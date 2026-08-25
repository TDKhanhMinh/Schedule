export const SCHEDULE_VERSION_STATUSES = ["DRAFT", "IN_REVIEW", "APPROVED", "LOCKED", "PUBLISHED", "ARCHIVED"] as const;

export type ScheduleVersionStatus = (typeof SCHEDULE_VERSION_STATUSES)[number];

export const SCHEDULE_VERSION_TRANSITIONS: Readonly<Record<ScheduleVersionStatus, readonly ScheduleVersionStatus[]>> = {
  DRAFT: ["IN_REVIEW"],
  IN_REVIEW: ["DRAFT", "APPROVED"],
  APPROVED: ["LOCKED"],
  LOCKED: ["PUBLISHED"],
  PUBLISHED: ["ARCHIVED"],
  ARCHIVED: [],
};

export function isScheduleVersionStatus(value: string): value is ScheduleVersionStatus {
  return (SCHEDULE_VERSION_STATUSES as readonly string[]).includes(value);
}

export function canTransitionScheduleVersion(from: ScheduleVersionStatus, to: ScheduleVersionStatus) {
  return SCHEDULE_VERSION_TRANSITIONS[from].includes(to);
}
