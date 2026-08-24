const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const JSZip = require("jszip");

const root = path.resolve(__dirname, "..");
const templatePath = path.join(root, "outputs", "P1.3-T01", "school-timetable-mvp-0.1.0-template-v1.0.xlsx");

function fail(message) {
  throw new Error(`[template-check] ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function text(value) {
  return String(value ?? "").trim();
}

async function main() {
  assert(fs.existsSync(templatePath), `missing artifact: ${templatePath}`);

  const { FileBlob, SpreadsheetFile } = await import("@oai/artifact-tool");
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(templatePath));

  const expectedSheets = ["LessonRequirements", "TemplateGuide", "ErrorCatalog", "Mapping", "CodeLists", "Changelog"];
  assert(
    JSON.stringify(workbook.worksheets.items.map((sheet) => sheet.name)) === JSON.stringify(expectedSheets),
    "sheet order or names do not match the published contract",
  );

  const lessonRequirements = workbook.worksheets.getItem("LessonRequirements");
  const headers = lessonRequirements.getRange("A1:E1").values[0].map(text);
  assert(
    JSON.stringify(headers) === JSON.stringify(["Mã lớp", "Mã môn", "Mã giáo viên", "Số tiết", "Mã phòng"]),
    "LessonRequirements headers do not match the import contract",
  );
  assert(text(lessonRequirements.getRange("A2").values[0][0]) === "7A", "missing THCS example row");
  assert(text(lessonRequirements.getRange("A4").values[0][0]) === "7B", "missing second lesson example row");
  assert(text(lessonRequirements.getRange("D2").values[0][0]) === "2", "lesson example value is not preserved");
  const zip = await JSZip.loadAsync(fs.readFileSync(templatePath));
  const lessonRequirementsXml = await zip.file("xl/worksheets/sheet1.xml").async("string");
  assert(
    lessonRequirementsXml.includes('type="whole" operator="between" sqref="D2:D200"') &&
      lessonRequirementsXml.includes("<formula1>1</formula1>") &&
      lessonRequirementsXml.includes("<formula2>50</formula2>"),
    "Số tiết whole-number validation metadata is missing or incorrect",
  );

  const guide = workbook.worksheets.getItem("TemplateGuide");
  assert(text(guide.getRange("B4").values[0][0]) === "MVP-0.1.0", "template version metadata is missing");
  assert(text(guide.getRange("B5").values[0][0]) === "1.0", "contract version metadata is missing");
  assert(text(guide.getRange("B12").values[0][0]) === "Changelog", "guide does not require the changelog sheet");

  const codeLists = workbook.worksheets.getItem("CodeLists");
  const codeListValues = codeLists.getRange("A4:A17").values.flat().map(text);
  assert(codeListValues.includes("THCS"), "CodeLists is missing THCS examples");
  assert(codeListValues.includes("THPT"), "CodeLists is missing THPT examples");

  const changelog = workbook.worksheets.getItem("Changelog");
  assert(text(changelog.getRange("A4").values[0][0]) === "v1.0", "published changelog version is missing");
  assert(
    text(changelog.getRange("D4").values[0][0]).includes("contractVersion 1.0"),
    "changelog compatibility note is missing",
  );

  const digest = crypto.createHash("sha256").update(fs.readFileSync(templatePath)).digest("hex");
  const { size } = fs.statSync(templatePath);
  console.log(`[template-check] passed: ${templatePath}`);
  console.log(`[template-check] bytes=${size} sha256=${digest}`);
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
