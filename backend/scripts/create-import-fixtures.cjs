const fs = require("node:fs");
const path = require("node:path");
const ExcelJS = require("exceljs");

const outputDir = path.resolve(__dirname, "../solver/examples/import-fixtures");
const schoolId = "00000000-0000-0000-0000-000000000001";
const headers = ["Mã lớp", "Mã môn", "Mã giáo viên", "Số tiết", "Mã phòng"];
const validRows = [
  [
    "00000000-0000-0000-0000-000000000201",
    "00000000-0000-0000-0000-000000000401",
    "00000000-0000-0000-0000-000000000301",
    2,
    "00000000-0000-0000-0000-000000000501"
  ],
  [
    "00000000-0000-0000-0000-000000000201",
    "00000000-0000-0000-0000-000000000403",
    "00000000-0000-0000-0000-000000000302",
    1,
    "00000000-0000-0000-0000-000000000502"
  ],
  [
    "00000000-0000-0000-0000-000000000202",
    "00000000-0000-0000-0000-000000000402",
    "00000000-0000-0000-0000-000000000301",
    1,
    "00000000-0000-0000-0000-000000000501"
  ]
];

async function writeWorkbook(filename, workbookHeaders, rows) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("LessonRequirements");
  worksheet.addRow(workbookHeaders);
  rows.forEach((row) => worksheet.addRow(row));
  await workbook.xlsx.writeFile(path.join(outputDir, filename));
}

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  await writeWorkbook("valid.xlsx", headers, validRows);
  await writeWorkbook("missing-required-column.xlsx", ["Mã lớp", "Mã môn", "Số tiết"], [[validRows[0][0], validRows[0][1], 2]]);
  await writeWorkbook("missing-value.xlsx", headers, [[null, validRows[0][1], validRows[0][2], 2, validRows[0][4]]]);
  await writeWorkbook("wrong-number.xlsx", headers, [[validRows[0][0], validRows[0][1], validRows[0][2], "hai", validRows[0][4]]]);
  await writeWorkbook("unknown-master-data.xlsx", headers, [[validRows[0][0], validRows[0][1], "XYZ", 2, "UNKNOWN-ROOM"]]);
  fs.writeFileSync(path.join(outputDir, "invalid.pdf"), "not an Excel workbook");
  fs.writeFileSync(path.join(outputDir, "invalid.docx"), "not an Excel workbook");
  fs.writeFileSync(
    path.join(outputDir, "README.md"),
    "# Excel import fixtures\n\nFixtures are generated from the local demo school seed. School ID: " + schoolId + ".\n"
  );
})();
