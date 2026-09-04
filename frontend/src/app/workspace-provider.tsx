import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiRequest } from "../lib/api-client";
import { frontendConfig, setFrontendContext } from "../config";
import type { WorkspaceScheduleVersion } from "./workspace-types";

interface WorkspaceSchool {
  id: string;
  code: string;
  name: string;
  status: string;
}
interface WorkspacePeriod {
  id: string;
  academicYear: string;
  termCode: string;
  name: string;
  status: string;
}
interface WorkspaceContextResponse {
  userId: string;
  role: string;
  currentSchoolId: string;
  schools: WorkspaceSchool[];
  canSwitchSchool: boolean;
}
interface WorkspaceValue {
  context: WorkspaceContextResponse | undefined;
  periods: WorkspacePeriod[];
  scheduleVersions: WorkspaceScheduleVersion[];
  scheduleVersionsPending: boolean;
  scheduleVersionsError: Error | null;
  schoolId: string;
  academicPeriodId: string;
  scheduleVersionId: string;
  setSchoolId: (schoolId: string) => void;
  setAcademicPeriodId: (periodId: string) => void;
  setScheduleVersionId: (versionId: string) => void;
}
const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [schoolId, setSchoolIdState] = useState(
    () =>
      new URLSearchParams(window.location.search).get("school") ||
      localStorage.getItem("schedule-school-id") ||
      frontendConfig.schoolId,
  );
  const [academicPeriodId, setAcademicPeriodIdState] = useState(
    () =>
      new URLSearchParams(window.location.search).get("period") ||
      localStorage.getItem("schedule-period-id") ||
      frontendConfig.academicPeriodId,
  );
  const [scheduleVersionId, setScheduleVersionIdState] = useState(
    () =>
      new URLSearchParams(window.location.search).get("version") ||
      localStorage.getItem("schedule-version-id") ||
      frontendConfig.scheduleVersionId,
  );
  const contextQuery = useQuery({
    queryKey: ["workspace-context", schoolId],
    queryFn: ({ signal }) => apiRequest<WorkspaceContextResponse>("/schools/context", { signal }),
    enabled: Boolean(schoolId),
  });
  const periodsQuery = useQuery({
    queryKey: ["workspace-periods", schoolId],
    queryFn: ({ signal }) =>
      apiRequest<WorkspacePeriod[]>(`/schools/${encodeURIComponent(schoolId)}/academic-periods`, { signal }),
    enabled: Boolean(schoolId),
  });
  const scheduleVersionsQuery = useQuery({
    queryKey: ["workspace-schedule-versions", schoolId, academicPeriodId],
    queryFn: ({ signal }) =>
      apiRequest<WorkspaceScheduleVersion[]>(
        `/schools/${encodeURIComponent(schoolId)}/academic-periods/${encodeURIComponent(academicPeriodId)}/schedule-versions`,
        { signal },
      ),
    enabled: Boolean(schoolId && academicPeriodId),
  });

  useEffect(() => {
    if (!contextQuery.isSuccess) return;
    const currentSchool = contextQuery.data.schools.find((school) => school.id === schoolId);
    const nextSchoolId = currentSchool?.id ?? contextQuery.data.schools[0]?.id ?? "";
    if (nextSchoolId === schoolId) return;
    setFrontendContext({ schoolId: nextSchoolId, academicPeriodId: "", scheduleVersionId: "" });
    setSchoolIdState(nextSchoolId);
    setAcademicPeriodIdState("");
    setScheduleVersionIdState("");
    localStorage.setItem("schedule-school-id", nextSchoolId);
    localStorage.removeItem("schedule-period-id");
    localStorage.removeItem("schedule-version-id");
    const url = new URL(window.location.href);
    if (nextSchoolId) url.searchParams.set("school", nextSchoolId);
    else url.searchParams.delete("school");
    url.searchParams.delete("period");
    url.searchParams.delete("version");
    window.history.replaceState({}, "", url);
  }, [contextQuery.data, contextQuery.isSuccess, schoolId]);

  useEffect(() => {
    if (!periodsQuery.isSuccess) return;
    const currentPeriod = periodsQuery.data.find((period) => period.id === academicPeriodId);
    const nextPeriodId = currentPeriod?.id ?? periodsQuery.data[0]?.id ?? "";
    if (nextPeriodId === academicPeriodId) return;
    setFrontendContext({ academicPeriodId: nextPeriodId, scheduleVersionId: "" });
    setAcademicPeriodIdState(nextPeriodId);
    setScheduleVersionIdState("");
    localStorage.removeItem("schedule-version-id");
    const url = new URL(window.location.href);
    if (nextPeriodId) url.searchParams.set("period", nextPeriodId);
    else url.searchParams.delete("period");
    url.searchParams.delete("version");
    window.history.replaceState({}, "", url);
  }, [academicPeriodId, periodsQuery.data, periodsQuery.isSuccess]);

  useEffect(() => {
    if (!scheduleVersionsQuery.isSuccess) return;
    const usableVersions = scheduleVersionsQuery.data.filter((version) => version.status !== "ARCHIVED");
    const requestedVersion = usableVersions.find((version) => version.id === scheduleVersionId);
    const nextVersionId =
      requestedVersion?.id ??
      usableVersions.find((version) => version.status === "DRAFT")?.id ??
      usableVersions[0]?.id ??
      "";
    if (nextVersionId === scheduleVersionId) return;
    setFrontendContext({ scheduleVersionId: nextVersionId });
    setScheduleVersionIdState(nextVersionId);
    if (nextVersionId) localStorage.setItem("schedule-version-id", nextVersionId);
    else localStorage.removeItem("schedule-version-id");
    const url = new URL(window.location.href);
    if (nextVersionId) url.searchParams.set("version", nextVersionId);
    else url.searchParams.delete("version");
    window.history.replaceState({}, "", url);
  }, [scheduleVersionId, scheduleVersionsQuery.data, scheduleVersionsQuery.isSuccess]);

  useEffect(() => {
    setFrontendContext({ schoolId, academicPeriodId, scheduleVersionId });
  }, [academicPeriodId, scheduleVersionId, schoolId]);

  const value = useMemo(
    () => ({
      context: contextQuery.data,
      periods: periodsQuery.data ?? [],
      scheduleVersions: scheduleVersionsQuery.data ?? [],
      scheduleVersionsPending: scheduleVersionsQuery.isPending,
      scheduleVersionsError: scheduleVersionsQuery.error instanceof Error ? scheduleVersionsQuery.error : null,
      schoolId,
      academicPeriodId,
      scheduleVersionId,
      setSchoolId: (next: string) => {
        setFrontendContext({ schoolId: next, academicPeriodId: "", scheduleVersionId: "" });
        localStorage.setItem("schedule-school-id", next);
        setSchoolIdState(next);
        localStorage.removeItem("schedule-period-id");
        localStorage.removeItem("schedule-version-id");
        setAcademicPeriodIdState("");
        setScheduleVersionIdState("");
        const url = new URL(window.location.href);
        url.searchParams.set("school", next);
        url.searchParams.delete("period");
        url.searchParams.delete("version");
        window.history.replaceState({}, "", url);
      },
      setAcademicPeriodId: (next: string) => {
        setFrontendContext({ academicPeriodId: next, scheduleVersionId: "" });
        localStorage.setItem("schedule-period-id", next);
        localStorage.removeItem("schedule-version-id");
        setAcademicPeriodIdState(next);
        setScheduleVersionIdState("");
        const url = new URL(window.location.href);
        url.searchParams.set("period", next);
        url.searchParams.delete("version");
        window.history.replaceState({}, "", url);
      },
      setScheduleVersionId: (next: string) => {
        setFrontendContext({ scheduleVersionId: next });
        setScheduleVersionIdState(next);
        if (next) localStorage.setItem("schedule-version-id", next);
        else localStorage.removeItem("schedule-version-id");
        const url = new URL(window.location.href);
        if (next) url.searchParams.set("version", next);
        else url.searchParams.delete("version");
        window.history.replaceState({}, "", url);
      },
    }),
    [
      academicPeriodId,
      contextQuery.data,
      periodsQuery.data,
      scheduleVersionId,
      scheduleVersionsQuery.data,
      scheduleVersionsQuery.error,
      scheduleVersionsQuery.isPending,
      schoolId,
    ],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace phải được dùng bên trong WorkspaceProvider");
  return context;
}
