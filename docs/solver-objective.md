# Mục tiêu bộ tối ưu có trọng số

Trường request tùy chọn `objective` dùng hợp đồng `SOLVER-OBJECTIVE-1.0.0`:

```json
{
  "contractVersion": "SOLVER-OBJECTIVE-1.0.0",
  "weights": {
    "teacherGap": 1,
    "compactness": 1,
    "dayDistribution": 1,
    "undesirableSlots": 2,
    "preferredDays": 1,
    "fairness": 1
  }
}
```

Mọi trọng số không âm. CP-SAT chỉ tối thiểu hóa tổng có trọng số sau khi mã hóa
tính khả thi cứng. Bỏ qua objective giữ tương thích với request hiện có và giữ
hành vi ưu tiên giáo viên có trọng số hiện tại. Objective toàn số 0 rõ ràng sẽ
tắt xếp hạng mềm mà không thay đổi ràng buộc cứng.

Các nhóm mục tiêu là:

- `teacherGap`: tiết trống giữa các phân công của cùng giáo viên/ngày;
- `compactness`: tiết trống giữa các phân công của cùng lớp/ngày;
- `dayDistribution`: độ lệch khỏi tải lớp đều trên các ngày khả dụng;
- `undesirableSlots`: quy tắc sẵn sàng mềm của giáo viên đã phê duyệt khớp khung tiết;
- `preferredDays`: quy tắc mềm đã phê duyệt có mã thể hiện ngày ưu tiên;
- `fairness`: độ lệch khỏi tải giáo viên đều trên các ngày khả dụng.

`diagnostics.objectiveBreakdown` báo điểm nhóm chưa trọng số và `weightedTotal`
đã co giãn. `metadata.objectiveContractVersion` xác định request objective rõ
ràng. Phân rã chỉ là tín hiệu chất lượng; nhật ký ràng buộc cứng và tính khả thi
CP-SAT vẫn có thẩm quyền.
