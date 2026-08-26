import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiRequest } from "../lib/api-client";
import { frontendConfig, setFrontendContext } from "../config";

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
  schoolId: string;
  academicPeriodId: string;
  setSchoolId: (schoolId: string) => void;
  setAcademicPeriodId: (periodId: string) => void;
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
  useEffect(() => {
    setFrontendContext({ schoolId, academicPeriodId });
  }, [schoolId, academicPeriodId]);
  const value = useMemo(
    () => ({
      context: contextQuery.data,
      periods: periodsQuery.data ?? [],
      schoolId,
      academicPeriodId,
      setSchoolId: (next: string) => {
        setFrontendContext({ schoolId: next, academicPeriodId: "" });
        localStorage.setItem("schedule-school-id", next);
        setSchoolIdState(next);
        localStorage.removeItem("schedule-period-id");
        setAcademicPeriodIdState("");
        const url = new URL(window.location.href);
        url.searchParams.set("school", next);
        url.searchParams.delete("period");
        window.history.replaceState({}, "", url);
      },
      setAcademicPeriodId: (next: string) => {
        setFrontendContext({ academicPeriodId: next });
        localStorage.setItem("schedule-period-id", next);
        setAcademicPeriodIdState(next);
        const url = new URL(window.location.href);
        url.searchParams.set("period", next);
        window.history.replaceState({}, "", url);
      },
    }),
    [academicPeriodId, contextQuery.data, periodsQuery.data, schoolId],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace phải được dùng bên trong WorkspaceProvider");
  return context;
}
