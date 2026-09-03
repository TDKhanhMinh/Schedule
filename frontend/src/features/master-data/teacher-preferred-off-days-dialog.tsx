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
  const mutation = useMutation({
    mutationFn: () => {
      if (!selectedProfile) throw new Error("Cần tạo bộ quy tắc DRAFT trước.");
      if (days.length === 0 || days.length > 2) throw new Error("Chọn từ 1 đến 2 ngày nghỉ mong muốn.");
      const sourceUrl = selectedProfile.sourceUrl?.trim();
      if (!sourceUrl) throw new Error("Bộ quy tắc cần có nguồn trước khi lưu ngày nghỉ.");
      return request(`/schools/${frontendConfig.schoolId}/rule-profiles/${selectedProfile.id}/rules`, {
        method: "POST",
        body: JSON.stringify({
          code: "RULE-TEACHER-PREFERRED-OFF-DAYS",
          kind: "SOFT",
          weight: 10,
          sourceUrl,
          sourceLocator: "Rule Center · Giáo viên",
          effectiveFrom: selectedProfile.effectiveFrom,
          effectiveTo: selectedProfile.effectiveTo,
          scope: { actorType: "TEACHER", actorId: teacher.id, resourceType: "TEACHER" },
          parameters: { daysOfWeek: [...days].sort((a, b) => a - b) },
        }),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rule-profiles", frontendConfig.schoolId, periodId] });
      onSaved("Đã lưu ngày nghỉ mong muốn vào bộ quy tắc DRAFT.");
      onOpenChange(false);
    },
  });

  useEffect(() => {
    if (open) {
      setProfileId(draftProfiles[0]?.id ?? "");
      setDays([]);
    }
  }, [open, draftProfiles, teacher.id]);

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
            <p>Tạo một bộ quy tắc DRAFT trong Rule Center rồi quay lại cấu hình ngày nghỉ.</p>
            <Button type="button" variant="outline" onClick={onNeedDraftProfile}>
              Mở Rule Center
            </Button>
          </div>
        ) : null}
        {selectedProfile ? (
          <div className="master-duty-form">
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
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold">Ngày nghỉ mong muốn ({days.length}/2)</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {DAYS.map(([day, label]) => (
                  <label
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                    key={day}
                  >
                    <input type="checkbox" checked={days.includes(day)} onChange={() => toggleDay(day)} />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="field-hint">
              Rule sẽ được lưu ở trạng thái chờ phê duyệt. Chỉ snapshot đã phê duyệt mới được áp dụng khi xếp TKB.
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
            disabled={!canWrite || !selectedProfile || days.length === 0 || mutation.isPending}
            onClick={() => void mutation.mutateAsync()}
          >
            {mutation.isPending ? "Đang lưu…" : "Lưu ngày nghỉ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
