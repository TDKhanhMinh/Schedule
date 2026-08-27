import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { PublicScheduleViewResult, SchedulePublicView } from "@schedule/backend/contracts";
import { frontendConfig } from "../../config";
import { apiRequest } from "../../lib/api-client";

function tokenFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts.at(-1) ?? "";
}

function viewLabel(view: SchedulePublicView) {
  if (view === "class") return "Theo lớp";
  if (view === "teacher") return "Theo giáo viên";
  if (view === "room") return "Theo phòng";
  return "Tất cả";
}

export function PublicScheduleScreen() {
  const token = tokenFromPath();
  const [view, setView] = useState<SchedulePublicView>("all");
  const [resource, setResource] = useState("");
  const scheduleQuery = useQuery({
    queryKey: ["public-schedule", token, view, resource],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ view });
      if (resource) params.set("resource", resource);
      return apiRequest<PublicScheduleViewResult>(
        `/public/schedules/${encodeURIComponent(token)}?${params.toString()}`,
        { signal },
      );
    },
    enabled: Boolean(token),
  });
  const snapshot = scheduleQuery.data ?? null;
  const state = scheduleQuery.isPending ? "loading" : scheduleQuery.isError || !snapshot ? "error" : "ready";
  const error = scheduleQuery.error instanceof Error ? scheduleQuery.error.message : "";

  const resourceOptions = useMemo(() => {
    if (!snapshot || view === "all") return [];
    if (view === "class") return snapshot.resources.classes;
    if (view === "teacher") return snapshot.resources.teachers;
    return snapshot.resources.rooms;
  }, [snapshot, view]);

  function handleViewChange(nextView: SchedulePublicView) {
    setView(nextView);
    setResource("");
  }

  const pdfParams = new URLSearchParams({ view });
  if (resource) pdfParams.set("resource", resource);
  const pdfUrl = `${frontendConfig.apiBaseUrl}/public/schedules/${encodeURIComponent(token)}.pdf?${pdfParams.toString()}`;

  if (state === "loading") {
    return <main className="public-view-shell public-view-state">Đang tải thời khóa biểu công khai…</main>;
  }
  if (state === "error" || !snapshot) {
    return (
      <main className="public-view-shell public-view-state" role="alert">
        <span className="public-watermark">CHỈ ĐỌC CÔNG KHAI</span>
        <h1>Không thể mở thời khóa biểu</h1>
        <p>{error || "Liên kết công khai không khả dụng."}</p>
      </main>
    );
  }

  return (
    <main className="public-view-shell" data-public-view-contract={snapshot.contractVersion}>
      <header className="public-view-header">
        <div>
          <p className="eyebrow">{snapshot.watermark} · không có quyền chỉnh sửa</p>
          <h1>{snapshot.school.name}</h1>
          <p className="lead">
            {snapshot.academicPeriod.name} · Phiên bản {snapshot.scheduleVersion.number} · ĐÃ CÔNG BỐ · Lần sửa đổi{" "}
            {snapshot.scheduleVersion.revision}
          </p>
          <p className="public-view-meta">
            Liên kết hết hạn: {snapshot.linkExpiresAt} · Hợp đồng {snapshot.contractVersion}
          </p>
        </div>
        <div className="public-view-actions">
          <a className="button-secondary" href={pdfUrl} target="_blank" rel="noreferrer">
            Mở bản PDF
          </a>
          <button type="button" onClick={() => window.print()}>
            In trang này
          </button>
        </div>
      </header>

      <section className="public-view-panel" aria-labelledby="public-view-title">
        <div className="public-view-toolbar">
          <div>
            <p className="eyebrow">Phân phối chỉ đọc</p>
            <h2 id="public-view-title">{viewLabel(view)}</h2>
          </div>
          <span className="public-version-badge">CHỈ ĐỌC CÔNG KHAI</span>
        </div>
        <div className="public-view-filters" aria-label="Bộ lọc thời khóa biểu công khai">
          <div className="view-switcher" role="tablist" aria-label="Góc nhìn công khai">
            {(["all", "class", "teacher", "room"] as const).map((option) => (
              <button
                type="button"
                role="tab"
                aria-selected={view === option}
                className={view === option ? "view-tab active" : "view-tab"}
                onClick={() => handleViewChange(option)}
                key={option}
              >
                {viewLabel(option)}
              </button>
            ))}
          </div>
          {view !== "all" ? (
            <label className="public-resource-picker">
              <span>Lọc tài nguyên</span>
              <select
                name="publicScheduleResource"
                aria-label="Lọc tài nguyên"
                value={resource}
                onChange={(event) => setResource(event.target.value)}
              >
                <option value="">Tất cả</option>
                {resourceOptions.map((option) => (
                  <option value={option} key={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        <div className="public-read-only-notice" role="status">
          Bản chụp đã công bố và không thể thay đổi. Không có thao tác chuyển, khóa, phê duyệt hoặc công bố trên chế độ
          xem công khai.
        </div>

        <div className="public-table-wrap">
          <table className="public-schedule-table">
            <caption className="sr-only">Thời khóa biểu công khai {viewLabel(view)}</caption>
            <thead>
              <tr>
                <th scope="col">Lớp</th>
                <th scope="col">Thứ</th>
                <th scope="col">Tiết</th>
                <th scope="col">Giờ</th>
                <th scope="col">Môn</th>
                <th scope="col">Giáo viên</th>
                <th scope="col">Phòng</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.assignments.length > 0 ? (
                snapshot.assignments.map((assignment, index) => (
                  <tr
                    key={`${assignment.classCode}-${assignment.day}-${assignment.period}-${assignment.subjectCode}-${index}`}
                  >
                    <td>{assignment.className}</td>
                    <td>Thứ {assignment.day}</td>
                    <td>{assignment.period}</td>
                    <td>
                      {assignment.startsAt && assignment.endsAt ? `${assignment.startsAt}-${assignment.endsAt}` : "-"}
                    </td>
                    <td>
                      <strong>{assignment.subjectName}</strong>
                      <small>{assignment.subjectCode}</small>
                    </td>
                    <td>{assignment.teacherName}</td>
                    <td>{assignment.roomName ?? "-"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="public-empty-row">
                    Bản chụp không có phân công phù hợp bộ lọc.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
