import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";
import JSZip from "jszip";

const outputDir = "D:/Schedule/outputs/P0.2-T02";
const previewDir = "D:/Schedule/.spreadsheet-work/previews";

const colors = {
  navy: "#17365D",
  blue: "#D9EAF7",
  paleBlue: "#EEF6FC",
  green: "#E2F0D9",
  yellow: "#FFF2CC",
  red: "#FCE4D6",
  gray: "#F2F2F2",
  border: "#B7C9D6",
  text: "#1F2937"
};

const baseFont = { name: "Aptos", size: 10, color: colors.text };

function setTitle(sheet, range, value) {
  sheet.mergeCells(range);
  const title = sheet.getRange(range);
  title.values = [[value]];
  title.format = {
    fill: colors.navy,
    font: { ...baseFont, bold: true, size: 16, color: "#FFFFFF" },
    horizontalAlignment: "left",
    verticalAlignment: "center"
  };
  title.format.rowHeight = 28;
}

function setHeader(range) {
  range.format = {
    fill: colors.blue,
    font: { ...baseFont, bold: true, color: colors.navy },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
    borders: { preset: "all", style: "thin", color: colors.border }
  };
  range.format.rowHeight = 30;
}

function setBody(range) {
  range.format = {
    font: baseFont,
    verticalAlignment: "top",
    wrapText: true,
    borders: { preset: "inside", style: "thin", color: colors.border }
  };
}

function setSection(range) {
  range.format = {
    fill: colors.paleBlue,
    font: { ...baseFont, bold: true, color: colors.navy },
    wrapText: true,
    verticalAlignment: "top",
    borders: { preset: "outside", style: "thin", color: colors.border }
  };
}

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const workbook = Workbook.create();
const lessons = workbook.worksheets.add("LessonRequirements");
const guide = workbook.worksheets.add("TemplateGuide");
const errors = workbook.worksheets.add("ErrorCatalog");
const mapping = workbook.worksheets.add("Mapping");

for (const sheet of [lessons, guide, errors, mapping]) {
  sheet.showGridLines = false;
}

lessons.getRange("A1:E4").values = [
  ["Mã lớp", "Mã môn", "Mã giáo viên", "Số tiết", "Mã phòng"],
  ["7A", "Toán", "Nguyễn An", 2, "Phòng A"],
  ["7A", "Ngữ văn", "Trần Bình", 1, "Phòng B"],
  ["7B", "Vật lý", "Nguyễn An", 1, "Phòng A"]
];
setHeader(lessons.getRange("A1:E1"));
setBody(lessons.getRange("A2:E4"));
lessons.getRange("A2:C205").format.numberFormat = "@";
lessons.getRange("D2:D205").format.numberFormat = "0";
lessons.getRange("D2:D205").dataValidation = {
  rule: { type: "whole", operator: "greaterThan", formula1: 0 }
};
lessons.getRange("A1:E4").format.borders = { preset: "all", style: "thin", color: colors.border };
lessons.getRange("A2:E4").conditionalFormats.add("containsBlanks", {
  format: { fill: colors.red }
});
lessons.freezePanes.freezeRows(1);
lessons.getRange("A:A").format.columnWidth = 22;
lessons.getRange("B:B").format.columnWidth = 22;
lessons.getRange("C:C").format.columnWidth = 24;
lessons.getRange("D:D").format.columnWidth = 12;
lessons.getRange("E:E").format.columnWidth = 20;

setTitle(guide, "A1:D1", "Template Guide — MVP-0.1.0");
guide.getRange("A3:D10").values = [
  ["Property", "Value", "Required", "Compatibility rule"],
  ["Template version", "MVP-0.1.0", "Yes", "Filename and guide version must change for a breaking workbook change."],
  ["Contract version", "1.0", "Yes", "NestJS and Python must reject unsupported breaking versions rather than silently coerce."],
  ["Required sheet", "LessonRequirements", "Yes", "Must be the first worksheet for the current API importer."],
  ["Required columns", "Mã lớp; Mã môn; Mã giáo viên; Số tiết", "Yes", "Header matching ignores case, accents and repeated whitespace."],
  ["Optional column", "Mã phòng", "No", "If present, the value must resolve to a room master record."],
  ["API scope", "schoolId", "Yes", "Current API supplies schoolId outside the workbook."],
  ["Academic period", "academicPeriodId", "Follow-up", "Not yet in the v1 workbook/API payload; must be confirmed before production."],
];
setHeader(guide.getRange("A3:D3"));
setBody(guide.getRange("A4:D10"));
guide.getRange("A4:A10").format.fill = colors.paleBlue;
guide.getRange("C4:C10").conditionalFormats.add("containsText", { text: "Yes", format: { fill: colors.green } });
guide.getRange("C4:C10").conditionalFormats.add("containsText", { text: "Follow-up", format: { fill: colors.yellow } });
guide.freezePanes.freezeRows(3);
guide.getRange("A:A").format.columnWidth = 22;
guide.getRange("B:B").format.columnWidth = 34;
guide.getRange("C:C").format.columnWidth = 16;
guide.getRange("D:D").format.columnWidth = 66;

setTitle(errors, "A1:D1", "Validation Error Catalog — Contract 1.0");
errors.getRange("A3:D13").values = [
  ["Code", "Location", "Example message", "Action"],
  ["FILE_REQUIRED", "Request", "Vui lòng chọn file Excel để upload.", "Choose a .xlsx or .xlsm workbook."],
  ["INVALID_FILE_TYPE", "Request", "Định dạng file không hợp lệ.", "Upload only .xlsx or .xlsm."],
  ["INVALID_TEMPLATE", "LessonRequirements / header row", "File thiếu các cột bắt buộc: Mã giáo viên.", "Restore the required header or use the versioned template."],
  ["REQUIRED", "LessonRequirements / data row", "Mã lớp là bắt buộc.", "Fill the cell on the reported row."],
  ["INVALID_NUMBER", "LessonRequirements / Số tiết", "Dữ liệu cột Số tiết phải là số nguyên dương.", "Enter a whole number greater than zero."],
  ["UNKNOWN_REFERENCE", "LessonRequirements / master column", "Mã Giáo viên XYZ không tồn tại.", "Use a code present in the selected school's master data."],
  ["DUPLICATE", "LessonRequirements / data row", "Dòng dữ liệu bị trùng phân công lớp/môn/giáo viên.", "Remove the duplicate or obtain an approved split-allocation rule."],
  ["SCHOOL_REQUIRED", "Request", "schoolId là bắt buộc.", "Select a school scope before preview."],
  ["IMPORT_HAS_ERRORS", "Confirm request", "Không thể Confirm Import khi dữ liệu còn lỗi.", "Fix all preview errors and upload/preview again."],
  ["INVALID_WORKBOOK", "Workbook", "Không thể đọc file Excel.", "Use the versioned .xlsx template."],
];
setHeader(errors.getRange("A3:D3"));
setBody(errors.getRange("A4:D13"));
errors.getRange("A4:A13").format.fill = colors.paleBlue;
errors.freezePanes.freezeRows(3);
errors.getRange("A:A").format.columnWidth = 24;
errors.getRange("B:B").format.columnWidth = 34;
errors.getRange("C:C").format.columnWidth = 52;
errors.getRange("D:D").format.columnWidth = 48;

setTitle(mapping, "A1:H1", "Canonical Mapping — Excel → NestJS → PostgreSQL → Python");
mapping.getRange("A3:H8").values = [
  ["Workbook column", "Canonical field", "Type", "Required", "PostgreSQL", "NestJS/API", "Python", "Status / note"],
  ["Mã lớp", "classId", "text", "Yes", "classes.id", "preview row normalized.classId", "LessonRequirement.classId", "Stable source code preferred; current importer also resolves id/name."],
  ["Mã môn", "subjectId", "text", "Yes", "subjects.id", "preview row normalized.subjectId", "LessonRequirement.subjectId", "Stable source code preferred; current importer also resolves id/name."],
  ["Mã giáo viên", "teacherId", "text", "Yes", "teachers.id", "preview row normalized.teacherId", "LessonRequirement.teacherId", "Do not use personal attributes as a join key."],
  ["Số tiết", "requiredSessions", "positive integer", "Yes", "lesson_requirements.required_sessions", "preview row normalized.requiredSessions", "LessonRequirement.requiredSessions", "Must be integer > 0."],
  ["Mã phòng", "roomId", "text", "No", "rooms.id (validation only in current confirm path)", "preview row normalized.roomId", "Not in solver v1 assignment", "Validated when present; persistence/solver support is follow-up."],
];
setHeader(mapping.getRange("A3:H3"));
setBody(mapping.getRange("A4:H8"));
mapping.getRange("A4:A8").format.fill = colors.paleBlue;
mapping.getRange("D4:D8").conditionalFormats.add("containsText", { text: "Yes", format: { fill: colors.green } });
mapping.getRange("D4:D8").conditionalFormats.add("containsText", { text: "No", format: { fill: colors.yellow } });
mapping.freezePanes.freezeRows(3);
mapping.getRange("A:A").format.columnWidth = 22;
mapping.getRange("B:B").format.columnWidth = 22;
mapping.getRange("C:C").format.columnWidth = 18;
mapping.getRange("D:D").format.columnWidth = 12;
mapping.getRange("E:E").format.columnWidth = 36;
mapping.getRange("F:F").format.columnWidth = 38;
mapping.getRange("G:G").format.columnWidth = 34;
mapping.getRange("H:H").format.columnWidth = 58;

for (const [sheetName, range] of [
  ["LessonRequirements", "A1:E4"],
  ["TemplateGuide", "A1:D10"],
  ["ErrorCatalog", "A1:D13"],
  ["Mapping", "A1:H8"]
]) {
  const preview = await workbook.render({ sheetName, range, scale: 1, format: "png" });
  await fs.writeFile(`${previewDir}/${sheetName}.png`, new Uint8Array(await preview.arrayBuffer()));
}

const inspection = await workbook.inspect({
  kind: "sheet,table,region",
  maxChars: 8000,
  tableMaxRows: 12,
  tableMaxCols: 10,
  tableMaxCellChars: 120
});
await fs.writeFile(`${previewDir}/inspection.ndjson`, inspection.ndjson, "utf8");

const errorsScan = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "template formula error scan"
});
await fs.writeFile(`${previewDir}/formula-errors.ndjson`, errorsScan.ndjson, "utf8");

const output = await SpreadsheetFile.exportXlsx(workbook);
const outputPath = `${outputDir}/school-timetable-mvp-0.1.0-template-v1.0.xlsx`;
await output.save(outputPath);

// The bundled artifact exporter emits a valid package with prefixed XML tags,
// while the current ExcelJS importer expects the same tags without the x:
// prefix. Normalize only XML namespaces; workbook content and formatting stay
// authored by artifact-tool.
const exportedBytes = await fs.readFile(outputPath);
const zip = await JSZip.loadAsync(exportedBytes);
for (const [entryName, entry] of Object.entries(zip.files)) {
  if (!entryName.endsWith(".xml")) continue;
  const xml = await entry.async("string");
  const normalizedXml = xml
    .replace(/<x:/g, "<")
    .replace(/<\/x:/g, "</")
    .replace(/\sxmlns:x=/g, " xmlns=");
  zip.file(entryName, normalizedXml);
}
await fs.writeFile(outputPath, await zip.generateAsync({ type: "nodebuffer" }));
console.log(JSON.stringify({
  output: outputPath,
  sheets: ["LessonRequirements", "TemplateGuide", "ErrorCatalog", "Mapping"],
  errorScan: errorsScan.ndjson,
  inspection: inspection.ndjson
}, null, 2));
