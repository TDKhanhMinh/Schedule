import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import ExcelJS from "exceljs";

const root = resolve(import.meta.dirname, "..");
const defaultInput = resolve(root, "outputs", "P1.3-T01", "school-timetable-mvp-0.1.0-template-v1.0.xlsx");
const defaultOutput = resolve(root, "outputs", "P3.1-T01", "pilot-import-evidence.json");
const args = process.argv.slice(2);

function argumentValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const inputPath = resolve(root, argumentValue("--input", defaultInput));
const outputPath = resolve(root, argumentValue("--output", defaultOutput));
const apiBaseUrl = (process.env.PILOT_API_BASE_URL ?? "http://localhost:3011/api/v1").replace(/\/$/, "");
const schoolId = process.env.PILOT_SCHOOL_ID ?? "00000000-0000-0000-0000-000000000001";
const actorId = process.env.PILOT_ACTOR_ID ?? "p3-1-t01-workbook-evidence";
const role = process.env.PILOT_ACTOR_ROLE ?? "ADMIN";

if (!existsSync(inputPath)) throw new Error(`Workbook not found: ${inputPath}`);
if (existsSync(outputPath) && !args.includes("--force")) {
  throw new Error(`Evidence already exists: ${outputPath}. Use --force only for an intentional new import run.`);
}

const bytes = readFileSync(inputPath);
const fileChecksum = createHash("sha256").update(bytes).digest("hex");
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(bytes);
const lessonSheet = workbook.getWorksheet("LessonRequirements");
if (!lessonSheet) throw new Error("LessonRequirements sheet is required.");

const templateGuide = workbook.getWorksheet("TemplateGuide");
const templateVersion = String(templateGuide?.getCell("B4").value ?? "unknown");
const contractVersion = String(templateGuide?.getCell("B5").value ?? "unknown");
const headers = (lessonSheet.getRow(1).values ?? []).slice(1).map((value) => String(value ?? "").trim());
const rowCount = Math.max(lessonSheet.rowCount - 1, 0);
const sourceRows = [];
for (let rowNumber = 2; rowNumber <= lessonSheet.rowCount; rowNumber += 1) {
  const values = (lessonSheet.getRow(rowNumber).values ?? []).slice(1, headers.length + 1);
  if (values.every((value) => value === null || value === undefined || String(value).trim() === "")) continue;
  sourceRows.push({
    rowNumber,
    values: values.map((value) => (value === null || value === undefined ? null : String(value))),
  });
}

const aliases = new Map([
  ["ma lop", "classId"],
  ["class code", "classId"],
  ["ma mon", "subjectId"],
  ["subject code", "subjectId"],
  ["ma giao vien", "teacherId"],
  ["ma gv", "teacherId"],
  ["teacher code", "teacherId"],
  ["so tiet", "requiredSessions"],
  ["required sessions", "requiredSessions"],
  ["ma phong", "roomId"],
  ["room code", "roomId"],
]);
function normalizeHeader(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const mapping = headers.map((header, index) => ({
  column: String.fromCharCode(65 + index),
  header,
  field: aliases.get(normalizeHeader(header)) ?? null,
  originalValuesPreserved: true,
}));
const anomalies = [];
for (const sheet of workbook.worksheets) {
  if (sheet.name === "LessonRequirements") continue;
  anomalies.push({
    scope: "sheet",
    sheet: sheet.name,
    classification: "WARNING",
    code: "GUIDANCE_SHEET_IGNORED",
    decision: "Preserve source sheet; do not import guidance rows as domain data.",
  });
}

const authHeaders = {
  "x-user-id": actorId,
  "x-user-role": role,
  "x-school-id": schoolId,
};
const form = new FormData();
form.append("schoolId", schoolId);
form.append(
  "file",
  new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
  basename(inputPath),
);
const previewResponse = await fetch(`${apiBaseUrl}/imports/preview`, {
  method: "POST",
  headers: authHeaders,
  body: form,
});
const previewPayload = await previewResponse.json();
if (!previewResponse.ok) {
  throw new Error(`Preview failed (${previewResponse.status}): ${JSON.stringify(previewPayload)}`);
}

const previewRows = Array.isArray(previewPayload.rows) ? previewPayload.rows : [];
for (const row of previewRows) {
  const errors = Array.isArray(row.errors) ? row.errors : [];
  const warnings = Array.isArray(row.warnings) ? row.warnings : [];
  if (errors.length > 0) {
    anomalies.push({ scope: "row", row: row.rowNumber, classification: "ERROR", issues: errors });
  } else if (warnings.length > 0) {
    anomalies.push({ scope: "row", row: row.rowNumber, classification: "WARNING", issues: warnings });
  }
}

const confirmResponse = await fetch(`${apiBaseUrl}/imports/${previewPayload.importBatchId}/confirm`, {
  method: "POST",
  headers: { ...authHeaders, "Idempotency-Key": previewPayload.importToken },
});
const confirmPayload = await confirmResponse.json();
if (!confirmResponse.ok) {
  throw new Error(`Confirm failed (${confirmResponse.status}): ${JSON.stringify(confirmPayload)}`);
}

const auditResponse = await fetch(`${apiBaseUrl}/imports/${previewPayload.importBatchId}/audit`, {
  headers: authHeaders,
});
const auditPayload = await auditResponse.json();
if (!auditResponse.ok) throw new Error(`Audit read failed (${auditResponse.status}): ${JSON.stringify(auditPayload)}`);

const report = {
  task: "P3.1-T01",
  generatedAt: new Date().toISOString(),
  source: {
    path: inputPath.replace(`${root}\\`, "").replaceAll("\\", "/"),
    bytes: bytes.length,
    sha256: fileChecksum,
    templateVersion,
    contractVersion,
    sourceStatus: "workspace template/fixture; school-issued workbook ownership is not evidenced here",
  },
  scope: { schoolId, actorId, environment: "local Docker/dev", productionApproved: false },
  workbook: {
    sheets: workbook.worksheets.map((sheet) => ({
      name: sheet.name,
      classification: sheet.name === "LessonRequirements" ? "IMPORTED" : "WARNING",
      rowCount: Math.max(sheet.rowCount - 1, 0),
      reason:
        sheet.name === "LessonRequirements" ? "data sheet" : "guidance sheet preserved but ignored by v1 importer",
    })),
    dataRows: sourceRows.length,
    allDataRowsClassified: sourceRows.length === previewRows.length,
    headers,
    mapping,
    originalValuesPreserved: true,
  },
  anomalyLog: anomalies,
  decisions: [
    {
      decision: "Use LessonRequirements as the only imported sheet",
      rationale: "v1 importer contract requires it as the first data sheet",
    },
    {
      decision: "Keep source labels and preserve original cell values",
      rationale: "server resolves approved school master-data labels without silent edits",
    },
    {
      decision: "Ignore TemplateGuide/ErrorCatalog/Mapping/CodeLists/Changelog as domain rows",
      rationale: "guidance sheets are traceability metadata, not lesson requirements",
    },
    { decision: "Do not infer academicPeriodId", rationale: "v1 workbook/API contract marks it as a follow-up gate" },
  ],
  serverEvidence: {
    preview: {
      httpStatus: previewResponse.status,
      batchId: previewPayload.importBatchId,
      status: previewPayload.status,
      rowCount: previewPayload.rowCount,
      validRowCount: previewPayload.validRowCount,
      errorCount: previewPayload.errorCount,
      warningCount: previewPayload.warningCount ?? 0,
      fileChecksum: previewPayload.fileChecksum,
      templateVersion: previewPayload.templateVersion,
      columnMappings: previewPayload.columnMappings,
      sheetSummaries: previewPayload.sheetSummaries,
    },
    confirm: {
      httpStatus: confirmResponse.status,
      status: confirmPayload.status,
      result: confirmPayload.result ?? confirmPayload,
    },
    audit: { httpStatus: auditResponse.status, entries: auditPayload },
  },
  gate: {
    devTestComplete: true,
    pilotApproved: false,
    productionApproved: false,
    openGates: [
      "official school workbook owner/source confirmation",
      "stakeholder mapping decision",
      "staging/UAT/security/restore evidence",
    ],
  },
};

mkdirSync(resolve(outputPath, ".."), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify(
    { outputPath, batchId: report.serverEvidence.preview.batchId, fileChecksum, rowCount: sourceRows.length },
    null,
    2,
  ),
);
