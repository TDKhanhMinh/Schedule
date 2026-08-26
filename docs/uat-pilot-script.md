# UAT và sign-off pilot — P3.1-T05

**Phiên bản script:** `P3.1-T05-UAT-1.0`
**Ngày ghi nhận:** 2026-08-26
**Phạm vi:** V1.0 Web MVP, luồng Upload → Validate → Confirm → Solve → Review/Edit → Approve → Lock → Publish → Export.

## 1. Quy tắc ghi nhận

- Ghi riêng `Dev/Test complete` và `Pilot approved`/`Production approved`.
- Mỗi kết quả phải có mã test, phiên bản artifact, môi trường, thời điểm, người thực hiện/xác nhận và link evidence.
- `PASS` của unit/runtime hoặc xác nhận của project owner không thay thế school-issued workbook, UAT staging, approver hoặc stakeholder sign-off.
- Không đóng waiver cho P0/P1 nếu thiếu tên approver, lý do, phạm vi ảnh hưởng và ngày hết hạn.
- Không đánh giá chất lượng solver từ snapshot chưa đối soát, rule profile chưa duyệt hoặc assignment coverage chưa khớp demand.

## 2. Vai trò và người tham gia

| Vai trò                            | Trách nhiệm                                                            | Bằng chứng bắt buộc                    |
| ---------------------------------- | ---------------------------------------------------------------------- | -------------------------------------- |
| Project owner / product reviewer   | Xác nhận scope, acceptance criteria và kết quả review implementation   | comment/biên bản có ngày và version    |
| QC/UAT operator                    | Chạy từng test case, lưu screenshot/video/request-response             | test record và evidence link           |
| School data steward                | Xác nhận workbook chính thức, master-data mapping và academic period   | file owner, checksum, mapping approval |
| School coordinator / rule approver | Duyệt rule source, hard/soft rules, effective period và weight profile | decision record có approver            |
| Release approver / stakeholder     | Go/no-go pilot và điều kiện waiver nếu có                              | sign-off có expiry cho waiver          |

Hiện tại workspace chỉ có xác nhận review của project owner trong task thread. Chưa suy luận danh tính school data steward, rule approver hoặc release stakeholder.

## 3. P0 UAT script

| Mã        | Luồng                            | Thao tác tối thiểu                                 | Kết quả cần lưu                                    |
| --------- | -------------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| TC-IMP-01 | Upload/preview workbook hợp lệ   | Upload workbook đã được school steward chốt        | preview, checksum, mapping, row/error counts       |
| TC-IMP-02 | Chặn file sai định dạng          | Upload PDF/DOCX                                    | HTTP/UI error, không tạo batch                     |
| TC-IMP-03 | Chặn sai template                | Thiếu cột bắt buộc                                 | tên cột thiếu, batch không confirm được            |
| TC-VAL-01 | Thiếu dữ liệu bắt buộc           | Upload row thiếu class/teacher/subject/session     | cell/row error, `canConfirm=false`                 |
| TC-VAL-02 | Sai kiểu dữ liệu                 | Nhập chữ vào `Số tiết`                             | catalog code và thông báo cột phải là số           |
| TC-VAL-03 | Sai master data                  | Dùng mã teacher/room không tồn tại                 | lỗi tại đúng row, không silent mapping             |
| TC-CFM-01 | Confirm import                   | Chỉ confirm khi không còn lỗi                      | `CONFIRMED`, row count và redirect/list evidence   |
| TC-CFM-02 | Audit log                        | Mở audit trail sau confirm                         | actor, timestamp, batch, checksum và action        |
| TC-E2E-01 | Solve và xử lý lỗi               | Preflight feasible/infeasible, enqueue/solve       | status, hard diagnostics, run/output checksum      |
| TC-E2E-02 | Review/Edit/Approve/Lock/Publish | Người có quyền chỉnh sửa, approve, lock và publish | revision/ETag, actor audit, version transition     |
| TC-E2E-03 | Export/public read               | Mở published viewer và export                      | export contract, file mở được, public token policy |

Kết quả phải được ghi theo mẫu:

```text
TC: <mã>
Artifact/version/hash: <...>
Environment: <staging hoặc local Docker/dev>
Executed at: <ISO-8601>
Actor/role: <...>
Result: PASS | FAIL | BLOCKED
Evidence: <screenshot/video/log/API response>
Defect or gap: <none hoặc mã>
Approver: <bắt buộc cho pilot sign-off/waiver>
```

## 4. Điều kiện pilot sign-off

Pilot chỉ được đánh dấu approved khi đồng thời có:

1. Workbook chính thức do school data steward sở hữu, checksum và version được chốt.
2. Snapshot được đối soát theo school + academic period; không còn duplicate, thiếu period hoặc thiếu assignment coverage.
3. Rule profile có source locator, effective period, hard/soft definitions và approval state.
4. Tất cả P0 flow đã chạy trên môi trường UAT phù hợp; P0/P1 defect đã clear hoặc có waiver hợp lệ.
5. Có evidence staging, security, backup/restore và release decision record.
6. Có approver/stakeholder cụ thể; mọi waiver ghi rõ expiry date và owner.

## 5. Kết quả lần chạy này và handoff

- Dev/Test evidence được tổng hợp trong `outputs/P3.1-T05/uat-gap-report.json`.
- Evidence import/preview/confirm/audit: `outputs/P3.1-T01/pilot-import-evidence.json`.
- Evidence reconciliation và blocker: `outputs/P3.1-T02/pilot-reconciliation-report.json`.
- Evidence solver baseline: `outputs/P3.1-T03/baseline-comparison-report.json`.
- Evidence weight sensitivity: `outputs/P3.1-T04/weight-sensitivity-report.json`.
- Test matrix và runtime contract: `docs/test-matrix-p2-5-t04.md`, `scripts/test-p2-5-t04-runtime.mjs`.

Kết luận của task: implementation/UAT preparation và Dev/Test evidence đã hoàn tất; pilot sign-off và production approval vẫn mở. Bốn blocker reconciliation phải được owner xử lý trước khi dùng kết quả này làm school pilot approval.
