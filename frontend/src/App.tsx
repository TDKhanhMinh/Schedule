import { AppShell, useApiStatus } from "./app/app-shell";
import { DashboardScreen } from "./features/dashboard/dashboard-screen";
import { ImportScreen } from "./features/imports/import-screen";
import { MasterDataScreen } from "./features/master-data/master-data-screen";
import { PublicScheduleScreen } from "./features/public-schedule/public-schedule-screen";
import { TimetableScreen } from "./features/timetable";
import { useAppRoute } from "./routing";

export default function App() {
  const route = useAppRoute();
  const apiStatus = useApiStatus();
  const content =
    route === "master-data" ? (
      <MasterDataScreen />
    ) : route === "imports" ? (
      <ImportScreen />
    ) : route === "timetable" ? (
      <TimetableScreen />
    ) : route === "public" ? (
      <PublicScheduleScreen />
    ) : (
      <DashboardScreen />
    );
  return (
    <AppShell route={route} apiStatus={apiStatus}>
      {content}
    </AppShell>
  );
}
