import { useEffect, useMemo, useState } from "react";
import type { PublicScheduleViewResult, SchedulePublicView } from "@schedule/backend/contracts";
import { frontendConfig } from "./config";

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
  const [snapshot, setSnapshot] = useState<PublicScheduleViewResult | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ view });
    if (resource) params.set("resource", resource);
    setState("loading");
    fetch(`${frontendConfig.apiBaseUrl}/public/schedules/${encodeURIComponent(token)}?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as PublicScheduleViewResult | { message?: string };
        if (!response.ok)
          throw new Error("message" in payload && payload.message ? payload.message : "Public link không khả dụng.");
        setSnapshot(payload as PublicScheduleViewResult);
        setState("ready");
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Không thể tải public timetable.");
        setState("error");
      });
    return () => controller.abort();
  }, [resource, token, view]);

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
    return <main className="public-view-shell public-view-state">Đang tải timetable public...</main>;
  }
  if (state === "error" || !snapshot) {
    return (
      <main className="public-view-shell public-view-state" role="alert">
        <span className="public-watermark">PUBLIC READ ONLY</span>
        <h1>Không thể mở timetable</h1>
        <p>{error || "Public link không khả dụng."}</p>
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
            {snapshot.academicPeriod.name} · Version {snapshot.scheduleVersion.number} · PUBLISHED · Revision{" "}
            {snapshot.scheduleVersion.revision}
          </p>
          <p className="public-view-meta">
            Link hết hạn: {snapshot.linkExpiresAt} · Contract {snapshot.contractVersion}
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
            <p className="eyebrow">Read-only distribution</p>
            <h2 id="public-view-title">{viewLabel(view)}</h2>
          </div>
          <span className="public-version-badge">PUBLIC READ ONLY</span>
        </div>
        <div className="public-view-filters" aria-label="Bộ lọc timetable public">
          <div className="view-switcher" role="tablist" aria-label="Góc nhìn public">
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
              <span>Lọc resource</span>
              <select value={resource} onChange={(event) => setResource(event.target.value)}>
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
          Snapshot đã publish và immutable. Không có thao tác move, lock, approve hoặc publish trên public view.
        </div>

        <div className="public-table-wrap">
          <table className="public-schedule-table">
            <caption className="sr-only">Timetable public {viewLabel(view)}</caption>
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
                    Snapshot không có assignment phù hợp bộ lọc.
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
