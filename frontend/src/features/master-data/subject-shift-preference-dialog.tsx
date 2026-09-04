import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3 } from "lucide-react";
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
import type { RuleProfile, Subject } from "./master-data-types";

type SubjectShiftPreference = "MAIN" | "SECONDARY";

const SHIFT_OPTIONS: Array<{ value: SubjectShiftPreference; label: string }> = [
  { value: "MAIN", label: "Buổi chính" },
  { value: "SECONDARY", label: "Buổi phụ" },
];

export function SubjectShiftPreferenceDialog({
  subject,
  periodId,
  canWrite,
  open,
  onOpenChange,
  onSaved,
}: {
  subject: Subject;
  periodId: string;
  canWrite: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (message: string) => void;
}) {
  const queryClient = useQueryClient();
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
  const [preferredShift, setPreferredShift] = useState<SubjectShiftPreference>("MAIN");
  const selectedProfile = draftProfiles.find((profile) => profile.id === profileId) ?? draftProfiles[0];
  const existingRule = selectedProfile?.rules.find(
    (rule) =>
      rule.code === "RULE-SUBJECT-SHIFT-PREFERENCE" &&
      rule.scope.resourceType === "SUBJECT" &&
      rule.scope.resourceIds?.includes(subject.id),
  );

  const mutation = useMutation({
    mutationFn: async ({ remove = false }: { remove?: boolean } = {}) => {
      const profile =
        selectedProfile ??
        (await request<RuleProfile>(
          `/schools/${frontendConfig.schoolId}/academic-periods/${periodId}/rule-profiles/ensure-draft`,
          { method: "POST" },
        ));
      const currentRule = profile.rules.find(
        (rule) =>
          rule.code === "RULE-SUBJECT-SHIFT-PREFERENCE" &&
          rule.scope.resourceType === "SUBJECT" &&
          rule.scope.resourceIds?.includes(subject.id),
      );
      if (remove && currentRule) {
        return request(`/schools/${frontendConfig.schoolId}/rule-profiles/${profile.id}/rules/${currentRule.id}`, {
          method: "DELETE",
        });
      }
      if (remove) throw new Error("Môn học chưa có cấu hình buổi dạy để xóa.");
      const sourceUrl = profile.sourceUrl?.trim();
      if (!sourceUrl) throw new Error("Bộ quy tắc cần có nguồn trước khi lưu ưu tiên buổi dạy.");
      return request(
        currentRule
          ? `/schools/${frontendConfig.schoolId}/rule-profiles/${profile.id}/rules/${currentRule.id}`
          : `/schools/${frontendConfig.schoolId}/rule-profiles/${profile.id}/rules`,
        {
          method: currentRule ? "PATCH" : "POST",
          body: JSON.stringify({
            code: "RULE-SUBJECT-SHIFT-PREFERENCE",
            kind: "SOFT",
            weight: 10,
            sourceUrl,
            sourceLocator: "Rule Center · Môn học",
            effectiveFrom: profile.effectiveFrom,
            effectiveTo: profile.effectiveTo,
            scope: { resourceType: "SUBJECT", resourceIds: [subject.id] },
            parameters: { preferredShift },
          }),
        },
      );
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["rule-profiles", frontendConfig.schoolId, periodId] });
      if (selectedProfile) {
        await queryClient.invalidateQueries({ queryKey: ["rule-validation", selectedProfile.id] });
      }
      onSaved(variables?.remove ? "Đã bỏ ưu tiên buổi dạy cho môn học." : "Đã cập nhật ưu tiên buổi dạy cho môn học.");
      onOpenChange(false);
    },
  });

  useEffect(() => {
    if (open) setProfileId(draftProfiles[0]?.id ?? "");
  }, [draftProfiles, open, subject.id]);

  useEffect(() => {
    if (!open) return;
    const configuredShift = existingRule?.parameters.preferredShift;
    setPreferredShift(configuredShift === "SECONDARY" ? "SECONDARY" : "MAIN");
  }, [existingRule?.id, open, selectedProfile?.id, subject.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="master-duty-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock3 aria-hidden="true" /> Ưu tiên buổi dạy theo môn
          </DialogTitle>
          <DialogDescription>
            {subject.code} - {subject.name}. Mặc định là ưu tiên mềm; bộ tối ưu vẫn có thể chọn buổi khác nếu cần.
          </DialogDescription>
        </DialogHeader>
        {profilesQuery.isPending ? <p className="small-note">Đang tải bộ quy tắc…</p> : null}
        {profilesQuery.error ? (
          <p className="master-dialog-error" role="alert">
            {profilesQuery.error instanceof Error ? profilesQuery.error.message : "Không thể tải bộ quy tắc."}
          </p>
        ) : null}
        {!profilesQuery.isPending && !profilesQuery.error && !selectedProfile ? (
          <div className="master-empty-state">
            <strong>Chưa có bộ quy tắc DRAFT</strong>
            <p>Hệ thống sẽ tự tạo bản DRAFT kế thừa cấu hình hiện tại khi bạn lưu ưu tiên buổi dạy.</p>
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
            <label>
              <span>Buổi ưu tiên</span>
              <select
                className="master-select"
                value={preferredShift}
                onChange={(event) => setPreferredShift(event.target.value as SubjectShiftPreference)}
              >
                {SHIFT_OPTIONS.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="field-hint">
              Buổi chính/buổi phụ được quy đổi theo cấu hình của từng khối lớp. Rule chỉ được dùng sau khi snapshot được
              phê duyệt.
            </p>
          </div>
        ) : null}
        {mutation.error ? (
          <p className="master-dialog-error" role="alert">
            {mutation.error instanceof Error ? mutation.error.message : "Không thể lưu ưu tiên buổi dạy."}
          </p>
        ) : null}
        <DialogFooter>
          {existingRule ? (
            <Button
              className="dialog-remove"
              type="button"
              variant="outline"
              disabled={!canWrite || mutation.isPending}
              onClick={() => void mutation.mutateAsync({ remove: true })}
            >
              Bỏ cấu hình
            </Button>
          ) : null}
          <Button className="dialog-cancel" type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            type="button"
            disabled={!canWrite || mutation.isPending}
            onClick={() => void mutation.mutateAsync({ remove: false })}
          >
            {mutation.isPending ? "Đang lưu…" : "Lưu ưu tiên"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
