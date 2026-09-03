import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Plus, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { frontendConfig } from "../../config";
import { request } from "./master-data-api";
import { RuleDefinitionDialog } from "./rule-definition-dialog";
import type {
  RuleCatalogEntry,
  RuleCatalogResponse,
  RuleProfile,
  RuleSnapshot,
  RuleSnapshotResolution,
  RuleValidationResult,
  Teacher,
} from "./master-data-types";

const statusLabels = {
  DRAFT: "Bản nháp",
  ACTIVE: "Đang áp dụng",
  RETIRED: "Đã ngừng",
  PENDING_STAKEHOLDER: "Chờ phê duyệt",
  APPROVED: "Đã phê duyệt",
  REVOKED: "Đã thu hồi",
} as const;

export function RuleCenterPanel({
  schoolId,
  periodId,
  teachers,
  canWrite,
  onSaved,
}: {
  schoolId: string;
  periodId: string;
  teachers: Teacher[];
  canWrite: boolean;
  onSaved: (message: string) => void;
}) {
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({
    version: "1.0.0",
    name: "Bộ quy tắc xếp thời khóa biểu",
    sourceUrl: "https://schedule.local/ui/rule-center",
    effectiveFrom: new Date().toISOString().slice(0, 10),
  });
  const [approvalSnapshot, setApprovalSnapshot] = useState<RuleSnapshot | null>(null);
  const [approvalReason, setApprovalReason] = useState("Đã rà soát bộ quy tắc trước khi áp dụng.");
  const queryClient = useQueryClient();
  const queryKey = ["rule-profiles", schoolId, periodId];
  const profilesQuery = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      request<RuleProfile[]>(`/schools/${schoolId}/academic-periods/${periodId}/rule-profiles`, { signal }),
    enabled: Boolean(schoolId && periodId),
  });
  const catalogQuery = useQuery({
    queryKey: ["rule-catalog", schoolId],
    queryFn: ({ signal }) => request<RuleCatalogResponse>(`/schools/${schoolId}/rule-catalog`, { signal }),
    enabled: Boolean(schoolId),
  });
  const snapshotQuery = useQuery({
    queryKey: ["rule-snapshots", schoolId, periodId],
    queryFn: ({ signal }) =>
      request<RuleSnapshot[]>(`/schools/${schoolId}/academic-periods/${periodId}/rule-snapshots`, { signal }),
    enabled: Boolean(schoolId && periodId),
  });
  const activeSnapshotQuery = useQuery({
    queryKey: ["active-rule-snapshot", schoolId, periodId],
    queryFn: ({ signal }) =>
      request<RuleSnapshotResolution>(`/schools/${schoolId}/academic-periods/${periodId}/rule-snapshots/active`, {
        signal,
      }),
    enabled: Boolean(schoolId && periodId),
  });
  const profiles = profilesQuery.data ?? [];
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0];
  const validationQuery = useQuery({
    queryKey: ["rule-validation", selectedProfile?.id],
    queryFn: ({ signal }) =>
      request<RuleValidationResult>(`/schools/${schoolId}/rule-profiles/${selectedProfile!.id}/validation`, { signal }),
    enabled: Boolean(selectedProfile?.id),
  });
  const createProfileMutation = useMutation({
    mutationFn: () =>
      request<RuleProfile>(`/schools/${schoolId}/academic-periods/${periodId}/rule-profiles`, {
        method: "POST",
        body: JSON.stringify({
          ...profileForm,
          scope: { schoolLevel: "THCS" },
        }),
      }),
    onSuccess: async (profile) => {
      await queryClient.invalidateQueries({ queryKey });
      setSelectedProfileId(profile.id);
      setProfileDialogOpen(false);
      onSaved("Đã tạo bộ quy tắc DRAFT.");
    },
  });
  const snapshotMutation = useMutation({
    mutationFn: () => {
      if (!selectedProfile) throw new Error("Chưa chọn rule profile.");
      return request<RuleSnapshot>(`/schools/${schoolId}/rule-profiles/${selectedProfile.id}/snapshots`, {
        method: "POST",
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["rule-snapshots", schoolId, periodId] }),
      ]);
      onSaved("Đã tạo snapshot chờ phê duyệt.");
    },
  });
  const approveMutation = useMutation({
    mutationFn: () => {
      if (!approvalSnapshot) throw new Error("Chưa chọn snapshot.");
      return request<RuleSnapshot>(`/schools/${schoolId}/rule-snapshots/${approvalSnapshot.snapshotId}/approve`, {
        method: "POST",
        body: JSON.stringify({ approvalReason }),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["rule-snapshots", schoolId, periodId] }),
        queryClient.invalidateQueries({ queryKey: ["active-rule-snapshot", schoolId, periodId] }),
      ]);
      setApprovalSnapshot(null);
      onSaved("Đã phê duyệt snapshot rule.");
    },
  });
  const pendingSnapshot = useMemo(
    () => (snapshotQuery.data ?? []).find((snapshot) => snapshot.approvalState === "PENDING_STAKEHOLDER"),
    [snapshotQuery.data],
  );

  useEffect(() => {
    if (selectedProfileId && profiles.some((profile) => profile.id === selectedProfileId)) return;
    setSelectedProfileId(profiles[0]?.id ?? "");
  }, [profiles, selectedProfileId]);

  if (!periodId) return <div className="master-empty-state">Chọn năm học/kỳ học để quản lý bộ quy tắc.</div>;

  return (
    <section className="master-relation-imports" aria-labelledby="rule-center-title">
      <div className="master-relation-imports-heading">
        <div>
          <span className="master-section-kicker">Quy tắc vận hành</span>
          <h2 id="rule-center-title">Rule Center</h2>
          <p>
            Rule được nhập bằng biểu mẫu có cấu trúc. Chỉ snapshot đã phê duyệt mới được đưa vào xếp thời khóa biểu.
          </p>
        </div>
        <Button type="button" onClick={() => setProfileDialogOpen(true)} disabled={!canWrite}>
          <Plus aria-hidden="true" /> Tạo bộ quy tắc
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatusCard
          icon={ShieldCheck}
          label="Snapshot đang dùng"
          value={
            activeSnapshotQuery.data?.resolved
              ? (activeSnapshotQuery.data.snapshot?.ruleSetVersion ?? "Đã chọn")
              : "Chưa có"
          }
          detail={
            activeSnapshotQuery.data?.resolved
              ? (activeSnapshotQuery.data.snapshot?.snapshotHash.slice(0, 12) ?? "Snapshot hợp lệ")
              : "Cần phê duyệt trước khi xếp TKB"
          }
        />
        <StatusCard
          icon={SlidersHorizontal}
          label="Catalog"
          value={catalogQuery.data?.catalogVersion ?? "Đang tải"}
          detail={`${catalogQuery.data?.ruleTypes.length ?? 0} loại rule`}
        />
        <StatusCard
          icon={CheckCircle2}
          label="Bộ quy tắc"
          value={`${profiles.length} profile`}
          detail={`${snapshotQuery.data?.length ?? 0} snapshot`}
        />
      </div>

      {profilesQuery.isPending || catalogQuery.isPending ? (
        <div className="master-loading-state" role="status">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-3 w-80" />
        </div>
      ) : null}
      {profilesQuery.error || catalogQuery.error ? (
        <p className="master-dialog-error" role="alert">
          Không thể tải Rule Center. {errorMessage(profilesQuery.error ?? catalogQuery.error)}
        </p>
      ) : null}

      {catalogQuery.data?.ruleTypes.length ? <RuleCatalogList entries={catalogQuery.data.ruleTypes} /> : null}

      {!profilesQuery.isPending && !profilesQuery.error && profiles.length === 0 ? (
        <div className="master-empty-state">
          <strong>Chưa có bộ quy tắc</strong>
          <p>Tạo profile DRAFT đầu tiên để nhập ngày nghỉ mong muốn và các rule vận hành.</p>
        </div>
      ) : null}

      {profiles.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="space-y-2">
            <p className="text-sm font-semibold">Bộ quy tắc</p>
            {profiles.map((profile) => (
              <button
                className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${selectedProfile?.id === profile.id ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/40"}`}
                type="button"
                key={profile.id}
                onClick={() => setSelectedProfileId(profile.id)}
              >
                <strong className="block text-sm">{profile.name}</strong>
                <span className="mt-1 block text-xs text-muted-foreground">{profile.version}</span>
                <Badge className="mt-2" variant={profile.status === "ACTIVE" ? "default" : "secondary"}>
                  {statusLabels[profile.status]}
                </Badge>
              </button>
            ))}
          </div>
          {selectedProfile ? (
            <div className="space-y-4 rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">{selectedProfile.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Hiệu lực từ {selectedProfile.effectiveFrom ?? "chưa đặt"}. Nguồn:{" "}
                    {selectedProfile.sourceLocator ?? selectedProfile.sourceUrl ?? "chưa đặt"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedProfile.status === "DRAFT" ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setRuleDialogOpen(true)}
                        disabled={!canWrite || !catalogQuery.data?.ruleTypes.length}
                      >
                        <Plus aria-hidden="true" /> Thêm rule
                      </Button>
                      <Button
                        type="button"
                        onClick={() => void snapshotMutation.mutateAsync()}
                        disabled={!canWrite || !validationQuery.data?.canCreateSnapshot || snapshotMutation.isPending}
                      >
                        {snapshotMutation.isPending ? "Đang tạo…" : "Tạo snapshot"}
                      </Button>
                    </>
                  ) : null}
                  {pendingSnapshot &&
                  (frontendConfig.actorRole === "ADMIN" || frontendConfig.actorRole === "REVIEWER") ? (
                    <Button type="button" onClick={() => setApprovalSnapshot(pendingSnapshot)}>
                      <ShieldCheck aria-hidden="true" /> Phê duyệt snapshot
                    </Button>
                  ) : null}
                </div>
              </div>
              {validationQuery.data ? <ValidationSummary validation={validationQuery.data} /> : null}
              {selectedProfile.rules.length ? (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[720px] text-sm">
                    <caption className="sr-only">Các rule trong bộ quy tắc</caption>
                    <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Rule</th>
                        <th className="px-3 py-2">Phạm vi</th>
                        <th className="px-3 py-2">Mức độ</th>
                        <th className="px-3 py-2">Hiệu lực</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedProfile.rules.map((rule) => (
                        <tr className="border-t border-border" key={rule.id}>
                          <td className="px-3 py-3">
                            <strong>{rule.code}</strong>
                            <span className="block text-xs text-muted-foreground">
                              {rule.sourceLocator ?? rule.sourceUrl}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            {rule.scope.actorId
                              ? (teachers.find((teacher) => teacher.id === rule.scope.actorId)?.code ??
                                rule.scope.actorId)
                              : (rule.scope.resourceType ?? "Toàn profile")}
                          </td>
                          <td className="px-3 py-3">
                            <Badge variant={rule.kind === "HARD" ? "destructive" : "secondary"}>
                              {rule.kind === "HARD" ? "Bắt buộc" : "Ưu tiên"}
                            </Badge>
                          </td>
                          <td className="px-3 py-3">
                            {rule.effectiveFrom ?? "chưa đặt"} - {rule.effectiveTo ?? "Không thời hạn"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Profile chưa có rule. Thêm rule để tạo snapshot.</p>
              )}
              {selectedProfile.rules.length === 0 ? (
                <p className="field-hint">
                  Catalog hiện hiển thị cả rule đã hỗ trợ và rule đang chờ compiler. Chỉ rule đã hỗ trợ mới tạo được
                  snapshot.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {snapshotQuery.data?.length ? <SnapshotHistory snapshots={snapshotQuery.data} /> : null}

      {selectedProfile ? (
        <RuleDefinitionDialog
          open={ruleDialogOpen}
          onOpenChange={setRuleDialogOpen}
          profile={selectedProfile}
          periodId={periodId}
          teachers={teachers}
          catalog={catalogQuery.data?.ruleTypes ?? []}
          canWrite={canWrite}
          onSaved={onSaved}
        />
      ) : null}
      <CreateRuleProfileDialog
        open={profileDialogOpen}
        onOpenChange={setProfileDialogOpen}
        form={profileForm}
        onChange={setProfileForm}
        onSubmit={() => void createProfileMutation.mutateAsync()}
        pending={createProfileMutation.isPending}
        error={createProfileMutation.error}
      />
      <Dialog open={Boolean(approvalSnapshot)} onOpenChange={(open) => !open && setApprovalSnapshot(null)}>
        <DialogContent className="master-duty-dialog">
          <DialogHeader>
            <DialogTitle>Phê duyệt snapshot rule</DialogTitle>
            <DialogDescription>
              Snapshot đã tạo là immutable. Phê duyệt sẽ tạo bản snapshot APPROVED mới để dùng cho xếp TKB.
            </DialogDescription>
          </DialogHeader>
          <label>
            <span>Lý do phê duyệt</span>
            <Input value={approvalReason} onChange={(event) => setApprovalReason(event.target.value)} />
          </label>
          {approveMutation.error ? (
            <p className="master-dialog-error" role="alert">
              {errorMessage(approveMutation.error)}
            </p>
          ) : null}
          <DialogFooter>
            <Button className="dialog-cancel" type="button" variant="outline" onClick={() => setApprovalSnapshot(null)}>
              Hủy
            </Button>
            <Button
              type="button"
              disabled={approveMutation.isPending}
              onClick={() => void approveMutation.mutateAsync()}
            >
              {approveMutation.isPending ? "Đang phê duyệt…" : "Phê duyệt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function StatusCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon aria-hidden="true" />
        {label}
      </div>
      <strong className="mt-2 block text-lg">{value}</strong>
      <span className="mt-1 block text-xs text-muted-foreground">{detail}</span>
    </div>
  );
}

function RuleCatalogList({ entries }: { entries: RuleCatalogEntry[] }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="rule-catalog-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="rule-catalog-title" className="text-base font-semibold">
            Danh mục rule
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">Chỉ rule có compiler được hỗ trợ mới được tạo snapshot.</p>
        </div>
        <Badge variant="secondary">{entries.length} loại</Badge>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {entries.map((entry) => (
          <div className="rounded-lg border border-border px-3 py-3" key={entry.code}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-sm">{entry.name}</strong>
              <Badge variant={entry.implementationStatus === "SUPPORTED" ? "default" : "secondary"}>
                {entry.implementationStatus === "SUPPORTED" ? "Đã hỗ trợ" : "Đang phát triển"}
              </Badge>
            </div>
            <code className="mt-1 block text-xs text-muted-foreground">{entry.code}</code>
            <p className="mt-2 text-xs text-muted-foreground">{entry.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SnapshotHistory({ snapshots }: { snapshots: RuleSnapshot[] }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="rule-snapshot-history-title">
      <div className="flex items-center justify-between gap-3">
        <h3 id="rule-snapshot-history-title" className="text-base font-semibold">
          Lịch sử snapshot
        </h3>
        <span className="text-xs text-muted-foreground">{snapshots.length} snapshot</span>
      </div>
      <div className="mt-3 grid gap-2">
        {snapshots.slice(0, 5).map((snapshot) => (
          <div
            className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm"
            key={snapshot.snapshotId}
          >
            <span>
              <strong>{snapshot.ruleSetVersion}</strong>
              <span className="ml-2 text-xs text-muted-foreground">{snapshot.snapshotHash.slice(0, 12)}</span>
            </span>
            <Badge variant={snapshot.approvalState === "APPROVED" ? "default" : "secondary"}>
              {statusLabels[snapshot.approvalState]}
            </Badge>
          </div>
        ))}
      </div>
    </section>
  );
}

function ValidationSummary({ validation }: { validation: RuleValidationResult }) {
  return (
    <div
      className={`rounded-lg border px-3 py-3 text-sm ${validation.canCreateSnapshot ? "border-emerald-300 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30" : "border-destructive/40 bg-destructive/5"}`}
    >
      <strong>{validation.canCreateSnapshot ? "Profile hợp lệ để tạo snapshot" : "Profile cần rà soát"}</strong>
      <span className="ml-2 text-muted-foreground">
        {validation.counts.total} rule, {validation.counts.hard} bắt buộc, {validation.counts.soft} ưu tiên
      </span>
      {validation.issues.length ? (
        <ul className="mt-2 space-y-1 text-xs">
          {validation.issues.map((issue) => (
            <li key={`${issue.code}-${issue.ruleId ?? "profile"}`}>
              {issue.severity}: {issue.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CreateRuleProfileDialog({
  open,
  onOpenChange,
  form,
  onChange,
  onSubmit,
  pending,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: { version: string; name: string; sourceUrl: string; effectiveFrom: string };
  onChange: (form: { version: string; name: string; sourceUrl: string; effectiveFrom: string }) => void;
  onSubmit: () => void;
  pending: boolean;
  error: unknown;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="master-duty-dialog">
        <DialogHeader>
          <DialogTitle>Tạo bộ quy tắc DRAFT</DialogTitle>
          <DialogDescription>Profile là nơi tập hợp nhiều rule trước khi tạo snapshot và phê duyệt.</DialogDescription>
        </DialogHeader>
        <div className="master-duty-form">
          <label>
            <span>Tên bộ quy tắc</span>
            <Input value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} />
          </label>
          <label>
            <span>Phiên bản profile</span>
            <Input value={form.version} onChange={(event) => onChange({ ...form, version: event.target.value })} />
          </label>
          <label>
            <span>Nguồn</span>
            <Input value={form.sourceUrl} onChange={(event) => onChange({ ...form, sourceUrl: event.target.value })} />
          </label>
          <label>
            <span>Ngày hiệu lực</span>
            <Input
              type="date"
              value={form.effectiveFrom}
              onChange={(event) => onChange({ ...form, effectiveFrom: event.target.value })}
            />
          </label>
        </div>
        {error ? (
          <p className="master-dialog-error" role="alert">
            {errorMessage(error)}
          </p>
        ) : null}
        <DialogFooter>
          <Button className="dialog-cancel" type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            type="button"
            disabled={
              pending || !form.name.trim() || !form.version.trim() || !form.sourceUrl.trim() || !form.effectiveFrom
            }
            onClick={onSubmit}
          >
            {pending ? "Đang tạo…" : "Tạo profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Không thể hoàn thành thao tác Rule Center.";
}
