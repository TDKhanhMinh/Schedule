import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { frontendConfig } from "../../config";
import { request } from "./master-data-api";
import type { RuleProfile, Teacher } from "./master-data-types";

const DAYS = [
  [1, "Thứ 2"],
  [2, "Thứ 3"],
  [3, "Thứ 4"],
  [4, "Thứ 5"],
  [5, "Thứ 6"],
  [6, "Thứ 7"],
] as const;

export function TeacherPreferredOffDaysDialog({
  teacher,
  periodId,
  canWrite,
  open,
  onOpenChange,
  onSaved,
  onNeedDraftProfile,
}: {
  teacher: Teacher;
  periodId: string;
  canWrite: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (message: string) => void;
  onNeedDraftProfile: () => void;
}) {
  const profilesQuery = useQuery({
    queryKey: ["rule-profiles", frontendConfig.schoolId, periodId],
    queryFn: ({ signal }) =>
      request<RuleProfile[]>(`/schools/${frontendConfig.schoolId}/academic-periods/${periodId}/rule-profiles`, {
        signal,
      }),
    enabled: Boolean(open && frontendConfig.schoolId && periodId),
  });
  const draftProfiles = useMemo(
    () => (profilesQuery.data ?? []).filter((profile) => profile.status === "DRAFT"),
    [profilesQuery.data],
  );
  const [profileId, setProfileId] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const queryClient = useQueryClient();
  const selectedProfile = draftProfiles.find((profile) => profile.id === profileId) ?? draftProfiles[0];
  const existingPreferenceRule = selectedProfile?.rules.find(
    (rule) => rule.code === "RULE-TEACHER-PREFERRED-OFF-DAYS" && rule.scope.actorId === teacher.id,
  );
  const mutation = useMutation({
    mutationFn: async () => {
      if (days.length === 0 && !existingPreferenceRule) {
        throw new Error("Chọn ít nhất một ngày nghỉ mong muốn.");
      }
      const profile =
        selectedProfile ??
        (await request<RuleProfile>(
          `/schools/${frontendConfig.schoolId}/academic-periods/${periodId}/rule-profiles/ensure-draft`,
          { method: "POST" },
        ));
      const currentRule = profile.rules.find(
        (rule) => rule.code === "RULE-TEACHER-PREFERRED-OFF-DAYS" && rule.scope.actorId === teacher.id,
      );
      if (days.length > 2) throw new Error("Chọn từ 1 đến 2 ngày nghỉ mong muốn.");
      if (days.length === 0 && currentRule) {
        return request(`/schools/${frontendConfig.schoolId}/rule-profiles/${profile.id}/rules/${currentRule.id}`, {
          method: "DELETE",
        });
      }
      const sourceUrl = profile.sourceUrl?.trim();
      if (!sourceUrl) throw new Error("Bộ quy tắc cần có nguồn trước khi lưu ngày nghỉ.");
      return request(
        currentRule
          ? `/schools/${frontendConfig.schoolId}/rule-profiles/${profile.id}/rules/${currentRule.id}`
          : `/schools/${frontendConfig.schoolId}/rule-profiles/${profile.id}/rules`,
        {
          method: currentRule ? "PATCH" : "POST",
          body: JSON.stringify({
            code: "RULE-TEACHER-PREFERRED-OFF-DAYS",
            kind: "SOFT",
            weight: 10,
            sourceUrl,
            sourceLocator: "Rule Center · Giáo viên",
            effectiveFrom: profile.effectiveFrom,
            effectiveTo: profile.effectiveTo,
            scope: { actorType: "TEACHER", actorId: teacher.id, resourceType: "TEACHER" },
            parameters: { daysOfWeek: [...days].sort((a, b) => a - b) },
          }),
        },
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rule-profiles", frontendConfig.schoolId, periodId] });
      if (selectedProfile) {
        await queryClient.invalidateQueries({ queryKey: ["rule-validation", selectedProfile.id] });
      }
      onSaved(
        days.length === 0
          ? "Đã bỏ ngày nghỉ mong muốn khỏi bộ quy tắc DRAFT."
          : "Đã cập nhật ngày nghỉ mong muốn trong bộ quy tắc DRAFT.",
      );
      onOpenChange(false);
    },
  });

  useEffect(() => {
    if (open) {
      setProfileId(draftProfiles[0]?.id ?? "");
    }
  }, [open, draftProfiles, teacher.id]);

  useEffect(() => {
    if (!open) return;
    const configuredDays = existingPreferenceRule?.parameters.daysOfWeek;
    setDays(
      Array.isArray(configuredDays)
        ? configuredDays.filter((day): day is number => typeof day === "number" && Number.isInteger(day))
        : [],
    );
  }, [existingPreferenceRule?.id, open, selectedProfile?.id, teacher.id]);

  function toggleDay(day: number) {
    setDays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : current.length < 2 ? [...current, day] : current,
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="master-duty-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays aria-hidden="true" /> Ngày nghỉ mong muốn
          </DialogTitle>
          <DialogDescription>
            {teacher.code} - {teacher.displayName}. Chọn tối đa 2 ngày để solver ưu tiên không xếp tiết. Đây là nguyện
            vọng mềm, không phải ngày cấm dạy tuyệt đối.
          </DialogDescription>
        </DialogHeader>
        {profilesQuery.isPending ? <p className="small-note">Đang tải các bộ quy tắc DRAFT…</p> : null}
        {profilesQuery.error ? (
          <p className="master-dialog-error" role="alert">
            {profilesQuery.error instanceof Error ? profilesQuery.error.message : "Không thể tải bộ quy tắc."}
          </p>
        ) : null}
        {!profilesQuery.isPending && !profilesQuery.error && !selectedProfile ? (
          <div className="master-empty-state">
            <strong>Chưa có bộ quy tắc DRAFT</strong>
            <p>Hệ thống sẽ tự tạo một bản nháp khi bạn lưu ngày nghỉ mong muốn.</p>
            <Button type="button" variant="outline" onClick={onNeedDraftProfile}>
              Mở Rule Center
            </Button>
          </div>
        ) : null}
        {!profilesQuery.isPending && !profilesQuery.error ? (
          <div className="master-duty-form">
            {selectedProfile ? (
              <label>
                <span>Bộ quy tắc DRAFT</span>
                <select
                  className="master-select"
                  value={selectedProfile.id}
                  onChange={(event) => setProfileId(event.target.value)}
                >
                  {draftProfiles.map((profile) => (
                    <option value={profile.id} key={profile.id}>
                      {profile.name} · {profile.version}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <PreferredDayOptions days={days} onToggle={toggleDay} />
            <p className="field-hint">
              {selectedProfile
                ? "Rule sẽ được lưu ở trạng thái chờ phê duyệt. Chỉ snapshot đã phê duyệt mới được áp dụng khi xếp TKB."
                : "Khi lưu, hệ thống sẽ tự tạo profile DRAFT kế thừa bộ quy tắc hiện tại rồi thêm ngày nghỉ này."}
            </p>
          </div>
        ) : null}
        {mutation.error ? (
          <p className="master-dialog-error" role="alert">
            {mutation.error instanceof Error ? mutation.error.message : "Không thể lưu ngày nghỉ mong muốn."}
          </p>
        ) : null}
        <DialogFooter>
          <Button className="dialog-cancel" type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            type="button"
            disabled={!canWrite || (!existingPreferenceRule && days.length === 0) || mutation.isPending}
            onClick={() => void mutation.mutateAsync()}
          >
            {mutation.isPending ? "Đang lưu…" : days.length === 0 ? "Bỏ ngày nghỉ" : "Lưu ngày nghỉ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreferredDayOptions({ days, onToggle }: { days: number[]; onToggle: (day: number) => void }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold">Ngày nghỉ mong muốn ({days.length}/2)</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {DAYS.map(([day, label]) => (
          <label
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
            key={day}
          >
            <input type="checkbox" checked={days.includes(day)} onChange={() => onToggle(day)} />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
