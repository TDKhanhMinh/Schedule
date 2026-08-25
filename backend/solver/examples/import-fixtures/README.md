# Excel import fixtures

Fixtures are generated from the local demo school seed. School ID:
`00000000-0000-0000-0000-000000000001`.

- `valid.xlsx`: valid three-row baseline.
- `missing-required-column.xlsx`: missing `Mã giáo viên` header.
- `missing-value.xlsx`: required `Mã lớp` value is blank.
- `wrong-number.xlsx`: `Số tiết` contains the invalid value `hai`.
- `unknown-master-data.xlsx`: unknown teacher and room references.
- `duplicate.xlsx`: duplicate class/subject/teacher natural key.

The v1 workbook contract has no enum-valued import column; an enum fixture is
not added without an approved versioned contract extension.
