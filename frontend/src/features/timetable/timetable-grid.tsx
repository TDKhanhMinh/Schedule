import { ArrowLeftRight, CalendarDays, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { HomeroomAssignment, TimetableAssignment, TimetableView } from "./timetable-types";

const SCHOOL_DAYS = [1, 2, 3, 4, 5, 6];
const SCHOOL_PERIODS = [1, 2, 3, 4, 5];
const SCHOOL_SHIFTS = [
  { code: "MORNING", label: "Sáng" },
  { code: "AFTERNOON", label: "Chiều" },
] as const;

function viewLabel(view: TimetableView) {
  if (view === "school") return "Toàn trường";
  return view === "class" ? "Lớp" : view === "teacher" ? "Giáo viên" : "Phòng";
}

function viewValue(assignment: TimetableAssignment, view: TimetableView) {
  return view === "class" ? assignment.classLabel : view === "teacher" ? assignment.teacherLabel : assignment.roomLabel;
}

export function TimetableGrid({
  assignments,
  classLabels,
  homerooms,
  view,
  query,
}: {
  assignments: TimetableAssignment[];
  classLabels: string[];
  homerooms: HomeroomAssignment[];
  view: TimetableView;
  query: string;
}) {
  const normalizedQuery = query.trim().toLowerCase();
  const visibleAssignments = assignments.filter((assignment) =>
    `${assignment.classLabel} ${assignment.subjectLabel} ${assignment.subjectName} ${assignment.teacherLabel} ${assignment.roomLabel}`
      .toLowerCase()
      .includes(normalizedQuery),
  );
  const flagCeremonyMatchesQuery = !normalizedQuery || "chào cờ".includes(normalizedQuery);
  const isGridView = view === "school" || view === "class";
  if (visibleAssignments.length === 0 && !isGridView)
    return (
      <div className="timetable-state" role="status">
        <span className="timetable-state-icon" aria-hidden="true">
          <CalendarDays />
        </span>
        <h3>Chưa có phân công để hiển thị</h3>
        <p>Hãy tạo hoặc chọn phiên bản thời khóa biểu có dữ liệu từ API.</p>
      </div>
    );
  if (view === "school") {
    const visibleClassLabels = classLabels.filter(
      (classLabel) =>
        !normalizedQuery ||
        flagCeremonyMatchesQuery ||
        classLabel.toLowerCase().includes(normalizedQuery) ||
        visibleAssignments.some((assignment) => assignment.classLabel === classLabel),
    );
    return (
      <SchoolOverviewView assignments={visibleAssignments} classLabels={visibleClassLabels} homerooms={homerooms} />
    );
  }
  if (view === "class") {
    const visibleClassLabels = classLabels.filter(
      (classLabel) =>
        !normalizedQuery ||
        flagCeremonyMatchesQuery ||
        classLabel.toLowerCase().includes(normalizedQuery) ||
        visibleAssignments.some((assignment) => assignment.classLabel === classLabel),
    );
    return <ClassBoardsView assignments={visibleAssignments} classLabels={visibleClassLabels} />;
  }
  return (
    <div className="timetable-table-frame timetable-resource-frame">
      <table>
        <caption className="sr-only">Thời khóa biểu theo {viewLabel(view).toLowerCase()}</caption>
        <thead>
          <tr>
            <th>{viewLabel(view)}</th>
            <th>Thứ</th>
            <th>Tiết</th>
            <th>Giờ</th>
            <th>Môn</th>
            <th>Giáo viên</th>
            <th>Phòng</th>
          </tr>
        </thead>
        <tbody>
          {visibleAssignments.map((assignment) => (
            <tr key={assignment.id}>
              <td>{viewValue(assignment, view)}</td>
              <td>{assignment.day ? dayLabel(assignment.day) : "Chưa có"}</td>
              <td>{assignment.period ?? "Chưa có"}</td>
              <td>{assignment.timeLabel}</td>
              <td>{assignment.subjectLabel}</td>
              <td>{assignment.teacherLabel}</td>
              <td>{assignment.roomLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SchoolOverviewView({
  assignments,
  classLabels,
  homerooms,
}: {
  assignments: TimetableAssignment[];
  classLabels: string[];
  homerooms: HomeroomAssignment[];
}) {
  const [layout, setLayout] = useState<"by-time" | "by-class">("by-time");
  const [isExpanded, setIsExpanded] = useState(false);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const wasExpandedRef = useRef(false);
  const days = SCHOOL_DAYS;
  const cells = new Map<string, TimetableAssignment[]>();
  for (const assignment of assignments) {
    if (assignment.day === null || assignment.period === null) continue;
    const key = `${assignment.classLabel}:${assignment.day}:${assignment.shiftCode ?? "MORNING"}:${assignment.period}`;
    cells.set(key, [...(cells.get(key) ?? []), assignment]);
  }

  useEffect(() => {
    if (!isExpanded) {
      if (wasExpandedRef.current) {
        wasExpandedRef.current = false;
        window.requestAnimationFrame(() => toggleButtonRef.current?.focus());
      }
      return;
    }

    wasExpandedRef.current = true;
    const previousBodyOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsExpanded(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isExpanded]);

  return (
    <div
      className={`timetable-grid-view${isExpanded ? " timetable-grid-view-expanded" : ""}`}
      aria-label="Thời khóa biểu tổng hợp toàn trường"
    >
      <div className="timetable-grid-summary">
        <div>
          <span className="timetable-grid-kicker">Tổng quan toàn trường</span>
          <h3>{classLabels.length} lớp trong phạm vi xem</h3>
        </div>
        <div className="timetable-grid-summary-actions">
          <div className="timetable-grid-summary-meta">
            <span>Thứ 2 - Thứ 7</span>
            <span>{assignments.length} tiết phù hợp bộ lọc</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="timetable-grid-layout-toggle"
            aria-pressed={layout === "by-class"}
            aria-label={layout === "by-time" ? "Chuyển sang hiển thị theo lớp" : "Chuyển sang hiển thị theo thời gian"}
            title={layout === "by-time" ? "Hiển thị các lớp theo từng hàng" : "Hiển thị Thứ, Buổi, Tiết theo từng hàng"}
            onClick={() => setLayout((current) => (current === "by-time" ? "by-class" : "by-time"))}
          >
            <ArrowLeftRight aria-hidden="true" />
            {layout === "by-time" ? "Theo lớp" : "Theo thời gian"}
          </Button>
          <Button
            ref={toggleButtonRef}
            type="button"
            variant="outline"
            size="sm"
            className="timetable-grid-fullscreen-toggle"
            aria-pressed={isExpanded}
            aria-label={isExpanded ? "Thu nhỏ thời khóa biểu toàn trường" : "Phóng to thời khóa biểu toàn trường"}
            title={isExpanded ? "Thu nhỏ (Esc)" : "Phóng to toàn màn hình"}
            onClick={() => setIsExpanded((expanded) => !expanded)}
          >
            {isExpanded ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
            {isExpanded ? "Thu nhỏ" : "Phóng to"}
          </Button>
        </div>
      </div>
      <div
        className="timetable-table-frame school-overview-wrap"
        role="region"
        aria-label="Lưới thời khóa biểu toàn trường, có thể cuộn ngang và dọc"
        tabIndex={0}
      >
        {layout === "by-time" ? (
          <table className="school-overview-table">
            <caption className="sr-only">Thời khóa biểu tổng hợp toàn trường theo thời gian</caption>
            <thead>
              <tr>
                <th>Thứ</th>
                <th>Buổi</th>
                <th>Tiết</th>
                {classLabels.map((classLabel) => (
                  <th key={classLabel}>{shortLabel(classLabel)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((day) =>
                SCHOOL_SHIFTS.map((shift, shiftIndex) =>
                  SCHOOL_PERIODS.map((period, periodIndex) => (
                    <tr key={`${day}-${shift.code}-${period}`}>
                      {shiftIndex === 0 && periodIndex === 0 ? (
                        <th
                          className="school-day-cell"
                          rowSpan={SCHOOL_SHIFTS.length * SCHOOL_PERIODS.length}
                          scope="rowgroup"
                        >
                          {dayLabel(day)}
                        </th>
                      ) : null}
                      {periodIndex === 0 ? (
                        <th className="school-shift-cell" rowSpan={SCHOOL_PERIODS.length} scope="rowgroup">
                          {shift.label}
                        </th>
                      ) : null}
                      <th className="school-period-cell" scope="row">
                        {period}
                      </th>
                      {classLabels.map((classLabel) => {
                        const cellAssignments = cells.get(`${classLabel}:${day}:${shift.code}:${period}`) ?? [];
                        return (
                          <td className="school-subject-cell" key={classLabel}>
                            {cellLabel(cellAssignments)}
                          </td>
                        );
                      })}
                    </tr>
                  )),
                ),
              )}
            </tbody>
            <tfoot>
              <tr className="school-homeroom-row">
                <th colSpan={3} scope="row">
                  GVCN
                </th>
                {classLabels.map((classLabel) => (
                  <td key={classLabel}>{homeroomTeacherName(classLabel, homerooms)}</td>
                ))}
              </tr>
            </tfoot>
          </table>
        ) : (
          <SchoolClassOverviewTable assignments={cells} classLabels={classLabels} homerooms={homerooms} />
        )}
      </div>
    </div>
  );
}

function SchoolClassOverviewTable({
  assignments,
  classLabels,
  homerooms,
}: {
  assignments: Map<string, TimetableAssignment[]>;
  classLabels: string[];
  homerooms: HomeroomAssignment[];
}) {
  return (
    <table className="school-overview-table school-overview-table-by-class">
      <caption className="sr-only">Thời khóa biểu tổng hợp toàn trường theo lớp</caption>
      <thead>
        <tr>
          <th scope="col">Lớp</th>
          <th scope="col">GVCN</th>
          <th scope="col">Buổi</th>
          <th scope="col">Tiết</th>
          {SCHOOL_DAYS.map((day) => (
            <th key={day} scope="col">
              {dayLabel(day)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {classLabels.flatMap((classLabel) =>
          SCHOOL_SHIFTS.flatMap((shift, shiftIndex) =>
            SCHOOL_PERIODS.map((period, periodIndex) => (
              <tr key={`${classLabel}-${shift.code}-${period}`}>
                {shiftIndex === 0 && periodIndex === 0 ? (
                  <th
                    className="school-class-label-cell"
                    rowSpan={SCHOOL_SHIFTS.length * SCHOOL_PERIODS.length}
                    scope="rowgroup"
                  >
                    {shortLabel(classLabel)}
                  </th>
                ) : null}
                {shiftIndex === 0 && periodIndex === 0 ? (
                  <td className="school-homeroom-cell" rowSpan={SCHOOL_SHIFTS.length * SCHOOL_PERIODS.length}>
                    {homeroomTeacherName(classLabel, homerooms)}
                  </td>
                ) : null}
                {periodIndex === 0 ? (
                  <th className="school-shift-cell" rowSpan={SCHOOL_PERIODS.length} scope="rowgroup">
                    {shift.label}
                  </th>
                ) : null}
                <th className="school-period-cell" scope="row">
                  {period}
                </th>
                {SCHOOL_DAYS.map((day) => {
                  const cellAssignments = assignments.get(`${classLabel}:${day}:${shift.code}:${period}`) ?? [];
                  return (
                    <td className="school-subject-cell" key={day}>
                      {cellLabel(cellAssignments)}
                    </td>
                  );
                })}
              </tr>
            )),
          ),
        )}
      </tbody>
    </table>
  );
}

/* Giữ Buổi và Tiết là cột hàng, giống bảng từng lớp và xếp liên tục các lớp. */
function ClassBoardsView({ assignments, classLabels }: { assignments: TimetableAssignment[]; classLabels: string[] }) {
  const groups = classLabels.map(
    (classLabel) => [classLabel, assignments.filter((assignment) => assignment.classLabel === classLabel)] as const,
  );
  const days = SCHOOL_DAYS;

  return (
    <div className="timetable-class-groups">
      {groups.map(([classLabel, classAssignments], index) => (
        <section className="timetable-class-card" key={classLabel} aria-labelledby={`school-class-${index}`}>
          <div className="timetable-class-heading">
            <h3 id={`school-class-${index}`}>{shortLabel(classLabel)}</h3>
            <span>{classAssignments.length} tiết có dữ liệu</span>
          </div>
          <div className="timetable-table-frame">
            <table className="school-wide-table">
              <caption className="sr-only">Thời khóa biểu lớp {classLabel}</caption>
              <thead>
                <tr>
                  <th>Buổi</th>
                  <th>Tiết</th>
                  {days.map((day) => (
                    <th key={day}>{dayLabel(day)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SCHOOL_SHIFTS.map((shift) => (
                  <ClassShiftRows key={shift.code} assignments={classAssignments} days={days} shift={shift} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function ClassShiftRows({
  assignments,
  days,
  shift,
}: {
  assignments: TimetableAssignment[];
  days: number[];
  shift: { code: string; label: string };
}) {
  const cells = new Map<string, TimetableAssignment[]>();
  for (const assignment of assignments) {
    if (assignment.shiftCode !== shift.code || assignment.day === null || assignment.period === null) continue;
    const key = `${assignment.day}:${assignment.period}`;
    cells.set(key, [...(cells.get(key) ?? []), assignment]);
  }

  return (
    <>
      {SCHOOL_PERIODS.map((period) => (
        <tr className="timetable-shift-row" key={`${shift.code}-${period}`}>
          {period === SCHOOL_PERIODS[0] ? (
            <th className="school-shift-cell" rowSpan={SCHOOL_PERIODS.length} scope="rowgroup">
              {shift.label}
            </th>
          ) : null}
          <th className="school-period-cell" scope="row">
            {period}
          </th>
          {days.map((day) => {
            const cellAssignments = cells.get(`${day}:${period}`) ?? [];
            return (
              <td className="school-subject-cell" key={day}>
                {cellLabel(cellAssignments, "subject")}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

function shortLabel(value: string) {
  const parts = value.split(" · ");
  return parts.at(-1) ?? value;
}

function cellLabel(cellAssignments: TimetableAssignment[], mode: "school" | "subject" = "school") {
  return cellAssignments
    .map((assignment) =>
      mode === "subject"
        ? shortLabel(assignment.subjectLabel)
        : `${shortLabel(assignment.subjectLabel)} - ${shortLabel(assignment.teacherLabel)}`,
    )
    .join(" / ");
}

function homeroomTeacherName(classLabel: string, assignments: HomeroomAssignment[]) {
  const assignment = assignments.find((item) => `${item.classCode} · ${item.className}` === classLabel);
  return assignment?.teacherName ?? "Chưa có";
}

function dayLabel(day: number) {
  if (day >= 1 && day <= 6) return `Thứ ${day + 1}`;
  if (day === 7) return "Chủ nhật";
  return `Ngày ${day}`;
}
