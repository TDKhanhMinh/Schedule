import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, Download, RefreshCw, Search, ServerCrash, Table2, UsersRound } from "lucide-react";
import type { SolveJobResult } from "@schedule/backend/contracts";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "../../app/app-shell";
import { useWorkspace } from "../../app/workspace-provider";
import { frontendConfig } from "../../config";
import { apiBlob, apiRequest } from "../../lib/api-client";
import { navigateTo } from "../../routing";
import { OptimizationJobPanel } from "./optimization-job-panel";
import { ReleasePanel } from "./release-panel";
import { buildTimetableAssignments, loadTimetable, type TimetableSolveInput } from "./timetable-api";
import { TimetableGrid } from "./timetable-grid";
import type { TimetableView } from "./timetable-types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { WorkspaceScheduleVersion } from "../../app/workspace-types";

const statusLabels: Record<string, string> = {
  DRAFT: "Bản nháp",
  IN_REVIEW: "Đang rà soát",
  APPROVED: "Đã phê duyệt",
  LOCKED: "Đã khóa",
  PUBLISHED: "Đã công bố",
  ARCHIVED: "Đã lưu trữ",
};

const viewOptions: Array<{ value: TimetableView; label: string; icon: typeof Table2 }> = [
  { value: "school", label: "Toàn trường", icon: Table2 },
  { value: "class", label: "Theo lớp", icon: CalendarDays },
  { value: "teacher", label: "Theo giáo viên", icon: UsersRound },
  { value: "room", label: "Theo phòng", icon: Table2 },
];

const TIMETABLE_SOLVE_TIME_LIMIT_SECONDS = 120;

export function TimetableScreen() {
  const {
    schoolId,
    academicPeriodId,
    scheduleVersionId,
    scheduleVersions,
    scheduleVersionsPending,
    scheduleVersionsError,
    setScheduleVersionId,
  } = useWorkspace();
  const queryClient = useQueryClient();
  const [view, setView] = useState<TimetableView>("school");
  const [query, setQuery] = useState("");
  const [exportNotice, setExportNotice] = useState("");
  const [versionNotice, setVersionNotice] = useState("");
  const [solverPreview, setSolverPreview] = useState<SolveJobResult | null>(null);
  const timetableQuery = useQuery({
    queryKey: ["timetable", schoolId, academicPeriodId, scheduleVersionId],
    queryFn: ({ signal }) => loadTimetable(signal, { schoolId, academicPeriodId, scheduleVersionId }),
    enabled: Boolean(schoolId && academicPeriodId && scheduleVersionId),
  });
  const availableScheduleVersions = scheduleVersions.filter((version) => version.status !== "ARCHIVED");
  const canWrite = frontendConfig.actorRole === "ADMIN" || frontendConfig.actorRole === "SCHEDULER";
  const createScheduleVersionMutation = useMutation({
    mutationFn: () =>
      apiRequest<WorkspaceScheduleVersion>(`/schools/${schoolId}/schedule-versions`, {
        method: "POST",
        body: JSON.stringify({ academicPeriodId }),
      }),
    onSuccess: async (version) => {
      queryClient.setQueryData<WorkspaceScheduleVersion[]>(
        ["workspace-schedule-versions", schoolId, academicPeriodId],
        (current) => [version, ...(current ?? []).filter((item) => item.id !== version.id)],
      );
      setScheduleVersionId(version.id);
      setVersionNotice(`Đã khởi tạo phiên bản TKB DRAFT số ${version.versionNumber}.`);
      await queryClient.invalidateQueries({ queryKey: ["workspace-schedule-versions", schoolId, academicPeriodId] });
    },
    onError: (error) =>
      setVersionNotice(error instanceof Error ? error.message : "Không thể khởi tạo phiên bản thời khóa biểu."),
  });
  const data = timetableQuery.data ?? null;
  const activeLessonRequirements = data?.lessonRequirements.filter(({ status }) => status !== "ARCHIVED") ?? [];
  const shiftConfigByGrade = new Map((data?.gradeShiftConfigs ?? []).map((config) => [config.grade, config]));
  const classGradeEntries =
    data?.classes.flatMap((item) => (item.grade === undefined ? [] : [[item.id, item.grade] as const])) ?? [];
  const solveInput: TimetableSolveInput | null =
    data && schoolId && data.timeSlots.length > 0 && activeLessonRequirements.length > 0
      ? {
          schemaVersion: "1.0",
          schoolId,
          academicPeriodId: data.snapshot.academicPeriodId,
          timeSlots: data.timeSlots.map(({ id, day, period, shiftCode }) => ({
            id,
            day,
            period,
            ...(shiftCode ? { shiftCode } : {}),
          })),
          lessons: activeLessonRequirements.map(
            ({ id, classId, subjectId, teacherId, requiredSessions, fixedSlotId }) => ({
              id,
              classId,
              subjectId,
              teacherId,
              requiredSessions,
              ...(fixedSlotId ? { fixedSlotId } : {}),
            }),
          ),
          classGrades: Object.fromEntries(classGradeEntries),
          classShiftPolicies: Object.fromEntries(
            data.classes.flatMap((item) => {
              const config = item.grade === undefined ? undefined : shiftConfigByGrade.get(item.grade);
              return config
                ? [
                    [
                      item.id,
                      {
                        mainShiftCode: config.mainShiftCode,
                        secondaryShiftCode: config.secondaryShiftCode,
                        allowSecondary: config.allowSecondary,
                      },
                    ] as const,
                  ]
                : [];
            }),
          ),
          options: { timeLimitSeconds: TIMETABLE_SOLVE_TIME_LIMIT_SECONDS },
        }
      : null;
  const solverPreviewAssignments =
    solverPreview && data
      ? buildTimetableAssignments(solverPreview.assignments, {
          lessonRequirements: data.lessonRequirements,
          timeSlots: data.timeSlots,
          classes: data.classes,
          subjects: data.subjects,
          teachers: data.teachers,
          rooms: data.rooms,
        })
      : null;
  const displayedAssignments = solverPreviewAssignments ?? data?.assignments ?? [];
  const handleSolveCompleted = useCallback((result: SolveJobResult) => setSolverPreview(result), []);
  useEffect(() => {
    setSolverPreview(null);
  }, [data?.snapshot.id, data?.snapshot.revision]);
  const state =
    !schoolId || !academicPeriodId
      ? "empty"
      : scheduleVersionsPending
        ? "loading"
        : scheduleVersionsError || timetableQuery.isError
          ? "error"
          : !scheduleVersionId
            ? "empty"
            : timetableQuery.isPending
              ? "loading"
              : data?.assignments.length
                ? "ready"
                : "empty";
  const notice =
    !schoolId || !academicPeriodId
      ? "Chọn trường và năm học để tải phiên bản thời khóa biểu."
      : scheduleVersionsError
        ? scheduleVersionsError.message
        : timetableQuery.error instanceof Error
          ? timetableQuery.error.message
          : versionNotice || exportNotice;
  const exportMutation = useMutation({
    mutationFn: () =>
      apiBlob(
        `/schools/${schoolId}/schedule-versions/${scheduleVersionId}/export.xlsx?view=${view === "school" ? "all" : view}`,
      ),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `thoi-khoa-bieu-${view === "school" ? "toan-truong" : view}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
      setExportNotice("Đã xuất tệp Excel từ phiên bản trên máy chủ.");
    },
    onError: (error) => setExportNotice(error instanceof Error ? error.message : "Không thể xuất tệp Excel."),
  });
  return (
    <div className="timetable-screen">
      <PageHeader
        eyebrow="Tối ưu và rà soát"
        title="Thời khóa biểu"
        description="Xem lịch học theo lớp, giáo viên, phòng hoặc toàn trường trong cùng một phiên bản dữ liệu."
        action={
          <Button variant="outline" type="button" onClick={() => navigateTo("data-quality")}>
            <ChevronLeft /> Kiểm tra dữ liệu
          </Button>
        }
      />

      <OptimizationJobPanel solveInput={solveInput} onSolveCompleted={handleSolveCompleted} />
      {solverPreview ? (
        <Alert className="timetable-preview-alert">
          <Table2 />
          <AlertDescription>
            Đã tìm được phương án {solverPreview.status === "OPTIMAL" ? "tối ưu" : "khả thi"} với{" "}
            {solverPreview.assignments.length} phân công. Đang hiển thị tạm thời; phương án này chưa thay thế phiên bản
            đã lưu.
            <Button variant="outline" size="sm" type="button" onClick={() => setSolverPreview(null)}>
              Quay về phiên bản đã lưu
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="timetable-workspace" aria-labelledby="timetable-title" aria-busy={timetableQuery.isFetching}>
        <div className="timetable-workspace-heading">
          <div className="timetable-workspace-title">
            <span className="timetable-section-kicker">Phiên bản thời khóa biểu</span>
            <h2 id="timetable-title">Rà soát phân công theo tài nguyên</h2>
            <p>
              {data
                ? `Phiên bản ${data.snapshot.id} - revision ${data.snapshot.revision} - ${statusLabels[data.snapshot.status] ?? data.snapshot.status}`
                : "Chưa có phiên bản được tải từ API."}
            </p>
          </div>
          <div className="timetable-workspace-status">
            <Badge variant={data ? "default" : "secondary"} role="status" aria-live="polite">
              {data ? (statusLabels[data.snapshot.status] ?? data.snapshot.status) : "Chưa có dữ liệu"}
            </Badge>
            <span>{data ? `${data.assignments.length} phân công` : "Đang chờ dữ liệu"}</span>
          </div>
        </div>

        <div className="timetable-control-surface">
          <div className="timetable-view-row">
            <div>
              <span className="timetable-control-label">Góc nhìn</span>
              <Tabs
                value={view}
                onValueChange={(next) => {
                  if (isTimetableView(next)) setView(next);
                }}
              >
                <TabsList className="timetable-view-tabs" aria-label="Góc nhìn thời khóa biểu">
                  {viewOptions.map((option) => {
                    const Icon = option.icon;
                    return (
                      <TabsTrigger value={option.value} key={option.value}>
                        <Icon />
                        {option.label}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </Tabs>
            </div>
            <div className="timetable-toolbar-note">
              <span className="timetable-toolbar-note-icon" aria-hidden="true">
                <Table2 />
              </span>
              <span>Buổi và tiết được hiển thị riêng trong lưới.</span>
            </div>
            <label className="timetable-version-field">
              <span className="timetable-control-label">Phiên bản TKB</span>
              <Select
                value={scheduleVersionId}
                onValueChange={setScheduleVersionId}
                disabled={scheduleVersionsPending || availableScheduleVersions.length === 0}
              >
                <SelectTrigger aria-label="Chọn phiên bản thời khóa biểu">
                  <SelectValue placeholder={scheduleVersionsPending ? "Đang tải phiên bản" : "Chưa có phiên bản"} />
                </SelectTrigger>
                <SelectContent>
                  {availableScheduleVersions.map((version) => (
                    <SelectItem value={version.id} key={version.id}>
                      {scheduleVersionLabel(version)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>

          <div className="timetable-filter-row">
            <label className="timetable-search-field">
              <span className="timetable-control-label">Tìm trong thời khóa biểu</span>
              <span className="timetable-search-input">
                <Search aria-hidden="true" />
                <Input
                  type="search"
                  name="timetableSearch"
                  autoComplete="off"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Môn, lớp, giáo viên, phòng"
                />
              </span>
            </label>
            <div className="timetable-toolbar-actions">
              <Button variant="outline" type="button" onClick={() => void timetableQuery.refetch()}>
                <RefreshCw className={timetableQuery.isFetching ? "animate-spin" : undefined} /> Làm mới
              </Button>
              <Button
                type="button"
                onClick={() => void exportMutation.mutateAsync()}
                disabled={exportMutation.isPending || !data}
              >
                <Download /> {exportMutation.isPending ? "Đang xuất…" : "Xuất Excel"}
              </Button>
            </div>
          </div>
        </div>

        {notice ? (
          <Alert
            className="timetable-inline-alert"
            variant={timetableQuery.isError || scheduleVersionsError ? "destructive" : "default"}
          >
            <ServerCrash />
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}

        {state === "loading" ? (
          <div className="timetable-state timetable-loading-state" role="status">
            <span className="timetable-state-icon" aria-hidden="true">
              <RefreshCw />
            </span>
            <h3>Đang tải dữ liệu</h3>
            <p>Đang đọc phiên bản thời khóa biểu từ API.</p>
          </div>
        ) : state === "error" ? (
          <div className="timetable-state timetable-error-state" role="alert">
            <span className="timetable-state-icon" aria-hidden="true">
              <ServerCrash />
            </span>
            <h3>Không thể tải thời khóa biểu</h3>
            <p>Kiểm tra API, mã trường và phiên bản thời khóa biểu.</p>
            <Button variant="outline" type="button" onClick={() => void timetableQuery.refetch()}>
              Thử lại
            </Button>
          </div>
        ) : state === "empty" ? (
          <div className="timetable-state timetable-empty-state" role="status">
            <span className="timetable-state-icon" aria-hidden="true">
              <Table2 />
            </span>
            <h3>
              {!schoolId || !academicPeriodId
                ? "Chưa đủ bối cảnh làm việc"
                : !scheduleVersionId
                  ? "Chưa có phiên bản TKB"
                  : "Phiên bản chưa có phân công"}
            </h3>
            <p>
              {!schoolId || !academicPeriodId
                ? "Chọn trường và năm học ở phần đầu trang để tiếp tục."
                : !scheduleVersionId
                  ? "Khởi tạo một phiên bản DRAFT để nạp dữ liệu và bắt đầu xếp thời khóa biểu."
                  : "Phiên bản hiện tại chưa có phân công được lưu từ máy chủ."}
            </p>
            {!schoolId || !academicPeriodId || scheduleVersionId ? null : (
              <Button
                type="button"
                onClick={() => void createScheduleVersionMutation.mutateAsync()}
                disabled={!canWrite || createScheduleVersionMutation.isPending}
              >
                {createScheduleVersionMutation.isPending ? "Đang khởi tạo…" : "Khởi tạo phiên bản TKB"}
              </Button>
            )}
          </div>
        ) : (
          <div className="timetable-grid-content">
            <TimetableGrid
              assignments={displayedAssignments}
              classLabels={data?.classLabels ?? []}
              homerooms={data?.homerooms ?? []}
              view={view}
              query={query}
            />
          </div>
        )}

        <section className="timetable-history-panel" aria-labelledby="history-panel-title">
          <div className="timetable-history-heading">
            <div>
              <span className="timetable-section-kicker">Nhật ký thao tác</span>
              <h3 id="history-panel-title">Lịch sử phiên bản</h3>
            </div>
            <Badge variant="outline">{data?.history.length ?? 0} sự kiện</Badge>
          </div>
          {data?.history.length ? (
            <ol className="history-list" aria-label="Lịch sử phiên bản">
              {data.history.map((entry) => (
                <li className="history-item" key={entry.id}>
                  <span className="history-kind">{entry.action ?? "Thay đổi"}</span>
                  <div>
                    <strong>{entry.actorId ?? "Người thực hiện không xác định"}</strong>
                    <p>{entry.createdAt ? new Date(entry.createdAt).toLocaleString("vi-VN") : "Chưa có"}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="timetable-history-empty">Chưa có nhật ký phiên bản từ API.</p>
          )}
        </section>
      </section>
      {data ? <ReleasePanel versionId={data.snapshot.id} status={data.snapshot.status} /> : null}
    </div>
  );
}

function scheduleVersionLabel(version: WorkspaceScheduleVersion) {
  const statusLabels: Record<WorkspaceScheduleVersion["status"], string> = {
    DRAFT: "Bản nháp",
    IN_REVIEW: "Đang rà soát",
    APPROVED: "Đã phê duyệt",
    LOCKED: "Đã khóa",
    PUBLISHED: "Đã công bố",
    ARCHIVED: "Đã lưu trữ",
  };
  return `V${version.versionNumber} · ${statusLabels[version.status]}`;
}

function isTimetableView(value: string): value is TimetableView {
  return value === "school" || value === "class" || value === "teacher" || value === "room";
}
