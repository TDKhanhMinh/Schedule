# Quyền phê duyệt và công bố

Vòng đời thời khóa biểu có hai lớp phân quyền:

- `AuthGuard` ánh xạ chuyển trạng thái `APPROVED`, `PUBLISHED` và `ARCHIVED` vào
  quyền `PUBLISH`. `REVIEWER` và `ADMIN` có quyền đó; `SCHEDULER` có thể chuẩn bị,
  rà soát và khóa phiên bản nhưng không thể phê duyệt hoặc công bố.
- `ScheduleVersionService` lặp lại kiểm tra chính sách để lời gọi trực tiếp đến
  service không thể bỏ qua ranh giới HTTP. Phê duyệt và công bố cũng yêu cầu lý do không rỗng.

Chuyển `APPROVED` và `PUBLISHED` chạy trong transaction PostgreSQL. Transaction
khóa phiên bản, kiểm tra lại trạng thái vòng đời và ghi sự kiện nhật ký `APPROVE`
hoặc `PUBLISH` với người thực hiện, vai trò, lý do, mã đối soát và thời điểm.
Chuyển đổi thất bại sẽ hoàn tác thay đổi trạng thái và nhật ký.

Trước `PUBLISHED`, service kiểm tra:

- số buổi học dự kiến bằng số phân công đã hiện thực;
- mọi phân công nằm trong phạm vi trường và khung năm học;
- không có lớp, giáo viên hoặc phòng được phân công hai lần trong cùng khung tiết.

Transaction công bố cũng tính mã băm bản chụp thời khóa biểu chuẩn. Trigger vòng
đời/phân công PostgreSQL vẫn là ranh giới bất biến cuối cho bản chụp đã công bố
và lưu trữ. Giao diện chỉ hiển thị điều khiển theo vai trò để hỗ trợ workflow;
đây không phải ranh giới bảo mật hay tính đúng đắn.
