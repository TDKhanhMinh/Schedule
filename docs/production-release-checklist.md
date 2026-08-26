# Danh sách kiểm tra phát hành production và biên bản phê duyệt — P3.3-T05

**Phiên bản danh sách:** `RELEASE-CHECKLIST-1.0.0`
**Ngày:** 2026-08-26
**Quyết định hiện tại:** `NO-GO — PENDING_GATES`

## Các cổng bắt buộc

| Cổng                          | Bằng chứng hiện có                                      | Trạng thái                                                |
| ----------------------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| Nguồn/phiên bản/commit        | `scripts/generate-release-record.mjs`, SHA Git hiện tại | ĐẠT cục bộ                                                |
| Build/kiểm thử/migration      | `npm run ci:local`                                      | ĐẠT cục bộ                                                |
| UAT/sổ làm việc/bên liên quan | `outputs/P3.1-T05/uat-gap-report.json`                  | MỞ: sổ chính thức/người phê duyệt/ký xác nhận             |
| Bảo mật/riêng tư              | `outputs/P3.3-T02/security-review-report.json`          | MỞ: 2 phát hiện dependency mức vừa + kiểm soát triển khai |
| Hiệu năng/năng lực            | `outputs/P3.3-T03/load-soak-report.json`                | ĐẠT cục bộ có giới hạn; staging/SLO còn mở                |
| Sao lưu/khôi phục/DR          | `outputs/P3.3-T04/disaster-recovery-report.json`        | ĐẠT cục bộ cô lập; lưu trữ/truy cập production còn mở     |
| Giám sát/cảnh báo             | `outputs/P3.3-T01/observability-report.json`            | ĐẠT trace/cảnh báo cục bộ; bộ thu/phân trang còn mở       |
| Triển khai/sau phát hành      | Danh sách của owner phát hành                           | MỞ: môi trường, owner, khung kiểm chứng                   |

`Production Approved` chỉ hợp lệ khi mọi cổng bắt buộc đạt hoặc có miễn trừ ghi rõ người phê duyệt, phạm vi ảnh hưởng, owner và thời hạn. Không dùng Docker cục bộ, CI đạt hoặc review triển khai của chủ dự án để suy ra phê duyệt production.

## Trình tự phát hành

1. Đóng băng nhập/chỉnh sửa/tối ưu/công bố và ghi mã thay đổi/đối soát.
2. Xác nhận sổ làm việc chính thức, khung năm học, bản chụp quy tắc, phát hiện bảo mật và chữ ký bên liên quan.
3. Build image từ commit chính xác; chạy migration tiến tới và sao lưu trước thay đổi.
4. Triển khai API/worker/giao diện theo cấu hình môi trường đã review; kiểm tra readiness, chỉ số, hàng đợi, worker và smoke bộ tối ưu.
5. Chạy smoke sau phát hành: tải/kiểm tra/xác nhận, tối ưu, rà soát/chỉnh sửa, phê duyệt/khóa/công bố/xuất và nhật ký thao tác.
6. Owner phát hành ký biên bản với thời điểm, quyết định khôi phục và owner giám sát.

## Khôi phục phiên bản

- Dừng lưu lượng ghi và rút hết BullMQ; không xóa nhật ký/bản chụp.
- Giữ cơ sở dữ liệu cũ ở chế độ chỉ đọc; khôi phục image ứng dụng về SHA đã phê duyệt trước đó.
- Nếu cần khôi phục dữ liệu, dùng bản sao lưu đã kiểm tra mã băm + diễn tập khôi phục vào DB cô lập trước, đối soát số migration/công bố/nhật ký/nhập rồi mới chuyển lưu lượng.
- Chạy lại readiness, smoke hàng đợi/worker/bộ tối ưu và workflow sau phát hành; mở sự cố nếu bất kỳ cổng nào thất bại.

## Trường phê duyệt còn mở

```text
Release approver: <required>
Security/risk approver: <required if waiver>
Pilot/stakeholder approver: <required>
Deployment owner: <required>
Monitoring/on-call owner: <required>
Decision: NO-GO | GO-WITH-WAIVER | PRODUCTION-APPROVED
Waiver scope/expiry: <required when applicable>
Post-release verification window: <required>
```

Report máy đọc: `outputs/P3.3-T05/release-record.json`. Report này hoàn tất gói quyết định và giữ `pilotApproved=false`, `productionApproved=false` cho tới khi người có thẩm quyền điền các trường trên.
