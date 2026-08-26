# API lịch sẵn sàng của giáo viên

**Contract:** `TEACHER-AVAILABILITY-1.0.0`

Lịch sẵn sàng được đọc từ `RuleSetSnapshot` đã phê duyệt, bất biến; API không coi
giao diện React là ranh giới đúng đắn.

## Đọc lịch sẵn sàng có hiệu lực

```http
GET /api/v1/schools/:schoolId/academic-periods/:periodId/teacher-availability?ruleSnapshotId=:snapshotId&teacherId=:teacherId
```

Tham số truy vấn `teacherId` là tùy chọn. Khi bỏ qua, phản hồi gồm mọi quy tắc
sẵn sàng theo giáo viên trong bản chụp.

```json
{
  "contractVersion": "TEACHER-AVAILABILITY-1.0.0",
  "schoolId": "school-001",
  "academicPeriodId": "period-001",
  "effectiveAsOf": "2026-09-01",
  "ruleSnapshotId": "snapshot-001",
  "ruleSetVersion": "RULE-SET-1.0.0",
  "ruleSnapshotHash": "<sha256>",
  "rules": [
    {
      "ruleId": "RULE-TEACHER-AVAILABILITY-001",
      "code": "RULE-TEACHER-AVAILABILITY-001",
      "teacherId": "teacher-001",
      "strength": "HARD_UNAVAILABLE",
      "weight": null,
      "dayOfWeek": 1,
      "shiftCode": "MORNING",
      "blockedSlotIds": ["slot-001", "slot-002"],
      "effectiveFrom": "2026-09-01",
      "source": {
        "sourceUrl": "https://schedule.local/school-decision",
        "sourceLocator": "PILOT-AVAILABILITY-001",
        "ruleSnapshotId": "snapshot-001",
        "ruleSetVersion": "RULE-SET-1.0.0",
        "ruleSnapshotHash": "<sha256>"
      }
    }
  ]
}
```

Định nghĩa quy tắc trong bản chụp dùng tiền tố
`RULE-TEACHER-AVAILABILITY-` and the following parameters:

- Không sẵn sàng cứng: `kind: HARD`, `constraintType: "UNAVAILABLE"`.
- Ưu tiên mạnh: `kind: SOFT`, `preferenceLevel: "STRONG"`, `weight` không âm.
- Mong muốn mềm: `kind: SOFT`, `preferenceLevel: "SOFT"`, `weight` không âm.
- Bộ chọn: bắt buộc `dayOfWeek`; `shiftCode`, `period` và `slotId` tùy chọn. Bỏ
  `shiftCode` và `period` nghĩa là cả ngày.
- `effectiveFrom`/`effectiveTo` và phê duyệt bản chụp được kiểm tra trước khi
  trả quy tắc. `blockedSlotIds` được phân giải từ `time_slots` PostgreSQL của
  khung năm học để bộ tối ưu nhận projection tất định.

Python CP-SAT loại khung tiết không sẵn sàng cứng. Ưu tiên mạnh và mềm bị tính
phạt trong objective; cảnh báo `PREFERENCE_VIOLATED:<ruleCode>` được trả khi
lịch đã chọn buộc phải vi phạm. RBAC production, nguồn thí điểm chính thức và
phê duyệt bên liên quan vẫn là các cổng riêng.
