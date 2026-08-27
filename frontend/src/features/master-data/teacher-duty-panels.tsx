import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
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

export interface TeacherSubjectGradeAssignment {
  id: string;
  schoolId: string;
  academicPeriodId: string;
  teacherId: string;
  subjectId: string;
  grade: number;
  status: "ACTIVE" | "ARCHIVED";
  sourceRef: string | null;
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
          <Button className="dialog-cancel" type="button" variant="outline" onClick={() => onOpenChange(false)}>
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

export function TeacherProfessionalAssignmentDialog({
  teacher,
  subjects,
  assignments,
  periodId,
  canWrite,
  open,
  onOpenChange,
  onSaved,
}: {
  teacher: TeacherOption;
  subjects: Array<{ id: string; code: string; name: string; status?: "ACTIVE" | "ARCHIVED" }>;
  assignments: TeacherSubjectGradeAssignment[];
  periodId: string;
  canWrite: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [subjectId, setSubjectId] = useState("");
  const [grade, setGrade] = useState("");
  const teacherAssignments = assignments.filter((item) => item.teacherId === teacher.id && item.status === "ACTIVE");
  const activeSubjects = subjects.filter((item) => item.status !== "ARCHIVED");
  useEffect(() => {
    if (open) {
      setSubjectId("");
      setGrade("");
    }
  }, [open, teacher.id]);
  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/schools/${frontendConfig.schoolId}/academic-periods/${periodId}/teacher-subject-grade-assignments`, {
        method: "POST",
        body: JSON.stringify({ teacherId: teacher.id, subjectId, grade: Number(grade) }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["teacher-subject-grade-assignments", frontendConfig.schoolId, periodId],
      });
      await queryClient.invalidateQueries({ queryKey: ["teacher-load-summary", frontendConfig.schoolId, periodId] });
      onSaved("Đã lưu phân công chuyên môn; bảng tải dạy đã được cập nhật.");
      onOpenChange(false);
    },
  });
  const removeMutation = useMutation({
    mutationFn: (assignmentId: string) =>
      apiRequest(
        `/schools/${frontendConfig.schoolId}/academic-periods/${periodId}/teacher-subject-grade-assignments/${assignmentId}`,
        { method: "DELETE" },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["teacher-subject-grade-assignments", frontendConfig.schoolId, periodId],
      });
      await queryClient.invalidateQueries({ queryKey: ["teacher-load-summary", frontendConfig.schoolId, periodId] });
      onSaved("Đã lưu trữ phân công chuyên môn; bảng tải dạy đã được cập nhật.");
    },
  });
  const error = saveMutation.error ?? removeMutation.error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="master-duty-dialog teacher-assignment-dialog">
        <DialogHeader>
          <DialogTitle>Phân công chuyên môn</DialogTitle>
          <DialogDescription>
            {teacher.code} - {teacher.displayName}. Chọn môn và khối mà giáo viên được phân công, không gắn với lớp cụ
            thể.
          </DialogDescription>
        </DialogHeader>
        <div className="teacher-assignment-current">
          <div className="teacher-assignment-section-heading">
            <strong>Phân công hiện tại</strong>
            <span>{teacherAssignments.length} phân công</span>
          </div>
          {teacherAssignments.length ? (
            <div className="teacher-assignment-list">
              {teacherAssignments.map((assignment) => {
                const subject = subjects.find((item) => item.id === assignment.subjectId);
                return (
                  <div className="teacher-assignment-list-item" key={assignment.id}>
                    <span>
                      <strong>{subject?.code ?? assignment.subjectId}</strong>
                      <small>
                        {subject?.name ?? "Môn học"} · Khối {assignment.grade}
                      </small>
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      disabled={!canWrite || removeMutation.isPending}
                      onClick={() => void removeMutation.mutateAsync(assignment.id)}
                    >
                      <Trash2 /> Bỏ phân công
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="teacher-assignment-empty">Chưa có phân công chuyên môn.</p>
          )}
        </div>
        <div className="teacher-assignment-form">
          <div className="teacher-assignment-section-heading">
            <strong>Thêm phân công</strong>
            <span>Không nhập lớp cụ thể</span>
          </div>
          <label>
            <span>Môn học</span>
            <select
              className="master-select"
              name="professionalSubject"
              value={subjectId}
              onChange={(event) => setSubjectId(event.target.value)}
              disabled={!activeSubjects.length}
            >
              <option value="">Chọn môn học</option>
              {activeSubjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.code} · {subject.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Khối</span>
            <Input
              name="professionalGrade"
              type="number"
              min={6}
              max={12}
              step={1}
              value={grade}
              onChange={(event) => setGrade(event.target.value)}
              placeholder="Nhập khối từ 6 đến 12"
            />
          </label>
        </div>
        {error ? (
          <p className="master-dialog-error" role="alert">
            {error instanceof Error ? error.message : "Không thể cập nhật phân công chuyên môn."}
          </p>
        ) : null}
        <DialogFooter>
          <Button className="dialog-cancel" type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            type="button"
            disabled={
              !canWrite || !subjectId || !grade || Number(grade) < 6 || Number(grade) > 12 || saveMutation.isPending
            }
            onClick={() => void saveMutation.mutateAsync()}
          >
            {saveMutation.isPending ? "Đang lưu…" : "Lưu phân công"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TeacherHomeroomAssignmentDialog({
  teacher,
  classes,
  assignments,
  periodId,
  canWrite,
  open,
  onOpenChange,
  onSaved,
}: {
  teacher: TeacherOption;
  classes: ClassOption[];
  assignments: HomeroomAssignment[];
  periodId: string;
  canWrite: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [classId, setClassId] = useState("");
  const teacherAssignments = assignments.filter((item) => item.teacherId === teacher.id);
  const availableClasses = useMemo(
    () =>
      classes.filter(
        (item) =>
          item.status !== "ARCHIVED" &&
          assignments.every((assignment) => assignment.classId !== item.id || assignment.teacherId === teacher.id),
      ),
    [assignments, classes],
  );
  const addableClasses = useMemo(
    () =>
      availableClasses.filter(
        (item) =>
          !assignments.some((assignment) => assignment.classId === item.id && assignment.teacherId === teacher.id),
      ),
    [assignments, availableClasses, teacher.id],
  );
  useEffect(() => {
    if (open) setClassId(addableClasses[0]?.id ?? "");
  }, [addableClasses, open, teacher.id]);
  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/schools/${frontendConfig.schoolId}/academic-periods/${periodId}/classes/${classId}/homeroom`, {
        method: "PUT",
        body: JSON.stringify({ teacherId: teacher.id, weeklyReductionPeriods: 4, ruleCode: RULE_CODE }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["homeroom-assignments", frontendConfig.schoolId, periodId] });
      await queryClient.invalidateQueries({ queryKey: ["teacher-load-summary", frontendConfig.schoolId, periodId] });
      onSaved("Đã lưu phân công GVCN; bảng tải dạy đã được cập nhật.");
      onOpenChange(false);
    },
  });
  const removeMutation = useMutation({
    mutationFn: (assignmentClassId: string) =>
      apiRequest(
        `/schools/${frontendConfig.schoolId}/academic-periods/${periodId}/classes/${assignmentClassId}/homeroom`,
        { method: "DELETE" },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["homeroom-assignments", frontendConfig.schoolId, periodId] });
      await queryClient.invalidateQueries({ queryKey: ["teacher-load-summary", frontendConfig.schoolId, periodId] });
      onSaved("Đã bỏ phân công GVCN; bảng tải dạy đã được cập nhật.");
    },
  });
  const error = saveMutation.error ?? removeMutation.error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="master-duty-dialog teacher-assignment-dialog">
        <DialogHeader>
          <DialogTitle>Phân công giáo viên chủ nhiệm</DialogTitle>
          <DialogDescription>
            {teacher.code} - {teacher.displayName}. Chọn lớp cụ thể; mặc định giảm 4 tiết/tuần theo Điều 9 khoản 1 Thông
            tư 05/2025/TT-BGDĐT.
          </DialogDescription>
        </DialogHeader>
        <div className="teacher-assignment-current">
          <div className="teacher-assignment-section-heading">
            <strong>Lớp đang chủ nhiệm</strong>
            <span>{teacherAssignments.length} lớp</span>
          </div>
          {teacherAssignments.length ? (
            <div className="teacher-assignment-list">
              {teacherAssignments.map((assignment) => (
                <div className="teacher-assignment-list-item" key={assignment.id}>
                  <span>
                    <strong>{assignment.classCode}</strong>
                    <small>
                      {assignment.className} · Giảm {assignment.weeklyReductionPeriods} tiết/tuần
                    </small>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    disabled={!canWrite || removeMutation.isPending}
                    onClick={() => void removeMutation.mutateAsync(assignment.classId)}
                  >
                    <Trash2 /> Bỏ gán
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="teacher-assignment-empty">Chưa chủ nhiệm lớp nào.</p>
          )}
        </div>
        <div className="teacher-assignment-form">
          <div className="teacher-assignment-section-heading">
            <strong>Thêm lớp chủ nhiệm</strong>
            <span>Lớp đã gán cho giáo viên khác không hiển thị</span>
          </div>
          <label>
            <span>Lớp</span>
            <select
              className="master-select"
              name="teacherHomeroomClass"
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
              disabled={!addableClasses.length}
            >
              <option value="">Chọn lớp</option>
              {addableClasses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} · {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error ? (
          <p className="master-dialog-error" role="alert">
            {error instanceof Error ? error.message : "Không thể cập nhật phân công GVCN."}
          </p>
        ) : null}
        <DialogFooter>
          <Button className="dialog-cancel" type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            type="button"
            disabled={!canWrite || !classId || saveMutation.isPending}
            onClick={() => void saveMutation.mutateAsync()}
          >
            {saveMutation.isPending ? "Đang lưu…" : "Lưu phân công"}
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
