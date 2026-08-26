import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const outputPath = resolve(root, process.env.RELEASE_RECORD ?? "outputs/P3.3-T05/release-record.json");

function run(command, args) {
  try {
    return execFileSync(command, args, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(resolve(root, relativePath), "utf8"));
  } catch {
    return null;
  }
}

function dockerImages() {
  try {
    const output = execFileSync(
      "docker",
      ["image", "inspect", "schedule-api:latest", "schedule-worker:latest", "--format", "{{json .}}"],
      { cwd: root, encoding: "utf8" },
    );
    return output
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const image = JSON.parse(line);
        return { id: image.Id ?? null, repoDigests: image.RepoDigests ?? [], created: image.Created ?? null };
      });
  } catch {
    return [];
  }
}

const packageManifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const uat = await readJson("outputs/P3.1-T05/uat-gap-report.json");
const security = await readJson("outputs/P3.3-T02/security-review-report.json");
const performance = await readJson("outputs/P3.3-T03/load-soak-report.json");
const recovery = await readJson("outputs/P3.3-T04/disaster-recovery-report.json");
const observability = await readJson("outputs/P3.3-T01/observability-report.json");
const statusLines = run("git", ["status", "--short"])?.split(/\r?\n/).filter(Boolean) ?? [];
const currentSha = run("git", ["rev-parse", "HEAD"]);
const migrationCount = Number(
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
    "SELECT count(*) FROM schema_migrations",
  ]) ?? 0,
);
const composeServices =
  run("docker", ["compose", "ps", "--status", "running", "--services"])?.split(/\r?\n/).filter(Boolean) ?? [];

const gates = {
  sourceVersion: Boolean(currentSha),
  ciLocal: true,
  uatImplementationEvidence: uat?.signoff?.devTestComplete === true,
  officialWorkbookAndStakeholder: false,
  securityLocalEvidence: security?.gates?.devTestComplete === true,
  securityP1ClosedOrAccepted: security?.gates?.p1FindingsOpen === false,
  performanceLocalEvidence: performance?.gate?.benchmarkPass === true,
  recoveryLocalEvidence: recovery?.gate?.rehearsalPass === true,
  observabilityLocalEvidence: observability?.gates?.devTestComplete === true,
  productionCollectorAndPaging:
    observability?.gates?.productionCollectorConfigured === true && observability?.gates?.alertPagingVerified === true,
  productionSecretsAndEnvironment: false,
  namedReleaseApprover: false,
  postReleaseOwnerAndWindow: false,
};

const releaseRecord = {
  task: "P3.3-T05",
  recordVersion: "RELEASE-CHECKLIST-1.0.0",
  generatedAt: new Date().toISOString(),
  applicationVersion: packageManifest.version,
  decision: "NO-GO_PENDING_GATES",
  productionApproved: false,
  pilotApproved: false,
  source: {
    commit: currentSha,
    branch: run("git", ["branch", "--show-current"]),
    workingTreeHasUnrelatedChanges: statusLines.length > 0,
    unrelatedChangesPreserved: statusLines,
    images: dockerImages(),
    migrationCount,
  },
  evidence: {
    uat: {
      path: "outputs/P3.1-T05/uat-gap-report.json",
      devTestComplete: uat?.signoff?.devTestComplete ?? false,
      pilotApproved: uat?.signoff?.pilotApproved ?? false,
    },
    security: {
      path: "outputs/P3.3-T02/security-review-report.json",
      devTestComplete: security?.gates?.devTestComplete ?? false,
      p1FindingsOpen: security?.gates?.p1FindingsOpen ?? null,
    },
    performance: {
      path: "outputs/P3.3-T03/load-soak-report.json",
      benchmarkPass: performance?.gate?.benchmarkPass ?? false,
      capacityLimit: performance?.gate?.capacityLimit ?? null,
    },
    recovery: {
      path: "outputs/P3.3-T04/disaster-recovery-report.json",
      rehearsalPass: recovery?.gate?.rehearsalPass ?? false,
      rtoSeconds: recovery?.restore?.rtoSeconds ?? null,
      rpoSeconds: recovery?.restore?.rpoSeconds ?? null,
    },
    observability: {
      path: "outputs/P3.3-T01/observability-report.json",
      devTestComplete: observability?.gates?.devTestComplete ?? false,
      runtime: observability?.runtimeEvidence?.status ?? "UNKNOWN",
    },
  },
  runtime: {
    composeServices,
    apiReadiness: composeServices.includes("api"),
    workerRunning: composeServices.includes("worker"),
  },
  gates,
  openGates: Object.entries(gates)
    .filter(([, passed]) => !passed)
    .map(([name]) => name),
  rollback: {
    strategy:
      "Freeze writes, drain queue, redeploy previous approved image, restore only after isolated consistency check.",
    owner: null,
    verificationWindow: null,
  },
  approvals: {
    releaseApprover: null,
    securityRiskApprover: null,
    pilotStakeholderApprover: null,
    waiver: { status: "NOT_GRANTED", scope: null, expiresAt: null },
  },
  limitations: [
    "Local/dev evidence only; no staging/production deployment or real school workbook approval.",
    "P1 dependency and deployment findings remain open; no risk acceptance identity/expiry is supplied.",
    "The record is a no-go decision package, not a production approval.",
  ],
};

await mkdir(resolve(root, "outputs/P3.3-T05"), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(releaseRecord, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify({ output: outputPath, decision: releaseRecord.decision, openGates: releaseRecord.openGates }, null, 2),
);
