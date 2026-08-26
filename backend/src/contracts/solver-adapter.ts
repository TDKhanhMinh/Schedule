import { createHash } from "node:crypto";
import type { SolveJobRequest } from "./index";

export const SOLVER_ADAPTER_CONTRACT_VERSION = "SOLVER-ADAPTER-1.0.0" as const;
export const DEFAULT_SOLVER_TIME_LIMIT_SECONDS = 10;

export interface SolverAdapterSource {
  schemaVersion: "1.0";
  templateVersion: string;
  schoolId: string;
  academicPeriodId: string;
  ruleSnapshotId: string;
  ruleSetVersion: string;
  ruleSnapshotHash: string;
}

export interface SolverAdapterReproducibility {
  randomSeed: number;
  timeLimitSeconds: number;
}

export interface SolverAdapterPayload {
  adapterContractVersion: typeof SOLVER_ADAPTER_CONTRACT_VERSION;
  source: SolverAdapterSource;
  reproducibility: SolverAdapterReproducibility;
  input: SolveJobRequest;
  inputChecksum: string;
}

export interface SolverAdapterContext {
  academicPeriodId: string;
  templateVersion: string;
  randomSeed?: number;
  timeLimitSeconds?: number;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nested]) => nested !== null && nested !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

function unsignedPayload(payload: Omit<SolverAdapterPayload, "inputChecksum">) {
  return canonicalize(payload);
}

export function computeSolverAdapterChecksum(payload: Omit<SolverAdapterPayload, "inputChecksum">) {
  return createHash("sha256")
    .update(JSON.stringify(unsignedPayload(payload)))
    .digest("hex");
}

export function buildSolverAdapterPayload(input: SolveJobRequest, context: SolverAdapterContext): SolverAdapterPayload {
  const ruleSnapshotId = input.ruleSnapshotId;
  const ruleSetVersion = input.ruleSetVersion;
  const ruleSnapshotHash = input.ruleSnapshotHash;
  if (!ruleSnapshotId || !ruleSetVersion || !ruleSnapshotHash) {
    throw new Error("Bộ điều hợp tối ưu yêu cầu tham chiếu bản chụp quy tắc đã phê duyệt.");
  }
  if (!context.academicPeriodId || !context.templateVersion) {
    throw new Error("Bộ điều hợp tối ưu yêu cầu academicPeriodId và templateVersion.");
  }

  const unsigned = {
    adapterContractVersion: SOLVER_ADAPTER_CONTRACT_VERSION,
    source: {
      schemaVersion: input.schemaVersion,
      templateVersion: context.templateVersion,
      schoolId: input.schoolId,
      academicPeriodId: context.academicPeriodId,
      ruleSnapshotId,
      ruleSetVersion,
      ruleSnapshotHash,
    },
    reproducibility: {
      randomSeed: context.randomSeed ?? 0,
      timeLimitSeconds:
        context.timeLimitSeconds ?? input.options?.timeLimitSeconds ?? DEFAULT_SOLVER_TIME_LIMIT_SECONDS,
    },
    input,
  } satisfies Omit<SolverAdapterPayload, "inputChecksum">;

  return {
    ...unsigned,
    inputChecksum: computeSolverAdapterChecksum(unsigned),
  };
}

export function verifySolverAdapterChecksum(payload: SolverAdapterPayload) {
  const { inputChecksum: received, ...unsigned } = payload;
  return received === computeSolverAdapterChecksum(unsigned);
}

export function validateSolverAdapterPayload(payload: SolverAdapterPayload) {
  if (payload.adapterContractVersion !== SOLVER_ADAPTER_CONTRACT_VERSION) {
    throw new Error(`Hợp đồng bộ điều hợp tối ưu không được hỗ trợ: ${payload.adapterContractVersion}`);
  }
  if (!/^[0-9a-f]{64}$/.test(payload.inputChecksum) || !verifySolverAdapterChecksum(payload)) {
    throw new Error("inputChecksum của bộ điều hợp tối ưu không khớp với dữ liệu chuẩn.");
  }
  return payload;
}
