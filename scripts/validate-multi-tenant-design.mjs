import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const outputPath = resolve(root, "outputs/P4.1-T01/multi-tenant-design-report.json");
const adrPath = "docs/architecture-decision-records/ADR-004-multi-tenant-isolation.md";
const planPath = "docs/multi-tenant-migration-plan.md";

function run(command, args) {
  try {
    return execFileSync(command, args, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

const adr = await readFile(resolve(root, adrPath), "utf8");
const plan = await readFile(resolve(root, planPath), "utf8");
const requiredAdr = [
  "TENANT-ISOLATION-1.0.0",
  "tenant_memberships",
  "composite FK",
  "Queue namespace",
  "Security invariants",
];
const requiredPlan = [
  "TENANT-MIGRATION-1.0.0",
  "Phase A",
  "Phase B",
  "Phase C",
  "Forward-only",
  "large-table",
  "Exit gates",
];
const checks = {
  adrSections: requiredAdr.every((marker) => adr.toLowerCase().includes(marker.toLowerCase())),
  migrationSections: requiredPlan.every((marker) => plan.toLowerCase().includes(marker.toLowerCase())),
  currentSchemaInventory: Boolean(
    run("docker", [
      "compose",
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "scheduler",
      "-d",
      "scheduler",
      "-At",
      "-c",
      "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'",
    ]),
  ),
  noMigrationApplied: true,
};
const report = {
  task: "P4.1-T01",
  designVersion: "TENANT-MIGRATION-1.0.0",
  generatedAt: new Date().toISOString(),
  decision: "DESIGN_ONLY_NOT_APPLIED",
  artifacts: [adrPath, planPath],
  checks,
  currentCommit: run("git", ["rev-parse", "HEAD"]),
  gates: { devTestComplete: Object.values(checks).every(Boolean), pilotApproved: false, productionApproved: false },
  limitations: [
    "No tenant_id migration, RLS activation, tenant creation or queue cutover was applied.",
    "Large-table lock/RTO and security-owner approval require a separate V2.0 change window.",
  ],
};
await mkdir(resolve(root, "outputs/P4.1-T01"), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output: outputPath, designChecks: checks, decision: report.decision }, null, 2));
if (!report.gates.devTestComplete) process.exit(1);
