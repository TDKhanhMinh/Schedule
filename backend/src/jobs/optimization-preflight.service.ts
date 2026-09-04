import { Injectable } from "@nestjs/common";
import {
  CONFLICT_CATALOG_VERSION,
  runPreSolveChecks,
  type PreSolveIssue,
  type PreSolveReport,
  type SolveJobRequest,
} from "../contracts";

@Injectable()
export class OptimizationPreflightService {
  check(payload: SolveJobRequest, additionalIssues: PreSolveIssue[] = []): PreSolveReport {
    const report = runPreSolveChecks(payload);
    if (additionalIssues.length > 0) {
      report.issues.push(...additionalIssues);
      report.canSolve = false;
    }
    return report;
  }

  ruleSnapshotIssue(reason: string): PreSolveIssue {
    const messages: Record<string, string> = {
      NO_APPROVED_SNAPSHOT: "Chưa có bộ quy tắc APPROVED đang hiệu lực cho kỳ học này.",
      SNAPSHOT_NOT_APPROVED: "Rule snapshot được yêu cầu chưa được phê duyệt.",
      SNAPSHOT_PROFILE_NOT_ACTIVE: "Rule snapshot thuộc profile đã ngừng áp dụng.",
      SNAPSHOT_OUTSIDE_EFFECTIVE_WINDOW: "Rule snapshot không còn trong thời gian hiệu lực.",
      SNAPSHOT_HOMEROOM_ASSIGNMENTS_STALE:
        "Phân công GVCN đã thay đổi sau khi snapshot được phê duyệt; cần tạo snapshot mới.",
    };
    return {
      catalogVersion: CONFLICT_CATALOG_VERSION,
      code: "RULE_SNAPSHOT_NOT_APPLICABLE",
      severity: "ERROR",
      entity: "RULE",
      message: messages[reason] ?? "Không thể xác định bộ quy tắc áp dụng.",
      remediationHint: "Tạo hoặc chọn snapshot rule APPROVED đúng trường, kỳ học và thời gian hiệu lực.",
      entityReferences: {},
      details: { reason },
    };
  }
}
