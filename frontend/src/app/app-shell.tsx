import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  ChevronRight,
  Database,
  FileSpreadsheet,
  LayoutDashboard,
  Menu,
  School,
  Table2,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "../lib/api-client";
import { cn } from "../lib/utils";
import { navigateTo, type AppRoute } from "../routing";
import { ModeToggle } from "./mode-toggle";
import { useWorkspace } from "./workspace-provider";

export type ApiStatus = "checking" | "online" | "offline";

const navigation: Array<{
  route: AppRoute;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { route: "dashboard", label: "Tổng quan", description: "Trạng thái vận hành", icon: LayoutDashboard },
  { route: "master-data", label: "Dữ liệu danh mục", description: "Lớp, giáo viên, phòng", icon: Database },
  { route: "imports", label: "Nhập dữ liệu", description: "Upload và kiểm tra Excel", icon: FileSpreadsheet },
  { route: "timetable", label: "Thời khóa biểu", description: "Xem và chỉnh lịch học", icon: CalendarDays },
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

function ApiStatusIcon({ apiStatus }: { apiStatus: ApiStatus }) {
  if (apiStatus === "offline") return <CircleAlert aria-hidden="true" />;
  return <CheckCircle2 aria-hidden="true" />;
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
  const { context, periods, schoolId, academicPeriodId, setSchoolId, setAcademicPeriodId } = useWorkspace();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const selectedSchool = context?.schools.find((school) => school.id === schoolId);
  const selectedPeriod = periods.find((period) => period.id === academicPeriodId);
  const currentNavigation = navigation.find((item) => item.route === route);

  return (
    <div className="app-shell min-h-screen bg-background text-foreground">
      <a className="skip-link" href="#main-content">
        Bỏ qua đến nội dung chính
      </a>

      <header className="app-header">
        <div className="app-header-main">
          <div className="app-brand-area">
            <Button
              className="mobile-menu-button app-mobile-menu"
              variant="outline"
              size="icon"
              aria-label={mobileNavOpen ? "Đóng điều hướng" : "Mở điều hướng"}
              aria-expanded={mobileNavOpen}
              aria-controls="primary-navigation"
              onClick={() => setMobileNavOpen((open) => !open)}
            >
              {mobileNavOpen ? <X /> : <Menu />}
            </Button>
            <Button
              variant="ghost"
              className="app-brand h-auto shrink-0 gap-3 px-0 text-left hover:bg-transparent"
              onClick={() => navigateTo("dashboard")}
              aria-label="Về tổng quan"
            >
              <span className="app-brand-mark" aria-hidden="true">
                ST
              </span>
              <span className="app-brand-copy">
                <strong>Thời khóa biểu trường học</strong>
                <small>Bộ tối ưu - MVP-0.1.0</small>
              </span>
            </Button>
          </div>

          <div className="workspace-context" role="group" aria-label="Ngữ cảnh làm việc">
            <div className="workspace-field">
              <span className="workspace-field-label">
                <School aria-hidden="true" /> Trường
              </span>
              <Select value={schoolId} onValueChange={setSchoolId} disabled={!context?.schools.length}>
                <SelectTrigger aria-label="Chọn trường">
                  <SelectValue placeholder="Chọn trường" />
                </SelectTrigger>
                <SelectContent>
                  {context?.schools.map((school) => (
                    <SelectItem key={school.id} value={school.id}>
                      {school.code} - {school.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="workspace-field">
              <span className="workspace-field-label">
                <Table2 aria-hidden="true" /> Năm học
              </span>
              <Select value={academicPeriodId} onValueChange={setAcademicPeriodId} disabled={!periods.length}>
                <SelectTrigger aria-label="Chọn năm học">
                  <SelectValue placeholder="Chọn năm học" />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((period) => (
                    <SelectItem key={period.id} value={period.id}>
                      {period.name} - {period.academicYear}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="app-header-actions">
            <span
              className={cn(
                "app-api-status",
                apiStatus === "online" && "is-online",
                apiStatus === "offline" && "is-offline",
              )}
              role="status"
              aria-live="polite"
            >
              <ApiStatusIcon apiStatus={apiStatus} />
              <span>API {apiStatusLabel(apiStatus)}</span>
            </span>
            <span className="app-role-badge">{context?.role ?? "VIEWER"}</span>
            <ModeToggle />
          </div>
        </div>
      </header>

      <div className="app-shell-body">
        {mobileNavOpen ? (
          <button
            className="mobile-nav-backdrop"
            type="button"
            aria-label="Đóng điều hướng"
            onClick={() => setMobileNavOpen(false)}
          />
        ) : null}

        <aside
          id="primary-navigation"
          className={cn("app-sidebar", mobileNavOpen && "mobile-open")}
          aria-label="Điều hướng chính"
        >
          <div className="app-sidebar-heading">
            <span className="app-sidebar-kicker">Điều hướng</span>
            <strong>{selectedSchool?.name ?? "Không gian làm việc"}</strong>
            <small>{selectedPeriod?.name ?? "Chọn trường và năm học để bắt đầu"}</small>
          </div>

          <nav className="app-nav" aria-label="Các khu vực chính">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = route === item.route;
              return (
                <a
                  className={cn("app-nav-link", isActive && "is-active")}
                  href={item.route === "dashboard" ? "/" : `/${item.route}`}
                  aria-current={isActive ? "page" : undefined}
                  key={item.route}
                  onClick={(event) => {
                    event.preventDefault();
                    navigateTo(item.route);
                    setMobileNavOpen(false);
                  }}
                >
                  <span className="app-nav-icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <span className="app-nav-copy">
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                  {isActive ? <ChevronRight className="app-nav-chevron" aria-hidden="true" /> : null}
                </a>
              );
            })}
          </nav>

          <div className="app-sidebar-footer">
            <span className="app-sidebar-footer-icon" aria-hidden="true">
              <UsersRound />
            </span>
            <span className="app-sidebar-footer-copy">
              <span>Phạm vi dữ liệu</span>
              <strong>THCS / THPT</strong>
              <small>Đang xem theo trường và năm học đã chọn</small>
            </span>
          </div>
        </aside>

        <main className="app-main" id="main-content">
          <div className="app-main-inner">
            <nav className="app-breadcrumb" aria-label="Đường dẫn">
              <a
                href="/"
                onClick={(event) => {
                  event.preventDefault();
                  navigateTo("dashboard");
                }}
              >
                Không gian làm việc
              </a>
              <ChevronRight aria-hidden="true" />
              <span>{currentNavigation?.label ?? "Tổng quan"}</span>
            </nav>
            <div className="app-page-content">{children}</div>
          </div>
        </main>
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
    <div className="app-page-header">
      <div className="app-page-heading">
        <p className="app-page-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="app-page-description">{description}</p>
      </div>
      {action ? <div className="app-page-action">{action}</div> : null}
    </div>
  );
}
