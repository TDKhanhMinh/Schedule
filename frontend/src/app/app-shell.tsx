import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  ChevronRight,
  Database,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ScanSearch,
  School,
  Table2,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
  { route: "data-quality", label: "Kiểm tra dữ liệu", description: "Quét dữ liệu vận hành", icon: ScanSearch },
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
  if (apiStatus === "offline") return <CircleAlert className="size-3.5" aria-hidden="true" />;
  return <CheckCircle2 className="size-3.5" aria-hidden="true" />;
}

function navigateWithSpa(event: MouseEvent<HTMLAnchorElement>, route: AppRoute) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return false;
  }

  event.preventDefault();
  navigateTo(route);
  return true;
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => globalThis.localStorage?.getItem("schedule-sidebar-collapsed") === "true",
  );
  const selectedSchool = context?.schools.find((school) => school.id === schoolId);
  const selectedPeriod = periods.find((period) => period.id === academicPeriodId);
  const currentNavigation = navigation.find((item) => item.route === route);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [route]);

  return (
    <div className="app-shell min-h-screen flex flex-col bg-background text-foreground selection:bg-primary/20">
      <a
        className="skip-link fixed top-2 left-2 z-50 -translate-y-24 focus:translate-y-0 transition-transform bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        href="#main-content"
      >
        Bỏ qua đến nội dung chính
      </a>

      {/* Topbar Header */}
      <header className="app-header sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md transition-[background-color,border-color,box-shadow]">
        <div className="app-header-main w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 min-h-[64px] lg:min-h-[72px] flex items-center justify-between gap-3 sm:gap-4 py-2">
          {/* Brand & Mobile Hamburger */}
          <div className="app-brand-area flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Mobile Sheet Trigger */}
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button
                  className="mobile-menu-button app-mobile-menu md:hidden min-h-[44px] min-w-[44px] shrink-0"
                  variant="outline"
                  size="icon"
                  aria-label={mobileNavOpen ? "Đóng điều hướng" : "Mở điều hướng"}
                  aria-controls="mobile-navigation"
                >
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[300px] sm:w-[340px] p-0 flex flex-col">
                <SheetHeader className="p-4 border-b border-border text-left">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex items-center justify-center size-9 rounded-xl bg-primary text-primary-foreground font-black text-xs shadow-xs shrink-0"
                      aria-hidden="true"
                    >
                      ST
                    </span>
                    <div className="min-w-0">
                      <SheetTitle className="text-sm font-bold text-foreground truncate">
                        Thời khóa biểu trường học
                      </SheetTitle>
                      <p className="text-[11px] text-muted-foreground truncate">Bộ tối ưu - MVP-0.1.0</p>
                    </div>
                  </div>
                  <SheetDescription className="sr-only">Điều hướng và chọn bối cảnh làm việc.</SheetDescription>
                </SheetHeader>

                {/* Mobile Workspace Selector inside Sheet */}
                <div className="p-4 border-b border-border bg-muted/30 grid gap-3">
                  <div className="grid gap-1">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      <School className="size-3.5" aria-hidden="true" /> Trường
                    </span>
                    <Select value={schoolId} onValueChange={setSchoolId} disabled={!context?.schools.length}>
                      <SelectTrigger className="w-full min-h-[44px] text-xs" aria-label="Chọn trường">
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
                  <div className="grid gap-1">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      <Table2 className="size-3.5" aria-hidden="true" /> Năm học
                    </span>
                    <Select value={academicPeriodId} onValueChange={setAcademicPeriodId} disabled={!periods.length}>
                      <SelectTrigger className="w-full min-h-[44px] text-xs" aria-label="Chọn năm học">
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

                {/* Mobile Nav Links */}
                <nav
                  id="mobile-navigation"
                  className="flex-1 overflow-y-auto p-3 grid gap-1"
                  aria-label="Điều hướng di động"
                >
                  {navigation.map((item) => {
                    const Icon = item.icon;
                    const isActive = route === item.route;
                    return (
                      <a
                        key={item.route}
                        className={cn(
                          "flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-colors min-h-[44px] select-none",
                          isActive
                            ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                            : "hover:bg-muted text-muted-foreground hover:text-foreground font-medium",
                        )}
                        href={item.route === "dashboard" ? "/" : `/${item.route}`}
                        aria-current={isActive ? "page" : undefined}
                        onClick={(event) => {
                          if (!navigateWithSpa(event, item.route)) return;
                          setMobileNavOpen(false);
                        }}
                      >
                        <span
                          className={cn(
                            "flex items-center justify-center size-8 rounded-md shrink-0",
                            isActive ? "bg-primary-foreground/15 text-primary-foreground" : "text-muted-foreground",
                          )}
                          aria-hidden="true"
                        >
                          <Icon className="size-5" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <strong className="block truncate text-sm">{item.label}</strong>
                          <small
                            className={cn(
                              "block text-[11px] truncate",
                              isActive ? "text-primary-foreground/80" : "text-muted-foreground",
                            )}
                          >
                            {item.description}
                          </small>
                        </div>
                        {isActive && (
                          <ChevronRight className="size-4 shrink-0 text-primary-foreground/80" aria-hidden="true" />
                        )}
                      </a>
                    );
                  })}
                </nav>

                <div className="p-4 border-t border-border bg-muted/20 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <UsersRound className="size-4 shrink-0" aria-hidden="true" />
                    <div>
                      <p className="font-semibold text-foreground">THCS / THPT</p>
                      <p className="text-[11px]">Đang xem theo trường đã chọn</p>
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            {/* Brand Logo Link */}
            <a
              className="app-brand inline-flex h-auto shrink-0 items-center gap-2.5 sm:gap-3 px-1.5 sm:px-2 py-1 text-left hover:bg-transparent min-w-0"
              href="/"
              aria-label="Về tổng quan"
              onClick={(event) => navigateWithSpa(event, "dashboard")}
            >
              <span
                className="app-brand-mark flex items-center justify-center size-9 sm:size-10 rounded-xl bg-primary text-primary-foreground font-black text-xs sm:text-sm tracking-tight shadow-xs shrink-0"
                aria-hidden="true"
              >
                ST
              </span>
              <span className="app-brand-copy hidden min-[420px]:grid gap-0.5 min-w-0">
                <strong className="block text-xs sm:text-sm font-bold text-foreground leading-snug truncate">
                  Thời khóa biểu trường học
                </strong>
                <small className="hidden sm:block text-[11px] text-muted-foreground leading-tight truncate">
                  Bộ tối ưu - MVP-0.1.0
                </small>
              </span>
            </a>
          </div>

          {/* Desktop / Tablet Workspace Context Selectors */}
          <div
            className="workspace-context hidden md:flex items-center gap-2.5 lg:gap-3 flex-1 max-w-xl mx-2 lg:mx-4"
            role="group"
            aria-label="Ngữ cảnh làm việc"
          >
            <div className="workspace-field flex-1 min-w-[140px] grid gap-1">
              <span className="workspace-field-label flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <School className="size-3 shrink-0" aria-hidden="true" /> Trường
              </span>
              <Select value={schoolId} onValueChange={setSchoolId} disabled={!context?.schools.length}>
                <SelectTrigger
                  className="w-full min-w-0 h-[var(--control-height)] text-xs sm:text-sm"
                  aria-label="Chọn trường"
                >
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
            <div className="workspace-field flex-1 min-w-[140px] grid gap-1">
              <span className="workspace-field-label flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <Table2 className="size-3 shrink-0" aria-hidden="true" /> Năm học
              </span>
              <Select value={academicPeriodId} onValueChange={setAcademicPeriodId} disabled={!periods.length}>
                <SelectTrigger
                  className="w-full min-w-0 h-[var(--control-height)] text-xs sm:text-sm"
                  aria-label="Chọn năm học"
                >
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

          {/* Header Actions (Status, Role, Theme Toggle) */}
          <div className="app-header-actions flex items-center gap-2 sm:gap-2.5 shrink-0">
            <span
              className={cn(
                "app-api-status hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-border bg-card shadow-xs transition-colors",
                apiStatus === "online" &&
                  "border-emerald-500/30 text-emerald-700 dark:text-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20",
                apiStatus === "offline" && "border-destructive/30 text-destructive bg-destructive/10",
                apiStatus === "checking" && "text-muted-foreground",
              )}
              role="status"
              aria-live="polite"
            >
              <ApiStatusIcon apiStatus={apiStatus} />
              <span className="capitalize">API {apiStatusLabel(apiStatus)}</span>
            </span>
            <span className="app-role-badge hidden lg:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border border-border bg-muted/60 text-muted-foreground uppercase tracking-wider">
              {context?.role ?? "VIEWER"}
            </span>
            <ModeToggle />
          </div>
        </div>
      </header>

      {/* Main Body Shell */}
      <div
        className={cn(
          "app-shell-body flex-1 flex w-full max-w-[1440px] mx-auto min-h-[calc(100vh-72px)]",
          sidebarCollapsed && "sidebar-collapsed",
        )}
      >
        {/* Desktop / Tablet Sidebar */}
        <aside
          id="primary-navigation"
          className={cn(
            "app-sidebar hidden md:flex flex-col border-r border-border bg-card/60 transition-[width,background-color,border-color] duration-200 ease-in-out shrink-0",
            sidebarCollapsed ? "is-collapsed w-16 p-2" : "w-60 lg:w-64 p-4",
          )}
          aria-label="Điều hướng chính"
        >
          {/* Sidebar Header & Toggle */}
          <div className="app-sidebar-heading mb-4 pb-3 border-b border-border/60">
            <div
              className={cn(
                "app-sidebar-heading-top flex items-center gap-2",
                sidebarCollapsed ? "justify-center" : "justify-between",
              )}
            >
              {!sidebarCollapsed && (
                <div className="app-sidebar-heading-copy min-w-0">
                  <span className="app-sidebar-kicker block text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Điều hướng
                  </span>
                  <strong className="block text-xs font-bold text-foreground truncate">
                    {selectedSchool?.name ?? "Không gian làm việc"}
                  </strong>
                  <small className="block text-[11px] text-muted-foreground truncate">
                    {selectedPeriod?.name ?? "Chọn trường và năm học"}
                  </small>
                </div>
              )}
              <Button
                className="app-sidebar-toggle min-h-[36px] min-w-[36px] shrink-0"
                variant="ghost"
                size="icon"
                type="button"
                title={sidebarCollapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
                aria-label={sidebarCollapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
                aria-expanded={!sidebarCollapsed}
                aria-controls="primary-navigation"
                onClick={() => {
                  setSidebarCollapsed((collapsed) => {
                    const next = !collapsed;
                    globalThis.localStorage?.setItem("schedule-sidebar-collapsed", String(next));
                    return next;
                  });
                }}
              >
                {sidebarCollapsed ? (
                  <PanelLeftOpen className="size-4" aria-hidden="true" />
                ) : (
                  <PanelLeftClose className="size-4" aria-hidden="true" />
                )}
              </Button>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="app-nav flex-1 grid gap-1 content-start" aria-label="Các khu vực chính">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = route === item.route;
              return (
                <a
                  key={item.route}
                  className={cn(
                    "app-nav-link group flex items-center rounded-lg text-sm transition-[color,background-color,border-color,transform] select-none min-h-[40px]",
                    sidebarCollapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5",
                    isActive
                      ? "is-active bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground font-medium",
                  )}
                  href={item.route === "dashboard" ? "/" : `/${item.route}`}
                  title={sidebarCollapsed ? item.label : undefined}
                  aria-current={isActive ? "page" : undefined}
                  onClick={(event) => navigateWithSpa(event, item.route)}
                >
                  <span
                    className={cn(
                      "app-nav-icon flex items-center justify-center shrink-0",
                      sidebarCollapsed ? "size-6" : "size-5",
                      isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground",
                    )}
                    aria-hidden="true"
                  >
                    <Icon className="size-4 sm:size-5" />
                  </span>
                  {!sidebarCollapsed && (
                    <>
                      <span className="app-nav-copy flex-1 min-w-0">
                        <strong className="block text-xs sm:text-sm font-semibold truncate leading-snug">
                          {item.label}
                        </strong>
                        <small
                          className={cn(
                            "block text-[11px] truncate leading-tight",
                            isActive ? "text-primary-foreground/80" : "text-muted-foreground",
                          )}
                        >
                          {item.description}
                        </small>
                      </span>
                      {isActive && (
                        <ChevronRight
                          className="app-nav-chevron size-4 shrink-0 text-primary-foreground/80"
                          aria-hidden="true"
                        />
                      )}
                    </>
                  )}
                </a>
              );
            })}
          </nav>

          {/* Sidebar Footer */}
          {!sidebarCollapsed && (
            <div className="app-sidebar-footer mt-auto pt-3 border-t border-border/60 flex items-center gap-2.5 text-muted-foreground">
              <span
                className="app-sidebar-footer-icon flex items-center justify-center size-8 rounded-lg bg-muted/60 text-foreground shrink-0"
                aria-hidden="true"
              >
                <UsersRound className="size-4" />
              </span>
              <span className="app-sidebar-footer-copy min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-wider">Phạm vi dữ liệu</span>
                <strong className="block text-xs font-bold text-foreground truncate">THCS / THPT</strong>
                <small className="block text-[11px] truncate text-muted-foreground">Theo trường và năm học</small>
              </span>
            </div>
          )}
        </aside>

        {/* Main Content Viewport */}
        <main className="app-main flex-1 min-w-0 flex flex-col px-4 sm:px-6 lg:px-8 py-4 sm:py-6" id="main-content">
          <div className="app-main-inner max-w-full">
            {/* Breadcrumb Navigation */}
            <nav
              className="app-breadcrumb flex items-center gap-1.5 text-xs text-muted-foreground mb-4 sm:mb-6"
              aria-label="Đường dẫn"
            >
              <a
                className="hover:text-foreground transition-colors font-medium"
                href="/"
                onClick={(event) => navigateWithSpa(event, "dashboard")}
              >
                Không gian làm việc
              </a>
              <ChevronRight className="size-3 text-muted-foreground/60" aria-hidden="true" />
              <span className="font-semibold text-foreground">{currentNavigation?.label ?? "Tổng quan"}</span>
            </nav>

            {/* Page Content Container */}
            <div className="app-page-content min-w-0">{children}</div>
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
    <div className="app-page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 pb-5 mb-6 border-b border-border">
      <div className="app-page-heading min-w-0">
        <p className="app-page-eyebrow text-xs font-semibold text-primary uppercase tracking-wider">{eyebrow}</p>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-foreground mt-0.5">{title}</h1>
        <p className="app-page-description text-sm text-muted-foreground mt-1 max-w-3xl leading-relaxed">
          {description}
        </p>
      </div>
      {action ? <div className="app-page-action shrink-0 self-start sm:self-center">{action}</div> : null}
    </div>
  );
}

// --- Hybrid Responsive Summary ---
// mobile  (default / sm):  Sheet drawer menu (min-h-[44px] touch targets), compact brand, context picker inside drawer.
// tablet  (md / lg):       Inline 2-col workspace context, collapsible icon-only sidebar (16/60), optimized table spacing.
// desktop (xl / 2xl):      Spacious 64-col sidebar, full navigation labels, wide max-w-[1440px] centered container.
// Interaction:             Touch targets >= 44px on mobile/touch, hover states on desktop, focus-visible:ring-2 rings.
