# So sánh, nhân bản và khôi phục phiên bản thời khóa biểu

**Contract:** `SCHEDULE-VERSION-OPS-1.0.0`

API coi phiên bản thời khóa biểu là bản chụp bất biến khi đã `PUBLISHED` hoặc
`ARCHIVED`. Các thao tác kịch bản không bao giờ cập nhật bản chụp đó:

- `GET /api/v1/schools/:schoolId/schedule-versions/:versionId/compare/:againstVersionId`
  returns assignment-level `MOVE`, `ADD` and `REMOVE` entries plus summary counts
  and a score delta. The score is read from the source optimization run when
  available; otherwise the response explicitly returns `available: false` and
  `delta: null`.
- `POST /api/v1/schools/:schoolId/schedule-versions/:versionId/clone` creates a
  new `DRAFT` from the source snapshot. The optional body is
  `{"reason":"..."}`.
- `POST /api/v1/schools/:schoolId/schedule-versions/:versionId/rollback` creates
  a new `DRAFT` from `sourceVersionId`; the body requires
  `{"sourceVersionId":"...","reason":"..."}`. The path version is retained
  as the rollback target in audit metadata and is not mutated.

Nhân bản và khôi phục chạy trong một transaction PostgreSQL. Transaction khóa
academic period while allocating the next version number, copies assignments,
computes a canonical schedule snapshot hash and writes one audit event with the
người thực hiện, lý do, phiên bản nguồn, thao tác và mã đối soát. Thất bại sẽ
hoàn tác bản nháp, phân công đã sao chép và sự kiện nhật ký cùng nhau. Phân quyền
máy chủ và ràng buộc cứng của bộ tối ưu vẫn có thẩm quyền; giao diện chỉ xem
trước workflow.
