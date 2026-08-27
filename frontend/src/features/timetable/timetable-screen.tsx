import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageHeader } from "../../app/app-shell";
import { frontendConfig } from "../../config";
import { apiBlob } from "../../lib/api-client";
import { navigateTo } from "../../routing";
import { OptimizationJobPanel } from "./optimization-job-panel";
import { TimetableGrid } from "./timetable-grid";
import { loadTimetable } from "./timetable-api";
import type { TimetableView } from "./timetable-types";
import { ReleasePanel } from "./release-panel";

const statusLabels: Record<string, string> = {
  DRAFT: "Bản nháp",
  IN_REVIEW: "Đang rà soát",
  APPROVED: "Đã phê duyệt",
  LOCKED: "Đã khóa",
  PUBLISHED: "Đã công bố",
  ARCHIVED: "Đã lưu trữ",
};

export function TimetableScreen() {
  const [view, setView] = useState<TimetableView>("school");
  const [query, setQuery] = useState("");
  const [exportNotice, setExportNotice] = useState("");
  const timetableQuery = useQuery({
    queryKey: ["timetable", frontendConfig.schoolId, frontendConfig.scheduleVersionId],
    queryFn: ({ signal }) => loadTimetable(signal),
    enabled: Boolean(frontendConfig.schoolId && frontendConfig.scheduleVersionId),
  });
  const data = timetableQuery.data ?? null;
  const state =
    !frontendConfig.schoolId || !frontendConfig.scheduleVersionId
      ? "empty"
      : timetableQuery.isPending
        ? "loading"
        : timetableQuery.isError
          ? "error"
          : data?.assignments.length
            ? "ready"
            : "empty";
  const notice =
    !frontendConfig.schoolId || !frontendConfig.scheduleVersionId
      ? "Chưa cấu hình VITE_SCHOOL_ID và VITE_SCHEDULE_VERSION_ID. Thời khóa biểu chỉ hiển thị dữ liệu từ API."
      : timetableQuery.error instanceof Error
        ? timetableQuery.error.message
        : exportNotice;
  const exportMutation = useMutation({
    mutationFn: () =>
      apiBlob(
        `/schools/${frontendConfig.schoolId}/schedule-versions/${frontendConfig.scheduleVersionId}/export.xlsx?view=${view === "school" ? "all" : view}`,
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
  const filtered = useMemo(() => data?.assignments ?? [], [data]);

  return (
    <>
      <PageHeader
        eyebrow="Tối ưu và rà soát"
        title="Thời khóa biểu"
        description="Xem nhanh toàn bộ lịch học theo lớp hoặc chuyển sang góc nhìn giáo viên, phòng từ cùng một phiên bản API."
        action={
          <button className="button-secondary" type="button" onClick={() => navigateTo("imports")}>
            ← Quay lại nhập dữ liệu
          </button>
        }
      />
      <OptimizationJobPanel />
      <section className="panel timetable-shell" aria-labelledby="timetable-title">
        <div className="timetable-toolbar">
          <div>
            <p className="eyebrow">Phiên bản thời khóa biểu</p>
            <h2 id="timetable-title">Rà soát phân công theo tài nguyên</h2>
            <p className="small-note">
              {data
                ? `Phiên bản ${data.snapshot.id} · revision ${data.snapshot.revision} · ${statusLabels[data.snapshot.status] ?? data.snapshot.status}`
                : "Chưa có phiên bản được tải."}
            </p>
          </div>
          <span className="solve-status">{data ? `${data.assignments.length} phân công` : "Chưa có dữ liệu"}</span>
        </div>
        <div className="timetable-controls" aria-label="Bộ lọc thời khóa biểu">
          <div className="view-switcher" role="tablist" aria-label="Góc nhìn thời khóa biểu">
            {(["school", "class", "teacher", "room"] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={view === option}
                className={view === option ? "view-tab active" : "view-tab"}
                onClick={() => setView(option)}
              >
                {option === "school"
                  ? "Toàn trường"
                  : option === "class"
                    ? "Theo lớp"
                    : option === "teacher"
                      ? "Theo giáo viên"
                      : "Theo phòng"}
              </button>
            ))}
          </div>
          <label className="search-picker">
            <span>Tìm trong thời khóa biểu</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Môn, lớp, giáo viên, phòng"
            />
          </label>
          <button className="button-secondary" type="button" onClick={() => void timetableQuery.refetch()}>
            Làm mới
          </button>
          <button
            type="button"
            onClick={() => void exportMutation.mutateAsync()}
            disabled={exportMutation.isPending || !data}
          >
            {exportMutation.isPending ? "Đang xuất..." : "Xuất Excel"}
          </button>
        </div>
        {notice ? (
          <div className="alert alert-error" role="alert">
            {notice}
          </div>
        ) : null}
        {state === "loading" ? (
          <div className="timetable-state" role="status">
            <div className="state-icon loading-icon" aria-hidden="true">
              …
            </div>
            <h3>Đang tải dữ liệu</h3>
            <p>Đang đọc phiên bản thời khóa biểu từ API.</p>
          </div>
        ) : state === "error" ? (
          <div className="timetable-state error-state" role="alert">
            <div className="state-icon error-icon" aria-hidden="true">
              !
            </div>
            <h3>Không thể tải thời khóa biểu</h3>
            <p>Kiểm tra API, mã trường và phiên bản thời khóa biểu.</p>
            <button className="button-secondary" type="button" onClick={() => void timetableQuery.refetch()}>
              Thử lại
            </button>
          </div>
        ) : (
          <TimetableGrid
            assignments={filtered}
            classLabels={data?.classLabels ?? []}
            homerooms={data?.homerooms ?? []}
            view={view}
            query={query}
          />
        )}
        <section className="history-panel" aria-labelledby="history-panel-title">
          <div className="history-heading">
            <div>
              <p className="eyebrow">Nhật ký thao tác</p>
              <h3 id="history-panel-title">Lịch sử phiên bản</h3>
            </div>
            <span className="history-count">{data?.history.length ?? 0} sự kiện</span>
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
            <p className="small-note history-empty">Chưa có nhật ký phiên bản từ API.</p>
          )}
        </section>
        {data ? <ReleasePanel versionId={data.snapshot.id} status={data.snapshot.status} /> : null}
      </section>
    </>
  );
}
