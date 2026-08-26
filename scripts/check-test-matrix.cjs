const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const matrixPath = path.join(root, "docs", "test-matrix-p2-5-t04.md");
const matrix = fs.readFileSync(matrixPath, "utf8");

const requiredFiles = [
  "backend/src/auth/auth.guard.spec.ts",
  "backend/src/imports/imports.service.spec.ts",
  "backend/src/contracts/pre-solve.spec.ts",
  "backend/src/timetable/schedule-version.service.spec.ts",
  "backend/src/timetable/schedule-export.service.spec.ts",
  "backend/src/timetable/public-schedule.service.spec.ts",
  "backend/src/jobs/optimization-queue.service.spec.ts",
  "backend/src/worker/optimization-worker.spec.ts",
  "backend/solver/tests/test_benchmarks.py",
  "backend/solver/tests/test_benchmark_rubric.py",
  "frontend/scripts/smoke.mjs",
  "scripts/test-p2-5-t04-runtime.mjs",
];

for (const relativePath of requiredFiles) {
  if (!fs.existsSync(path.join(root, relativePath))) {
    throw new Error(`Test matrix source is missing: ${relativePath}`);
  }
  if (!matrix.includes(relativePath)) {
    throw new Error(`Test matrix does not reference: ${relativePath}`);
  }
}

for (const id of ["UT-01", "UT-04", "UT-06", "IT-03", "IT-04", "IT-05", "E2E-02"]) {
  if (!matrix.includes(id)) {
    throw new Error(`Required matrix row is missing: ${id}`);
  }
}

console.log(`Test matrix check passed: ${requiredFiles.length} sources and core workflow rows are present.`);
