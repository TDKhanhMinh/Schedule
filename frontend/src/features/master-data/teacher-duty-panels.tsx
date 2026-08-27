import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { frontendConfig } from "../../config";
import { apiRequest } from "../../lib/api-client";

interface ClassOption {
  id: string;
  code: string;
  name: string;
  status?: "ACTIVE" | "ARCHIVED";
}

interface TeacherOption {
  id: string;
  code: string;
  displayName: string;
  status?: "ACTIVE" | "ARCHIVED";
}

export interface HomeroomAssignment {
  id: string;
  classId: string;
  classCode: string;
  className: string;
  teacherId: string;
  teacherCode: string;
  teacherName: string;
  weeklyReductionPeriods: number;
  ruleCode: string;
}

interface TeacherDuty {
  code: string;
  label: string;
  count: number;
}

interface TeacherLoadSummary {
  teacherId: string;
  teacherCode: string;
  teacherName: string;
  educationLevel: string;
  standardWeeklyPeriods: number;
  teachingPeriods: number;
  subjectCount: number;
  gradeCount: number;
  subjectCodes: string[];
  grades: number[];
  homeroomClasses: number;
  reductionPeriods: number;
  adjustedWeeklyTarget: number;
  difference: number;
  status: "OVER" | "UNDER" | "ON_TARGET";
  rule: {
    ruleCode: string;
    ruleSetVersion: string;
    ruleSnapshotId: string | null;
    sourceUrl: string;
    sourceLocator: string | null;
    effectiveFrom: string;
    effectiveTo: string | null;
    enforcement: "REPORT_ONLY" | "HARD_CAP";
  };
  duties: TeacherDuty[];
}

const RULE_CODE = "TT_05_2025_D9_1";

export function HomeroomAssignmentDialog({
  classOption,
  teachers,
  periodId,
  canWrite,
  assignment,
  open,
  onOpenChange,
  onSaved,
}: {
  classOption: ClassOption;
  teachers: TeacherOption[];
  periodId: string;
  canWrite: boolean;
  assignment?: HomeroomAssignment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [teacherId, setTeacherId] = useState(assignment?.teacherId ?? "");
  useEffect(() => {
    setTeacherId(assignment?.teacherId ?? "");
  }, [assignment?.teacherId, classOption.id]);
  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest(
        `/schools/${frontendConfig.schoolId}/academic-periods/${periodId}/classes/${classOption.id}/homeroom`,
        {
          method: "PUT",
          body: JSON.stringify({ teacherId, weeklyReductionPeriods: 4, ruleCode: RULE_CODE }),
        },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["homeroom-assignments", frontendConfig.schoolId, periodId] });
      await queryClient.invalidateQueries({ queryKey: ["teacher-load-summary", frontendConfig.schoolId, periodId] });
      onSaved("Đã lưu phân công GVCN; bảng tải dạy đã được cập nhật.");
      onOpenChange(false);
    },
  });
  const removeMutation = useMutation({
    mutationFn: () =>
      apiRequest(
        `/schools/${frontendConfig.schoolId}/academic-periods/${periodId}/classes/${classOption.id}/homeroom`,
        {
          method: "DELETE",
        },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["homeroom-assignments", frontendConfig.schoolId, periodId] });
      await queryClient.invalidateQueries({ queryKey: ["teacher-load-summary", frontendConfig.schoolId, periodId] });
      setTeacherId("");
      onSaved("Đã bỏ phân công GVCN của lớp.");
      onOpenChange(false);
    },
  });
  const error = saveMutation.error ?? removeMutation.error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="master-duty-dialog">
        <DialogHeader>
          <DialogTitle>{assignment ? "Sửa phân công GVCN" : "Gán giáo viên chủ nhiệm"}</DialogTitle>
          <DialogDescription>
            Lớp {classOption.code} - {classOption.name}. Mặc định giảm 4 tiết/tuần theo Điều 9 khoản 1 Thông tư
            05/2025/TT-BGDĐT.
          </DialogDescription>
        </DialogHeader>
        <div className="master-duty-form">
          <label>
            <span>Lớp</span>
            <input className="master-input" value={`${classOption.code} - ${classOption.name}`} readOnly />
          </label>
          <label>
            <span>Giáo viên chủ nhiệm</span>
            <select
              name="homeroomTeacher"
              className="master-select"
              value={teacherId}
              onChange={(event) => setTeacherId(event.target.value)}
              disabled={!teachers.length}
            >
              <option value="">Chưa gán</option>
              {teachers
                .filter((item) => item.status !== "ARCHIVED" || item.id === assignment?.teacherId)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} · {item.displayName}
                  </option>
                ))}
            </select>
          </label>
        </div>
        {error ? (
          <p className="master-dialog-error" role="alert">
            {error instanceof Error ? error.message : "Không thể cập nhật GVCN."}
          </p>
        ) : null}
        <DialogFooter>
          {assignment ? (
            <Button
              type="button"
              variant="outline"
              disabled={!canWrite || removeMutation.isPending}
              onClick={() => void removeMutation.mutateAsync()}
            >
              Bỏ gán
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            type="button"
            disabled={!canWrite || !teacherId || saveMutation.isPending}
            onClick={() => void saveMutation.mutateAsync()}
          >
            {saveMutation.isPending ? "Đang lưu…" : "Lưu GVCN"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TeacherLoadSummaryPanel({ periodId, periodLabel }: { periodId: string; periodLabel?: string }) {
  const [filterText, setFilterText] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | TeacherLoadSummary["status"]>("ALL");
  const summaryQuery = useQuery({
    queryKey: ["teacher-load-summary", frontendConfig.schoolId, periodId],
    queryFn: ({ signal }) =>
      apiRequest<TeacherLoadSummary[]>(
        `/schools/${frontendConfig.schoolId}/academic-periods/${periodId}/teacher-load-summary`,
        { signal },
      ),
    enabled: Boolean(frontendConfig.schoolId && periodId),
  });
  const rows = summaryQuery.data ?? [];
  const statusLabel = useMemo(() => ({ OVER: "Vượt định mức", UNDER: "Thiếu định mức", ON_TARGET: "Đủ định mức" }), []);
  const visibleRows = useMemo(() => {
    const normalizedQuery = filterText.trim().toLocaleLowerCase("vi-VN");
    return rows.filter((row) => {
      const matchesText = normalizedQuery
        ? `${row.teacherCode} ${row.teacherName} ${row.subjectCodes.join(" ")} ${row.grades.join(" ")}`
            .toLocaleLowerCase("vi-VN")
            .includes(normalizedQuery)
        : true;
      return matchesText && (statusFilter === "ALL" || row.status === statusFilter);
    });
  }, [filterText, rows, statusFilter]);
  const rule = rows[0]?.rule;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tổng hợp tải dạy giáo viên</CardTitle>
        <CardDescription>
          {periodLabel ? `${periodLabel}. ` : ""}Tiết dạy/tuần lấy từ phân công chuyên môn; GVCN được hiển thị riêng và
          trừ vào định mức theo chức vụ.
        </CardDescription>
        {rule ? (
          <div className="teacher-load-rule-summary" aria-label="Nguồn quy tắc tính tải dạy">
            <div>
              <span>Quy tắc</span>
              <code>{rule.ruleCode}</code>
              <Badge variant={rule.enforcement === "HARD_CAP" ? "destructive" : "secondary"}>
                {rule.enforcement === "HARD_CAP" ? "Giới hạn cứng" : "Chỉ báo cáo"}
              </Badge>
            </div>
            <div>
              <span>Nguồn</span>
              <a href={rule.sourceUrl} target="_blank" rel="noreferrer">
                {rule.sourceLocator ?? rule.sourceUrl}
              </a>
            </div>
            <div>
              <span>Hiệu lực</span>
              <strong>
                {rule.effectiveFrom} - {rule.effectiveTo ?? "Không thời hạn"}
              </strong>
            </div>
            <div>
              <span>Snapshot</span>
              <strong>{rule.ruleSnapshotId ? rule.ruleSetVersion : "Chưa có snapshot đã duyệt"}</strong>
            </div>
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {summaryQuery.isPending ? <p className="text-sm text-muted-foreground">Đang tổng hợp…</p> : null}
        {summaryQuery.error ? (
          <p className="text-sm text-destructive">
            {summaryQuery.error instanceof Error ? summaryQuery.error.message : "Không thể tổng hợp tải dạy."}
          </p>
        ) : null}
        {!summaryQuery.isPending && !summaryQuery.error ? (
          <div className="teacher-load-summary-content">
            <div className="teacher-load-filters">
              <label>
                <span>Tìm giáo viên, môn hoặc khối</span>
                <Input
                  name="teacherLoadSearch"
                  value={filterText}
                  onChange={(event) => setFilterText(event.target.value)}
                  placeholder="Ví dụ: GV-001, Toán, khối 9"
                />
              </label>
              <label>
                <span>Trạng thái định mức</span>
                <select
                  className="master-select"
                  name="teacherLoadStatus"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as "ALL" | TeacherLoadSummary["status"])}
                >
                  <option value="ALL">Tất cả trạng thái</option>
                  <option value="ON_TARGET">Đủ định mức</option>
                  <option value="UNDER">Thiếu định mức</option>
                  <option value="OVER">Vượt định mức</option>
                </select>
              </label>
              <span className="teacher-load-result-count">
                Hiển thị {visibleRows.length}/{rows.length} giáo viên
              </span>
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[1120px] text-sm">
                <caption className="sr-only">Tổng hợp tải dạy giáo viên theo tuần</caption>
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">Giáo viên</th>
                    <th className="px-3 py-3">Môn và khối</th>
                    <th className="px-3 py-3">Chức vụ</th>
                    <th className="px-3 py-3">Tiết dạy/tuần</th>
                    <th className="px-3 py-3">Định mức gốc</th>
                    <th className="px-3 py-3">Tiết giảm</th>
                    <th className="px-3 py-3">Định mức sau giảm</th>
                    <th className="px-3 py-3">Chênh lệch</th>
                    <th className="px-3 py-3">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr className="border-t" key={row.teacherId}>
                      <td className="px-3 py-3">
                        <strong>{row.teacherName}</strong>
                        <span className="block text-xs text-muted-foreground">{row.teacherCode}</span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="teacher-load-subjects">
                          {row.subjectCodes.length ? row.subjectCodes.join(", ") : "Chưa có phân công"}
                        </div>
                        <span className="block text-xs text-muted-foreground">
                          {row.grades.length ? row.grades.map((grade) => `Khối ${grade}`).join(", ") : "Chưa có khối"}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {row.duties.length
                          ? row.duties.map((duty) => `${duty.label} (${duty.count})`).join(", ")
                          : "Chưa có"}
                      </td>
                      <td className="px-3 py-3 font-semibold tabular-nums">{row.teachingPeriods}</td>
                      <td className="px-3 py-3 tabular-nums">{row.standardWeeklyPeriods}</td>
                      <td className="px-3 py-3 tabular-nums">{row.reductionPeriods}</td>
                      <td className="px-3 py-3 tabular-nums">{row.adjustedWeeklyTarget}</td>
                      <td className="px-3 py-3 font-semibold tabular-nums">
                        {row.difference > 0 ? `+${row.difference}` : row.difference}
                      </td>
                      <td className="px-3 py-3">
                        <Badge
                          variant={
                            row.status === "ON_TARGET" ? "default" : row.status === "OVER" ? "destructive" : "secondary"
                          }
                        >
                          {statusLabel[row.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visibleRows.length ? (
                <p className="teacher-load-empty">Không có giáo viên phù hợp với bộ lọc.</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
