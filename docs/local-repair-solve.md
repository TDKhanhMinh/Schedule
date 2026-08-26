# Sửa lỗi cục bộ — P3.2-T02

`LOCAL-REPAIR-1.0.0` là chế độ bổ sung `SolveJobRequest.localRepair`. Chế độ yêu
cầu bản chụp phân công đường cơ sở đầy đủ, mã băm đường cơ sở SHA-256, vùng lần
xuất hiện bị ảnh hưởng và tùy chọn các khóa lần xuất hiện đã đóng băng.

Bộ tối ưu áp dụng các quy tắc an toàn sau:

- every baseline occurrence outside `affectedAssignmentKeys` is hard-fixed;
- every `frozenAssignmentKeys` occurrence is hard-fixed even if it is listed as
  affected;
- the existing class, teacher, room, fixed-slot and availability constraints
  remain hard constraints;
- the objective minimizes moved occurrences before ordinary soft preferences;
- the result reports moved/preserved counts and whether the outside region is
  unchanged.

Chế độ này không tự công bố hoặc lưu thời khóa biểu. Hợp đồng API/worker vẫn là
nguồn chuẩn và các thao tác rà soát/phê duyệt/công bố sau đó vẫn phải vượt kiểm tra máy chủ.

Bằng chứng cục bộ có thể tái lập:

```powershell
npm run repair:evidence
```

Đầu ra: `outputs/P3.2-T02/local-repair-report.json`.
