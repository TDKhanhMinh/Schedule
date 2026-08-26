# Biên bản hiệu chỉnh trọng số mềm — P3.1-T04

Trọng số mềm chỉ thay đổi thứ tự ưu tiên. Chúng không bao giờ được nới lỏng
ràng buộc cứng, thay đổi bản chụp đầu vào hoặc được trình bày như chính sách
trường đã phê duyệt nếu thiếu biên bản quyết định có ngày.

## Lần chạy độ nhạy có thể tái lập

Từ thư mục gốc của kho mã:

```powershell
& .\backend\solver\.venv\Scripts\python.exe .\backend\solver\scripts\run_weight_sensitivity.py `
  --output .\outputs\P3.1-T04\weight-sensitivity-report.json
```

Lần chạy giữ cố định hợp đồng `SOLVER-OBJECTIVE-1.0.0`, đầu vào benchmark, giới
hạn thời gian và seed `0/1/7`. Lần chạy so sánh trọng số `baseline-v1` hiện có với
hai hồ sơ ứng viên:

- `candidate-teacher-fairness-v1`: teacher gap `3`, fairness `2`, other groups `1`;
- `candidate-compactness-v1`: compactness `3`, day distribution `2`, other groups `1`.

Các số này là ứng viên độ nhạy, không phải quyết định của trường. Báo cáo lưu
before/after weighted totals and runtime ratios per dataset/seed. Weighted totals
from different profiles are not treated as directly comparable quality claims;
the rationale and component breakdown must be reviewed with the timetable team.

## Cổng nghiệm thu

Ứng viên chỉ đủ điều kiện để bên liên quan review khi trạng thái/số phân công và
hành vi xung đột cứng không đổi, đồng thời thời gian chạy trung vị trong phạm vi
2× đường cơ sở. Lần chạy không phê duyệt hồ sơ hoặc lưu vào bộ quy tắc production.
`pilotWeightsApproved=false` và `productionApproved=false` vẫn giữ nguyên cho đến
khi đối soát P3.1-T02 và ghi nhận quyết định của trường/bên liên quan.
