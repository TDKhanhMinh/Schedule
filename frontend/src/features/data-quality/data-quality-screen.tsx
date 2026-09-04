import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  CircleX,
  Database,
  ListChecks,
  RefreshCw,
  ScanSearch,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "../../app/app-shell";
import { useWorkspace } from "../../app/workspace-provider";
import type { WorkspaceScheduleVersion } from "../../app/workspace-types";
import { navigateTo } from "../../routing";
import { request } from "../master-data/master-data-api";
import type {
  AcademicPeriod,
  GradeShiftConfig,
  LessonRequirement,
  RuleProfile,
  RuleSnapshotResolution,
  SchoolClass,
  Room,
  Subject,
  Teacher,
  TimeSlot,
} from "../master-data/master-data-types";

type QualitySeverity = "ERROR" | "WARNING";

interface QualityIssue {
  id: string;
  severity: QualitySeverity;
  area: string;
  title: string;
  description: string;
}

interface HomeroomAssignment {
  classId: string;
  teacherId: string;
  weeklyReductionPeriods: number;
}

interface ProfessionalAssignment {
  teacherId: string;
  subjectId: string;
  grade: number;
  status: string;
}

interface QualityDataset {
  periods: AcademicPeriod[];
  teachers: Teacher[];
  classes: SchoolClass[];
  subjects: Subject[];
  rooms: Room[];
  slots: TimeSlot[];
  gradeShifts: GradeShiftConfig[];
  lessons: LessonRequirement[];
  homerooms: HomeroomAssignment[];
  professionalAssignments: ProfessionalAssignment[];
  profiles: RuleProfile[];
  activeSnapshot: RuleSnapshotResolution;
  scheduleVersions: WorkspaceScheduleVersion[];
}

interface QualityReport {
  scannedAt: string;
  issues: QualityIssue[];
  counts: {
    errors: number;
    warnings: number;
    checks: number;
  };
}

export function DataQualityScreen() {
  const { periods, schoolId, academicPeriodId } = useWorkspace();
  const [scanRequestedAt, setScanRequestedAt] = useState(0);
  const selectedPeriod = periods.find((period) => period.id === academicPeriodId);
  const scanQuery = useQuery({
    queryKey: ["data-quality", schoolId, academicPeriodId, scanRequestedAt],
    queryFn: ({ signal }) => fetchQualityDataset(schoolId, academicPeriodId, signal),
    enabled: Boolean(schoolId && academicPeriodId && scanRequestedAt),
  });
  const report = useMemo(
    () => (scanQuery.data ? evaluateQuality(scanQuery.data, selectedPeriod) : null),
    [scanQuery.data, selectedPeriod],
  );

  useEffect(() => {
    setScanRequestedAt(0);
  }, [schoolId, academicPeriodId]);

  if (!schoolId || !academicPeriodId) {
    return (
      <div className="data-quality-screen">
        <PageHeader
          eyebrow="Kiểm tra dữ liệu vận hành"
          title="Quét dữ liệu trước khi xếp TKB"
          description="Chọn trường và năm học để kiểm tra toàn bộ danh mục, phân công, khung tiết và bộ quy tắc."
        />
        <div className="data-quality-empty" role="status">
          <Database aria-hidden="true" />
          <strong>Chưa đủ bối cảnh để quét dữ liệu</strong>
          <p>Chọn trường và năm học ở phần đầu trang, sau đó quay lại đây để bắt đầu kiểm tra.</p>
        </div>
      </div>
    );
  }

  const isScanning = scanQuery.isFetching;
  return (
    <div className="data-quality-screen">
      <PageHeader
        eyebrow="Kiểm tra dữ liệu vận hành"
        title="Quét dữ liệu trước khi xếp TKB"
        description={`Kiểm tra dữ liệu của ${selectedPeriod?.name ?? "năm học đang chọn"} trước khi tạo hoặc phát hành thời khóa biểu.`}
        action={
          <div className="data-quality-header-actions">
            <Button type="button" onClick={() => setScanRequestedAt(Date.now())} disabled={isScanning}>
              <ScanSearch aria-hidden="true" /> {isScanning ? "Đang quét…" : "Quét dữ liệu"}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigateTo("master-data")}>
              Chỉnh sửa dữ liệu <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        }
      />

      {scanQuery.isPending && scanRequestedAt ? <QualityLoadingState /> : null}
      {scanQuery.error ? (
        <Alert variant="destructive">
          <CircleX aria-hidden="true" />
          <AlertTitle>Không thể hoàn tất lượt quét</AlertTitle>
          <AlertDescription>
            {scanQuery.error instanceof Error ? scanQuery.error.message : "Không thể đọc dữ liệu từ API."}
          </AlertDescription>
        </Alert>
      ) : null}
      {!report && !scanQuery.isPending && !scanQuery.error ? <QualityIntro /> : null}
      {report ? <QualityReportView report={report} /> : null}
    </div>
  );
}

async function fetchQualityDataset(schoolId: string, periodId: string, signal: AbortSignal): Promise<QualityDataset> {
  const base = `/schools/${encodeURIComponent(schoolId)}`;
  const periodBase = `${base}/academic-periods/${encodeURIComponent(periodId)}`;
  const [
    periods,
    teachers,
    classes,
    subjects,
    rooms,
    slots,
    gradeShifts,
    lessons,
    homerooms,
    professionalAssignments,
    profiles,
    activeSnapshot,
    scheduleVersions,
  ] = await Promise.all([
    request<AcademicPeriod[]>(`${base}/academic-periods`, { signal }),
    request<Teacher[]>(`${base}/teachers`, { signal }),
    request<SchoolClass[]>(`${base}/classes`, { signal }),
    request<Subject[]>(`${base}/subjects`, { signal }),
    request<Room[]>(`${base}/rooms`, { signal }),
    request<TimeSlot[]>(`${periodBase}/time-slots`, { signal }),
    request<GradeShiftConfig[]>(`${periodBase}/grade-shifts`, { signal }),
    request<LessonRequirement[]>(`${periodBase}/lesson-requirements`, { signal }),
    request<HomeroomAssignment[]>(`${periodBase}/homeroom-assignments`, { signal }),
    request<ProfessionalAssignment[]>(`${periodBase}/teacher-subject-grade-assignments`, { signal }),
    request<RuleProfile[]>(`${periodBase}/rule-profiles`, { signal }),
    request<RuleSnapshotResolution>(`${periodBase}/rule-snapshots/active`, { signal }),
    request<WorkspaceScheduleVersion[]>(`${periodBase}/schedule-versions`, { signal }),
  ]);
  return {
    periods,
    teachers,
    classes,
    subjects,
    rooms,
    slots,
    gradeShifts,
    lessons,
    homerooms,
    professionalAssignments,
    profiles,
    activeSnapshot,
    scheduleVersions,
  };
}

function evaluateQuality(dataset: QualityDataset, period: { status: string } | undefined): QualityReport {
  const issues: QualityIssue[] = [];
  const activeTeachers = dataset.teachers.filter((item) => item.status === "ACTIVE");
  const activeClasses = dataset.classes.filter((item) => item.status === "ACTIVE");
  const activeSubjects = dataset.subjects.filter((item) => item.status === "ACTIVE");
  const activeRooms = dataset.rooms.filter((item) => item.status === "ACTIVE");
  const activeLessons = dataset.lessons.filter((item) => item.status === "ACTIVE");
  const activeHomerooms = dataset.homerooms;
  const activeProfessionalAssignments = dataset.professionalAssignments.filter((item) => item.status === "ACTIVE");
  const usableScheduleVersions = dataset.scheduleVersions.filter((version) => version.status !== "ARCHIVED");

  checkRequiredCollection(issues, "teachers", "Giáo viên", activeTeachers.length);
  checkRequiredCollection(issues, "classes", "Lớp học", activeClasses.length);
  checkRequiredCollection(issues, "subjects", "Môn học", activeSubjects.length);
  checkRequiredCollection(issues, "rooms", "Phòng học", activeRooms.length);
  checkDuplicateCodes(
    issues,
    "teachers",
    "Giáo viên",
    activeTeachers.map((item) => item.code),
  );
  checkDuplicateCodes(
    issues,
    "classes",
    "Lớp học",
    activeClasses.map((item) => item.code),
  );
  checkDuplicateCodes(
    issues,
    "subjects",
    "Môn học",
    activeSubjects.map((item) => item.code),
  );
  checkDuplicateCodes(
    issues,
    "rooms",
    "Phòng học",
    activeRooms.map((item) => item.code),
  );

  const teacherIds = new Set(activeTeachers.map((item) => item.id));
  const classById = new Map(activeClasses.map((item) => [item.id, item]));
  const subjectIds = new Set(activeSubjects.map((item) => item.id));
  const roomIds = new Set(activeRooms.map((item) => item.id));
  const slotIds = new Set(dataset.slots.map((item) => item.id));
  const invalidLessons = activeLessons.filter(
    (lesson) =>
      !classById.has(lesson.classId) ||
      !subjectIds.has(lesson.subjectId) ||
      !teacherIds.has(lesson.teacherId) ||
      (lesson.roomId !== null && !roomIds.has(lesson.roomId)) ||
      (lesson.fixedSlotId !== undefined && lesson.fixedSlotId !== null && !slotIds.has(lesson.fixedSlotId)) ||
      !Number.isInteger(lesson.requiredSessions) ||
      lesson.requiredSessions < 1,
  );
  if (invalidLessons.length) {
    issues.push({
      id: "lesson-references",
      severity: "ERROR",
      area: "Yêu cầu tiết",
      title: `${invalidLessons.length} yêu cầu tiết cần rà soát`,
      description: "Có lớp, môn, giáo viên, phòng, khung tiết không tồn tại hoặc số tiết không hợp lệ.",
    });
  }

  const expectedSlotKeys = new Set(
    [1, 2, 3, 4, 5, 6].flatMap((day) =>
      ["MORNING", "AFTERNOON"].flatMap((shift) =>
        [1, 2, 3, 4, 5].map((periodNumber) => `${day}|${shift}|${periodNumber}`),
      ),
    ),
  );
  const actualSlotKeys = new Set(
    dataset.slots.map((slot) => `${slot.day}|${slot.shiftCode ?? "UNKNOWN"}|${slot.period}`),
  );
  const missingSlotCount = [...expectedSlotKeys].filter((key) => !actualSlotKeys.has(key)).length;
  if (missingSlotCount) {
    issues.push({
      id: "time-slots",
      severity: "ERROR",
      area: "Khung tiết",
      title: `Thiếu ${missingSlotCount} slot trong tuần chuẩn`,
      description: "Mỗi ngày từ thứ 2 đến thứ 7 cần đủ buổi sáng/chiều và 5 tiết mỗi buổi.",
    });
  }
  if (actualSlotKeys.size !== dataset.slots.length) {
    issues.push({
      id: "duplicate-slots",
      severity: "ERROR",
      area: "Khung tiết",
      title: "Khung tiết có ô trùng ngày, buổi và tiết",
      description: "Xóa hoặc chỉnh sửa các slot trùng trước khi xếp thời khóa biểu.",
    });
  }

  const classIdsWithHomeroom = new Set(activeHomerooms.map((item) => item.classId));
  const missingHomerooms = activeClasses.filter((item) => !classIdsWithHomeroom.has(item.id));
  if (missingHomerooms.length) {
    issues.push({
      id: "homeroom",
      severity: "ERROR",
      area: "GVCN",
      title: `${missingHomerooms.length} lớp chưa có giáo viên chủ nhiệm`,
      description: "Gán GVCN cho từng lớp và kỳ học trước khi kiểm tra tải dạy.",
    });
  }
  const invalidHomerooms = activeHomerooms.filter(
    (assignment) => !classById.has(assignment.classId) || !teacherIds.has(assignment.teacherId),
  );
  if (invalidHomerooms.length) {
    issues.push({
      id: "homeroom-references",
      severity: "ERROR",
      area: "GVCN",
      title: `${invalidHomerooms.length} phân công GVCN có tham chiếu không hợp lệ`,
      description: "Lớp hoặc giáo viên trong phân công GVCN không còn ở trạng thái hoạt động.",
    });
  }
  const wrongReductionCount = activeHomerooms.filter((item) => item.weeklyReductionPeriods !== 4).length;
  if (wrongReductionCount) {
    issues.push({
      id: "homeroom-reduction",
      severity: "WARNING",
      area: "Định mức",
      title: `${wrongReductionCount} GVCN chưa có mức giảm 4 tiết/tuần`,
      description: "Kiểm tra lại quyết định phân công và rule giảm định mức của trường.",
    });
  }

  const professionalKeys = new Set(
    activeProfessionalAssignments.map(
      (assignment) => `${assignment.teacherId}|${assignment.subjectId}|${assignment.grade}`,
    ),
  );
  const uncoveredLessons = activeLessons.filter((lesson) => {
    if (lesson.activityType === "FLAG_CEREMONY") return false;
    const classRecord = classById.get(lesson.classId);
    return classRecord ? !professionalKeys.has(`${lesson.teacherId}|${lesson.subjectId}|${classRecord.grade}`) : false;
  });
  if (uncoveredLessons.length) {
    issues.push({
      id: "professional-coverage",
      severity: "WARNING",
      area: "Phân công chuyên môn",
      title: `${uncoveredLessons.length} yêu cầu tiết chưa có phân công chuyên môn tương ứng`,
      description: "Mở bảng phân công chuyên môn để bổ sung giáo viên, môn và khối phù hợp.",
    });
  }

  const grades = [...new Set(activeClasses.map((item) => item.grade))];
  const configuredGrades = new Set(dataset.gradeShifts.map((item) => item.grade));
  const missingShiftGrades = grades.filter((grade) => !configuredGrades.has(grade));
  if (missingShiftGrades.length) {
    issues.push({
      id: "grade-shifts",
      severity: "ERROR",
      area: "Buổi học",
      title: `Khối ${missingShiftGrades.join(", ")} chưa có cấu hình buổi học`,
      description: "Cấu hình buổi chính, buổi phụ và vị trí chào cờ trước khi xếp TKB.",
    });
  }

  if (!dataset.activeSnapshot.resolved) {
    issues.push({
      id: "rule-snapshot",
      severity: "ERROR",
      area: "Bộ quy tắc",
      title: "Chưa có snapshot rule được phê duyệt",
      description: "Cần approve baseline production trong Rule Center trước khi chạy bộ tối ưu.",
    });
  }
  if (usableScheduleVersions.length === 0) {
    issues.push({
      id: "schedule-version",
      severity: "ERROR",
      area: "Phiên bản TKB",
      title: "Chưa có phiên bản thời khóa biểu",
      description: "Khởi tạo một phiên bản DRAFT trong trang Thời khóa biểu trước khi chạy bộ tối ưu.",
    });
  }
  if (!period || period.status !== "ACTIVE") {
    issues.push({
      id: "academic-period",
      severity: "WARNING",
      area: "Năm học",
      title: "Năm học hiện tại chưa ở trạng thái hoạt động",
      description: "Kiểm tra trạng thái kỳ học trước khi đưa dữ liệu vào vận hành.",
    });
  }

  return {
    scannedAt: new Date().toISOString(),
    issues,
    counts: {
      errors: issues.filter((issue) => issue.severity === "ERROR").length,
      warnings: issues.filter((issue) => issue.severity === "WARNING").length,
      checks: 11,
    },
  };
}

function checkRequiredCollection(issues: QualityIssue[], id: string, label: string, count: number) {
  if (count > 0) return;
  issues.push({
    id,
    severity: "ERROR",
    area: "Dữ liệu danh mục",
    title: `Chưa có ${label.toLowerCase()} hoạt động`,
    description: `Thêm ít nhất một bản ghi ${label.toLowerCase()} trước khi tiếp tục.`,
  });
}

function checkDuplicateCodes(issues: QualityIssue[], id: string, label: string, codes: string[]) {
  const duplicates = codes.filter((code, index) => codes.indexOf(code) !== index);
  if (!duplicates.length) return;
  issues.push({
    id: `duplicate-${id}`,
    severity: "ERROR",
    area: "Dữ liệu danh mục",
    title: `${label} có mã bị trùng`,
    description: `Mã trùng: ${[...new Set(duplicates)].slice(0, 5).join(", ")}.`,
  });
}

function QualityLoadingState() {
  return (
    <div className="data-quality-loading" role="status" aria-label="Đang quét dữ liệu">
      <Skeleton className="h-6 w-64" />
      <Skeleton className="h-4 w-96" />
      <div className="data-quality-loading-grid">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    </div>
  );
}

function QualityIntro() {
  return (
    <div className="data-quality-intro">
      <ScanSearch aria-hidden="true" />
      <div>
        <strong>Sẵn sàng kiểm tra dữ liệu</strong>
        <p>Lượt quét sẽ đọc dữ liệu hiện tại từ API và không tự thay đổi bất kỳ bản ghi nào.</p>
      </div>
    </div>
  );
}

function QualityReportView({ report }: { report: QualityReport }) {
  const status = report.counts.errors > 0 ? "blocked" : report.counts.warnings > 0 ? "attention" : "ready";
  const statusCopy = {
    blocked: "Chưa đủ điều kiện",
    attention: "Có cảnh báo cần xem",
    ready: "Dữ liệu đạt kiểm tra",
  } as const;
  const statusIcon =
    status === "blocked" ? (
      <CircleX aria-hidden="true" />
    ) : status === "attention" ? (
      <AlertTriangle aria-hidden="true" />
    ) : (
      <CheckCircle2 aria-hidden="true" />
    );
  const missingScheduleVersion = report.issues.some((issue) => issue.id === "schedule-version");
  const nextRoute = status === "ready" || missingScheduleVersion ? "timetable" : "master-data";
  return (
    <>
      <section className={`data-quality-status is-${status}`} aria-live="polite">
        <div className="data-quality-status-icon">{statusIcon}</div>
        <div>
          <span className="data-quality-kicker">Kết quả lượt quét</span>
          <h2>{statusCopy[status]}</h2>
          <p>Đã quét lúc {new Date(report.scannedAt).toLocaleString("vi-VN")}.</p>
        </div>
      </section>
      <section className="data-quality-summary" aria-label="Tóm tắt kiểm tra">
        <SummaryCard icon={<CircleX />} label="Lỗi chặn" value={report.counts.errors} tone="error" />
        <SummaryCard icon={<AlertTriangle />} label="Cảnh báo" value={report.counts.warnings} tone="warning" />
        <SummaryCard icon={<ListChecks />} label="Nhóm kiểm tra" value={report.counts.checks} tone="success" />
      </section>
      <section className="data-quality-checks" aria-labelledby="data-quality-checks-title">
        <div className="data-quality-section-heading">
          <div>
            <span className="data-quality-kicker">Chi tiết cần xử lý</span>
            <h2 id="data-quality-checks-title">Danh sách kết quả</h2>
          </div>
          <Button type="button" variant="outline" onClick={() => navigateTo("master-data")}>
            Mở dữ liệu danh mục <ArrowRight aria-hidden="true" />
          </Button>
        </div>
        {report.issues.length ? (
          <div className="data-quality-issue-list">
            {report.issues.map((issue) => (
              <article className={`data-quality-issue is-${issue.severity.toLowerCase()}`} key={issue.id}>
                <div className="data-quality-issue-icon">
                  {issue.severity === "ERROR" ? <CircleX aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
                </div>
                <div>
                  <div className="data-quality-issue-heading">
                    <span>{issue.area}</span>
                    <Badge variant={issue.severity === "ERROR" ? "destructive" : "secondary"}>
                      {issue.severity === "ERROR" ? "Lỗi" : "Cảnh báo"}
                    </Badge>
                  </div>
                  <strong>{issue.title}</strong>
                  <p>{issue.description}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="data-quality-success">
            <CheckCircle2 aria-hidden="true" />
            <strong>Không phát hiện lỗi hoặc cảnh báo.</strong>
            <p>Dữ liệu hiện tại đã sẵn sàng để chuyển sang bước xếp thời khóa biểu.</p>
          </div>
        )}
      </section>
      <section className="data-quality-next-step" aria-label="Bước tiếp theo">
        <div className="data-quality-next-icon">
          {status === "ready" ? <CalendarCheck aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
        </div>
        <div>
          <strong>
            {status === "ready"
              ? "Có thể chuyển sang thời khóa biểu"
              : missingScheduleVersion
                ? "Cần khởi tạo phiên bản thời khóa biểu"
                : "Sửa dữ liệu rồi quét lại"}
          </strong>
          <p>
            {status === "ready"
              ? "Kiểm tra này không thay đổi dữ liệu. Bạn có thể mở thời khóa biểu để tiếp tục."
              : missingScheduleVersion
                ? "Mở Thời khóa biểu để tạo bản DRAFT, sau đó quay lại quét dữ liệu."
                : "Mở Dữ liệu danh mục, chỉnh sửa các mục được nêu và thực hiện lại lượt quét."}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => navigateTo(nextRoute)}>
          {status === "ready" ? "Mở thời khóa biểu" : missingScheduleVersion ? "Khởi tạo phiên bản" : "Chỉnh sửa ngay"}{" "}
          <ArrowRight aria-hidden="true" />
        </Button>
      </section>
    </>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "error" | "warning" | "success";
}) {
  return (
    <Card className={`data-quality-summary-card is-${tone}`}>
      <CardHeader>
        <CardDescription>
          <span aria-hidden="true">{icon}</span> {label}
        </CardDescription>
        <CardTitle>{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
