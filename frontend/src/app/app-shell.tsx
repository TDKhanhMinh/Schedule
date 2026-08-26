import { useQuery } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { authHeaders } from "../config";
import { apiRequest } from "../lib/api-client";
import { navigateTo, type AppRoute } from "../routing";

export type ApiStatus = "checking" | "online" | "offline";

const navigation: Array<{ route: AppRoute; label: string; shortLabel: string }> = [
  { route: "dashboard", label: "Tổng quan", shortLabel: "Trang chủ" },
  { route: "master-data", label: "Dữ liệu danh mục", shortLabel: "Dữ liệu" },
  { route: "imports", label: "Nhập dữ liệu", shortLabel: "Nhập" },
  { route: "timetable", label: "Thời khóa biểu", shortLabel: "Lịch học" },
];

export function useApiStatus() {
  const query = useQuery({
    queryKey: ["health"],
    queryFn: ({ signal }) => apiRequest<{ status: string }>("/health", { signal }),
    retry: 0,
    refetchInterval: 30_000,
  });
  if (query.isPending) return "checking" satisfies ApiStatus;
  return query.isSuccess ? ("online" satisfies ApiStatus) : ("offline" satisfies ApiStatus);
}

function apiStatusLabel(apiStatus: ApiStatus) {
  if (apiStatus === "checking") return "đang kiểm tra";
  if (apiStatus === "online") return "đang hoạt động";
  return "chưa kết nối";
}

export function AppShell({
  route,
  apiStatus,
  children,
}: {
  route: AppRoute;
  apiStatus: ApiStatus;
  children: ReactNode;
}) {
  return (
    <div className="app-frame">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => navigateTo("dashboard")} aria-label="Về tổng quan">
          <span className="brand-mark" aria-hidden="true">
            ST
          </span>
          <span>
            <strong>Thời khóa biểu trường học</strong>
            <small>Bộ tối ưu · MVP-0.1.0</small>
          </span>
        </button>
        <div className="topbar-meta">
          <span className={`status status-${apiStatus}`}>
            <span aria-hidden="true" /> API {apiStatusLabel(apiStatus)}
          </span>
          <span className="user-chip">QC cục bộ</span>
        </div>
      </header>

      <div className="app-body">
        <aside className="sidebar" aria-label="Điều hướng chính">
          <p className="sidebar-label">Không gian làm việc</p>
          <nav>
            {navigation.map((item) => (
              <a
                className={route === item.route ? "nav-link active" : "nav-link"}
                href={item.route === "dashboard" ? "/" : `/${item.route}`}
                aria-current={route === item.route ? "page" : undefined}
                key={item.route}
                onClick={(event) => {
                  event.preventDefault();
                  navigateTo(item.route);
                }}
              >
                <span className="nav-icon" aria-hidden="true">
                  {item.shortLabel.slice(0, 1)}
                </span>
                {item.label}
              </a>
            ))}
          </nav>
          <div className="sidebar-footer">
            <span className="eyebrow">Phạm vi</span>
            <strong>THCS / THPT</strong>
            <small>Ưu tiên web · cấu hình theo trường</small>
          </div>
        </aside>

        <main className="content">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="lead">{description}</p>
      </div>
      {action ? <div className="page-header-action">{action}</div> : null}
    </div>
  );
}

export function readApiMessage(payload: unknown) {
  if (typeof payload === "object" && payload !== null && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Có lỗi xảy ra. Vui lòng thử lại.";
}

export { authHeaders };
