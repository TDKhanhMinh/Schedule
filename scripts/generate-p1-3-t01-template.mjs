import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const require = createRequire(import.meta.url);
const JSZip = require("jszip");

const root = process.cwd();
const sourcePath = path.join(root, "outputs", "P0.2-T02", "school-timetable-mvp-0.1.0-template-v1.0.xlsx");
const outputDir = path.join(root, "outputs", "P1.3-T01");
const verificationDir = path.join(root, "tmp", "P1.3-T01");
const outputPath = path.join(outputDir, "school-timetable-mvp-0.1.0-template-v1.0.xlsx");

const colors = {
  title: "#17365D",
  titleText: "#FFFFFF",
  header: "#D9EAF7",
  headerText: "#17365D",
  body: "#1F2937",
  border: "#B7C9D6",
  note: "#FFF2CC",
};

function styleTitle(sheet, range) {
  range.format = {
    fill: colors.title,
    font: { bold: true, color: colors.titleText, fontSize: 16 },
    horizontalAlignment: "left",
    verticalAlignment: "center",
  };
  range.format.rowHeight = 28;
}

function styleHeader(range) {
  range.format = {
    fill: colors.header,
    font: { bold: true, color: colors.headerText },
    wrapText: true,
    horizontalAlignment: "center",
    verticalAlignment: "center",
    borders: { preset: "all", style: "thin", color: colors.border },
  };
  range.format.rowHeight = 24;
}

function styleBody(range) {
  range.format = {
    font: { color: colors.body },
    wrapText: true,
    verticalAlignment: "top",
    borders: { preset: "all", style: "thin", color: colors.border },
  };
}

async function loadWorkbook() {
  const input = await FileBlob.load(sourcePath);
  return SpreadsheetFile.importXlsx(input);
}

function addCodeLists(workbook) {
  const sheet = workbook.worksheets.add("CodeLists");
  sheet.showGridLines = false;
  sheet.mergeCells("A1:E1");
  sheet.getRange("A1").values = [["Code Lists & examples — THCS/THPT"]];
  styleTitle(sheet, sheet.getRange("A1:E1"));
  sheet.getRange("A3:E3").values = [["Cấp học", "Danh mục", "Mã/giá trị mẫu", "Tên hiển thị", "Ghi chú"]];
  styleHeader(sheet.getRange("A3:E3"));
  const rows = [
    ["THCS", "Lớp", "7A", "Lớp 7A", "Ví dụ minh họa; mã thật lấy từ master data của trường."],
    ["THCS", "Lớp", "7B", "Lớp 7B", ""],
    ["THCS", "Môn", "Toán", "Toán", ""],
    ["THCS", "Môn", "Ngữ văn", "Ngữ văn", ""],
    ["THCS", "Giáo viên", "Nguyễn An", "Nguyễn An", ""],
    ["THCS", "Giáo viên", "Trần Bình", "Trần Bình", ""],
    ["THCS", "Phòng", "Phòng A", "Phòng A", ""],
    ["THCS", "Phòng", "Phòng B", "Phòng B", ""],
    ["THPT", "Lớp", "10A1", "Lớp 10A1", "Ví dụ minh họa; không trộn dữ liệu hai trường trong một batch."],
    ["THPT", "Lớp", "11A1", "Lớp 11A1", ""],
    ["THPT", "Môn", "Vật lý", "Vật lý", ""],
    ["THPT", "Môn", "Hóa học", "Hóa học", ""],
    ["THPT", "Giáo viên", "Lê Minh", "Lê Minh", ""],
    ["THPT", "Phòng", "Phòng Lab 1", "Phòng Lab 1", ""],
  ];
  sheet.getRange(`A4:E${rows.length + 3}`).values = rows;
  styleBody(sheet.getRange(`A4:E${rows.length + 3}`));
  sheet.getRange("A1:A20").format.columnWidth = 12;
  sheet.getRange("B1:B20").format.columnWidth = 16;
  sheet.getRange("C1:C20").format.columnWidth = 18;
  sheet.getRange("D1:D20").format.columnWidth = 20;
  sheet.getRange("E1:E20").format.columnWidth = 54;
  sheet.freezePanes.freezeRows(3);
}

function addChangelog(workbook) {
  const sheet = workbook.worksheets.add("Changelog");
  sheet.showGridLines = false;
  sheet.mergeCells("A1:D1");
  sheet.getRange("A1").values = [["Template Changelog — MVP-0.1.0"]];
  styleTitle(sheet, sheet.getRange("A1:D1"));
  sheet.getRange("A3:D3").values = [["Template version", "Ngày phát hành", "Thay đổi", "Tương thích / ghi chú"]];
  styleHeader(sheet.getRange("A3:D3"));
  const rows = [
    [
      "v1.0",
      "2026-08-24",
      "Phát hành template P1.3-T01 với guide, error catalog, mapping, code lists THCS/THPT và ví dụ nhập liệu.",
      "Không đổi contractVersion 1.0; LessonRequirements vẫn là sheet đầu tiên.",
    ],
  ];
  sheet.getRange("A4:D4").values = rows;
  styleBody(sheet.getRange("A4:D4"));
  sheet.getRange("A1:A10").format.columnWidth = 18;
  sheet.getRange("B1:B10").format.columnWidth = 16;
  sheet.getRange("C1:C10").format.columnWidth = 58;
  sheet.getRange("D1:D10").format.columnWidth = 54;
  sheet.freezePanes.freezeRows(3);
}

function extendGuide(workbook) {
  const sheet = workbook.worksheets.getItem("TemplateGuide");
  sheet.getRange("A11:D13").values = [
    ["Code lists sheet", "CodeLists", "Recommended", "Reference examples for THCS/THPT; not imported as domain rows."],
    [
      "Changelog sheet",
      "Changelog",
      "Required",
      "Append a row for every published template version or breaking change.",
    ],
    [
      "Published status",
      "P1.3-T01 / v1.0",
      "Yes",
      "Official MVP artifact for review; pilot master-data codes still require school confirmation.",
    ],
  ];
  styleBody(sheet.getRange("A11:D13"));
  sheet.getRange("A11:A13").format.fill = "#EEF6FC";
  sheet.getRange("C11:C13").format.fill = colors.note;
  sheet.getRange("A1:A20").format.columnWidth = 22;
  sheet.getRange("B1:B20").format.columnWidth = 28;
  sheet.getRange("C1:C20").format.columnWidth = 16;
  sheet.getRange("D1:D20").format.columnWidth = 66;
}

function addBasicValidation(workbook) {
  const sheet = workbook.worksheets.getItem("LessonRequirements");
  sheet.getRange("D2:D200").dataValidation = {
    rule: { type: "whole", operator: "between", formula1: 1, formula2: 50 },
  };
}

async function inspectAndRender(workbook, label, sheetNames) {
  const summary = await workbook.inspect({
    kind: "workbook,sheet,table",
    maxChars: 6000,
    tableMaxRows: 6,
    tableMaxCols: 8,
    tableMaxCellChars: 100,
  });
  console.log(`[${label}] summary\n${summary.ndjson}`);
  const errors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 100 },
    summary: `${label} formula error scan`,
  });
  console.log(`[${label}] formula-errors\n${errors.ndjson}`);
  await fs.mkdir(verificationDir, { recursive: true });
  for (const sheetName of sheetNames) {
    const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
    await fs.writeFile(
      path.join(verificationDir, `${label}-${sheetName}.png`),
      new Uint8Array(await preview.arrayBuffer()),
    );
  }
}

async function normalizeExcelNamespaces(filePath) {
  const zip = await JSZip.loadAsync(await fs.readFile(filePath));
  for (const [entryName, entry] of Object.entries(zip.files)) {
    if (entry.dir || !entryName.startsWith("xl/") || !entryName.endsWith(".xml")) continue;
    const xml = await entry.async("string");
    if (!xml.includes("<x:") && !xml.includes("</x:")) continue;
    const normalized = xml
      .replace(
        /xmlns:x="http:\/\/schemas\.openxmlformats\.org\/spreadsheetml\/2006\/main"/,
        'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
      )
      .replace(/<\/?x:/g, (tag) => tag.replace("x:", ""));
    zip.file(entryName, normalized);
  }
  await fs.writeFile(filePath, await zip.generateAsync({ type: "nodebuffer" }));
}

async function build() {
  const workbook = await loadWorkbook();
  extendGuide(workbook);
  addBasicValidation(workbook);
  addCodeLists(workbook);
  addChangelog(workbook);
  const sheetNames = ["LessonRequirements", "TemplateGuide", "ErrorCatalog", "Mapping", "CodeLists", "Changelog"];
  await inspectAndRender(workbook, "before-export", sheetNames);
  await fs.mkdir(outputDir, { recursive: true });
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);
  await normalizeExcelNamespaces(outputPath);

  const exported = await SpreadsheetFile.importXlsx(await FileBlob.load(outputPath));
  await inspectAndRender(exported, "after-export", sheetNames);
  console.log(`saved=${outputPath}`);
}

async function inspectReference() {
  const workbook = await loadWorkbook();
  await inspectAndRender(workbook, "reference", ["LessonRequirements", "TemplateGuide", "ErrorCatalog", "Mapping"]);
}

if (process.argv[2] === "inspect") {
  await inspectReference();
} else {
  await build();
}
