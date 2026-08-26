# Disaster recovery rehearsal — P3.3-T04

**Runbook version:** `DR-REHEARSAL-1.0.0`
**Ngày:** 2026-08-26
**Mục tiêu local:** RPO ≤ 24 giờ, RTO ≤ 60 phút theo runbook P2.5-T06; lần chạy này đo backup/restore thực tế trong Docker và không đụng database đang phục vụ.

## Kịch bản

1. Chụp PostgreSQL custom-format dump từ service `postgres`, tính SHA-256 và kiểm tra catalog.
2. Tạo một database restore cô lập, restore dump với `--no-owner --no-privileges`.
3. Đối soát `schema_migrations`, published schedule versions, schedule transitions, import batches và audit logs giữa source/restore.
4. Kiểm tra API readiness, các service dependency đang chạy và backup không được Git track.
5. Đo thời gian từ restore start đến consistency verification (RTO observed) và tuổi backup tại lúc report (RPO observed).
6. Xóa đúng database rehearsal; dump local nằm trong ignored path và không được commit.

Chạy:

```text
npm run dr:rehearse
```

Report: `outputs/P3.3-T04/disaster-recovery-report.json`. Dump tạm: `outputs/P2.5-T06/p3.3-t04-dr-rehearsal.dump` (ignored, không commit).

## Kết luận và giới hạn

`PASS` chỉ xác nhận isolated local restore và consistency của dataset hiện tại. Nó không chứng minh backup encryption/object-storage access, production credentials, cross-region restore, Redis durability, worker drain, long-duration RTO hoặc stakeholder approval. Các gate này phải được chạy lại trong staging/production change window.
