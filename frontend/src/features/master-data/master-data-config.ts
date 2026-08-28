import type { MasterDataEntity, MasterRecord, LessonRequirement } from "./master-data-types";

export const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Đang hoạt động",
  ARCHIVED: "Đã lưu trữ",
  DRAFT: "Bản nháp",
};

export function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}

export const entityLabels: Record<MasterDataEntity, string> = {
  school: "Trường",
  period: "Khung năm học",
  slot: "Khung tiết",
  teacher: "Giáo viên",
  class: "Lớp",
  subject: "Môn học",
  room: "Phòng học",
  assignment: "Phân công",
};

export const entityOrder: MasterDataEntity[] = [
  "school",
  "period",
  "slot",
  "teacher",
  "class",
  "subject",
  "room",
  "assignment",
];

export const emptyForm: Record<MasterDataEntity, Record<string, string>> = {
  school: { code: "", name: "", timezone: "Asia/Ho_Chi_Minh" },
  period: { academicYear: "2026-2027", termCode: "TERM_1", name: "", startsOn: "", endsOn: "" },
  slot: { day: "1", period: "1", shiftCode: "MORNING", startsAt: "07:00", endsAt: "07:45" },
  teacher: { code: "", displayName: "" },
  class: { code: "", name: "", grade: "7" },
  subject: { name: "" },
  room: { code: "", name: "", roomType: "STANDARD", capacity: "" },
  assignment: { classId: "", subjectId: "", teacherId: "", roomId: "", requiredSessions: "" },
};

export const fields: Record<
  MasterDataEntity,
  Array<{ key: string; label: string; type?: string; required?: boolean; placeholder?: string }>
> = {
  school: [
    { key: "code", label: "Mã trường", required: true, placeholder: "Nhập mã trường" },
    { key: "name", label: "Tên trường", required: true, placeholder: "Nhập tên trường" },
    { key: "timezone", label: "Múi giờ", placeholder: "Nhập múi giờ IANA" },
  ],
  period: [
    { key: "academicYear", label: "Năm học", required: true, placeholder: "YYYY-YYYY" },
    { key: "termCode", label: "Mã học kỳ", required: true, placeholder: "Nhập mã học kỳ" },
    { key: "name", label: "Tên khung năm học", required: true, placeholder: "Nhập tên khung năm học" },
    { key: "startsOn", label: "Bắt đầu", type: "date", required: true },
    { key: "endsOn", label: "Kết thúc", type: "date", required: true },
  ],
  slot: [
    { key: "day", label: "Thứ", type: "number", required: true },
    { key: "period", label: "Tiết", type: "number", required: true },
    { key: "shiftCode", label: "Buổi", placeholder: "Nhập mã buổi" },
    { key: "startsAt", label: "Giờ bắt đầu", type: "time" },
    { key: "endsAt", label: "Giờ kết thúc", type: "time" },
  ],
  teacher: [
    { key: "code", label: "Mã giáo viên", required: true, placeholder: "Nhập mã giáo viên" },
    { key: "displayName", label: "Tên giáo viên", required: true, placeholder: "Nhập tên giáo viên" },
  ],
  class: [
    { key: "code", label: "Mã lớp", required: true, placeholder: "Nhập mã lớp" },
    { key: "name", label: "Tên lớp", required: true, placeholder: "Nhập tên lớp" },
    { key: "grade", label: "Khối", type: "number", required: true },
  ],
  subject: [{ key: "name", label: "Tên môn", required: true, placeholder: "Nhập tên môn" }],
  room: [
    { key: "code", label: "Mã phòng", required: true, placeholder: "Nhập mã phòng" },
    { key: "name", label: "Tên phòng", required: true, placeholder: "Nhập tên phòng" },
    { key: "roomType", label: "Loại phòng", placeholder: "Nhập loại phòng" },
    { key: "capacity", label: "Sức chứa", type: "number" },
  ],
  assignment: [
    { key: "classId", label: "Lớp", required: true },
    { key: "subjectId", label: "Môn học", required: true },
    { key: "teacherId", label: "Giáo viên", required: true },
    { key: "roomId", label: "Phòng học" },
    { key: "requiredSessions", label: "Số tiết/tuần", type: "number", required: true },
  ],
};

export interface NameMaps {
  classes: Record<string, string>;
  subjects: Record<string, string>;
  teachers: Record<string, string>;
  rooms: Record<string, string>;
}

export function recordId(record: MasterRecord) {
  return record.id;
}

export function recordSearchText(entity: MasterDataEntity, record: MasterRecord, names: NameMaps) {
  if (entity === "assignment") {
    const value = record as LessonRequirement;
    return [
      names.classes[value.classId],
      names.subjects[value.subjectId],
      names.teachers[value.teacherId],
      value.roomId ? names.rooms[value.roomId] : "",
      value.requiredSessions,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }
  return Object.values(record)
    .filter((value) => typeof value === "string" || typeof value === "number")
    .join(" ")
    .toLowerCase();
}

export function optionLabel(entity: MasterDataEntity, id: string, names: NameMaps) {
  if (entity === "class") return names.classes[id] ?? id;
  if (entity === "subject") return names.subjects[id] ?? id;
  if (entity === "teacher") return names.teachers[id] ?? id;
  return names.rooms[id] ?? id;
}

export function localValidate(entity: MasterDataEntity, form: Record<string, string>) {
  const errors: Record<string, string> = {};
  for (const field of fields[entity]) {
    if (field.required && !form[field.key]?.trim()) errors[field.key] = `${field.label} là bắt buộc.`;
  }
  if (
    entity === "class" &&
    form.grade &&
    (!Number.isInteger(Number(form.grade)) || Number(form.grade) < 6 || Number(form.grade) > 12)
  ) {
    errors.grade = "Khối phải là số nguyên từ 6 đến 12.";
  }
  if (
    entity === "slot" &&
    form.day &&
    (!Number.isInteger(Number(form.day)) || Number(form.day) < 1 || Number(form.day) > 7)
  ) {
    errors.day = "Thứ phải là số nguyên từ 1 đến 7.";
  }
  if (entity === "slot" && form.period && (!Number.isInteger(Number(form.period)) || Number(form.period) < 1)) {
    errors.period = "Tiết phải là số nguyên dương.";
  }
  if (
    (entity === "room" && form.capacity && Number(form.capacity) < 1) ||
    (entity === "assignment" && form.requiredSessions && Number(form.requiredSessions) < 1)
  ) {
    errors.capacity = entity === "room" ? "Sức chứa phải lớn hơn 0." : "Số tiết phải lớn hơn 0.";
    if (entity === "assignment") {
      errors.requiredSessions = errors.capacity;
      delete errors.capacity;
    }
  }
  return errors;
}

export function fieldErrorFromServer(message: string, entity: MasterDataEntity) {
  const lower = message.toLowerCase();
  const match = fields[entity].find(
    (field) => lower.includes(field.key.toLowerCase()) || lower.includes(field.label.toLowerCase()),
  );
  return match?.key;
}
