import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { frontendConfig } from "../../config";
import { apiRequest } from "../../lib/api-client";

interface ClassOption {
  id: string;
  code: string;
  name: string;
}

interface TeacherOption {
  id: string;
  code: string;
  displayName: string;
}

interface HomeroomAssignment {
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
  homeroomClasses: number;
  reductionPeriods: number;
  adjustedWeeklyTarget: number;
  difference: number;
  status: "OVER" | "UNDER" | "ON_TARGET";
  duties: TeacherDuty[];
}

const RULE_CODE = "TT_05_2025_D9_1";

export function HomeroomAssignmentPanel({
  classes,
  teachers,
  periodId,
  canWrite,
}: {
  classes: ClassOption[];
  teachers: TeacherOption[];
  periodId: string;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [teacherId, setTeacherId] = useState("");
  const [notice, setNotice] = useState("");
  const assignmentQuery = useQuery({
    queryKey: ["homeroom-assignments", frontendConfig.schoolId, periodId],
    queryFn: ({ signal }) =>
      apiRequest<HomeroomAssignment[]>(
        `/schools/${frontendConfig.schoolId}/academic-periods/${periodId}/homeroom-assignments`,
        { signal },
      ),
    enabled: Boolean(frontendConfig.schoolId && periodId),
  });
  const assignments = assignmentQuery.data ?? [];
  const selectedAssignment = assignments.find((item) => item.classId === classId);
  useEffect(() => {
    if (!classId && classes[0]?.id) setClassId(classes[0].id);
  }, [classId, classes]);
  useEffect(() => {
    setTeacherId(selectedAssignment?.teacherId ?? "");
  }, [selectedAssignment?.teacherId]);
  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/schools/${frontendConfig.schoolId}/academic-periods/${periodId}/classes/${classId}/homeroom`, {
        method: "PUT",
        body: JSON.stringify({ teacherId, weeklyReductionPeriods: 4, ruleCode: RULE_CODE }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["homeroom-assignments", frontendConfig.schoolId, periodId] });
      await queryClient.invalidateQueries({ queryKey: ["teacher-load-summary", frontendConfig.schoolId, periodId] });
      setNotice("Đã lưu phân công GVCN; bảng tải dạy đã được cập nhật.");
    },
  });
  const removeMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/schools/${frontendConfig.schoolId}/academic-periods/${periodId}/classes/${classId}/homeroom`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["homeroom-assignments", frontendConfig.schoolId, periodId] });
      await queryClient.invalidateQueries({ queryKey: ["teacher-load-summary", frontendConfig.schoolId, periodId] });
      setTeacherId("");
      setNotice("Đã bỏ phân công GVCN của lớp.");
    },
  });
  const selectedClass = classes.find((item) => item.id === classId);
  const error = assignmentQuery.error ?? saveMutation.error ?? removeMutation.error;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Gán giáo viên chủ nhiệm</CardTitle>
        <CardDescription>
          Phân công theo từng lớp và năm học. Mặc định giảm 4 tiết/tuần theo Điều 9 khoản 1 Thông tư 05/2025/TT-BGDĐT.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
          <label className="grid gap-2 text-sm font-medium">
            Lớp
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
              disabled={!classes.length}
            >
              {classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} · {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Giáo viên chủ nhiệm
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={teacherId}
              onChange={(event) => setTeacherId(event.target.value)}
              disabled={!teachers.length}
            >
              <option value="">Chưa gán</option>
              {teachers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} · {item.displayName}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            disabled={!canWrite || !classId || !teacherId || saveMutation.isPending}
            onClick={() => void saveMutation.mutateAsync()}
          >
            {saveMutation.isPending ? "Đang lưu..." : "Lưu GVCN"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canWrite || !selectedAssignment || removeMutation.isPending}
            onClick={() => void removeMutation.mutateAsync()}
          >
            Bỏ gán
          </Button>
        </div>
        {selectedClass && selectedAssignment ? (
          <p className="text-sm text-muted-foreground">
            {selectedClass.code} hiện do <strong>{selectedAssignment.teacherName}</strong> chủ nhiệm; mức giảm đang áp
            dụng: {selectedAssignment.weeklyReductionPeriods} tiết/tuần.
          </p>
        ) : null}
        {notice ? <p className="text-sm text-emerald-700 dark:text-emerald-300">{notice}</p> : null}
        {error ? (
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Không thể cập nhật GVCN."}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function TeacherLoadSummaryPanel({ periodId }: { periodId: string }) {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tổng hợp tải dạy giáo viên</CardTitle>
        <CardDescription>
          Tiết dạy/tuần lấy từ kế hoạch phân công môn học; GVCN được hiển thị riêng và trừ vào định mức theo chức vụ.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {summaryQuery.isPending ? <p className="text-sm text-muted-foreground">Đang tổng hợp...</p> : null}
        {summaryQuery.error ? (
          <p className="text-sm text-destructive">
            {summaryQuery.error instanceof Error ? summaryQuery.error.message : "Không thể tổng hợp tải dạy."}
          </p>
        ) : null}
        {!summaryQuery.isPending && !summaryQuery.error ? (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[960px] text-sm">
              <caption className="sr-only">Tổng hợp tải dạy giáo viên theo tuần</caption>
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">Giáo viên</th>
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
                {rows.map((row) => (
                  <tr className="border-t" key={row.teacherId}>
                    <td className="px-3 py-3">
                      <strong>{row.teacherName}</strong>
                      <span className="block text-xs text-muted-foreground">{row.teacherCode}</span>
                    </td>
                    <td className="px-3 py-3">
                      {row.duties.length
                        ? row.duties.map((duty) => `${duty.label} (${duty.count})`).join(", ")
                        : "Chưa có"}
                    </td>
                    <td className="px-3 py-3 tabular-nums">{row.teachingPeriods}</td>
                    <td className="px-3 py-3 tabular-nums">{row.standardWeeklyPeriods}</td>
                    <td className="px-3 py-3 tabular-nums">{row.reductionPeriods}</td>
                    <td className="px-3 py-3 tabular-nums">{row.adjustedWeeklyTarget}</td>
                    <td className="px-3 py-3 tabular-nums">
                      {row.difference > 0 ? `+${row.difference}` : row.difference}
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={row.status === "ON_TARGET" ? "default" : "secondary"}>
                        {statusLabel[row.status]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
