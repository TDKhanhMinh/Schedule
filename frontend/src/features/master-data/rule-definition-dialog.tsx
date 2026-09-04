import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { frontendConfig } from "../../config";
import { request } from "./master-data-api";
import type { RuleCatalogEntry, RuleCatalogParameter, RuleProfile, Subject, Teacher } from "./master-data-types";

const DAY_LABELS: Record<number, string> = {
  1: "Thứ 2",
  2: "Thứ 3",
  3: "Thứ 4",
  4: "Thứ 5",
  5: "Thứ 6",
  6: "Thứ 7",
  7: "Chủ nhật",
};

const SHIFT_LABELS = { MORNING: "Sáng", AFTERNOON: "Chiều" } as const;

export function RuleDefinitionDialog({
  open,
  onOpenChange,
  profile,
  periodId,
  teachers,
  subjects,
  catalog,
  canWrite,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: RuleProfile;
  periodId: string;
  teachers: Teacher[];
  subjects: Subject[];
  catalog: RuleCatalogEntry[];
  canWrite: boolean;
  onSaved: (message: string) => void;
}) {
  const supportedEntries = useMemo(
    () => catalog.filter((entry) => entry.implementationStatus === "SUPPORTED"),
    [catalog],
  );
  const [code, setCode] = useState(supportedEntries[0]?.code ?? "");
  const [teacherId, setTeacherId] = useState(teachers[0]?.id ?? "");
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [parameters, setParameters] = useState<Record<string, unknown>>({});
  const queryClient = useQueryClient();
  const selectedEntry = supportedEntries.find((entry) => entry.code === code) ?? supportedEntries[0];
  const teacherScopeRequired = selectedEntry?.targetResources.includes("TEACHER") ?? false;
  const subjectScopeRequired = selectedEntry?.targetResources.includes("SUBJECT") ?? false;
  const mutation = useMutation({
    mutationFn: () => {
      if (!selectedEntry) throw new Error("Chưa có loại rule được hỗ trợ để thêm.");
      const sourceUrl = profile.sourceUrl?.trim();
      if (!sourceUrl) throw new Error("Bộ quy tắc cần có nguồn trước khi thêm rule.");
      return request(`/schools/${frontendConfig.schoolId}/rule-profiles/${profile.id}/rules`, {
        method: "POST",
        body: JSON.stringify({
          code: selectedEntry.code,
          kind: selectedEntry.defaultKind,
          ...(selectedEntry.defaultKind === "SOFT" ? { weight: selectedEntry.defaultWeight ?? 10 } : {}),
          sourceUrl,
          sourceLocator: "Rule Center",
          effectiveFrom: profile.effectiveFrom,
          effectiveTo: profile.effectiveTo,
          scope: teacherScopeRequired
            ? { actorType: "TEACHER", actorId: teacherId, resourceType: "TEACHER" }
            : subjectScopeRequired
              ? { resourceType: "SUBJECT", resourceIds: [subjectId] }
              : { schoolLevel: profile.scope.schoolLevel ?? "THCS" },
          parameters,
        }),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rule-profiles", frontendConfig.schoolId, periodId] });
      await queryClient.invalidateQueries({ queryKey: ["rule-validation", profile.id] });
      onSaved("Đã thêm rule vào bộ quy tắc DRAFT.");
      onOpenChange(false);
    },
  });

  useEffect(() => {
    if (!open) return;
    const firstEntry = supportedEntries[0];
    setCode(firstEntry?.code ?? "");
    setTeacherId(teachers[0]?.id ?? "");
    setSubjectId(subjects[0]?.id ?? "");
    setParameters(defaultParameters(firstEntry));
  }, [open, subjects, supportedEntries, teachers]);

  function selectEntry(nextCode: string) {
    setCode(nextCode);
    setParameters(defaultParameters(supportedEntries.find((entry) => entry.code === nextCode)));
  }

  function updateParameter(parameter: RuleCatalogParameter, value: unknown) {
    setParameters((current) => ({ ...current, [parameter.key]: value }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="master-duty-dialog">
        <DialogHeader>
          <DialogTitle>Thêm rule vào bộ quy tắc</DialogTitle>
          <DialogDescription>
            Chọn loại rule và điền tham số có cấu trúc. Profile hiện tại: {profile.name} ({profile.version}).
          </DialogDescription>
        </DialogHeader>
        {supportedEntries.length === 0 ? (
          <p className="master-dialog-error" role="alert">
            Chưa có rule type nào được Backend hỗ trợ.
          </p>
        ) : (
          <div className="master-duty-form">
            <label>
              <span>Loại rule</span>
              <select
                className="master-select"
                value={selectedEntry?.code ?? ""}
                onChange={(event) => selectEntry(event.target.value)}
              >
                {supportedEntries.map((entry) => (
                  <option value={entry.code} key={entry.code}>
                    {entry.name}
                  </option>
                ))}
              </select>
              {selectedEntry ? <small className="field-hint">{selectedEntry.description}</small> : null}
            </label>
            {teacherScopeRequired ? (
              <label>
                <span>Giáo viên</span>
                <select
                  className="master-select"
                  value={teacherId}
                  onChange={(event) => setTeacherId(event.target.value)}
                >
                  {teachers
                    .filter((teacher) => teacher.status !== "ARCHIVED")
                    .map((teacher) => (
                      <option value={teacher.id} key={teacher.id}>
                        {teacher.code} · {teacher.displayName}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
            {subjectScopeRequired ? (
              <label>
                <span>Môn học</span>
                <select
                  className="master-select"
                  value={subjectId}
                  onChange={(event) => setSubjectId(event.target.value)}
                >
                  {subjects
                    .filter((subject) => subject.status !== "ARCHIVED")
                    .map((subject) => (
                      <option value={subject.id} key={subject.id}>
                        {subject.code} · {subject.name}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
            {selectedEntry?.parameters.map((parameter) => (
              <RuleParameterField
                key={parameter.key}
                parameter={parameter}
                value={parameters[parameter.key]}
                onChange={(value) => updateParameter(parameter, value)}
              />
            ))}
          </div>
        )}
        {mutation.error ? (
          <p className="master-dialog-error" role="alert">
            {mutation.error instanceof Error ? mutation.error.message : "Không thể thêm rule."}
          </p>
        ) : null}
        <DialogFooter>
          <Button className="dialog-cancel" type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            type="button"
            disabled={
              !canWrite ||
              !selectedEntry ||
              (teacherScopeRequired && !teacherId) ||
              (subjectScopeRequired && !subjectId) ||
              mutation.isPending
            }
            onClick={() => void mutation.mutateAsync()}
          >
            {mutation.isPending ? "Đang lưu…" : "Thêm rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RuleParameterField({
  parameter,
  value,
  onChange,
}: {
  parameter: RuleCatalogParameter;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (parameter.type === "DAY_OF_WEEK") {
    return (
      <label>
        <span>{parameter.label}</span>
        <select
          className="master-select"
          value={String(value ?? "")}
          onChange={(event) => onChange(Number(event.target.value))}
        >
          <option value="">Chọn thứ</option>
          {Object.entries(DAY_LABELS).map(([day, label]) => (
            <option value={day} key={day}>
              {label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (parameter.type === "DAY_OF_WEEK_LIST") {
    const selectedDays = Array.isArray(value)
      ? value.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day in DAY_LABELS)
      : [];
    return (
      <fieldset className="master-rule-day-list">
        <legend>{parameter.label}</legend>
        <small className="field-hint">
          Chọn từ {parameter.minItems ?? 1} đến {parameter.maxItems ?? 7} ngày.
        </small>
        <div className="master-rule-day-options">
          {Object.entries(DAY_LABELS)
            .filter(([day]) => Number(day) <= 6)
            .map(([day, label]) => {
              const dayNumber = Number(day);
              return (
                <label className="master-rule-day-option" key={day}>
                  <input
                    type="checkbox"
                    value={day}
                    checked={selectedDays.includes(dayNumber)}
                    onChange={(event) => {
                      const nextDays = event.target.checked
                        ? [...selectedDays, dayNumber]
                        : selectedDays.filter((selectedDay) => selectedDay !== dayNumber);
                      onChange(nextDays.sort((left, right) => left - right));
                    }}
                    disabled={
                      !selectedDays.includes(dayNumber) &&
                      selectedDays.length >= (parameter.maxItems ?? Number.POSITIVE_INFINITY)
                    }
                  />
                  <span>{label}</span>
                </label>
              );
            })}
        </div>
      </fieldset>
    );
  }
  if (parameter.type === "SHIFT_CODE") {
    return (
      <label>
        <span>{parameter.label}</span>
        <select
          className="master-select"
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Chọn buổi</option>
          <option value="MORNING">{SHIFT_LABELS.MORNING}</option>
          <option value="AFTERNOON">{SHIFT_LABELS.AFTERNOON}</option>
        </select>
      </label>
    );
  }
  if (parameter.type === "GRANULARITY" && parameter.options?.length) {
    return (
      <label>
        <span>{parameter.label}</span>
        <select
          className="master-select"
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Chọn giá trị</option>
          {parameter.options.map((option) => (
            <option value={option} key={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (parameter.type === "BOOLEAN") {
    return (
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
        {parameter.label}
      </label>
    );
  }
  if (parameter.type === "OBJECT") {
    const serialized = typeof value === "string" ? value : JSON.stringify(value ?? {}, null, 2);
    return (
      <label>
        <span>{parameter.label}</span>
        <textarea
          className="master-textarea"
          rows={5}
          value={serialized}
          onChange={(event) => {
            try {
              onChange(JSON.parse(event.target.value));
            } catch {
              onChange(event.target.value);
            }
          }}
        />
      </label>
    );
  }
  return (
    <label>
      <span>{parameter.label}</span>
      <Input
        type={parameter.type === "INTEGER" || parameter.type === "PERIOD" ? "number" : "text"}
        min={parameter.minimum}
        max={parameter.maximum}
        value={String(value ?? "")}
        onChange={(event) => onChange(event.target.type === "number" ? Number(event.target.value) : event.target.value)}
      />
    </label>
  );
}

function defaultParameters(entry: RuleCatalogEntry | undefined) {
  const defaults: Record<string, unknown> = {};
  for (const parameter of entry?.parameters ?? []) {
    if (parameter.type === "DAY_OF_WEEK") defaults[parameter.key] = 1;
    if (parameter.type === "DAY_OF_WEEK_LIST") defaults[parameter.key] = [];
    if (parameter.type === "SHIFT_CODE") defaults[parameter.key] = "MORNING";
    if (parameter.type === "GRANULARITY") defaults[parameter.key] = parameter.options?.[0] ?? "";
    if (parameter.type === "BOOLEAN") defaults[parameter.key] = false;
  }
  return defaults;
}
