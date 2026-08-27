import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  BookOpen,
  Building2,
  CalendarRange,
  ClipboardList,
  Clock3,
  DoorOpen,
  GraduationCap,
  Search,
  Upload,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "../../app/app-shell";
import { frontendConfig } from "../../config";
import { navigateTo } from "../../routing";
import { useWorkspace } from "../../app/workspace-provider";
import { request } from "./master-data-api";
import {
  emptyForm,
  entityLabels,
  entityOrder,
  fields,
  fieldErrorFromServer,
  localValidate,
  type NameMaps,
  optionLabel,
  recordId,
  recordSearchText,
  statusLabel,
} from "./master-data-config";
import {
  MasterDataApiError,
  type AcademicPeriod,
  type LessonRequirement,
  type MasterDataEntity,
  type MasterRecord,
  type Room,
  type School,
  type SchoolClass,
  type Subject,
  type Teacher,
  type TimeSlot,
} from "./master-data-types";
import { HomeroomAssignmentPanel, TeacherLoadSummaryPanel } from "./teacher-duty-panels";

const entityIcons: Record<MasterDataEntity, LucideIcon> = {
  school: Building2,
  period: CalendarRange,
  slot: Clock3,
  teacher: UsersRound,
  class: GraduationCap,
  subject: BookOpen,
  room: DoorOpen,
  assignment: ClipboardList,
};

export function MasterDataScreen() {
  const { academicPeriodId: workspacePeriodId, setAcademicPeriodId } = useWorkspace();
  const [activeEntity, setActiveEntity] = useState<MasterDataEntity>("teacher");
  const [schools, setSchools] = useState<School[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [assignments, setAssignments] = useState<LessonRequirement[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState(workspacePeriodId);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<Record<string, string>>(emptyForm.teacher);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [bulkReport, setBulkReport] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<MasterRecord | null>(null);

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
    setSelectedPeriodId((current) => {
      const next = current || workspacePeriodId || periodRows[0]?.id || "";
      if (next && next !== workspacePeriodId) setAcademicPeriodId(next);
      return next;
    });
  }, [baseDataQuery.data, setAcademicPeriodId, workspacePeriodId]);

  useEffect(() => {
    if (workspacePeriodId && workspacePeriodId !== selectedPeriodId) setSelectedPeriodId(workspacePeriodId);
  }, [selectedPeriodId, workspacePeriodId]);

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
            className="master-select"
            name={field.key}
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
          <Input
            type={field.type ?? "text"}
            name={field.key}
            autoComplete="off"
            value={form[field.key] ?? ""}
            className={errorMessage ? "master-input-error" : undefined}
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
          <td>{value.shiftCode ?? "Chưa có"}</td>
          <td>
            {value.startsAt ?? "Chưa có"} → {value.endsAt ?? "Chưa có"}
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
          <td>{value.roomType ?? "Chưa có"}</td>
          <td>{value.capacity ?? "Chưa có"}</td>
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
        <td>{value.roomId ? names.rooms[value.roomId] : "Chưa có"}</td>
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
    <div className="master-data-screen">
      <PageHeader
        eyebrow="Dữ liệu danh mục"
        title="Nhập tay và chỉnh sửa dữ liệu"
        description="Quản lý dữ liệu nguồn trong phạm vi trường. Mọi thay đổi được ghi qua NestJS API và đọc lại từ PostgreSQL."
        action={
          <div className="master-header-actions">
            <Badge variant={canWrite ? "default" : "secondary"}>
              {canWrite ? "Có quyền chỉnh sửa" : "Chỉ xem"} - {frontendConfig.actorRole}
            </Badge>
            <Button variant="outline" type="button" onClick={() => navigateTo("imports")}>
              <Upload /> Mở nhập dữ liệu
            </Button>
          </div>
        }
      />

      <section className="master-workspace" aria-labelledby="master-data-title">
        <h2 id="master-data-title" className="sr-only">
          Không gian quản lý dữ liệu danh mục
        </h2>
        <div className="master-workspace-toolbar">
          <div className="master-toolbar-heading">
            <span className="master-section-kicker">Danh mục nguồn</span>
            <strong>Chọn khu vực dữ liệu</strong>
            <small>Chuyển giữa các nhóm dữ liệu mà không rời khỏi không gian làm việc.</small>
          </div>
          <div className="master-tabs" role="tablist" aria-label="Loại dữ liệu danh mục">
            {entityOrder.map((entity) => {
              const Icon = entityIcons[entity];
              const isActive = activeEntity === entity;
              return (
                <Button
                  className={isActive ? "master-tab active" : "master-tab"}
                  variant={isActive ? "secondary" : "ghost"}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  key={entity}
                  onClick={() => selectEntity(entity)}
                >
                  <Icon />
                  <span>{entityLabels[entity]}</span>
                  <small>
                    {entityRecordCount(entity, {
                      schools,
                      periods,
                      slots,
                      teachers,
                      classes,
                      subjects,
                      rooms,
                      assignments,
                    })}
                  </small>
                </Button>
              );
            })}
          </div>
        </div>

        {activeEntity === "slot" || activeEntity === "assignment" || activeEntity === "class" ? (
          <label className="master-period-picker">
            <span>Năm học/kỳ học</span>
            <select
              className="master-select"
              name="academicPeriod"
              value={selectedPeriodId}
              onChange={(event) => {
                setSelectedPeriodId(event.target.value);
                setAcademicPeriodId(event.target.value);
                resetEditor();
              }}
            >
              <option value="">Chọn năm học/kỳ học</option>
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name} - {period.academicYear}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {activeEntity === "class" && selectedPeriodId ? (
          <HomeroomAssignmentPanel
            classes={classes}
            teachers={teachers}
            periodId={selectedPeriodId}
            canWrite={canWrite}
          />
        ) : null}

        <div className="master-workspace-layout">
          <form className="master-editor" onSubmit={save}>
            <div className="master-editor-header">
              <div>
                <span className="master-section-kicker">{editingId ? "Chỉnh sửa" : "Tạo mới"}</span>
                <h2>
                  {editingId
                    ? `Sửa ${entityLabels[activeEntity].toLowerCase()}`
                    : `Thêm ${entityLabels[activeEntity].toLowerCase()}`}
                </h2>
              </div>
              {editingId ? (
                <Button variant="outline" size="sm" type="button" onClick={() => resetEditor()}>
                  Hủy sửa
                </Button>
              ) : null}
            </div>
            <div className="master-fields">{fields[activeEntity].map(renderField)}</div>
            <Button
              type="submit"
              disabled={
                !canWrite || saving || ((activeEntity === "slot" || activeEntity === "assignment") && !selectedPeriodId)
              }
            >
              {saving ? "Đang lưu…" : editingId ? "Lưu thay đổi" : "Tạo mới"}
            </Button>
            {!canWrite ? (
              <p className="small-note">
                Vai trò {frontendConfig.actorRole} chỉ được đọc dữ liệu. API vẫn là nơi thực thi quyền cuối cùng.
              </p>
            ) : null}
          </form>

          <div className="master-data-list">
            <div className="master-list-header">
              <div>
                <span className="master-section-kicker">Danh sách và kiểm tra</span>
                <h2>
                  {entityLabels[activeEntity]} ({filteredRecords.length}/{records.length})
                </h2>
              </div>
              <div className="master-list-actions">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={validateBulk}
                  disabled={loading || records.length === 0}
                >
                  Kiểm tra dữ liệu
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => void loadBaseData()}
                  disabled={loading}
                >
                  Làm mới
                </Button>
              </div>
            </div>
            <label className="master-search-field">
              <span>Lọc nhanh</span>
              <span className="master-search-input">
                <Search aria-hidden="true" />
                <Input
                  name="masterDataSearch"
                  autoComplete="off"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Mã, tên hoặc giá trị…"
                />
              </span>
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
              <div className="master-loading-state" role="status">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-3 w-72" />
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="master-empty-state">
                <strong>Chưa có dữ liệu phù hợp</strong>
                <p>Thử đổi bộ lọc hoặc tạo dòng đầu tiên bằng form bên trái.</p>
              </div>
            ) : (
              <div className="master-table-frame">
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
                          <Button
                            className="table-action"
                            variant="outline"
                            size="sm"
                            type="button"
                            onClick={() => editRecord(record)}
                            disabled={!canWrite}
                          >
                            Sửa
                          </Button>
                          <Button
                            className="table-action danger"
                            variant="outline"
                            size="sm"
                            type="button"
                            onClick={() => setPendingDelete(record)}
                            disabled={!canWrite || saving}
                          >
                            Xóa
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        {selectedPeriodId ? <TeacherLoadSummaryPanel periodId={selectedPeriodId} /> : null}
      </section>
      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa dữ liệu?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `Thao tác này sẽ lưu trữ hoặc xóa ${entityLabels[activeEntity].toLowerCase()} đang chọn theo hợp đồng API.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) void removeRecord(pendingDelete);
                setPendingDelete(null);
              }}
            >
              Xác nhận xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function entityRecordCount(
  entity: MasterDataEntity,
  data: {
    schools: School[];
    periods: AcademicPeriod[];
    slots: TimeSlot[];
    teachers: Teacher[];
    classes: SchoolClass[];
    subjects: Subject[];
    rooms: Room[];
    assignments: LessonRequirement[];
  },
) {
  if (entity === "school") return data.schools.length;
  if (entity === "period") return data.periods.length;
  if (entity === "slot") return data.slots.length;
  if (entity === "teacher") return data.teachers.length;
  if (entity === "class") return data.classes.length;
  if (entity === "subject") return data.subjects.length;
  if (entity === "room") return data.rooms.length;
  return data.assignments.length;
}
