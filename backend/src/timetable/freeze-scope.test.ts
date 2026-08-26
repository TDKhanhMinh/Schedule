/// <reference types="jest" />

import {
  FREEZE_SCOPE_CONTRACT_VERSION,
  type FreezeAssignmentSnapshot,
  type FreezeChangeEvent,
  type FreezeScope,
} from "../contracts";
import { buildAffectedNeighborhood, evaluateFreezeChange, validateFreezeScope } from "./freeze-scope";

const baselineHash = "a".repeat(64);
const assignments: readonly FreezeAssignmentSnapshot[] = [
  {
    assignmentId: "assignment-1",
    lessonId: "lesson-1",
    sessionIndex: 0,
    teacherId: "teacher-1",
    classId: "class-1",
    day: 1,
    timeSlotId: "slot-1",
    roomId: "room-1",
  },
  {
    assignmentId: "assignment-2",
    lessonId: "lesson-2",
    sessionIndex: 0,
    teacherId: "teacher-1",
    classId: "class-2",
    day: 1,
    timeSlotId: "slot-2",
    roomId: "room-2",
  },
  {
    assignmentId: "assignment-3",
    lessonId: "lesson-3",
    sessionIndex: 0,
    teacherId: "teacher-2",
    classId: "class-3",
    day: 2,
    timeSlotId: "slot-3",
    roomId: "room-3",
  },
];

const moveEvent: FreezeChangeEvent = {
  contractType: "FREEZE_CHANGE_EVENT",
  contractVersion: FREEZE_SCOPE_CONTRACT_VERSION,
  eventId: "change-1",
  schoolId: "school-1",
  academicPeriodId: "period-1",
  scheduleVersionId: "version-1",
  baselineSnapshotHash: baselineHash,
  operation: "MOVE",
  before: assignments[0],
  after: { ...assignments[0], day: 2, timeSlotId: "slot-4", roomId: "room-3" },
};

const scope = (selectors: FreezeScope["selectors"]): FreezeScope => ({
  contractType: "FREEZE_SCOPE",
  contractVersion: FREEZE_SCOPE_CONTRACT_VERSION,
  scopeId: "scope-1",
  schoolId: "school-1",
  academicPeriodId: "period-1",
  scheduleVersionId: "version-1",
  baselineSnapshotHash: baselineHash,
  selectors,
});

describe("freeze scope contract", () => {
  it("builds a deterministic neighborhood across lesson, teacher, class, day and room edges", () => {
    const report = buildAffectedNeighborhood(assignments, moveEvent);

    expect(report.changedResourceKeys).toEqual([
      "CLASS:class-1",
      "DAY:1",
      "DAY:2",
      "LESSON:lesson-1",
      "ROOM:room-1",
      "ROOM:room-3",
      "TEACHER:teacher-1",
    ]);
    expect(report.affectedAssignmentIds).toEqual(["assignment-1", "assignment-2", "assignment-3"]);
    expect(report.edges).toHaveLength(15);
    expect(assignments[0].timeSlotId).toBe("slot-1");
  });

  it("rejects a change touching a frozen teacher or destination room", () => {
    const decision = evaluateFreezeChange(
      scope([
        { kind: "TEACHER", id: "teacher-1" },
        { kind: "ROOM", id: "room-3" },
      ]),
      moveEvent,
      assignments,
    );

    expect(decision).toMatchObject({ allowed: false, reason: "FROZEN_RESOURCE" });
    expect(decision.violations).toEqual([
      { kind: "TEACHER", id: "teacher-1" },
      { kind: "ROOM", id: "room-3" },
    ]);
  });

  it("keeps the baseline immutable and blocks hash or scope drift", () => {
    const mismatchedHash = evaluateFreezeChange(
      scope([{ kind: "LESSON", id: "lesson-1" }]),
      { ...moveEvent, baselineSnapshotHash: "b".repeat(64) },
      assignments,
    );
    const mismatchedScope = evaluateFreezeChange(
      scope([{ kind: "LESSON", id: "lesson-1" }]),
      { ...moveEvent, academicPeriodId: "period-2" },
      assignments,
    );

    expect(mismatchedHash).toMatchObject({ allowed: false, reason: "BASELINE_SNAPSHOT_MISMATCH" });
    expect(mismatchedScope).toMatchObject({ allowed: false, reason: "SCOPE_MISMATCH" });
    expect(assignments).toEqual(
      expect.arrayContaining([expect.objectContaining({ assignmentId: "assignment-1", timeSlotId: "slot-1" })]),
    );
  });

  it("validates the day selector and duplicate selectors before evaluation", () => {
    expect(() => validateFreezeScope(scope([{ kind: "DAY", id: "8" }]))).toThrow("Bộ chọn ngày");
    expect(() =>
      validateFreezeScope(
        scope([
          { kind: "ROOM", id: "room-1" },
          { kind: "ROOM", id: "room-1" },
        ]),
      ),
    ).toThrow("Selector bị lặp");
  });
});
