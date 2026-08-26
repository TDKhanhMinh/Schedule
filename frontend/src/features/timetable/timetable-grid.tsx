import type { TimetableAssignment, TimetableView } from "./timetable-types";

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
  view,
  query,
}: {
  assignments: TimetableAssignment[];
  classLabels: string[];
  view: TimetableView;
  query: string;
}) {
  const normalizedQuery = query.trim().toLowerCase();
  const visibleAssignments = assignments.filter((assignment) =>
    `${assignment.classLabel} ${assignment.subjectLabel} ${assignment.teacherLabel} ${assignment.roomLabel}`
      .toLowerCase()
      .includes(normalizedQuery),
  );
  const isGridView = view === "school" || view === "class";
  if (visibleAssignments.length === 0 && !isGridView)
    return (
      <div className="timetable-state" role="status">
        <div className="state-icon empty-icon" aria-hidden="true">
          ▦
        </div>
        <h3>Chưa có phân công để hiển thị</h3>
        <p>Hãy tạo hoặc chọn phiên bản thời khóa biểu có dữ liệu từ API.</p>
      </div>
    );
  if (view === "school") {
    const visibleClassLabels = classLabels.filter(
      (classLabel) =>
        !normalizedQuery ||
        classLabel.toLowerCase().includes(normalizedQuery) ||
        visibleAssignments.some((assignment) => assignment.classLabel === classLabel),
    );
    return <SchoolOverviewView assignments={visibleAssignments} classLabels={visibleClassLabels} />;
  }
  if (view === "class") {
    const visibleClassLabels = classLabels.filter(
      (classLabel) =>
        !normalizedQuery ||
        classLabel.toLowerCase().includes(normalizedQuery) ||
        visibleAssignments.some((assignment) => assignment.classLabel === classLabel),
    );
    return <ClassBoardsView assignments={visibleAssignments} classLabels={visibleClassLabels} />;
  }
  return (
    <div className="table-wrap">
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
              <td>{assignment.day ? dayLabel(assignment.day) : "—"}</td>
              <td>{assignment.period ?? "—"}</td>
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
}: {
  assignments: TimetableAssignment[];
  classLabels: string[];
}) {
  const days = SCHOOL_DAYS;
  const rows = SCHOOL_SHIFTS.flatMap((shift) =>
    SCHOOL_PERIODS.map((period) => ({
      key: `${shift.code}-${period}`,
      label: `${shift.label} ${period}`,
      shiftCode: shift.code,
      period,
    })),
  );
  const cells = new Map<string, TimetableAssignment[]>();
  for (const assignment of assignments) {
    if (assignment.day === null || assignment.period === null) continue;
    const key = `${assignment.classLabel}:${assignment.day}:${assignment.shiftCode ?? "MORNING"}:${assignment.period}`;
    cells.set(key, [...(cells.get(key) ?? []), assignment]);
  }

  return (
    <div className="school-wide-view" aria-label="Thời khóa biểu tổng hợp toàn trường">
      <div className="school-wide-summary">
        <div>
          <p className="eyebrow">Tổng quan toàn trường</p>
          <h3>{classLabels.length} lớp trong phạm vi xem</h3>
        </div>
        <span>{assignments.length} tiết phù hợp bộ lọc</span>
      </div>
      <div className="table-wrap school-overview-wrap">
        <table className="school-overview-table">
          <caption className="sr-only">Thời khóa biểu tổng hợp toàn trường theo lớp</caption>
          <thead>
            <tr>
              <th>Thứ</th>
              <th>Tiết</th>
              {classLabels.map((classLabel) => (
                <th key={classLabel}>{shortLabel(classLabel)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day) =>
              rows.map((row, rowIndex) => (
                <tr key={`${day}-${row.key}`}>
                  {rowIndex === 0 ? (
                    <th className="school-day-cell" rowSpan={rows.length} scope="rowgroup">
                      {dayLabel(day)}
                    </th>
                  ) : null}
                  <th className="school-period-cell" scope="row">
                    {row.label}
                  </th>
                  {classLabels.map((classLabel) => {
                    const cellAssignments = cells.get(`${classLabel}:${day}:${row.shiftCode}:${row.period}`) ?? [];
                    return (
                      <td className="school-subject-cell" key={classLabel}>
                        {cellAssignments
                          .map(
                            (assignment) =>
                              `${shortLabel(assignment.subjectLabel)} - ${shortLabel(assignment.teacherLabel)}`,
                          )
                          .join(" / ")}
                      </td>
                    );
                  })}
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ClassBoardsView({ assignments, classLabels }: { assignments: TimetableAssignment[]; classLabels: string[] }) {
  const groups = classLabels.map(
    (classLabel) => [classLabel, assignments.filter((assignment) => assignment.classLabel === classLabel)] as const,
  );
  const days = SCHOOL_DAYS;

  return (
    <div className="school-wide-groups">
      {groups.map(([classLabel, classAssignments], index) => (
        <section className="school-wide-class" key={classLabel} aria-labelledby={`school-class-${index}`}>
          <div className="school-wide-class-heading">
            <h3 id={`school-class-${index}`}>{shortLabel(classLabel)}</h3>
            <span>{classAssignments.length} tiết có dữ liệu</span>
          </div>
          <div className="table-wrap">
            <table className="school-wide-table">
              <caption className="sr-only">Thời khóa biểu lớp {classLabel}</caption>
              <thead>
                <tr>
                  <th>{SCHOOL_SHIFTS[0].label}</th>
                  {days.map((day) => (
                    <th key={day}>{dayLabel(day)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SCHOOL_SHIFTS.map((shift, shiftIndex) => (
                  <ClassShiftRows
                    key={shift.code}
                    assignments={classAssignments}
                    days={days}
                    showShiftLabel={shiftIndex > 0}
                    shift={shift}
                  />
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
  showShiftLabel,
  shift,
}: {
  assignments: TimetableAssignment[];
  days: number[];
  showShiftLabel: boolean;
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
      {showShiftLabel ? (
        <tr className="school-shift-divider">
          <th scope="row">{shift.label}</th>
          {days.map((day) => (
            <td key={day} />
          ))}
        </tr>
      ) : null}
      {SCHOOL_PERIODS.map((period) => (
        <tr key={`${shift.code}-${period}`}>
          <th className="school-period-cell" scope="row">
            {period}
          </th>
          {days.map((day) => {
            const cellAssignments = cells.get(`${day}:${period}`) ?? [];
            return (
              <td className="school-subject-cell" key={day}>
                {cellAssignments.map((assignment) => shortLabel(assignment.subjectLabel)).join(" / ")}
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

function dayLabel(day: number) {
  if (day >= 1 && day <= 6) return `Thứ ${day + 1}`;
  if (day === 7) return "Chủ nhật";
  return `Ngày ${day}`;
}
