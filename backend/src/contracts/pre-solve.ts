import type { LessonRequirement, SolveJobRequest, TimeSlot } from "./index";
import { createConflictDiagnostic, CONFLICT_CATALOG_VERSION, type ConflictDiagnostic } from "./conflict-catalog";
import { availabilityRuleMatchesSlot, type TeacherAvailabilityRule } from "./teacher-availability";

export const PRE_SOLVE_CONTRACT_VERSION = "PRE-SOLVE-1.0.0" as const;

export interface RoomCapability {
  id: string;
  capabilities: string[];
  unavailableSlotIds?: string[];
}

export interface PreSolveIssue {
  catalogVersion: typeof CONFLICT_CATALOG_VERSION;
  code: string;
  severity: "ERROR" | "WARNING";
  entity: ConflictDiagnostic["entity"];
  message: string;
  remediationHint: string;
  entityReferences: Record<string, string>;
  lessonId?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
}

export interface PreSolveReport {
  contractVersion: typeof PRE_SOLVE_CONTRACT_VERSION;
  catalogVersion: typeof CONFLICT_CATALOG_VERSION;
  canSolve: boolean;
  totalDemandSessions: number;
  slotCapacity: number;
  issues: PreSolveIssue[];
  warnings: string[];
}

type PreSolveIssueDraft = Omit<PreSolveIssue, "catalogVersion" | "entity" | "remediationHint" | "entityReferences">;

function finalizeIssue(issue: PreSolveIssueDraft): PreSolveIssue {
  const entityReferences = {
    ...(issue.lessonId ? { lessonId: issue.lessonId } : {}),
    ...(issue.resourceId ? { resourceId: issue.resourceId } : {}),
  };
  return {
    ...issue,
    ...createConflictDiagnostic(issue.code, issue.message, entityReferences, issue.severity),
    severity: issue.severity,
  };
}

function activeTeacherRules(request: SolveJobRequest): TeacherAvailabilityRule[] {
  const availability = request.teacherAvailability;
  if (!availability) return [];
  return availability.rules.filter(
    (rule) =>
      rule.effectiveFrom <= availability.effectiveAsOf &&
      (!rule.effectiveTo || availability.effectiveAsOf <= rule.effectiveTo),
  );
}

function addTeacherSubjectGradeIssues(issues: PreSolveIssueDraft[], request: SolveJobRequest) {
  const assignments = request.teacherSubjectGradeAssignments;
  const classGrades = request.classGrades;
  if (assignments === undefined || !classGrades || request.teacherSubjectGradeEnforcement === "OFF") return;

  const allowed = new Set(
    assignments.map((assignment) => `${assignment.teacherId}|${assignment.subjectId}|${assignment.grade}`),
  );
  const severity = request.teacherSubjectGradeEnforcement === "HARD" ? "ERROR" : "WARNING";
  for (const lesson of request.lessons) {
    const grade = classGrades[lesson.classId];
    const key = grade === undefined ? "" : `${lesson.teacherId}|${lesson.subjectId}|${grade}`;
    if (grade !== undefined && allowed.has(key)) continue;
    issues.push({
      code: "TEACHER_SUBJECT_GRADE_NOT_ALLOWED",
      severity,
      lessonId: lesson.id,
      resourceId: lesson.teacherId,
      message:
        grade === undefined
          ? `Không xác định được khối của lớp ${lesson.classId} để kiểm tra phân công chuyên môn cho giáo viên ${lesson.teacherId}.`
          : `Giáo viên ${lesson.teacherId} chưa được phân công dạy môn ${lesson.subjectId} ở khối ${grade}.`,
      details: {
        teacherId: lesson.teacherId,
        subjectId: lesson.subjectId,
        classId: lesson.classId,
        grade: grade ?? null,
        enforcement: request.teacherSubjectGradeEnforcement,
      },
    });
  }
}

function candidateSlots(request: SolveJobRequest, lesson: LessonRequirement, slotsById: Map<string, TimeSlot>) {
  const issues: PreSolveIssueDraft[] = [];
  const allSlotIds = new Set(slotsById.keys());
  let allowed = new Set(lesson.allowedSlotIds ?? allSlotIds);
  const unknownAllowed = [...allowed].filter((slotId) => !allSlotIds.has(slotId));
  if (unknownAllowed.length) {
    issues.push({
      code: "UNKNOWN_ALLOWED_SLOT",
      severity: "ERROR",
      lessonId: lesson.id,
      message: `Yêu cầu tiết học ${lesson.id} tham chiếu khung tiết không tồn tại.`,
      details: { slotIds: unknownAllowed },
    });
    unknownAllowed.forEach((slotId) => allowed.delete(slotId));
  }
  if (lesson.fixedSlotId) {
    if (!slotsById.has(lesson.fixedSlotId)) {
      issues.push({
        code: "UNKNOWN_FIXED_SLOT",
        severity: "ERROR",
        lessonId: lesson.id,
        message: `Yêu cầu tiết học ${lesson.id} tham chiếu khung tiết cố định không tồn tại.`,
        details: { slotId: lesson.fixedSlotId },
      });
      allowed.clear();
    } else {
      allowed = new Set([lesson.fixedSlotId]);
    }
  }
  const teacherRules = activeTeacherRules(request).filter(
    (rule) => rule.teacherId === lesson.teacherId && rule.strength === "HARD_UNAVAILABLE",
  );
  const classBlocked = new Set(request.classUnavailableSlotIds?.[lesson.classId] ?? []);
  const filtered = [...allowed].filter((slotId) => {
    const slot = slotsById.get(slotId)!;
    return !classBlocked.has(slotId) && !teacherRules.some((rule) => availabilityRuleMatchesSlot(rule, slot));
  });
  if (filtered.length === 0 && allowed.size > 0) {
    const blockedByClass = [...allowed].filter((slotId) => classBlocked.has(slotId));
    if (blockedByClass.length) {
      issues.push({
        code: "CLASS_AVAILABILITY_CONFLICT",
        severity: "ERROR",
        lessonId: lesson.id,
        message: `Yêu cầu tiết học ${lesson.id} không còn khung tiết sau khi áp dụng lịch lớp không khả dụng.`,
        details: { classId: lesson.classId, blockedSlotIds: blockedByClass },
      });
    }
    if (
      [...allowed].some((slotId) =>
        teacherRules.some((rule) => availabilityRuleMatchesSlot(rule, slotsById.get(slotId)!)),
      )
    ) {
      issues.push({
        code: "HARD_AVAILABILITY_CONFLICT",
        severity: "ERROR",
        lessonId: lesson.id,
        message: `Yêu cầu tiết học ${lesson.id} không còn khung tiết sau khi áp dụng thời gian không khả dụng cố định của giáo viên.`,
        details: { teacherId: lesson.teacherId },
      });
    }
  }
  return { slots: filtered, issues };
}

function addResourceCapacityIssues(
  issues: PreSolveIssueDraft[],
  lessons: LessonRequirement[],
  candidates: Map<string, string[]>,
  resource: "classId" | "teacherId",
  code: string,
) {
  const grouped = new Map<string, LessonRequirement[]>();
  lessons.forEach((lesson) => grouped.set(lesson[resource], [...(grouped.get(lesson[resource]) ?? []), lesson]));
  for (const [resourceId, resourceLessons] of grouped) {
    const demand = resourceLessons.reduce((sum, lesson) => sum + lesson.requiredSessions, 0);
    const capacity = new Set(resourceLessons.flatMap((lesson) => candidates.get(lesson.id) ?? [])).size;
    if (demand > capacity) {
      issues.push({
        code,
        severity: "ERROR",
        resourceId,
        message: `${resource} ${resourceId} cần ${demand} buổi học nhưng chỉ có ${capacity} khung tiết khả dụng.`,
        details: { demandSessions: demand, availableSlots: capacity },
      });
    }
  }
}

export function runPreSolveChecks(request: SolveJobRequest): PreSolveReport {
  const issues: PreSolveIssueDraft[] = [];
  addTeacherSubjectGradeIssues(issues, request);
  const slotsById = new Map(request.timeSlots.map((slot) => [slot.id, slot]));
  const totalDemandSessions = request.lessons.reduce((sum, lesson) => sum + lesson.requiredSessions, 0);
  const candidates = new Map<string, string[]>();
  for (const lesson of request.lessons) {
    const result = candidateSlots(request, lesson, slotsById);
    candidates.set(lesson.id, result.slots);
    issues.push(...result.issues);
    if (lesson.requiredSessions > result.slots.length) {
      issues.push({
        code: "LESSON_SLOT_CAPACITY_EXCEEDED",
        severity: "ERROR",
        lessonId: lesson.id,
        message: `Yêu cầu tiết học ${lesson.id} cần ${lesson.requiredSessions} buổi học nhưng chỉ còn ${result.slots.length} khung tiết.`,
        details: { requiredSessions: lesson.requiredSessions, availableSlots: result.slots.length },
      });
    }

    if (request.rooms !== undefined) {
      const rooms = request.rooms;
      const eligibleRooms = rooms.filter(
        (room) =>
          (!lesson.allowedRoomIds?.length || lesson.allowedRoomIds.includes(room.id)) &&
          (lesson.requiredRoomCapabilities ?? []).every((capability) => room.capabilities.includes(capability)),
      );
      if (!eligibleRooms.length) {
        issues.push({
          code: "ROOM_CAPABILITY_UNSATISFIED",
          severity: "ERROR",
          lessonId: lesson.id,
          message: `Yêu cầu tiết học ${lesson.id} không có phòng đáp ứng năng lực yêu cầu.`,
          details: {
            requiredRoomCapabilities: lesson.requiredRoomCapabilities ?? [],
            allowedRoomIds: lesson.allowedRoomIds ?? [],
          },
        });
      } else if (
        !result.slots.some((slotId) => eligibleRooms.some((room) => !room.unavailableSlotIds?.includes(slotId)))
      ) {
        issues.push({
          code: "ROOM_AVAILABILITY_CONFLICT",
          severity: "ERROR",
          lessonId: lesson.id,
          message: `Yêu cầu tiết học ${lesson.id} không có phòng khả dụng trong các khung tiết ứng viên.`,
          details: { roomIds: eligibleRooms.map((room) => room.id) },
        });
      }
    }
  }

  const classSlotCapacity = new Map<string, Set<string>>();
  for (const lesson of request.lessons) {
    const candidateSet = classSlotCapacity.get(lesson.classId) ?? new Set<string>();
    (candidates.get(lesson.id) ?? []).forEach((slotId) => candidateSet.add(slotId));
    classSlotCapacity.set(lesson.classId, candidateSet);
  }
  const slotCapacity = [...classSlotCapacity.values()].reduce((sum, slots) => sum + slots.size, 0);
  if (totalDemandSessions > slotCapacity) {
    issues.push({
      code: "TOTAL_SLOT_CAPACITY_EXCEEDED",
      severity: "ERROR",
      message: `Tổng nhu cầu ${totalDemandSessions} buổi học vượt sức chứa khung tiết theo lớp ${slotCapacity}.`,
      details: { totalDemandSessions, slotCapacity },
    });
  }

  addResourceCapacityIssues(issues, request.lessons, candidates, "classId", "CLASS_SLOT_CAPACITY_EXCEEDED");
  addResourceCapacityIssues(issues, request.lessons, candidates, "teacherId", "TEACHER_SLOT_CAPACITY_EXCEEDED");

  const fixedResources = new Map<string, string>();
  for (const lesson of request.lessons) {
    if (!lesson.fixedSlotId) continue;
    for (const resource of ["classId", "teacherId"] as const) {
      const key = `${resource}:${lesson[resource]}:${lesson.fixedSlotId}`;
      const previousLessonId = fixedResources.get(key);
      if (previousLessonId && previousLessonId !== lesson.id) {
        issues.push({
          code: "FIXED_RESOURCE_CONFLICT",
          severity: "ERROR",
          lessonId: lesson.id,
          resourceId: lesson[resource],
          message: `${resource} ${lesson[resource]} bị cố định trùng tại khung tiết ${lesson.fixedSlotId}.`,
          details: { previousLessonId, slotId: lesson.fixedSlotId },
        });
      } else {
        fixedResources.set(key, lesson.id);
      }
    }
  }

  return {
    contractVersion: PRE_SOLVE_CONTRACT_VERSION,
    catalogVersion: CONFLICT_CATALOG_VERSION,
    canSolve: issues.every((issue) => issue.severity !== "ERROR"),
    totalDemandSessions,
    slotCapacity,
    issues: issues.map(finalizeIssue),
    warnings: issues.filter((issue) => issue.severity === "WARNING").map((issue) => issue.message),
  };
}
