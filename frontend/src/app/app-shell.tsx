import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "../lib/api-client";
import { navigateTo, type AppRoute } from "../routing";
import { ModeToggle } from "./mode-toggle";
import { useWorkspace } from "./workspace-provider";

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
  const { context, periods, schoolId, academicPeriodId, setSchoolId, setAcademicPeriodId } = useWorkspace();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <a className="skip-link" href="#main-content">
        Bỏ qua đến nội dung chính
      </a>
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex min-h-16 max-w-[1440px] flex-wrap items-center gap-3 px-4 py-2 lg:px-6">
          <Button
            className="mobile-menu-button"
            variant="outline"
            size="icon"
            aria-label="Mở điều hướng"
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            {mobileNavOpen ? <X /> : <Menu />}
          </Button>
          <Button
            variant="ghost"
            className="h-auto shrink-0 gap-3 px-0 text-left hover:bg-transparent"
            onClick={() => navigateTo("dashboard")}
            aria-label="Về tổng quan"
          >
            <span
              className="grid size-9 place-items-center rounded-xl bg-primary text-sm font-black text-primary-foreground"
              aria-hidden="true"
            >
              ST
            </span>
            <span className="hidden min-[480px]:grid">
              <strong className="text-sm font-semibold leading-tight">Thời khóa biểu trường học</strong>
              <small className="text-xs text-muted-foreground">Bộ tối ưu · MVP-0.1.0</small>
            </span>
          </Button>
          <div
            className="workspace-controls flex min-w-0 flex-1 items-center justify-end gap-2"
            aria-label="Ngữ cảnh làm việc"
          >
            <Select value={schoolId} onValueChange={setSchoolId} disabled={!context?.schools.length}>
              <SelectTrigger aria-label="Chọn trường">
                <SelectValue placeholder="Chọn trường" />
              </SelectTrigger>
              <SelectContent>
                {context?.schools.map((school) => (
                  <SelectItem key={school.id} value={school.id}>
                    {school.code} · {school.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={academicPeriodId} onValueChange={setAcademicPeriodId} disabled={!periods.length}>
              <SelectTrigger aria-label="Chọn năm học">
                <SelectValue placeholder="Chọn năm học" />
              </SelectTrigger>
              <SelectContent>
                {periods.map((period) => (
                  <SelectItem key={period.id} value={period.id}>
                    {period.name} · {period.academicYear}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="topbar-meta flex items-center gap-2">
            <span
              className={`hidden items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium sm:inline-flex ${apiStatus === "online" ? "text-emerald-700 dark:text-emerald-300" : apiStatus === "offline" ? "text-destructive" : "text-muted-foreground"}`}
            >
              <span className="size-2 rounded-full bg-current" aria-hidden="true" /> API {apiStatusLabel(apiStatus)}
            </span>
            <span className="hidden rounded-full border px-3 py-2 text-xs font-medium text-muted-foreground lg:inline-flex">
              {context?.role ?? "VIEWER"}
            </span>
            <ModeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1440px]">
        <aside
          className={`fixed inset-x-3 top-[118px] z-20 hidden max-h-[calc(100vh-130px)] w-auto shrink-0 overflow-y-auto rounded-2xl border bg-background p-3 shadow-xl md:sticky md:inset-auto md:top-20 md:z-0 md:block md:h-[calc(100vh-5rem)] md:w-60 md:overflow-visible md:rounded-none md:border-0 md:border-r md:bg-transparent md:p-5 md:shadow-none${mobileNavOpen ? " !block" : ""}`}
          aria-label="Điều hướng chính"
        >
          <p className="mb-3 px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Không gian làm việc
          </p>
          <nav className="grid gap-1">
            {navigation.map((item) => (
              <a
                className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground${route === item.route ? " bg-primary/10 text-primary" : " text-muted-foreground"}`}
                href={item.route === "dashboard" ? "/" : `/${item.route}`}
                aria-current={route === item.route ? "page" : undefined}
                key={item.route}
                onClick={(event) => {
                  event.preventDefault();
                  navigateTo(item.route);
                  setMobileNavOpen(false);
                }}
              >
                <span
                  className="grid size-7 place-items-center rounded-md bg-primary/10 text-xs font-bold text-primary"
                  aria-hidden="true"
                >
                  {item.shortLabel.slice(0, 1)}
                </span>
                {item.label}
              </a>
            ))}
          </nav>
          <div className="mt-auto hidden gap-1 rounded-xl border bg-card p-4 md:grid">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Phạm vi</span>
            <strong className="text-sm">THCS / THPT</strong>
            <small className="text-xs leading-relaxed text-muted-foreground">Ưu tiên web · cấu hình theo trường</small>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-8 lg:px-8 lg:py-10" id="main-content">
          {children}
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
    <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-primary">{eyebrow}</p>
        <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-foreground md:text-4xl">{title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
