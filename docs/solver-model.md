# Mô hình tiết học-khung tiết-phòng CP-SAT

Bộ tối ưu dựng một biến quyết định Boolean cho mỗi bộ khả thi:

`(lessonId, sessionIndex, slotId, roomId)`

Khi request bỏ qua `rooms`, mô hình vẫn tương thích hợp đồng không phòng ban đầu
và dùng một phòng ảo `null` cho mỗi khung tiết. Khi có `rooms`, miền phòng của
yêu cầu tiết học được lọc theo `allowedRoomIds` và `requiredRoomCapabilities`,
sau đó theo `unavailableSlotIds` của từng phòng; mọi phòng còn lại được biểu
diễn trong chỉ mục biến.

Trước khi tạo biến, builder loại khung tiết không xác định, khung tiết lớp không
khả dụng, phòng không đáp ứng yêu cầu, cặp phòng-khung tiết không khả dụng và
khung tiết bị quy tắc sẵn sàng cứng của giáo viên chặn. Sau đó áp dụng các ràng
buộc cứng:

- đúng một ứng viên cho mỗi buổi của yêu cầu tiết học;
- tối đa một yêu cầu tiết học cho một lớp trong một khung tiết;
- tối đa một yêu cầu tiết học cho một giáo viên trong một khung tiết;
- tối đa một yêu cầu tiết học cho một phòng trong một khung tiết khi bật mô hình phòng.

Chẩn đoán kết quả cung cấp `modelMetrics`:

- `variableCount`: number of CP-SAT Boolean variables created;
- `candidatePairCount`: number of feasible lesson/session-slot-room pairs;
- `domainPrunedCount`: number of slot-room candidates removed during domain
  construction;
- `roomDomainCount`: sum of eligible room entries across lesson domains.

Phân công được giải mã từ cùng chỉ mục bộ, nên phòng đã chọn trả về dưới dạng
`roomId`. Trường là `null` ở chế độ không phòng tương thích ngược. Các chỉ số và
ánh xạ ngược là bằng chứng bộ tối ưu; giao diện không phải ranh giới đúng đắn.

Sau khi giải mã, nhật ký kiểm tra ràng buộc cứng độc lập xác minh nhu cầu chính
xác, lần xuất hiện duy nhất và không chồng lấp lớp/giáo viên/phòng. Mọi vi phạm
được trả trong `diagnostics.hardConstraintViolations` và kết quả không được báo
là khả thi. Vì vậy kết quả thành công có danh sách kiểm tra rỗng rõ ràng ngoài
các ràng buộc CP-SAT.
