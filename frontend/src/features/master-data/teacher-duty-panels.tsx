import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      await queryClient.invalidateQueries({ queryKey: ["rule-profiles", frontendConfig.schoolId, periodId] });
      await queryClient.invalidateQueries({ queryKey: ["active-rule-snapshot", frontendConfig.schoolId, periodId] });
      onSaved("Đã lưu phân công GVCN; bảng tải dạy và bộ quy tắc DRAFT đã được cập nhật.");
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
      await queryClient.invalidateQueries({ queryKey: ["rule-profiles", frontendConfig.schoolId, periodId] });
      await queryClient.invalidateQueries({ queryKey: ["active-rule-snapshot", frontendConfig.schoolId, periodId] });
      setTeacherId("");
      onSaved("Đã bỏ phân công GVCN; bộ quy tắc DRAFT đã được cập nhật.");
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
      await queryClient.invalidateQueries({ queryKey: ["rule-profiles", frontendConfig.schoolId, periodId] });
      await queryClient.invalidateQueries({ queryKey: ["active-rule-snapshot", frontendConfig.schoolId, periodId] });
      onSaved("Đã lưu phân công GVCN; bảng tải dạy và bộ quy tắc DRAFT đã được cập nhật.");
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
      await queryClient.invalidateQueries({ queryKey: ["rule-profiles", frontendConfig.schoolId, periodId] });
      await queryClient.invalidateQueries({ queryKey: ["active-rule-snapshot", frontendConfig.schoolId, periodId] });
      onSaved("Đã bỏ phân công GVCN; bộ quy tắc DRAFT đã được cập nhật.");
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
