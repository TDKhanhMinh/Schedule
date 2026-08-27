import { Check } from "lucide-react";

export const workflowSteps = [
  { key: "upload", label: "Tải lên" },
  { key: "validate", label: "Kiểm tra" },
  { key: "confirm", label: "Xác nhận" },
  { key: "solve", label: "Tối ưu" },
  { key: "review", label: "Rà soát và sửa" },
  { key: "approve", label: "Phê duyệt" },
  { key: "lock", label: "Khóa" },
  { key: "publish", label: "Công bố" },
  { key: "export", label: "Xuất dữ liệu" },
] as const;

export type WorkflowStepKey = (typeof workflowSteps)[number]["key"];

export function WorkflowStepper({
  activeStep,
  completedSteps = [],
}: {
  activeStep: WorkflowStepKey;
  completedSteps?: WorkflowStepKey[];
}) {
  const completed = new Set(completedSteps);
  return (
    <ol className="workflow-stepper" aria-label="Tiến trình workflow">
      {workflowSteps.map((step) => {
        const isComplete = completed.has(step.key);
        const isCurrent = activeStep === step.key;
        return (
          <li
            className={`workflow-step ${isComplete ? "is-complete" : isCurrent ? "is-current" : "is-upcoming"}`}
            aria-current={isCurrent ? "step" : undefined}
            key={step.key}
          >
            <span className="workflow-step-marker" aria-hidden="true">
              {isComplete ? <Check /> : null}
            </span>
            <span className="workflow-step-copy">
              <strong>{step.label}</strong>
              <small>{isComplete ? "Hoàn tất" : isCurrent ? "Đang xử lý" : "Chưa thực hiện"}</small>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
