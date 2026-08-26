import { ConflictException, GoneException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import PDFDocument from "pdfkit";
import type { Pool } from "pg";
import { PG_POOL } from "../database/database.module";
import { tenantContext } from "../database/tenant-context";
import {
  SCHEDULE_PDF_CONTRACT_VERSION,
  SCHEDULE_PUBLIC_LINK_CONTRACT_VERSION,
  SCHEDULE_PUBLIC_VIEW_CONTRACT_VERSION,
  type PublicScheduleAssignment,
  type SchedulePublicView,
  type PublicScheduleViewResult,
} from "../contracts";

const PDF_CONTENT_TYPE = "application/pdf";
const MAX_LINK_HOURS = 720;
const VIEW_LABELS: Record<SchedulePublicView, string> = {
  all: "Tất cả góc nhìn",
  class: "Theo lớp",
  teacher: "Theo giáo viên",
  room: "Theo phòng",
};

interface PublicLinkRow {
  id: string;
  school_id: string;
  schedule_version_id: string;
  expires_at: string | Date;
  revoked_at: string | Date | null;
}

interface PublicVersionRow {
  id: string;
  version_number: number;
  status: string;
  revision: number | string;
  school_id: string;
  school_code: string;
  school_name: string;
  academic_period_id: string;
  academic_period_name: string;
  academic_year: string;
  term_code: string;
  link_expires_at: string | Date;
}

interface AssignmentRow {
  class_code: string;
  class_name: string;
  teacher_code: string;
  teacher_name: string;
  subject_code: string;
  subject_name: string;
  room_code: string | null;
  room_name: string | null;
  day: number;
  period: number;
  shift_code: string | null;
  starts_at: string | null;
  ends_at: string | null;
}

interface Queryable {
  query: Pool["query"];
}

export interface PublicScheduleLinkResult {
  contractVersion: typeof SCHEDULE_PUBLIC_LINK_CONTRACT_VERSION;
  id: string;
  scheduleVersionId: string;
  expiresAt: string;
  publicPath: string;
}

export interface PublicSchedulePdfResult {
  buffer: Buffer;
  filename: string;
  contentType: typeof PDF_CONTENT_TYPE;
  metadata: PublicScheduleViewResult;
}

@Injectable()
export class PublicScheduleService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async createLink(
    schoolId: string,
    versionId: string,
    actorId: string,
    expiresInHours = 168,
  ): Promise<PublicScheduleLinkResult & { token: string }> {
    const boundedHours = Math.min(Math.max(Math.trunc(expiresInHours), 1), MAX_LINK_HOURS);
    const version = await this.loadPublishedVersion(this.pool, schoolId, versionId);
    const token = randomBytes(32).toString("base64url");
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + boundedHours * 60 * 60 * 1000);
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO schedule_public_links
        (tenant_id, school_id, schedule_version_id, token_hash, expires_at, created_by)
       VALUES ((SELECT tenant_id FROM schools WHERE id = $1), $1, $2, $3, $4, $5)
       RETURNING id::text`,
      [schoolId, version.id, tokenHash, expiresAt, actorId],
    );
    const id = result.rows[0]?.id;
    if (!id)
      throw new ConflictException({
        code: "SCHEDULE_PUBLIC_LINK_CREATE_FAILED",
        message: "Không tạo được liên kết công khai.",
      });
    return {
      contractVersion: SCHEDULE_PUBLIC_LINK_CONTRACT_VERSION,
      id,
      scheduleVersionId: version.id,
      expiresAt: expiresAt.toISOString(),
      publicPath: `/public/schedules/${token}`,
      token,
    };
  }

  async revokeLink(schoolId: string, versionId: string, linkId: string) {
    const result = await this.pool.query<{ id: string; revoked_at: string | Date }>(
      `UPDATE schedule_public_links
          SET revoked_at = COALESCE(revoked_at, now())
        WHERE id = $1 AND school_id = $2 AND schedule_version_id = $3
       RETURNING id::text, revoked_at`,
      [linkId, schoolId, versionId],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException({
        code: "SCHEDULE_PUBLIC_LINK_NOT_FOUND",
        message: "Liên kết công khai không tồn tại trong phạm vi trường.",
      });
    }
    return {
      contractVersion: SCHEDULE_PUBLIC_LINK_CONTRACT_VERSION,
      id: result.rows[0].id,
      revokedAt: new Date(result.rows[0].revoked_at).toISOString(),
    };
  }

  async getPublicView(
    token: string,
    view: SchedulePublicView = "all",
    resource?: string,
  ): Promise<PublicScheduleViewResult> {
    const tokenHash = this.hashToken(token);
    const tenantResult = await this.pool.query<{ tenant_id: string }>(
      "SELECT resolve_public_schedule_tenant($1)::text AS tenant_id",
      [tokenHash],
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;
    if (!tenantId) {
      throw new NotFoundException({
        code: "SCHEDULE_PUBLIC_LINK_NOT_FOUND",
        message: "Liên kết công khai không tồn tại.",
      });
    }
    const data = await tenantContext.run(tenantId, () => this.loadPublicSnapshot(token));
    const assignments = this.filterAssignments(data.assignments, view, resource);
    return this.toPublicView(data.version, data.link, assignments, view, resource ?? null);
  }

  async buildPdf(token: string, view: SchedulePublicView = "all", resource?: string): Promise<PublicSchedulePdfResult> {
    const metadata = await this.getPublicView(token, view, resource);
    const buffer = await this.renderPdf(metadata);
    return {
      buffer,
      contentType: PDF_CONTENT_TYPE,
      filename: `public-timetable-v${metadata.scheduleVersion.number}-${view}.pdf`,
      metadata,
    };
  }

  private async loadPublishedVersion(client: Queryable, schoolId: string, versionId: string) {
    const result = await client.query<Pick<PublicVersionRow, "id" | "status">>(
      `SELECT id::text, status
         FROM schedule_versions
        WHERE id = $1 AND school_id = $2`,
      [versionId, schoolId],
    );
    if (result.rows.length === 0)
      throw new NotFoundException({
        code: "SCHEDULE_VERSION_NOT_FOUND",
        message: "Phiên bản thời khóa biểu không tồn tại trong phạm vi trường.",
      });
    if (result.rows[0].status !== "PUBLISHED") {
      throw new ConflictException({
        code: "SCHEDULE_PUBLIC_LINK_PUBLISHED_REQUIRED",
        message: "Chỉ phiên bản thời khóa biểu PUBLISHED mới được tạo liên kết công khai.",
      });
    }
    return result.rows[0];
  }

  private async loadPublicSnapshot(token: string) {
    const tokenHash = this.hashToken(token);
    const link = await this.pool.query<PublicLinkRow>(
      `SELECT id::text, school_id::text, schedule_version_id::text, expires_at, revoked_at
         FROM schedule_public_links
        WHERE token_hash = $1`,
      [tokenHash],
    );
    if (link.rows.length === 0)
      throw new NotFoundException({
        code: "SCHEDULE_PUBLIC_LINK_NOT_FOUND",
        message: "Liên kết công khai không tồn tại.",
      });
    const linkRow = link.rows[0];
    if (linkRow.revoked_at || new Date(linkRow.expires_at).getTime() <= Date.now()) {
      throw new GoneException({
        code: "SCHEDULE_PUBLIC_LINK_EXPIRED",
        message: "Liên kết công khai đã hết hạn hoặc bị thu hồi.",
      });
    }

    const version = await this.pool.query<PublicVersionRow>(
      `SELECT version.id::text,
              version.version_number,
              version.status,
              version.revision,
              school.id::text AS school_id,
              school.code AS school_code,
              school.name AS school_name,
              period.id::text AS academic_period_id,
              period.name AS academic_period_name,
              period.academic_year,
              period.term_code,
              public_link.expires_at AS link_expires_at
         FROM schedule_versions version
         JOIN schools school ON school.id = version.school_id
         JOIN academic_periods period
           ON period.id = version.academic_period_id
          AND period.school_id = version.school_id
         JOIN schedule_public_links public_link
           ON public_link.schedule_version_id = version.id
          AND public_link.school_id = version.school_id
        WHERE version.id = $1 AND version.school_id = $2 AND public_link.id = $3`,
      [linkRow.schedule_version_id, linkRow.school_id, linkRow.id],
    );
    if (version.rows.length === 0 || version.rows[0].status !== "PUBLISHED") {
      throw new GoneException({
        code: "SCHEDULE_PUBLIC_LINK_UNAVAILABLE",
        message: "Bản chụp công khai không còn khả dụng.",
      });
    }

    const assignments = await this.pool.query<AssignmentRow>(
      `SELECT class.code AS class_code,
              class.name AS class_name,
              teacher.code AS teacher_code,
              teacher.display_name AS teacher_name,
              subject.code AS subject_code,
              subject.name AS subject_name,
              room.code AS room_code,
              room.name AS room_name,
              slot.day,
              slot.period,
              slot.shift_code,
              to_char(slot.starts_at, 'HH24:MI') AS starts_at,
              to_char(slot.ends_at, 'HH24:MI') AS ends_at
         FROM schedule_assignments assignment
         JOIN lesson_requirements lesson ON lesson.id = assignment.lesson_id
          AND lesson.school_id = $2
          AND lesson.academic_period_id = $3
         JOIN classes class ON class.id = lesson.class_id AND class.school_id = $2
         JOIN teachers teacher ON teacher.id = lesson.teacher_id AND teacher.school_id = $2
         JOIN subjects subject ON subject.id = lesson.subject_id AND subject.school_id = $2
         JOIN time_slots slot ON slot.id = assignment.time_slot_id
          AND slot.school_id = $2
          AND slot.academic_period_id = $3
         LEFT JOIN rooms room ON room.id = assignment.room_id AND room.school_id = $2
        WHERE assignment.schedule_version_id = $1
        ORDER BY class.code, teacher.code, slot.day, slot.period, subject.code`,
      [linkRow.schedule_version_id, linkRow.school_id, version.rows[0].academic_period_id],
    );
    return { version: version.rows[0], link: linkRow, assignments: assignments.rows };
  }

  private filterAssignments(assignments: AssignmentRow[], view: SchedulePublicView, resource?: string) {
    const normalizedResource = resource?.trim().toLocaleLowerCase("vi-VN");
    return assignments.filter((assignment) => {
      if (!normalizedResource) return true;
      const value =
        view === "class"
          ? `${assignment.class_code} ${assignment.class_name}`
          : view === "teacher"
            ? `${assignment.teacher_code} ${assignment.teacher_name}`
            : view === "room"
              ? `${assignment.room_code ?? ""} ${assignment.room_name ?? ""}`
              : `${assignment.class_code} ${assignment.class_name} ${assignment.teacher_code} ${assignment.teacher_name} ${assignment.room_code ?? ""} ${assignment.room_name ?? ""}`;
      return value.toLocaleLowerCase("vi-VN").includes(normalizedResource);
    });
  }

  private toPublicView(
    version: PublicVersionRow,
    link: PublicLinkRow,
    assignments: AssignmentRow[],
    view: SchedulePublicView,
    resourceFilter: string | null,
  ): PublicScheduleViewResult {
    const toPublicAssignment = (assignment: AssignmentRow): PublicScheduleAssignment => ({
      classCode: assignment.class_code,
      className: assignment.class_name,
      teacherCode: assignment.teacher_code,
      teacherName: assignment.teacher_name,
      subjectCode: assignment.subject_code,
      subjectName: assignment.subject_name,
      roomCode: assignment.room_code,
      roomName: assignment.room_name,
      day: assignment.day,
      period: assignment.period,
      shiftCode: assignment.shift_code,
      startsAt: assignment.starts_at,
      endsAt: assignment.ends_at,
    });
    const publicAssignments = assignments.map(toPublicAssignment);
    return {
      contractVersion: SCHEDULE_PUBLIC_VIEW_CONTRACT_VERSION,
      pdfContractVersion: SCHEDULE_PDF_CONTRACT_VERSION,
      watermark: "PUBLIC READ ONLY",
      linkExpiresAt: new Date(link.expires_at).toISOString(),
      generatedAt: new Date().toISOString(),
      view,
      resourceFilter,
      school: { id: version.school_id, code: version.school_code, name: version.school_name },
      academicPeriod: {
        id: version.academic_period_id,
        name: version.academic_period_name,
        academicYear: version.academic_year,
        termCode: version.term_code,
      },
      scheduleVersion: {
        id: version.id,
        number: version.version_number,
        status: "PUBLISHED",
        revision: Number(version.revision),
      },
      resources: {
        classes: [
          ...new Set(assignments.map((assignment) => `${assignment.class_code} · ${assignment.class_name}`)),
        ].sort(),
        teachers: [
          ...new Set(assignments.map((assignment) => `${assignment.teacher_code} · ${assignment.teacher_name}`)),
        ].sort(),
        rooms: [
          ...new Set(
            assignments
              .filter((assignment) => assignment.room_code)
              .map((assignment) => `${assignment.room_code} · ${assignment.room_name}`),
          ),
        ].sort(),
      },
      assignments: publicAssignments,
    };
  }

  private async renderPdf(data: PublicScheduleViewResult) {
    const document = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 32,
      bufferPages: true,
      compress: true,
    });
    const chunks: Buffer[] = [];
    const completed = new Promise<Buffer>((resolveBuffer, reject) => {
      document.on("data", (chunk: Buffer) => chunks.push(chunk));
      document.on("end", () => resolveBuffer(Buffer.concat(chunks)));
      document.on("error", reject);
    });
    const regularFont = this.findFont(false);
    const boldFont = this.findFont(true);
    if (regularFont) document.font(regularFont);
    this.drawWatermark(document);
    this.drawHeader(document, data, boldFont, regularFont);
    this.drawTable(document, data, boldFont, regularFont);
    const pageRange = document.bufferedPageRange();
    for (let index = 0; index < pageRange.count; index += 1) {
      document.switchToPage(pageRange.start + index);
      this.drawFooter(document, data, index + 1, pageRange.count, boldFont, regularFont);
    }
    document.end();
    return completed;
  }

  private drawHeader(
    document: PDFKit.PDFDocument,
    data: PublicScheduleViewResult,
    boldFont?: string,
    regularFont?: string,
  ) {
    if (boldFont) document.font(boldFont);
    document.fontSize(15).fillColor("#0f766e").text(`${data.school.name} · Thời khóa biểu công khai`, 32, 30);
    if (regularFont) document.font(regularFont);
    document
      .fontSize(8.5)
      .fillColor("#334155")
      .text(
        `${data.academicPeriod.name} · Version ${data.scheduleVersion.number} · PUBLISHED · ${VIEW_LABELS[data.view]}`,
        32,
        52,
      );
    document
      .fontSize(8)
      .fillColor("#64748b")
      .text(`PUBLIC READ ONLY · Hết hạn: ${data.linkExpiresAt} · Contract ${data.pdfContractVersion}`, 32, 66);
    document.moveTo(32, 82).lineTo(810, 82).strokeColor("#cbd5e1").stroke();
  }

  private drawTable(
    document: PDFKit.PDFDocument,
    data: PublicScheduleViewResult,
    boldFont?: string,
    regularFont?: string,
  ) {
    const columns = this.columnsFor(data.view);
    const usableWidth = 778;
    const widthScale = usableWidth / columns.reduce((sum, column) => sum + column.width, 0);
    const widths = columns.map((column) => column.width * widthScale);
    let y = 96;
    const rowHeight = (values: string[], fontSize: number) => {
      if (regularFont) document.font(regularFont);
      document.fontSize(fontSize);
      return (
        Math.max(20, ...values.map((value, index) => document.heightOfString(value, { width: widths[index] - 8 }))) + 8
      );
    };
    const drawRow = (values: string[], height: number, header = false) => {
      let x = 32;
      if (header) document.fillColor("#334155").rect(x, y, usableWidth, height).fill();
      for (let index = 0; index < values.length; index += 1) {
        document.lineWidth(0.4).strokeColor("#cbd5e1").rect(x, y, widths[index], height).stroke();
        if (header && boldFont) document.font(boldFont);
        else if (regularFont) document.font(regularFont);
        document
          .fontSize(header ? 8 : 7.5)
          .fillColor(header ? "#ffffff" : "#0f172a")
          .text(values[index], x + 4, y + 4, { width: widths[index] - 8, height: height - 6 });
        x += widths[index];
      }
      y += height;
    };
    const headers = columns.map((column) => column.label);
    drawRow(headers, 24, true);
    for (const assignment of data.assignments) {
      const values = this.valuesFor(assignment, data.view);
      const height = rowHeight(values, 7.5);
      if (y + height > 560) {
        document.addPage();
        this.drawWatermark(document);
        this.drawHeader(document, data, boldFont, regularFont);
        y = 96;
        drawRow(headers, 24, true);
      }
      drawRow(values, height);
    }
    if (data.assignments.length === 0) {
      drawRow(["Không có assignment trong public snapshot.", ...new Array(columns.length - 1).fill("")], 24);
    }
  }

  private drawFooter(
    document: PDFKit.PDFDocument,
    data: PublicScheduleViewResult,
    page: number,
    total: number,
    boldFont?: string,
    regularFont?: string,
  ) {
    if (regularFont) document.font(regularFont);
    document
      .fontSize(7.5)
      .fillColor("#64748b")
      .text(
        `PUBLIC READ ONLY · ${data.school.code} · Version ${data.scheduleVersion.number} · Generated ${data.generatedAt}`,
        32,
        548,
        { width: 650 },
      );
    if (boldFont) document.font(boldFont);
    document.fontSize(7.5).fillColor("#64748b").text(`${page}/${total}`, 770, 548, { width: 40, align: "right" });
  }

  private drawWatermark(document: PDFKit.PDFDocument) {
    document
      .save()
      .rotate(-28, { origin: [390, 330] })
      .fontSize(42)
      .fillColor("#e2e8f0")
      .opacity(0.42)
      .text("PUBLIC READ ONLY", 190, 300)
      .restore()
      .opacity(1);
  }

  private columnsFor(view: SchedulePublicView) {
    const common = [
      { label: "Thứ", width: 45 },
      { label: "Tiết", width: 38 },
      { label: "Giờ", width: 78 },
      { label: "Môn", width: 150 },
    ];
    if (view === "class")
      return [
        { label: "Lớp", width: 95 },
        ...common,
        { label: "Giáo viên", width: 170 },
        { label: "Phòng", width: 100 },
      ];
    if (view === "teacher")
      return [
        { label: "Giáo viên", width: 170 },
        ...common,
        { label: "Lớp", width: 95 },
        { label: "Phòng", width: 100 },
      ];
    if (view === "room")
      return [
        { label: "Phòng", width: 100 },
        ...common,
        { label: "Lớp", width: 95 },
        { label: "Giáo viên", width: 170 },
      ];
    return [{ label: "Lớp", width: 95 }, ...common, { label: "Giáo viên", width: 170 }, { label: "Phòng", width: 100 }];
  }

  private valuesFor(assignment: PublicScheduleAssignment, view: SchedulePublicView) {
    const common = [
      `Thứ ${assignment.day}`,
      String(assignment.period),
      assignment.startsAt && assignment.endsAt ? `${assignment.startsAt}-${assignment.endsAt}` : "-",
      `${assignment.subjectName} (${assignment.subjectCode})`,
    ];
    if (view === "teacher")
      return [
        `${assignment.teacherCode} · ${assignment.teacherName}`,
        ...common,
        `${assignment.classCode} · ${assignment.className}`,
        assignment.roomName ?? "-",
      ];
    if (view === "room")
      return [
        assignment.roomName ? `${assignment.roomCode ?? ""} · ${assignment.roomName}` : "-",
        ...common,
        `${assignment.classCode} · ${assignment.className}`,
        `${assignment.teacherCode} · ${assignment.teacherName}`,
      ];
    return [
      `${assignment.classCode} · ${assignment.className}`,
      ...common,
      `${assignment.teacherCode} · ${assignment.teacherName}`,
      assignment.roomName ? `${assignment.roomCode ?? ""} · ${assignment.roomName}` : "-",
    ];
  }

  private findFont(bold: boolean) {
    const configured = bold ? process.env.PDF_FONT_BOLD_PATH : process.env.PDF_FONT_PATH;
    const candidates = configured
      ? [configured]
      : bold
        ? [
            "C:\\Windows\\Fonts\\arialbd.ttf",
            "/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
          ]
        : [
            "C:\\Windows\\Fonts\\arial.ttf",
            "/usr/share/fonts/truetype/msttcorefonts/Arial.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
          ];
    return candidates.find((candidate) => existsSync(resolve(candidate)));
  }

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }
}
