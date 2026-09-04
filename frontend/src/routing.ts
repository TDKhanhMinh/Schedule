import { useSyncExternalStore } from "react";

export type AppRoute = "dashboard" | "master-data" | "data-quality" | "timetable" | "public";

const routePaths: Record<AppRoute, string> = {
  dashboard: "/",
  "master-data": "/master-data",
  "data-quality": "/data-quality",
  timetable: "/timetable",
  public: "/public/schedules",
};

function routeFromPath(pathname: string): AppRoute {
  if (pathname.startsWith("/master-data")) return "master-data";
  if (pathname.startsWith("/data-quality") || pathname.startsWith("/imports")) return "data-quality";
  if (pathname.startsWith("/timetable")) return "timetable";
  if (pathname.startsWith("/public/schedules/")) return "public";
  return "dashboard";
}

export function useAppRoute() {
  return useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("popstate", onStoreChange);
      return () => window.removeEventListener("popstate", onStoreChange);
    },
    () => routeFromPath(window.location.pathname),
    () => "dashboard" as AppRoute,
  );
}

export function navigateTo(route: AppRoute) {
  window.history.pushState({}, "", routePaths[route]);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
