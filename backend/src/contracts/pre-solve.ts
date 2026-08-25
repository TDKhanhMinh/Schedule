import type { LessonRequirement, SolveJobRequest, TimeSlot } from "./index";
import { availabilityRuleMatchesSlot, type TeacherAvailabilityRule } from "./teacher-availability";

export const PRE_SOLVE_CONTRACT_VERSION = "PRE-SOLVE-1.0.0" as const;

export interface RoomCapability {
  id: string;
  capabilities: string[];
}

export interface PreSolveIssue {
  code: string;
  severity: "ERROR" | "WARNING";
  message: string;
  lessonId?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
}

export interface PreSolveReport {
  contractVersion: typeof PRE_SOLVE_CONTRACT_VERSION;
  canSolve: boolean;
  totalDemandSessions: number;
  slotCapacity: number;
  issues: PreSolveIssue[];
  warnings: string[];
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

function candidateSlots(request: SolveJobRequest, lesson: LessonRequirement, slotsById: Map<string, TimeSlot>) {
  const issues: PreSolveIssue[] = [];
  const allSlotIds = new Set(slotsById.keys());
  let allowed = new Set(lesson.allowedSlotIds ?? allSlotIds);
  const unknownAllowed = [...allowed].filter((slotId) => !allSlotIds.has(slotId));
  if (unknownAllowed.length) {
    issues.push({
      code: "UNKNOWN_ALLOWED_SLOT",
      severity: "ERROR",
      lessonId: lesson.id,
      message: `Lesson ${lesson.id} tham chiếu slot không tồn tại.`,
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
        message: `Lesson ${lesson.id} tham chiếu fixed slot không tồn tại.`,
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
  return { slots: filtered, issues };
}

function addResourceCapacityIssues(
  issues: PreSolveIssue[],
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
        message: `${resource} ${resourceId} cần ${demand} session nhưng chỉ có ${capacity} slot khả dụng.`,
        details: { demandSessions: demand, availableSlots: capacity },
      });
    }
  }
}

export function runPreSolveChecks(request: SolveJobRequest): PreSolveReport {
  const issues: PreSolveIssue[] = [];
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
        message: `Lesson ${lesson.id} cần ${lesson.requiredSessions} session nhưng chỉ còn ${result.slots.length} slot.`,
        details: { requiredSessions: lesson.requiredSessions, availableSlots: result.slots.length },
      });
    }

    if (lesson.requiredRoomCapabilities?.length) {
      const rooms = request.rooms ?? [];
      const eligibleRooms = rooms.filter(
        (room) =>
          (!lesson.allowedRoomIds?.length || lesson.allowedRoomIds.includes(room.id)) &&
          lesson.requiredRoomCapabilities!.every((capability) => room.capabilities.includes(capability)),
      );
      if (!eligibleRooms.length) {
        issues.push({
          code: "ROOM_CAPABILITY_UNSATISFIED",
          severity: "ERROR",
          lessonId: lesson.id,
          message: `Lesson ${lesson.id} không có phòng đáp ứng capability yêu cầu.`,
          details: {
            requiredRoomCapabilities: lesson.requiredRoomCapabilities,
            allowedRoomIds: lesson.allowedRoomIds ?? [],
          },
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
      message: `Tổng nhu cầu ${totalDemandSessions} session vượt sức chứa class-slot ${slotCapacity}.`,
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
          message: `${resource} ${lesson[resource]} bị fixed trùng tại slot ${lesson.fixedSlotId}.`,
          details: { previousLessonId, slotId: lesson.fixedSlotId },
        });
      } else {
        fixedResources.set(key, lesson.id);
      }
    }
  }

  return {
    contractVersion: PRE_SOLVE_CONTRACT_VERSION,
    canSolve: issues.every((issue) => issue.severity !== "ERROR"),
    totalDemandSessions,
    slotCapacity,
    issues,
    warnings: [],
  };
}
