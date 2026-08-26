import {
  FREEZE_SCOPE_CONTRACT_VERSION,
  type AffectedNeighborhood,
  type FreezeAssignmentSnapshot,
  type FreezeChangeDecision,
  type FreezeChangeEvent,
  type FreezeNeighborhoodEdge,
  type FreezeResourceNode,
  type FreezeScope,
  type FreezeScopeResourceKind,
  type FreezeScopeSelector,
} from "../contracts";

const HASH_PATTERN = /^[0-9a-f]{64}$/i;
const RESOURCE_KINDS: readonly FreezeScopeResourceKind[] = ["LESSON", "TEACHER", "CLASS", "DAY", "ROOM"];

export class FreezeScopeValidationError extends Error {
  constructor(
    public readonly code: "INVALID_SCOPE" | "INVALID_ASSIGNMENT" | "INVALID_CHANGE_EVENT" | "DUPLICATE_ASSIGNMENT",
    message: string,
  ) {
    super(message);
    this.name = "FreezeScopeValidationError";
  }
}

function requireText(value: string, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new FreezeScopeValidationError("INVALID_SCOPE", `${field} phải là chuỗi không rỗng.`);
  }
}

function resourceKey(kind: FreezeScopeResourceKind, id: string) {
  return `${kind}:${id}`;
}

function validateSelector(selector: FreezeScopeSelector) {
  if (!RESOURCE_KINDS.includes(selector.kind)) {
    throw new FreezeScopeValidationError("INVALID_SCOPE", `Resource kind không hợp lệ: ${selector.kind}.`);
  }
  requireText(selector.id, `${selector.kind}.id`);
  if (selector.kind === "DAY" && !/^[1-7]$/.test(selector.id)) {
    throw new FreezeScopeValidationError("INVALID_SCOPE", 'DAY selector phải là một giá trị từ "1" đến "7".');
  }
}

function validateAssignment(assignment: FreezeAssignmentSnapshot) {
  for (const [field, value] of Object.entries({
    assignmentId: assignment.assignmentId,
    lessonId: assignment.lessonId,
    teacherId: assignment.teacherId,
    classId: assignment.classId,
    timeSlotId: assignment.timeSlotId,
  })) {
    requireText(value, field);
  }
  if (!Number.isInteger(assignment.sessionIndex) || assignment.sessionIndex < 0) {
    throw new FreezeScopeValidationError("INVALID_ASSIGNMENT", "sessionIndex phải là số nguyên không âm.");
  }
  if (!Number.isInteger(assignment.day) || assignment.day < 1 || assignment.day > 7) {
    throw new FreezeScopeValidationError("INVALID_ASSIGNMENT", "day phải là số nguyên từ 1 đến 7.");
  }
}

function validateBaselineHash(hash: string, code: FreezeScopeValidationError["code"]) {
  if (!HASH_PATTERN.test(hash)) {
    throw new FreezeScopeValidationError(code, "baselineSnapshotHash phải là SHA-256 dạng hex 64 ký tự.");
  }
}

function assignmentNodes(assignment: FreezeAssignmentSnapshot): FreezeResourceNode[] {
  const nodes: FreezeResourceNode[] = [
    { kind: "LESSON", id: assignment.lessonId, key: resourceKey("LESSON", assignment.lessonId) },
    { kind: "TEACHER", id: assignment.teacherId, key: resourceKey("TEACHER", assignment.teacherId) },
    { kind: "CLASS", id: assignment.classId, key: resourceKey("CLASS", assignment.classId) },
    { kind: "DAY", id: String(assignment.day), key: resourceKey("DAY", String(assignment.day)) },
  ];
  if (assignment.roomId) {
    nodes.push({ kind: "ROOM", id: assignment.roomId, key: resourceKey("ROOM", assignment.roomId) });
  }
  return nodes;
}

function uniqueNodes(nodes: readonly FreezeResourceNode[]) {
  return [...new Map(nodes.map((node) => [node.key, node])).values()].sort((left, right) =>
    left.key.localeCompare(right.key),
  );
}

function changeNodes(event: FreezeChangeEvent) {
  return uniqueNodes([
    ...(event.before ? assignmentNodes(event.before) : []),
    ...(event.after ? assignmentNodes(event.after) : []),
  ]);
}

function validateEvent(event: FreezeChangeEvent) {
  if (event.contractType !== "FREEZE_CHANGE_EVENT" || event.contractVersion !== FREEZE_SCOPE_CONTRACT_VERSION) {
    throw new FreezeScopeValidationError("INVALID_CHANGE_EVENT", "Freeze change event không đúng contract version.");
  }
  for (const [field, value] of Object.entries({
    eventId: event.eventId,
    schoolId: event.schoolId,
    academicPeriodId: event.academicPeriodId,
    scheduleVersionId: event.scheduleVersionId,
  })) {
    requireText(value, field);
  }
  validateBaselineHash(event.baselineSnapshotHash, "INVALID_CHANGE_EVENT");
  if (event.operation === "MOVE" && (!event.before || !event.after)) {
    throw new FreezeScopeValidationError("INVALID_CHANGE_EVENT", "MOVE phải có cả before và after.");
  }
  if (event.operation === "ADD" && (!event.after || event.before)) {
    throw new FreezeScopeValidationError("INVALID_CHANGE_EVENT", "ADD chỉ được có after.");
  }
  if (event.operation === "REMOVE" && (!event.before || event.after)) {
    throw new FreezeScopeValidationError("INVALID_CHANGE_EVENT", "REMOVE chỉ được có before.");
  }
  if (!event.before && !event.after) {
    throw new FreezeScopeValidationError("INVALID_CHANGE_EVENT", "Change event phải có before hoặc after.");
  }
  if (event.before) validateAssignment(event.before);
  if (event.after) validateAssignment(event.after);
  if (event.before && event.after) {
    const identity = ["assignmentId", "lessonId", "sessionIndex"] as const;
    if (identity.some((field) => event.before?.[field] !== event.after?.[field])) {
      throw new FreezeScopeValidationError(
        "INVALID_CHANGE_EVENT",
        "before và after phải trỏ cùng một assignment session.",
      );
    }
  }
}

export function validateFreezeScope(scope: FreezeScope) {
  if (scope.contractType !== "FREEZE_SCOPE" || scope.contractVersion !== FREEZE_SCOPE_CONTRACT_VERSION) {
    throw new FreezeScopeValidationError("INVALID_SCOPE", "Freeze scope không đúng contract version.");
  }
  for (const [field, value] of Object.entries({
    scopeId: scope.scopeId,
    schoolId: scope.schoolId,
    academicPeriodId: scope.academicPeriodId,
    scheduleVersionId: scope.scheduleVersionId,
  })) {
    requireText(value, field);
  }
  validateBaselineHash(scope.baselineSnapshotHash, "INVALID_SCOPE");
  const seen = new Set<string>();
  for (const selector of scope.selectors) {
    validateSelector(selector);
    const key = resourceKey(selector.kind, selector.id);
    if (seen.has(key)) {
      throw new FreezeScopeValidationError("INVALID_SCOPE", `Selector bị lặp: ${key}.`);
    }
    seen.add(key);
  }
  return scope;
}

function validateBaseline(assignments: readonly FreezeAssignmentSnapshot[]) {
  const seen = new Set<string>();
  for (const assignment of assignments) {
    validateAssignment(assignment);
    if (seen.has(assignment.assignmentId)) {
      throw new FreezeScopeValidationError("DUPLICATE_ASSIGNMENT", `Assignment bị lặp: ${assignment.assignmentId}.`);
    }
    seen.add(assignment.assignmentId);
  }
}

export function buildAffectedNeighborhood(
  baselineAssignments: readonly FreezeAssignmentSnapshot[],
  event: FreezeChangeEvent,
): AffectedNeighborhood {
  validateBaseline(baselineAssignments);
  validateEvent(event);
  const changedResourceKeys = new Set(changeNodes(event).map((node) => node.key));
  const edges: FreezeNeighborhoodEdge[] = [];
  const affectedAssignmentIds = new Set<string>();
  const affectedResources: FreezeResourceNode[] = [];

  for (const assignment of baselineAssignments) {
    const nodes = assignmentNodes(assignment);
    if (!nodes.some((node) => changedResourceKeys.has(node.key))) continue;
    affectedAssignmentIds.add(assignment.assignmentId);
    affectedResources.push(...nodes);
    for (const node of nodes) edges.push({ assignmentId: assignment.assignmentId, resourceKey: node.key });
  }

  return {
    contractType: "AFFECTED_NEIGHBORHOOD",
    contractVersion: FREEZE_SCOPE_CONTRACT_VERSION,
    changeEventId: event.eventId,
    baselineSnapshotHash: event.baselineSnapshotHash,
    changedResourceKeys: [...changedResourceKeys].sort(),
    affectedAssignmentIds: [...affectedAssignmentIds].sort(),
    affectedResources: uniqueNodes(affectedResources),
    edges: edges.sort((left, right) =>
      `${left.assignmentId}:${left.resourceKey}`.localeCompare(`${right.assignmentId}:${right.resourceKey}`),
    ),
  };
}

export function evaluateFreezeChange(
  scope: FreezeScope,
  event: FreezeChangeEvent,
  baselineAssignments: readonly FreezeAssignmentSnapshot[],
): FreezeChangeDecision {
  validateFreezeScope(scope);
  validateEvent(event);
  const neighborhood = buildAffectedNeighborhood(baselineAssignments, event);
  const scopeMatches =
    scope.schoolId === event.schoolId &&
    scope.academicPeriodId === event.academicPeriodId &&
    scope.scheduleVersionId === event.scheduleVersionId;
  const violations = scope.selectors.filter((selector) =>
    changeNodes(event).some((node) => node.key === resourceKey(selector.kind, selector.id)),
  );
  const reason =
    scope.baselineSnapshotHash !== event.baselineSnapshotHash
      ? "BASELINE_SNAPSHOT_MISMATCH"
      : !scopeMatches
        ? "SCOPE_MISMATCH"
        : violations.length > 0
          ? "FROZEN_RESOURCE"
          : "ALLOWED";
  return {
    contractType: "FREEZE_DECISION",
    contractVersion: FREEZE_SCOPE_CONTRACT_VERSION,
    eventId: event.eventId,
    allowed: reason === "ALLOWED",
    reason,
    violations,
    neighborhood,
  };
}
