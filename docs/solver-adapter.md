# Hợp đồng bộ điều hợp tối ưu

**Contract:** `SOLVER-ADAPTER-1.0.0`

Bộ điều hợp là đường nối tất định giữa dữ liệu bản chụp NestJS và worker Python.
Nó giữ `SolveJobRequest` chuẩn trong một phong bì nhỏ có phiên bản thay vì để
Python truy vấn PostgreSQL.

```text
SolverAdapterPayload
├── adapterContractVersion
├── source
│   ├── schemaVersion / templateVersion
│   ├── schoolId / academicPeriodId
│   └── ruleSnapshotId / ruleSetVersion / ruleSnapshotHash
├── reproducibility
│   ├── randomSeed
│   └── timeLimitSeconds
├── input: SolveJobRequest
└── inputChecksum: SHA-256(canonical unsigned payload)
```

Builder TypeScript là `buildSolverAdapterPayload` trong
`backend/src/contracts/solver-adapter.ts`. Canonicalization sorts object keys,
omits null/undefined object fields and preserves array order. The Python
`SolverAdapterPayload` validates the same checksum before CP-SAT is called.
Giá trị số thực nguyên được chuẩn hóa trong bộ chuẩn hóa Python để các số JSON
như `10` và `10.0` tạo cùng mã băm giữa các thời gian chạy.

Fixture vòng khứ hồi đã công bố là
`backend/contracts/examples/solver-adapter.json`; its JSON Schema is
`backend/contracts/schemas/solver-adapter.schema.json`. Raw
`SolveJobRequest` input remains accepted by the CLI during the compatibility
window, while adapter input adds `adapterContractVersion`, template/period
provenance, checksum and effective seed/time-limit metadata to the result.

NestJS vẫn phụ trách phân quyền, chọn bản chụp PostgreSQL, điều phối hàng đợi và
nhật ký. Python kiểm tra phong bì chuẩn và thực thi ràng buộc cứng; giao diện
không tham gia quyết định tính đúng.
