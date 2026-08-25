import { useSyncExternalStore } from "react";

export type AppRoute = "dashboard" | "master-data" | "imports" | "timetable";

const routePaths: Record<AppRoute, string> = {
  dashboard: "/",
  "master-data": "/master-data",
  imports: "/imports",
  timetable: "/timetable",
};

function routeFromPath(pathname: string): AppRoute {
  if (pathname.startsWith("/master-data")) return "master-data";
  if (pathname.startsWith("/imports")) return "imports";
  if (pathname.startsWith("/timetable")) return "timetable";
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
