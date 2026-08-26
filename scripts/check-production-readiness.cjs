const { existsSync, readFileSync, mkdirSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");

const root = resolve(__dirname, "..");
const releasePath = resolve(root, "outputs/P3.3-T05/release-record.json");
const outputPath = resolve(root, "outputs/P3.3-T05/production-readiness-preflight.json");
const release = JSON.parse(readFileSync(releasePath, "utf8"));
const checks = {
  scopePlanPresent: existsSync(resolve(root, "docs/production-readiness-plan.md")),
  releaseRecordPresent: existsSync(releasePath),
  webFirstScope: true,
  tenantMigrationApplied: release.gates?.tenantMigrationApplied === true,
  applicationTenantContextConfigured: release.gates?.applicationTenantContextConfigured === true,
  productionIdentityProviderConfigured: false,
  localCi: release.gates?.ciLocal === true,
  officialWorkbookAndStakeholder: release.gates?.officialWorkbookAndStakeholder === true,
  securityP1ClosedOrAccepted: release.gates?.securityP1ClosedOrAccepted === true,
  productionCollectorAndPaging: release.gates?.productionCollectorAndPaging === true,
  productionSecretsAndEnvironment: release.gates?.productionSecretsAndEnvironment === true,
  namedReleaseApprover: release.gates?.namedReleaseApprover === true,
  postReleaseOwnerAndWindow: release.gates?.postReleaseOwnerAndWindow === true,
  productionApproved: release.productionApproved === true,
};
const openGates = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);
const report = {
  task: "P3.3-T05",
  reportVersion: "PRODUCTION-READINESS-PREFLIGHT-1.0.0",
  generatedAt: new Date().toISOString(),
  decision: openGates.length === 0 ? "READY_FOR_PRODUCTION_APPROVAL" : "BLOCKED_OPEN_GATES",
  releaseRecord: "outputs/P3.3-T05/release-record.json",
  plan: "docs/production-readiness-plan.md",
  checks,
  openGates,
  boundary: "Read-only preflight; it does not deploy, approve, or mutate production.",
};
mkdirSync(resolve(outputPath, ".."), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output: outputPath, decision: report.decision, openGates }, null, 2));
if (openGates.length > 0) process.exitCode = 2;
