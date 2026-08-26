import type { TimetableAssignment, TimetableView } from "./timetable-types";

function viewLabel(view: TimetableView) {
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
