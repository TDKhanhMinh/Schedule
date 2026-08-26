# Đề xuất nới lỏng theo thứ hạng — P3.2-T04

`RELAXATION-PROPOSAL-1.0.0` là chẩn đoán chỉ dùng để rà soát. Đề xuất được sắp xếp
by deterministic impact score and proposal ID, and include affected lesson and
entity counts, rule source, impact, approval requirement and whether a hard rule
is protected.

Các loại đề xuất được hỗ trợ:

- `SOFT_RULE_WEIGHT`: review a soft wish or preference weight;
- `STAKEHOLDER_DATA_CHANGE`: review slot/data capacity with the school owner;
- `STAKEHOLDER_HARD_RULE_REVIEW`: identify a hard/legal rule for authorized
  stakeholder review, never automatic relaxation.

Mọi đề xuất có `requiresApproval=true` và `autoApply=false`. Giao diện hiển thị
đề xuất nhưng không áp dụng hoặc công bố thời khóa biểu.
