# Runbook Rule Engine — P2.1

Tài liệu này mô tả cách vận hành rule engine cho School Timetable Optimizer.
Rule engine chỉ áp dụng các rule có mã đã đăng ký, được kiểm tra bằng catalog
chung và được đóng thành snapshot `APPROVED`. Giao diện không quyết định logic
của solver bằng text hiển thị.

## Hợp đồng và phiên bản

- Catalog: `RULE-CATALOG-1.0.0` (`backend/contracts/rule-catalog.json`).
- Rule snapshot: `RULE-SET-1.0.0`.
- Pre-solve: `PRE-SOLVE-1.0.0`.
- Queue boundary: `BULLMQ-OPTIMIZATION-1.0.0`.
- Solver adapter: `SOLVER-ADAPTER-1.0.0`.
- Objective: `SOLVER-OBJECTIVE-1.0.0`.

Catalog là nguồn metadata dùng chung cho NestJS, frontend và Python. Mỗi rule
phải có mã, nhóm, resource đích, kind, tham số, trọng số mặc định và trạng thái
`SUPPORTED` hoặc `PLANNED`.

## Lifecycle chuẩn

1. Người dùng có quyền `WRITE` tạo profile `DRAFT` theo trường, học kỳ và
   khoảng hiệu lực.
2. Người dùng thêm definition có `scope` và `parameters` có cấu trúc. Mọi
   definition mới bắt đầu ở `PENDING_STAKEHOLDER`.
3. API validate profile: mã phải có trong catalog, rule phải được hỗ trợ, kind
   và weight phải hợp lệ, tham số phải đúng schema, scope phải thuộc trường.
4. API tạo snapshot pending. Snapshot giữ nguyên definition, nguồn, khoảng
   hiệu lực và hash SHA-256; snapshot là append-only.
5. Người có quyền `PUBLISH` review và approve snapshot. API tạo bản snapshot
   `APPROVED` mới, ghi actor/reason/audit log và chuyển profile sang `ACTIVE`.
6. Khi preflight hoặc enqueue solve, API tự resolve snapshot `APPROVED` mới
   nhất theo `schoolId`, `academicPeriodId` và ngày hiệu lực. Không truyền
   snapshot từ UI không có nghĩa là bỏ qua rule.
7. API đưa rule definitions, availability đã tính và provenance snapshot vào
   payload BullMQ. Worker Python kiểm tra lại catalog, approval và tham số trước
   khi dựng CP-SAT.
8. Kết quả lưu `ruleSnapshotId`, version, hash và diagnostics. UI dùng các mã
   cấu trúc này để giải thích ảnh hưởng, vi phạm mềm và hướng xử lý.

## Rule được hỗ trợ hiện tại

| Mã                                                           | Kind      | Phạm vi            | Ý nghĩa                                                                      |
| ------------------------------------------------------------ | --------- | ------------------ | ---------------------------------------------------------------------------- |
| `RULE-TEACHER-AVAILABILITY` và mã legacy có prefix tương ứng | HARD/SOFT | Giáo viên          | Không sẵn sàng hoặc ưu tiên theo ngày/buổi/tiết.                             |
| `RULE-TEACHER-PREFERRED-OFF-DAYS`                            | SOFT      | Giáo viên          | Tối đa hai ngày nghỉ mong muốn trong tuần.                                   |
| `RULE-TEACHER-MAX-WORKING-DAYS`                              | HARD      | Giáo viên          | Giới hạn số ngày có tiết dạy.                                                |
| `RULE-SCHEDULE-NO-INTERNAL-GAPS`                             | HARD/SOFT | Lớp hoặc giáo viên | Không để gap giữa các tiết trong cùng ngày và buổi; không nối qua buổi khác. |

`RULE-TEACHER-MAX-PERIODS-DAY` và `RULE-CLASS-MAIN-SHIFT` vẫn là `PLANNED` trong
catalog. Cấu hình buổi chính của lớp hiện đi qua model grade-shift riêng và
không được giả mạo thành generic rule chưa có compiler.

## API vận hành

Các endpoint dùng prefix `/api/v1` và yêu cầu header xác thực nội bộ tương ứng:

```text
GET  /schools/:schoolId/rule-catalog
GET  /schools/:schoolId/academic-periods/:periodId/rule-profiles
POST /schools/:schoolId/academic-periods/:periodId/rule-profiles
POST /schools/:schoolId/rule-profiles/:profileId/rules
GET  /schools/:schoolId/rule-profiles/:profileId/validation
POST /schools/:schoolId/rule-profiles/:profileId/snapshots
POST /schools/:schoolId/rule-snapshots/:snapshotId/approve
GET  /schools/:schoolId/academic-periods/:periodId/rule-snapshots/active
POST /optimization-jobs/preflight
POST /optimization-jobs
GET  /optimization-jobs/:jobId
```

Header mẫu cho local:

```text
x-user-id: local-rule-operator
x-user-role: ADMIN
x-school-id: <school-id>
x-tenant-id: <tenant-id>
```

## Kiểm tra trước khi chạy solve

```powershell
npm run check:migrations
npm run typecheck
npm run lint
python -m unittest discover -s backend/solver/tests -v
docker-compose ps
```

Kiểm tra active snapshot:

```text
GET /api/v1/schools/<school-id>/academic-periods/<period-id>/rule-snapshots/active?asOf=2026-09-03
```

Nếu không có snapshot phù hợp, preflight phải trả `canSolve: false` với issue
`RULE_SNAPSHOT_NOT_APPLICABLE`. Không dùng kết quả solve không có snapshot cho
workflow review/approve/publish.

## Kiểm chứng pilot 55 lớp

Dữ liệu công khai Bình Phú được nạp bằng script có kiểm tra đúng 55 trang lớp:

```powershell
$env:SCHEDULE_DATABASE_URL = "postgresql://scheduler:scheduler@127.0.0.1:55432/scheduler"
node scripts/refresh-binh-phu-live-data.cjs
```

Sau khi nạp, phải đối chiếu tối thiểu:

- 55 lớp, đủ GVCN theo từng lớp và đúng học kỳ.
- Các môn, phòng, phân công chuyên môn và lesson requirement đều cùng
  `schoolId`/`academicPeriodId`.
- Chào cờ dùng slot cố định theo buổi chính của từng khối.
- Preflight tự resolve snapshot `APPROVED` và giữ nguyên version/hash.
- Enqueue trả run id; worker hoàn tất `OPTIMAL` hoặc `FEASIBLE` và metadata
  kết quả trùng snapshot đã resolve.

## Xử lý lỗi

| Mã                                        | Nguyên nhân                                                               | Cách xử lý                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `RULE_CODE_UNKNOWN` / `UNKNOWN_RULE_CODE` | Rule chưa đăng ký trong catalog.                                          | Dùng mã đã có hoặc cập nhật catalog/compiler theo một task riêng.     |
| `RULE_NOT_SUPPORTED`                      | Rule đã đăng ký nhưng còn `PLANNED`.                                      | Không đưa vào snapshot áp dụng; chờ compiler và test.                 |
| `RULE_SNAPSHOT_NOT_APPLICABLE`            | Không có snapshot approved, snapshot pending/revoked hoặc ngoài hiệu lực. | Approve snapshot phù hợp hoặc điều chỉnh ngày hiệu lực.               |
| `RULE_SCOPE_INVALID`                      | Scope không thuộc trường/profile hoặc thiếu resource id.                  | Kiểm tra resource type/id và tenant-school scope.                     |
| `RULE_PARAMETER_INVALID`                  | Tham số thiếu, sai kiểu hoặc ngoài giới hạn.                              | Sửa definition qua dialog có schema, validate lại profile.            |
| `PRESOLVE_FAILED`                         | Dữ liệu đầu vào đã chứng minh chưa thể solve.                             | Sửa lesson/slot/availability hoặc xem impact preview; không retry mù. |
| `INFEASIBLE`                              | CP-SAT không thỏa các ràng buộc cứng.                                     | Xem conflict details và chỉ thay đổi rule hard sau review.            |

## Evidence record

Mỗi lần kiểm chứng cần lưu:

```text
timestampUtc:
schoolId:
academicPeriodId:
snapshotId:
ruleSetVersion:
snapshotHash:
runId:
resultStatus:
appliedRuleCount:
classes:
lessons:
workerImage:
checks:
openGates:
```

Evidence local/dev không thay thế browser QA, stakeholder sign-off, staging,
production secrets hoặc production approval. Chỉ chuyển task sang `Done` sau
khi các gate tương ứng đã có người chịu trách nhiệm xác nhận.
