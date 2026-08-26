import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const baseUrl = process.env.P25_T04_API_BASE_URL ?? "http://localhost:3011/api/v1";
const schoolId = process.env.P25_T04_SCHOOL_ID ?? "00000000-0000-0000-0000-000000000001";
const otherSchoolId = process.env.P25_T04_OTHER_SCHOOL_ID ?? "00000000-0000-0000-0000-000000000002";
const adminHeaders = {
  "x-user-id": "p2-5-t04-runtime-admin",
  "x-user-role": "ADMIN",
  "x-school-id": schoolId,
};
const viewerHeaders = {
  "x-user-id": "p2-5-t04-runtime-viewer",
  "x-user-role": "VIEWER",
  "x-school-id": schoolId,
};

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("json") ? await response.json() : await response.arrayBuffer();
  return { response, body };
}

function expectCode(result, status, code) {
  assert.equal(result.response.status, status, JSON.stringify(result.body));
  assert.equal(result.body.code, code, JSON.stringify(result.body));
}

const health = await request("/health");
assert.equal(health.response.status, 200);
for (const [header, expected] of [
  ["x-content-type-options", "nosniff"],
  ["x-frame-options", "DENY"],
  ["referrer-policy", "no-referrer"],
  ["permissions-policy", "camera=(), microphone=(), geolocation=()"],
]) {
  assert.equal(health.response.headers.get(header), expected, `${header} security header mismatch`);
}

const unauthenticated = await request("/schools");
expectCode(unauthenticated, 401, "AUTH_REQUIRED");

const schools = await request("/schools", { headers: adminHeaders });
assert.equal(schools.response.status, 200, JSON.stringify(schools.body));
assert.deepEqual(
  schools.body.map((school) => school.id),
  [schoolId],
);

const crossSchool = await request(`/schools/${otherSchoolId}/teachers`, { headers: adminHeaders });
expectCode(crossSchool, 403, "SCHOOL_SCOPE_FORBIDDEN");

const viewerMutation = await request(`/schools/${schoolId}`, { method: "DELETE", headers: viewerHeaders });
expectCode(viewerMutation, 403, "PERMISSION_DENIED");

const invalidPublic = await request("/public/schedules/p2-5-t04-invalid-token");
expectCode(invalidPublic, 404, "SCHEDULE_PUBLIC_LINK_NOT_FOUND");

const preflight = JSON.parse(await readFile(resolve("backend/solver/examples/benchmarks/small-feasible.json"), "utf8"));
preflight.schoolId = schoolId;
const feasiblePreflight = await request("/optimization-jobs/preflight", {
  method: "POST",
  headers: { ...adminHeaders, "content-type": "application/json" },
  body: JSON.stringify(preflight),
});
assert.equal(feasiblePreflight.response.status, 201);
assert.equal(feasiblePreflight.body.canSolve, true, JSON.stringify(feasiblePreflight.body));

const infeasible = JSON.parse(
  await readFile(resolve("backend/solver/examples/benchmarks/infeasible-teacher-conflict.json"), "utf8"),
);
infeasible.schoolId = schoolId;
const infeasiblePreflight = await request("/optimization-jobs/preflight", {
  method: "POST",
  headers: { ...adminHeaders, "content-type": "application/json" },
  body: JSON.stringify(infeasible),
});
assert.equal(infeasiblePreflight.response.status, 201);
assert.equal(infeasiblePreflight.body.canSolve, false, JSON.stringify(infeasiblePreflight.body));
assert.ok(
  infeasiblePreflight.body.issues.some((issue) => issue.code === "TEACHER_SLOT_CAPACITY_EXCEEDED"),
  JSON.stringify(infeasiblePreflight.body),
);

const workbook = await readFile(resolve("backend/solver/examples/import-fixtures/valid.xlsx"));
const form = new FormData();
form.set("schoolId", schoolId);
form.set(
  "file",
  new Blob([workbook], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
  "valid.xlsx",
);
const preview = await request("/imports/preview", {
  method: "POST",
  headers: adminHeaders,
  body: form,
});
assert.equal(preview.response.status, 201, JSON.stringify(preview.body));
assert.equal(preview.body.status, "PREVIEWED");
assert.equal(preview.body.validRowCount, 3);
assert.equal(preview.body.errorCount, 0);
assert.equal(preview.body.canConfirm, true);
assert.ok(preview.body.importBatchId);
assert.ok(preview.body.importToken);

const confirmHeaders = { ...adminHeaders, "Idempotency-Key": preview.body.importToken };
const confirmed = await request(`/imports/${preview.body.importBatchId}/confirm`, {
  method: "POST",
  headers: confirmHeaders,
});
assert.equal(confirmed.response.status, 201, JSON.stringify(confirmed.body));
assert.equal(confirmed.body.status, "CONFIRMED");

const retried = await request(`/imports/${preview.body.importBatchId}/confirm`, {
  method: "POST",
  headers: confirmHeaders,
});
assert.equal(retried.response.status, 201, JSON.stringify(retried.body));
assert.deepEqual(retried.body, confirmed.body);

const publishedVersionId = "00000000-0000-0000-0000-000000000901";
const published = await request(`/schools/${schoolId}/schedule-versions/${publishedVersionId}`, {
  headers: viewerHeaders,
});
assert.equal(published.response.status, 200, JSON.stringify(published.body));
assert.equal(published.body.status, "PUBLISHED");

const exportResult = await request(
  `/schools/${schoolId}/schedule-versions/${publishedVersionId}/export.xlsx?view=all`,
  { headers: viewerHeaders },
);
assert.equal(exportResult.response.status, 200);
assert.match(exportResult.response.headers.get("x-export-contract-version") ?? "", /^SCHEDULE-EXPORT-1\.0\.0$/);
assert.ok(exportResult.body.byteLength > 0);

console.log(
  "P2.5-T04 runtime matrix passed: auth/scope, import preview-confirm-retry, feasible/infeasible preflight and published export.",
);
