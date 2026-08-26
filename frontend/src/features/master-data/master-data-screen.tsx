import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { authHeaders, frontendConfig } from "../../config";
import { navigateTo } from "../../routing";

type Status = "ACTIVE" | "ARCHIVED";
type MasterDataEntity = "school" | "period" | "slot" | "teacher" | "class" | "subject" | "room" | "assignment";

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Đang hoạt động",
  ARCHIVED: "Đã lưu trữ",
  DRAFT: "Bản nháp",
};

function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}

interface School {
  id: string;
  code: string;
  name: string;
  timezone: string;
  status: Status;
}

interface AcademicPeriod {
  id: string;
  academicYear: string;
  termCode: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
}

interface TimeSlot {
  id: string;
  day: number;
  period: number;
  shiftCode: string | null;
  startsAt: string | null;
  endsAt: string | null;
}

interface Teacher {
  id: string;
  code: string;
  displayName: string;
  status: Status;
}

interface SchoolClass {
  id: string;
  code: string;
  name: string;
  grade: number;
  status: Status;
}

interface Subject {
  id: string;
  code: string;
  name: string;
  status: Status;
}

interface Room {
  id: string;
  code: string;
  name: string;
  roomType: string | null;
  capacity: number | null;
  status: Status;
}

interface LessonRequirement {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  roomId: string | null;
  requiredSessions: number;
  status: Status;
}

type MasterRecord = School | AcademicPeriod | TimeSlot | Teacher | SchoolClass | Subject | Room | LessonRequirement;

interface ApiErrorPayload {
  code?: string;
  message?: string | string[];
  [key: string]: unknown;
}

class MasterDataApiError extends Error {
  payload: ApiErrorPayload;

  constructor(payload: ApiErrorPayload, fallback: string) {
    const message = Array.isArray(payload.message) ? payload.message.join(", ") : payload.message;
    super(typeof message === "string" ? message : fallback);
    this.name = "MasterDataApiError";
    this.payload = payload;
  }
}

async function request<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(frontendConfig.apiBaseUrl + path, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new MasterDataApiError(
      typeof payload === "object" && payload !== null ? (payload as ApiErrorPayload) : {},
      "Không thể cập nhật dữ liệu danh mục.",
    );
  }
  return payload as T;
}

const entityLabels: Record<MasterDataEntity, string> = {
  school: "Trường",
  period: "Khung năm học",
  slot: "Khung tiết",
  teacher: "Giáo viên",
  class: "Lớp",
  subject: "Môn học",
  room: "Phòng học",
  assignment: "Phân công",
};

const entityOrder: MasterDataEntity[] = [
  "school",
  "period",
  "slot",
  "teacher",
  "class",
  "subject",
  "room",
  "assignment",
];

const emptyForm: Record<MasterDataEntity, Record<string, string>> = {
  school: { code: "", name: "", timezone: "Asia/Ho_Chi_Minh" },
  period: { academicYear: "2026-2027", termCode: "TERM_1", name: "", startsOn: "", endsOn: "" },
  slot: { day: "1", period: "1", shiftCode: "MORNING", startsAt: "07:00", endsAt: "07:45" },
  teacher: { code: "", displayName: "" },
  class: { code: "", name: "", grade: "7" },
  subject: { code: "", name: "" },
  room: { code: "", name: "", roomType: "STANDARD", capacity: "" },
  assignment: { classId: "", subjectId: "", teacherId: "", roomId: "", requiredSessions: "" },
};

const fields: Record<
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
  subject: [
    { key: "code", label: "Mã môn", required: true, placeholder: "Nhập mã môn" },
    { key: "name", label: "Tên môn", required: true, placeholder: "Nhập tên môn" },
  ],
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

function recordId(record: MasterRecord) {
  return record.id;
}

function recordSearchText(entity: MasterDataEntity, record: MasterRecord, names: NameMaps) {
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

interface NameMaps {
  classes: Record<string, string>;
  subjects: Record<string, string>;
  teachers: Record<string, string>;
  rooms: Record<string, string>;
}

function optionLabel(entity: MasterDataEntity, id: string, names: NameMaps) {
  if (entity === "class") return names.classes[id] ?? id;
  if (entity === "subject") return names.subjects[id] ?? id;
  if (entity === "teacher") return names.teachers[id] ?? id;
  return names.rooms[id] ?? id;
}

function localValidate(entity: MasterDataEntity, form: Record<string, string>) {
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

function fieldErrorFromServer(message: string, entity: MasterDataEntity) {
  const lower = message.toLowerCase();
  const match = fields[entity].find(
    (field) => lower.includes(field.key.toLowerCase()) || lower.includes(field.label.toLowerCase()),
  );
  return match?.key;
}

export function MasterDataScreen() {
  const [activeEntity, setActiveEntity] = useState<MasterDataEntity>("teacher");
  const [schools, setSchools] = useState<School[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [assignments, setAssignments] = useState<LessonRequirement[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<Record<string, string>>(emptyForm.teacher);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [bulkReport, setBulkReport] = useState("");
  const [saving, setSaving] = useState(false);

  const canWrite = frontendConfig.actorRole === "ADMIN" || frontendConfig.actorRole === "SCHEDULER";

  const baseDataQuery = useQuery({
    queryKey: ["master-data", "base", frontendConfig.schoolId],
    queryFn: async ({ signal }) => {
      const options = { signal };
      return Promise.all([
        request<School[]>("/schools", options),
        request<AcademicPeriod[]>(`/schools/${frontendConfig.schoolId}/academic-periods`, options),
        request<Teacher[]>(`/schools/${frontendConfig.schoolId}/teachers`, options),
        request<SchoolClass[]>(`/schools/${frontendConfig.schoolId}/classes`, options),
        request<Subject[]>(`/schools/${frontendConfig.schoolId}/subjects`, options),
        request<Room[]>(`/schools/${frontendConfig.schoolId}/rooms`, options),
      ]);
    },
    enabled: Boolean(frontendConfig.schoolId),
  });

  const periodDataQuery = useQuery({
    queryKey: ["master-data", "period", frontendConfig.schoolId, selectedPeriodId],
    queryFn: async ({ signal }) =>
      Promise.all([
        request<TimeSlot[]>(`/schools/${frontendConfig.schoolId}/academic-periods/${selectedPeriodId}/time-slots`, {
          signal,
        }),
        request<LessonRequirement[]>(
          `/schools/${frontendConfig.schoolId}/academic-periods/${selectedPeriodId}/lesson-requirements`,
          { signal },
        ),
      ]),
    enabled: Boolean(frontendConfig.schoolId && selectedPeriodId),
  });

  const loading = baseDataQuery.isPending || periodDataQuery.isPending;

  const saveMutation = useMutation({
    mutationFn: ({ path, body, method }: { path: string; body: string; method: "POST" | "PATCH" }) =>
      request(path, { method, body }),
    onSuccess: async () => {
      await Promise.all([baseDataQuery.refetch(), selectedPeriodId ? periodDataQuery.refetch() : Promise.resolve()]);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (path: string) => request(path, { method: "DELETE" }),
    onSuccess: async () => {
      await Promise.all([baseDataQuery.refetch(), selectedPeriodId ? periodDataQuery.refetch() : Promise.resolve()]);
    },
  });

  useEffect(() => {
    if (!baseDataQuery.data) return;
    const [schoolRows, periodRows, teacherRows, classRows, subjectRows, roomRows] = baseDataQuery.data;
    setSchools(schoolRows);
    setPeriods(periodRows);
    setTeachers(teacherRows);
    setClasses(classRows);
    setSubjects(subjectRows);
    setRooms(roomRows);
    setSelectedPeriodId((current) => current || periodRows[0]?.id || "");
  }, [baseDataQuery.data]);

  useEffect(() => {
    if (!periodDataQuery.data) return;
    const [slotRows, assignmentRows] = periodDataQuery.data;
    setSlots(slotRows);
    setAssignments(assignmentRows);
  }, [periodDataQuery.data]);

  useEffect(() => {
    const queryError = baseDataQuery.error ?? periodDataQuery.error;
    if (queryError) setError(queryError instanceof Error ? queryError.message : "Không thể tải dữ liệu danh mục.");
  }, [baseDataQuery.error, periodDataQuery.error]);

  const loadBaseData = useCallback(async () => {
    await baseDataQuery.refetch();
  }, [baseDataQuery.refetch]);

  const names = useMemo<NameMaps>(
    () => ({
      classes: Object.fromEntries(classes.map((item) => [item.id, `${item.code} · ${item.name}`])),
      subjects: Object.fromEntries(subjects.map((item) => [item.id, `${item.code} · ${item.name}`])),
      teachers: Object.fromEntries(teachers.map((item) => [item.id, `${item.code} · ${item.displayName}`])),
      rooms: Object.fromEntries(rooms.map((item) => [item.id, `${item.code} · ${item.name}`])),
    }),
    [classes, rooms, subjects, teachers],
  );

  const records = useMemo<MasterRecord[]>(() => {
    if (activeEntity === "school") return schools;
    if (activeEntity === "period") return periods;
    if (activeEntity === "slot") return slots;
    if (activeEntity === "teacher") return teachers;
    if (activeEntity === "class") return classes;
    if (activeEntity === "subject") return subjects;
    if (activeEntity === "room") return rooms;
    return assignments;
  }, [activeEntity, assignments, classes, periods, rooms, schools, slots, subjects, teachers]);

  const filteredRecords = useMemo(
    () =>
      records.filter(
        (record) => !query.trim() || recordSearchText(activeEntity, record, names).includes(query.trim().toLowerCase()),
      ),
    [activeEntity, names, query, records],
  );

  function resetEditor(entity = activeEntity) {
    setEditingId(null);
    setForm({ ...emptyForm[entity] });
    setFieldErrors({});
    setBulkReport("");
  }

  function selectEntity(entity: MasterDataEntity) {
    setActiveEntity(entity);
    setQuery("");
    setError("");
    setNotice("");
    resetEditor(entity);
  }

  function editRecord(record: MasterRecord) {
    setEditingId(recordId(record));
    if (activeEntity === "school") {
      const value = record as School;
      setForm({ code: value.code, name: value.name, timezone: value.timezone });
    } else if (activeEntity === "period") {
      const value = record as AcademicPeriod;
      setForm({
        academicYear: value.academicYear,
        termCode: value.termCode,
        name: value.name,
        startsOn: value.startsOn.slice(0, 10),
        endsOn: value.endsOn.slice(0, 10),
      });
    } else if (activeEntity === "slot") {
      const value = record as TimeSlot;
      setForm({
        day: String(value.day),
        period: String(value.period),
        shiftCode: value.shiftCode ?? "",
        startsAt: value.startsAt ?? "",
        endsAt: value.endsAt ?? "",
      });
    } else if (activeEntity === "teacher") {
      const value = record as Teacher;
      setForm({ code: value.code, displayName: value.displayName });
    } else if (activeEntity === "class") {
      const value = record as SchoolClass;
      setForm({ code: value.code, name: value.name, grade: String(value.grade) });
    } else if (activeEntity === "subject") {
      const value = record as Subject;
      setForm({ code: value.code, name: value.name });
    } else if (activeEntity === "room") {
      const value = record as Room;
      setForm({
        code: value.code,
        name: value.name,
        roomType: value.roomType ?? "",
        capacity: value.capacity ? String(value.capacity) : "",
      });
    } else {
      const value = record as LessonRequirement;
      setForm({
        classId: value.classId,
        subjectId: value.subjectId,
        teacherId: value.teacherId,
        roomId: value.roomId ?? "",
        requiredSessions: String(value.requiredSessions),
      });
    }
    setFieldErrors({});
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function formBody() {
    const numericKeys = new Set(["day", "period", "grade", "capacity", "requiredSessions"]);
    const body: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(form)) {
      if (
        value === "" &&
        ["roomId", "roomType", "capacity", "timezone", "shiftCode", "startsAt", "endsAt"].includes(key)
      )
        continue;
      if (numericKeys.has(key)) body[key] = Number(value);
      else body[key] = value.trim();
    }
    return body;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) {
      setError("Vai trò hiện tại chỉ có quyền xem; cần ADMIN hoặc SCHEDULER để chỉnh sửa.");
      return;
    }
    const validationErrors = localValidate(activeEntity, form);
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      setError("Vui lòng sửa các trường đang được đánh dấu.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    setFieldErrors({});
    try {
      const body = formBody();
      let path = "";
      if (activeEntity === "school") path = editingId ? `/schools/${editingId}` : "/schools";
      if (activeEntity === "period")
        path = editingId
          ? `/schools/${frontendConfig.schoolId}/academic-periods/${editingId}`
          : `/schools/${frontendConfig.schoolId}/academic-periods`;
      if (activeEntity === "slot")
        path = `/schools/${frontendConfig.schoolId}/academic-periods/${selectedPeriodId}/time-slots${editingId ? `/${editingId}` : ""}`;
      if (activeEntity === "teacher")
        path = `/schools/${frontendConfig.schoolId}/teachers${editingId ? `/${editingId}` : ""}`;
      if (activeEntity === "class")
        path = `/schools/${frontendConfig.schoolId}/classes${editingId ? `/${editingId}` : ""}`;
      if (activeEntity === "subject")
        path = `/schools/${frontendConfig.schoolId}/subjects${editingId ? `/${editingId}` : ""}`;
      if (activeEntity === "room")
        path = `/schools/${frontendConfig.schoolId}/rooms${editingId ? `/${editingId}` : ""}`;
      if (activeEntity === "assignment")
        path = `/schools/${frontendConfig.schoolId}/academic-periods/${selectedPeriodId}/lesson-requirements${editingId ? `/${editingId}` : ""}`;
      await saveMutation.mutateAsync({ path, method: editingId ? "PATCH" : "POST", body: JSON.stringify(body) });
      resetEditor();
      setNotice(
        `${entityLabels[activeEntity]} đã được ${editingId ? "cập nhật" : "tạo mới"}; dữ liệu đã được đọc lại từ API và sẵn sàng cho xem trước hoặc đầu vào bộ tối ưu.`,
      );
    } catch (requestError) {
      if (requestError instanceof MasterDataApiError) {
        const messages = Array.isArray(requestError.payload.message)
          ? requestError.payload.message
          : [requestError.message];
        const nextFieldErrors: Record<string, string> = {};
        for (const message of messages) {
          const field = fieldErrorFromServer(message, activeEntity);
          if (field) nextFieldErrors[field] = message;
        }
        setFieldErrors(nextFieldErrors);
        setError(messages.join(" "));
      } else {
        setError(requestError instanceof Error ? requestError.message : "Không thể lưu dữ liệu.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function removeRecord(record: MasterRecord) {
    if (!canWrite) {
      setError("Vai trò hiện tại chỉ có quyền xem; không thể xóa.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      let path = "";
      if (activeEntity === "school") path = `/schools/${record.id}`;
      if (activeEntity === "period") path = `/schools/${frontendConfig.schoolId}/academic-periods/${record.id}`;
      if (activeEntity === "slot")
        path = `/schools/${frontendConfig.schoolId}/academic-periods/${selectedPeriodId}/time-slots/${record.id}`;
      if (activeEntity === "teacher") path = `/schools/${frontendConfig.schoolId}/teachers/${record.id}`;
      if (activeEntity === "class") path = `/schools/${frontendConfig.schoolId}/classes/${record.id}`;
      if (activeEntity === "subject") path = `/schools/${frontendConfig.schoolId}/subjects/${record.id}`;
      if (activeEntity === "room") path = `/schools/${frontendConfig.schoolId}/rooms/${record.id}`;
      if (activeEntity === "assignment")
        path = `/schools/${frontendConfig.schoolId}/academic-periods/${selectedPeriodId}/lesson-requirements/${record.id}`;
      await deleteMutation.mutateAsync(path);
      resetEditor();
      setNotice(`${entityLabels[activeEntity]} đã được lưu trữ/xóa theo hợp đồng của API.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể xóa dữ liệu.");
    } finally {
      setSaving(false);
    }
  }

  function validateBulk() {
    const invalidRecords = filteredRecords.filter((record) => {
      if (activeEntity === "school") return !(record as School).code || !(record as School).name;
      if (activeEntity === "period") {
        const value = record as AcademicPeriod;
        return !value.academicYear || !value.termCode || !value.name || value.startsOn > value.endsOn;
      }
      if (activeEntity === "slot") {
        const value = record as TimeSlot;
        return (
          value.day < 1 ||
          value.day > 7 ||
          value.period < 1 ||
          (value.startsAt !== null && value.endsAt !== null && value.startsAt >= value.endsAt)
        );
      }
      if (activeEntity === "teacher") return !(record as Teacher).code || !(record as Teacher).displayName;
      if (activeEntity === "class") {
        const value = record as SchoolClass;
        return !value.code || !value.name || value.grade < 6 || value.grade > 12;
      }
      if (activeEntity === "subject") return !(record as Subject).code || !(record as Subject).name;
      if (activeEntity === "room") {
        const value = record as Room;
        return !value.code || !value.name || (value.capacity !== null && value.capacity < 1);
      }
      const value = record as LessonRequirement;
      return !value.classId || !value.subjectId || !value.teacherId || value.requiredSessions < 1;
    });
    setBulkReport(
      invalidRecords.length === 0
        ? `Đã kiểm tra ${filteredRecords.length} dòng: không phát hiện lỗi cơ bản.`
        : `Đã kiểm tra ${filteredRecords.length} dòng: ${invalidRecords.length} dòng cần rà soát.`,
    );
  }

  function renderField(field: (typeof fields)[MasterDataEntity][number]) {
    const errorMessage = fieldErrors[field.key];
    const selectOptions =
      activeEntity === "assignment" && ["classId", "subjectId", "teacherId", "roomId"].includes(field.key);
    return (
      <label className="master-field" key={field.key}>
        <span>
          {field.label}
          {field.required ? " *" : ""}
        </span>
        {selectOptions ? (
          <select
            value={form[field.key] ?? ""}
            onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
            aria-invalid={Boolean(errorMessage)}
          >
            <option value="">{field.key === "roomId" ? "Không chỉ định" : `Chọn ${field.label.toLowerCase()}`}</option>
            {(field.key === "classId"
              ? classes
              : field.key === "subjectId"
                ? subjects
                : field.key === "teacherId"
                  ? teachers
                  : rooms
            )
              .filter((item) => item.status === "ACTIVE")
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {optionLabel(
                    field.key === "classId"
                      ? "class"
                      : field.key === "subjectId"
                        ? "subject"
                        : field.key === "teacherId"
                          ? "teacher"
                          : "room",
                    item.id,
                    names,
                  )}
                </option>
              ))}
          </select>
        ) : (
          <input
            type={field.type ?? "text"}
            value={form[field.key] ?? ""}
            placeholder={field.placeholder}
            min={
              field.key === "day"
                ? 1
                : field.key === "period" || field.key === "grade"
                  ? 1
                  : field.key === "capacity" || field.key === "requiredSessions"
                    ? 1
                    : undefined
            }
            max={field.key === "day" ? 7 : field.key === "grade" ? 12 : undefined}
            onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
            aria-invalid={Boolean(errorMessage)}
          />
        )}
        {errorMessage ? <small className="field-error">{errorMessage}</small> : null}
      </label>
    );
  }

  function renderRecord(record: MasterRecord) {
    if (activeEntity === "school") {
      const value = record as School;
      return (
        <>
          <td>
            <strong>{value.code}</strong>
          </td>
          <td>{value.name}</td>
          <td>{value.timezone}</td>
          <td>
            <span className={`status-tag ${value.status.toLowerCase()}`}>{statusLabel(value.status)}</span>
          </td>
        </>
      );
    }
    if (activeEntity === "period") {
      const value = record as AcademicPeriod;
      return (
        <>
          <td>
            <strong>{value.termCode}</strong>
          </td>
          <td>{value.name}</td>
          <td>{value.academicYear}</td>
          <td>
            {value.startsOn.slice(0, 10)} → {value.endsOn.slice(0, 10)}
          </td>
          <td>
            <span className={`status-tag ${value.status.toLowerCase()}`}>{statusLabel(value.status)}</span>
          </td>
        </>
      );
    }
    if (activeEntity === "slot") {
      const value = record as TimeSlot;
      return (
        <>
          <td>Thứ {value.day}</td>
          <td>Tiết {value.period}</td>
          <td>{value.shiftCode ?? "—"}</td>
          <td>
            {value.startsAt ?? "—"} → {value.endsAt ?? "—"}
          </td>
        </>
      );
    }
    if (activeEntity === "teacher") {
      const value = record as Teacher;
      return (
        <>
          <td>
            <strong>{value.code}</strong>
          </td>
          <td>{value.displayName}</td>
          <td>
            <span className={`status-tag ${value.status.toLowerCase()}`}>{statusLabel(value.status)}</span>
          </td>
        </>
      );
    }
    if (activeEntity === "class") {
      const value = record as SchoolClass;
      return (
        <>
          <td>
            <strong>{value.code}</strong>
          </td>
          <td>{value.name}</td>
          <td>Khối {value.grade}</td>
          <td>
            <span className={`status-tag ${value.status.toLowerCase()}`}>{statusLabel(value.status)}</span>
          </td>
        </>
      );
    }
    if (activeEntity === "subject") {
      const value = record as Subject;
      return (
        <>
          <td>
            <strong>{value.code}</strong>
          </td>
          <td>{value.name}</td>
          <td>
            <span className={`status-tag ${value.status.toLowerCase()}`}>{statusLabel(value.status)}</span>
          </td>
        </>
      );
    }
    if (activeEntity === "room") {
      const value = record as Room;
      return (
        <>
          <td>
            <strong>{value.code}</strong>
          </td>
          <td>{value.name}</td>
          <td>{value.roomType ?? "—"}</td>
          <td>{value.capacity ?? "—"}</td>
          <td>
            <span className={`status-tag ${value.status.toLowerCase()}`}>{statusLabel(value.status)}</span>
          </td>
        </>
      );
    }
    const value = record as LessonRequirement;
    return (
      <>
        <td>{names.classes[value.classId] ?? value.classId}</td>
        <td>{names.subjects[value.subjectId] ?? value.subjectId}</td>
        <td>{names.teachers[value.teacherId] ?? value.teacherId}</td>
        <td>{value.roomId ? names.rooms[value.roomId] : "—"}</td>
        <td>{value.requiredSessions}</td>
        <td>
          <span className={`status-tag ${value.status.toLowerCase()}`}>{statusLabel(value.status)}</span>
        </td>
      </>
    );
  }

  const headers: Record<MasterDataEntity, string[]> = {
    school: ["Mã", "Tên", "Múi giờ", "Trạng thái"],
    period: ["Học kỳ", "Tên", "Năm học", "Khoảng ngày", "Trạng thái"],
    slot: ["Ngày", "Tiết", "Buổi", "Thời gian"],
    teacher: ["Mã", "Tên giáo viên", "Trạng thái"],
    class: ["Mã", "Tên lớp", "Khối", "Trạng thái"],
    subject: ["Mã", "Tên môn", "Trạng thái"],
    room: ["Mã", "Tên phòng", "Loại", "Sức chứa", "Trạng thái"],
    assignment: ["Lớp", "Môn", "Giáo viên", "Phòng", "Số tiết", "Trạng thái"],
  };

  return (
    <>
      <div className="master-header">
        <div>
          <p className="eyebrow">Bước 01 · Dữ liệu danh mục</p>
          <h1>Nhập tay & chỉnh sửa dữ liệu</h1>
          <p className="lead">
            Quản lý dữ liệu nguồn trong cùng phạm vi trường. Mọi thay đổi được ghi qua NestJS API và đọc lại từ
            PostgreSQL trước khi dùng cho xem trước hoặc bộ tối ưu.
          </p>
        </div>
        <div className="master-header-actions">
          <span className={`permission-chip ${canWrite ? "write" : "read"}`}>
            {canWrite ? "Có quyền chỉnh sửa" : "Chỉ xem"} · {frontendConfig.actorRole}
          </span>
          <button className="button-secondary" type="button" onClick={() => navigateTo("imports")}>
            Mở nhập dữ liệu →
          </button>
        </div>
      </div>

      <section className="panel master-panel" aria-labelledby="master-data-title">
        <div className="master-tabs" role="tablist" aria-label="Loại dữ liệu danh mục">
          {entityOrder.map((entity) => (
            <button
              className={activeEntity === entity ? "master-tab active" : "master-tab"}
              type="button"
              role="tab"
              aria-selected={activeEntity === entity}
              key={entity}
              onClick={() => selectEntity(entity)}
            >
              {entityLabels[entity]}
            </button>
          ))}
        </div>

        {activeEntity === "slot" || activeEntity === "assignment" ? (
          <label className="period-picker">
            <span>Năm học/kỳ học</span>
            <select
              value={selectedPeriodId}
              onChange={(event) => {
                setSelectedPeriodId(event.target.value);
                resetEditor();
              }}
            >
              <option value="">Chọn năm học/kỳ học</option>
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name} · {period.academicYear}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="master-layout">
          <form className="master-form" onSubmit={save}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{editingId ? "Chỉnh sửa" : "Tạo mới"}</p>
                <h2>
                  {editingId
                    ? `Sửa ${entityLabels[activeEntity].toLowerCase()}`
                    : `Thêm ${entityLabels[activeEntity].toLowerCase()}`}
                </h2>
              </div>
              {editingId ? (
                <button className="button-secondary" type="button" onClick={() => resetEditor()}>
                  Hủy sửa
                </button>
              ) : null}
            </div>
            <div className="master-fields">{fields[activeEntity].map(renderField)}</div>
            <button
              type="submit"
              disabled={
                !canWrite || saving || ((activeEntity === "slot" || activeEntity === "assignment") && !selectedPeriodId)
              }
            >
              {saving ? "Đang lưu..." : editingId ? "Lưu thay đổi" : "Tạo mới"}
            </button>
            {!canWrite ? (
              <p className="small-note">
                Vai trò {frontendConfig.actorRole} chỉ được đọc dữ liệu. API vẫn là nơi thực thi quyền cuối cùng.
              </p>
            ) : null}
          </form>

          <div className="master-list">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Danh sách · Lọc · Kiểm tra</p>
                <h2>
                  {entityLabels[activeEntity]} ({filteredRecords.length}/{records.length})
                </h2>
              </div>
              <div className="master-list-actions">
                <button
                  className="button-secondary"
                  type="button"
                  onClick={validateBulk}
                  disabled={loading || records.length === 0}
                >
                  Kiểm tra dữ liệu
                </button>
                <button
                  className="button-secondary"
                  type="button"
                  onClick={() => void loadBaseData()}
                  disabled={loading}
                >
                  Làm mới
                </button>
              </div>
            </div>
            <label className="master-search">
              <span>Lọc nhanh</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Mã, tên hoặc giá trị..."
              />
            </label>
            {bulkReport ? (
              <div className="alert alert-success" role="status">
                {bulkReport}
              </div>
            ) : null}
            {error ? (
              <div className="alert alert-error" role="alert">
                <strong>Không thể cập nhật</strong>
                <span>{error}</span>
              </div>
            ) : null}
            {notice ? (
              <div className="alert alert-success" role="status">
                {notice}
              </div>
            ) : null}
            {loading ? (
              <div className="empty-inline">
                <strong>Đang tải dữ liệu...</strong>
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="empty-inline">
                <strong>Chưa có dữ liệu phù hợp</strong>
                <p>Thử đổi bộ lọc hoặc tạo dòng đầu tiên bằng form bên trái.</p>
              </div>
            ) : (
              <div className="table-wrap master-table-wrap">
                <table>
                  <thead>
                    <tr>
                      {headers[activeEntity].map((header) => (
                        <th key={header}>{header}</th>
                      ))}
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.map((record) => (
                      <tr key={recordId(record)}>
                        {renderRecord(record)}
                        <td className="row-actions">
                          <button
                            className="table-action"
                            type="button"
                            onClick={() => editRecord(record)}
                            disabled={!canWrite}
                          >
                            Sửa
                          </button>
                          <button
                            className="table-action danger"
                            type="button"
                            onClick={() => void removeRecord(record)}
                            disabled={!canWrite || saving}
                          >
                            Xóa
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
