import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, Lock, Send, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { WorkflowStepper, type WorkflowStepKey } from "@/components/workflow-stepper";
import { apiRequest } from "../../lib/api-client";
import { frontendConfig } from "../../config";

type WorkflowStatus = "DRAFT" | "IN_REVIEW" | "APPROVED" | "LOCKED" | "PUBLISHED" | "ARCHIVED";
const statusLabels: Record<WorkflowStatus, string> = {
  DRAFT: "Bản nháp",
  IN_REVIEW: "Đang rà soát",
  APPROVED: "Đã phê duyệt",
  LOCKED: "Đã khóa",
  PUBLISHED: "Đã công bố",
  ARCHIVED: "Đã lưu trữ",
};

export function ReleasePanel({ versionId, status }: { versionId: string; status: string }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState<"APPROVED" | "PUBLISHED" | null>(null);
  const transitionsQuery = useQuery({
    queryKey: ["schedule-transitions", frontendConfig.schoolId, versionId],
    queryFn: ({ signal }) =>
      apiRequest<Array<{ id: string; action: string; createdAt: string }>>(
        `/schools/${frontendConfig.schoolId}/schedule-versions/${versionId}/transitions`,
        { signal },
      ),
    enabled: Boolean(frontendConfig.schoolId && versionId),
  });
  const transitionMutation = useMutation({
    mutationFn: ({
      toStatus,
      transitionReason,
    }: {
      toStatus: "APPROVED" | "LOCKED" | "PUBLISHED";
      transitionReason?: string;
    }) =>
      apiRequest(`/schools/${frontendConfig.schoolId}/schedule-versions/${versionId}/transitions`, {
        method: "POST",
        body: JSON.stringify({ toStatus, reason: transitionReason ?? "" }),
      }),
    onSuccess: async () => {
      setTarget(null);
      setReason("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["timetable"] }),
        queryClient.invalidateQueries({ queryKey: ["schedule-transitions", frontendConfig.schoolId, versionId] }),
      ]);
    },
  });
  const normalizedStatus = status as WorkflowStatus;
  const canPublish = frontendConfig.actorRole === "ADMIN" || frontendConfig.actorRole === "REVIEWER";
  const releaseWorkflow = releaseWorkflowState(normalizedStatus);
  return (
    <>
      <Card className="mt-4">
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardDescription>Phát hành phiên bản</CardDescription>
            <CardTitle>Kiểm tra trước khi công bố</CardTitle>
          </div>
          <Badge variant={normalizedStatus === "PUBLISHED" ? "default" : "secondary"}>
            {statusLabels[normalizedStatus] ?? status}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-5">
          <WorkflowStepper activeStep={releaseWorkflow.activeStep} completedSteps={releaseWorkflow.completedSteps} />
          {normalizedStatus === "PUBLISHED" ? (
            <Alert>
              <ShieldCheck className="size-4" />
              <AlertDescription>Phiên bản đã công bố và không thể chỉnh sửa.</AlertDescription>
            </Alert>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={!canPublish || normalizedStatus !== "IN_REVIEW"}
                onClick={() => setTarget("APPROVED")}
              >
                <CheckCircle2 /> Phê duyệt
              </Button>
              <Button
                variant="outline"
                disabled={normalizedStatus !== "APPROVED" || transitionMutation.isPending}
                onClick={() => void transitionMutation.mutateAsync({ toStatus: "LOCKED" })}
              >
                <Lock /> Khóa phiên bản
              </Button>
              <Button disabled={!canPublish || normalizedStatus !== "LOCKED"} onClick={() => setTarget("PUBLISHED")}>
                <Send /> Công bố
              </Button>
            </div>
          )}
          {transitionsQuery.data?.length ? (
            <div className="border-t pt-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Lịch sử chuyển trạng thái</p>
              <div className="space-y-2">
                {transitionsQuery.data.slice(0, 5).map((transition) => (
                  <div className="flex items-center justify-between text-sm" key={transition.id}>
                    <span>{transition.action}</span>
                    <time className="text-xs text-muted-foreground">{transition.createdAt}</time>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
      <Dialog
        open={Boolean(target)}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{target === "APPROVED" ? "Phê duyệt phiên bản" : "Công bố phiên bản"}</DialogTitle>
            <DialogDescription>Nhập lý do để lưu vào nhật ký audit của phiên bản.</DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Lý do"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Nhập lý do…"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>
              Hủy
            </Button>
            <Button
              disabled={!reason.trim() || transitionMutation.isPending}
              onClick={() =>
                target && void transitionMutation.mutateAsync({ toStatus: target, transitionReason: reason.trim() })
              }
            >
              {transitionMutation.isPending ? "Đang xử lý…" : "Xác nhận"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function releaseWorkflowState(status: WorkflowStatus): {
  activeStep: WorkflowStepKey;
  completedSteps: WorkflowStepKey[];
} {
  if (status === "PUBLISHED" || status === "ARCHIVED") {
    return {
      activeStep: "export",
      completedSteps: ["upload", "validate", "confirm", "solve", "review", "approve", "lock", "publish"],
    };
  }
  if (status === "LOCKED") {
    return {
      activeStep: "publish",
      completedSteps: ["upload", "validate", "confirm", "solve", "review", "approve", "lock"],
    };
  }
  if (status === "APPROVED") {
    return {
      activeStep: "lock",
      completedSteps: ["upload", "validate", "confirm", "solve", "review", "approve"],
    };
  }
  if (status === "IN_REVIEW") {
    return {
      activeStep: "approve",
      completedSteps: ["upload", "validate", "confirm", "solve", "review"],
    };
  }
  return {
    activeStep: "review",
    completedSteps: ["upload", "validate", "confirm", "solve"],
  };
}
