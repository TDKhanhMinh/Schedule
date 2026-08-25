import { runPreSolveChecks, type SolveJobRequest } from "./index";

function createRequest(overrides: Partial<SolveJobRequest> = {}): SolveJobRequest {
  return {
    schemaVersion: "1.0",
    jobId: "job-preflight",
    schoolId: "school-001",
    timeSlots: [
      { id: "mon-1", day: 1, period: 1, shiftCode: "MORNING" },
      { id: "tue-1", day: 2, period: 1, shiftCode: "MORNING" },
    ],
    lessons: [
      { id: "lesson-1", classId: "class-1", subjectId: "subject-1", teacherId: "teacher-1", requiredSessions: 1 },
    ],
    ...overrides,
  };
}

describe("pre-solve checks", () => {
  it("reports total demand before solver capacity is exhausted", () => {
    const report = runPreSolveChecks(
      createRequest({
        lessons: [
          { id: "lesson-1", classId: "class-1", subjectId: "subject-1", teacherId: "teacher-1", requiredSessions: 3 },
          { id: "lesson-2", classId: "class-2", subjectId: "subject-2", teacherId: "teacher-2", requiredSessions: 2 },
        ],
      }),
    );

    expect(report.canSolve).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain("TOTAL_SLOT_CAPACITY_EXCEEDED");
  });

  it("combines hard availability and room capability checks", () => {
    const report = runPreSolveChecks(
      createRequest({
        teacherAvailability: {
          contractVersion: "TEACHER-AVAILABILITY-1.0.0",
          schoolId: "school-001",
          academicPeriodId: "period-001",
          effectiveAsOf: "2026-09-01",
          ruleSnapshotId: "snapshot-001",
          ruleSetVersion: "RULE-SET-1.0.0",
          ruleSnapshotHash: "0".repeat(64),
          rules: [
            {
              ruleId: "availability-1",
              code: "RULE-TEACHER-AVAILABILITY-001",
              teacherId: "teacher-1",
              strength: "HARD_UNAVAILABLE",
              weight: null,
              dayOfWeek: 1,
              blockedSlotIds: ["mon-1"],
              effectiveFrom: "2026-09-01",
              source: {
                sourceUrl: "https://schedule.local/rules",
                ruleSnapshotId: "snapshot-001",
                ruleSetVersion: "RULE-SET-1.0.0",
                ruleSnapshotHash: "0".repeat(64),
              },
            },
          ],
        },
        lessons: [
          {
            id: "lesson-1",
            classId: "class-1",
            subjectId: "subject-1",
            teacherId: "teacher-1",
            requiredSessions: 1,
            requiredRoomCapabilities: ["LAB"],
          },
        ],
        rooms: [{ id: "room-1", capabilities: ["STANDARD"] }],
      }),
    );

    expect(report.canSolve).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["ROOM_CAPABILITY_UNSATISFIED"]));
  });

  it("detects fixed teacher conflicts and passes a valid request", () => {
    const conflict = runPreSolveChecks(
      createRequest({
        lessons: [
          {
            id: "lesson-1",
            classId: "class-1",
            subjectId: "subject-1",
            teacherId: "teacher-1",
            requiredSessions: 1,
            fixedSlotId: "mon-1",
          },
          {
            id: "lesson-2",
            classId: "class-2",
            subjectId: "subject-2",
            teacherId: "teacher-1",
            requiredSessions: 1,
            fixedSlotId: "mon-1",
          },
        ],
      }),
    );
    expect(conflict.issues.map((issue) => issue.code)).toContain("FIXED_RESOURCE_CONFLICT");

    expect(runPreSolveChecks(createRequest()).canSolve).toBe(true);
  });
});
