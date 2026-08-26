# Pilot reconciliation — P3.1-T02

Đối soát là một cổng trước solve, không phải bước trang trí sau khi solver chạy.
Report phải chứng minh snapshot nào được dùng, checksum nào, số lượng master
data/demand, workload, assignment coverage và rule provenance.

## Chạy read-only

```text
node scripts/reconcile-pilot-snapshot.mjs
```

Mặc định script đọc database local Docker và batch evidence của P3.1-T01, sau đó
ghi `outputs/P3.1-T02/pilot-reconciliation-report.json`. Script không insert,
update, delete hoặc thay đổi rule/schedule. Dùng `--force` chỉ để refresh report
sau khi đã chủ động thay đổi nguồn dữ liệu.

## Nguyên tắc quyết định

- So sánh theo `schoolId` và `academicPeriodId`; không gộp khác tenant/period.
- Natural key lesson v1 là `class + subject + teacher`; duplicate, row thiếu
  period, hoặc assignment coverage thấp hơn demand là blocker cho solve.
- Workload chỉ được so với norm/target khi rule source có version, effective
  range, approval state và source locator. Không suy luận legal/school rule từ
  số liệu fixture.
- Rule profile `DRAFT`, `PENDING_STAKEHOLDER`, không có hard/soft definitions
  hoặc không có source là blocker; không tạo snapshot “đã approve” bằng tay.
- Mỗi exception phải có severity, evidence, owner, action và status. Trường phải
  xác nhận snapshot hoặc danh sách ngoại lệ trước khi đánh giá solver.

## Gate và handoff

`solveAllowed` chỉ có thể true khi mọi exception đã `CLEAR`. `snapshotReconciled`
không đồng nghĩa với `pilotApproved` hay `productionApproved`; hai cờ này chỉ
chuyển sau khi có người phụ trách trường/stakeholder xác nhận cùng các gate
staging/UAT/security/restore.
