import type { TimetableAssignment, TimetableView } from "./timetable-types";

function viewLabel(view: TimetableView) {
  if (view === "school") return "Toàn trường";
  return view === "class" ? "Lớp" : view === "teacher" ? "Giáo viên" : "Phòng";
}

function viewValue(assignment: TimetableAssignment, view: TimetableView) {
  return view === "class" ? assignment.classLabel : view === "teacher" ? assignment.teacherLabel : assignment.roomLabel;
}

export function TimetableGrid({
  assignments,
  view,
  query,
}: {
  assignments: TimetableAssignment[];
  view: TimetableView;
  query: string;
}) {
  const normalizedQuery = query.trim().toLowerCase();
  const visibleAssignments = assignments.filter((assignment) =>
    `${assignment.classLabel} ${assignment.subjectLabel} ${assignment.teacherLabel} ${assignment.roomLabel}`
      .toLowerCase()
      .includes(normalizedQuery),
  );
  if (visibleAssignments.length === 0)
    return (
      <div className="timetable-state" role="status">
        <div className="state-icon empty-icon" aria-hidden="true">
          ▦
        </div>
        <h3>Chưa có phân công để hiển thị</h3>
        <p>Hãy tạo hoặc chọn phiên bản thời khóa biểu có dữ liệu từ API.</p>
      </div>
    );
  if (view === "school") return <SchoolWideView assignments={visibleAssignments} />;
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
              <td>{assignment.day ? `Thứ ${assignment.day}` : "—"}</td>
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

function SchoolWideView({ assignments }: { assignments: TimetableAssignment[] }) {
  const groups = Array.from(
    assignments
      .slice()
      .sort((left, right) => {
        const classOrder = left.classLabel.localeCompare(right.classLabel, "vi");
        if (classOrder !== 0) return classOrder;
        return (left.day ?? 99) - (right.day ?? 99) || (left.period ?? 99) - (right.period ?? 99);
      })
      .reduce((grouped, assignment) => {
        const group = grouped.get(assignment.classLabel) ?? [];
        group.push(assignment);
        grouped.set(assignment.classLabel, group);
        return grouped;
      }, new Map<string, TimetableAssignment[]>())
      .entries(),
  );

  return (
    <div className="school-wide-view" aria-label="Thời khóa biểu toàn trường theo lớp">
      <div className="school-wide-summary">
        <div>
          <p className="eyebrow">Tổng quan toàn trường</p>
          <h3>{groups.length} lớp có phân công</h3>
        </div>
        <span>{assignments.length} tiết đã xếp</span>
      </div>
      <div className="school-wide-groups">
        {groups.map(([classLabel, classAssignments], index) => (
          <section className="school-wide-class" key={classLabel} aria-labelledby={`school-class-${index}`}>
            <div className="school-wide-class-heading">
              <h3 id={`school-class-${index}`}>{classLabel}</h3>
              <span>{classAssignments.length} tiết</span>
            </div>
            <div className="table-wrap">
              <table className="school-wide-table">
                <caption className="sr-only">Thời khóa biểu lớp {classLabel}</caption>
                <thead>
                  <tr>
                    <th>Thứ</th>
                    <th>Tiết</th>
                    <th>Giờ</th>
                    <th>Môn</th>
                    <th>Giáo viên</th>
                    <th>Phòng</th>
                  </tr>
                </thead>
                <tbody>
                  {classAssignments.map((assignment) => (
                    <tr key={assignment.id}>
                      <td>{assignment.day ? `Thứ ${assignment.day}` : "—"}</td>
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
          </section>
        ))}
      </div>
    </div>
  );
}
