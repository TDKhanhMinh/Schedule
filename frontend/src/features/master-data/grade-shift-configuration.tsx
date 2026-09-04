import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { request } from "./master-data-api";
import type { GradeShiftConfig, ShiftCode } from "./master-data-types";

const GRADES = [6, 7, 8, 9];
const SHIFTS: ShiftCode[] = ["MORNING", "AFTERNOON"];
const SHIFT_LABELS: Record<ShiftCode, string> = { MORNING: "Sáng", AFTERNOON: "Chiều" };
const DEFAULT_CONFIGS: Record<number, DraftConfig> = {
  6: { grade: 6, mainShiftCode: "AFTERNOON", secondaryShiftCode: "MORNING", allowSecondary: true },
  7: { grade: 7, mainShiftCode: "MORNING", secondaryShiftCode: "AFTERNOON", allowSecondary: true },
  8: { grade: 8, mainShiftCode: "AFTERNOON", secondaryShiftCode: "MORNING", allowSecondary: true },
  9: { grade: 9, mainShiftCode: "MORNING", secondaryShiftCode: "AFTERNOON", allowSecondary: true },
};

type DraftConfig = {
  grade: number;
  mainShiftCode: ShiftCode;
  secondaryShiftCode: ShiftCode;
  allowSecondary: boolean;
};

export function GradeShiftConfiguration({
  schoolId,
  periodId,
  canWrite,
}: {
  schoolId: string;
  periodId: string;
  canWrite: boolean;
}) {
  const configsQuery = useQuery({
    queryKey: ["grade-shifts", schoolId, periodId],
    queryFn: ({ signal }) =>
      request<GradeShiftConfig[]>("/schools/" + schoolId + "/academic-periods/" + periodId + "/grade-shifts", {
        signal,
      }),
    enabled: Boolean(schoolId && periodId),
  });
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Record<number, DraftConfig>>(() => buildDraft([]));
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const saveMutation = useMutation({
    mutationFn: (payload: { configs: DraftConfig[] }) =>
      request<GradeShiftConfig[]>("/schools/" + schoolId + "/academic-periods/" + periodId + "/grade-shifts", {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["grade-shifts", schoolId, periodId] });
      setNotice("Đã lưu cấu hình buổi học. Lần xếp thời khóa biểu tiếp theo sẽ ưu tiên buổi chính.");
      setError("");
    },
  });

  useEffect(() => {
    if (configsQuery.data) setDraft(buildDraft(configsQuery.data));
  }, [configsQuery.data]);

  const rows = useMemo(() => GRADES.map((grade) => draft[grade]), [draft]);

  function updateConfig(grade: number, patch: Partial<DraftConfig>) {
    setDraft((current) => {
      const next = { ...current[grade], ...patch };
      if (patch.mainShiftCode) next.secondaryShiftCode = oppositeShift(patch.mainShiftCode);
      if (patch.secondaryShiftCode) next.mainShiftCode = oppositeShift(patch.secondaryShiftCode);
      return { ...current, [grade]: next };
    });
    setNotice("");
    setError("");
  }

  function save() {
    if (!canWrite || rows.some((config) => config.mainShiftCode === config.secondaryShiftCode)) return;
    void saveMutation.mutateAsync({ configs: rows }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Không thể lưu cấu hình buổi học.");
    });
  }

  if (!periodId) return <div className="master-empty-state">Chọn năm học/kỳ học để cấu hình buổi học theo khối.</div>;

  return (
    <section className="master-relation-imports grade-shift-configuration" aria-labelledby="grade-shift-title">
      <div className="master-relation-imports-heading">
        <div>
          <span className="master-section-kicker">Quy tắc xếp lịch</span>
          <h2 id="grade-shift-title">Cấu hình buổi học theo khối</h2>
          <p>Buổi chính được ưu tiên; buổi phụ chỉ được dùng khi cần để thỏa các ràng buộc xếp lịch.</p>
          <p>Chọn Sáng hoặc Chiều ở một bên, hệ thống sẽ tự chọn buổi đối nghịch ở bên còn lại.</p>
        </div>
      </div>
      {configsQuery.isPending ? (
        <div className="master-loading-state" role="status">
          Đang tải cấu hình buổi học…
        </div>
      ) : null}
      {configsQuery.error ? (
        <div className="alert alert-error" role="alert">
          Không thể tải cấu hình buổi học. {configsQuery.error instanceof Error ? configsQuery.error.message : ""}
        </div>
      ) : null}
      {error ? (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="alert alert-success" role="status">
          {notice}
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((config) => (
          <article className="rounded-2xl border border-border bg-card p-4 shadow-sm" key={config.grade}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">Khối {config.grade}</h3>
                <p className="mt-1 text-sm text-muted-foreground">Áp dụng riêng cho học kỳ đang chọn.</p>
              </div>
              <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">
                Chào cờ: T2 · {SHIFT_LABELS[config.mainShiftCode]} · Tiết {config.mainShiftCode === "AFTERNOON" ? 5 : 1}
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold">Buổi chính</legend>
                {SHIFTS.map((shift) => (
                  <label
                    className="grade-shift-choice flex cursor-pointer items-center gap-2 text-sm"
                    key={"main-" + config.grade + "-" + shift}
                  >
                    <input
                      type="radio"
                      name={"main-shift-" + config.grade}
                      value={shift}
                      checked={config.mainShiftCode === shift}
                      disabled={!canWrite || saveMutation.isPending}
                      onChange={() => updateConfig(config.grade, { mainShiftCode: shift })}
                    />
                    {SHIFT_LABELS[shift]}
                  </label>
                ))}
              </fieldset>
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold">Buổi phụ</legend>
                {SHIFTS.map((shift) => (
                  <label
                    className="grade-shift-choice flex cursor-pointer items-center gap-2 text-sm"
                    key={"secondary-" + config.grade + "-" + shift}
                  >
                    <input
                      type="radio"
                      name={"secondary-shift-" + config.grade}
                      value={shift}
                      checked={config.secondaryShiftCode === shift}
                      disabled={!canWrite || saveMutation.isPending}
                      onChange={() => updateConfig(config.grade, { secondaryShiftCode: shift })}
                    />
                    {SHIFT_LABELS[shift]}
                  </label>
                ))}
              </fieldset>
            </div>
            <label className="mt-4 flex cursor-pointer items-center gap-2 border-t border-border pt-4 text-sm">
              <input
                type="checkbox"
                checked={config.allowSecondary}
                disabled={!canWrite || saveMutation.isPending}
                onChange={(event) => updateConfig(config.grade, { allowSecondary: event.target.checked })}
              />
              Cho phép dùng buổi phụ khi buổi chính không đủ
            </label>
          </article>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">Thay đổi chỉ tác động đến lần xếp thời khóa biểu tiếp theo.</p>
        <Button
          className="grade-shift-save"
          type="button"
          onClick={save}
          disabled={
            !canWrite ||
            saveMutation.isPending ||
            configsQuery.isPending ||
            rows.some((config) => config.mainShiftCode === config.secondaryShiftCode)
          }
        >
          {saveMutation.isPending ? "Đang lưu…" : "Lưu cấu hình"}
        </Button>
      </div>
    </section>
  );
}

function buildDraft(configs: GradeShiftConfig[]) {
  const byGrade = new Map(configs.map((config) => [config.grade, config]));
  return Object.fromEntries(
    GRADES.map((grade) => {
      const config = byGrade.get(grade);
      return [
        grade,
        config
          ? {
              grade,
              mainShiftCode: config.mainShiftCode,
              secondaryShiftCode: config.secondaryShiftCode,
              allowSecondary: config.allowSecondary,
            }
          : DEFAULT_CONFIGS[grade],
      ];
    }),
  ) as Record<number, DraftConfig>;
}

function oppositeShift(shift: ShiftCode): ShiftCode {
  return shift === "MORNING" ? "AFTERNOON" : "MORNING";
}
