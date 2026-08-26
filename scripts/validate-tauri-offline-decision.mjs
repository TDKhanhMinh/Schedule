import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const documentPath = "docs/tauri-offline-business-case.md";
const outputPath = resolve(root, "outputs/P4.2-T01/tauri-offline-decision-report.json");
const document = await readFile(resolve(root, documentPath), "utf8");
const requiredMarkers = [
  "TAURI-OFFLINE-DECISION-1.0.0",
  "NO-GO_PENDING_EVIDENCE",
  "Network pain",
  "Sync safety",
  "Security",
  "TCO",
  "Web-first",
  "GO criteria",
  "Evidence boundary",
];
const checks = Object.fromEntries(
  requiredMarkers.map((marker) => [marker, document.toLowerCase().includes(marker.toLowerCase())]),
);
const report = {
  task: "P4.2-T01",
  decisionVersion: "TAURI-OFFLINE-DECISION-1.0.0",
  generatedAt: new Date().toISOString(),
  decision: "NO-GO_PENDING_EVIDENCE",
  document: documentPath,
  checks,
  gates: {
    designEvidenceComplete: Object.values(checks).every(Boolean),
    pilotApproved: false,
    productionApproved: false,
  },
  openEvidence: [
    "pilot network telemetry/interviews",
    "3-year TCO/budget",
    "offline threat model",
    "sync/conflict contract",
    "signed update/support owner",
  ],
  limitation: "No Tauri implementation or offline runtime was added; web-first remains the interim recommendation.",
};
await mkdir(resolve(root, "outputs/P4.2-T01"), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify(
    { output: outputPath, decision: report.decision, designEvidenceComplete: report.gates.designEvidenceComplete },
    null,
    2,
  ),
);
if (!report.gates.designEvidenceComplete) process.exit(1);
