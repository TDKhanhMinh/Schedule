import assert from "node:assert/strict";
import { Pool } from "pg";

const baseUrl = process.env.P21_T14_API_BASE_URL ?? "http://localhost:3011/api/v1";
const tenantId = process.env.P21_T14_TENANT_ID ?? "34ec13a2-7f70-4325-8439-408885feca58";
const schoolId = process.env.P21_T14_SCHOOL_ID ?? "00000000-0000-0000-0000-000000000001";
const periodId = process.env.P21_T14_PERIOD_ID ?? "00000000-0000-0000-0000-000000000101";
const timestamp = new Date()
  .toISOString()
  .replace(/[-:.TZ]/g, "")
  .slice(0, 14);
const runPrefix = `p21-t14-${timestamp}`;
const adminHeaders = {
  "x-user-id": `${runPrefix}-admin`,
  "x-user-role": "ADMIN",
  "x-school-id": schoolId,
  "x-tenant-id": tenantId,
  "content-type": "application/json",
};
const viewerHeaders = {
  "x-user-id": `${runPrefix}-viewer`,
  "x-user-role": "VIEWER",
  "x-school-id": schoolId,
  "x-tenant-id": tenantId,
  "content-type": "application/json",
};

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("json") ? await response.json() : await response.text();
  return { response, body };
}

function assertStatus(result, status, message = "") {
  assert.equal(result.response.status, status, `${message} ${JSON.stringify(result.body)}`.trim());
}

async function loadPilotPayload(client) {
  const [counts, slots, lessons, teachers, classes] = await Promise.all([
    client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM classes WHERE school_id = $1 AND status = 'ACTIVE') AS classes,
         (SELECT COUNT(*)::int FROM teachers WHERE school_id = $1 AND status = 'ACTIVE') AS teachers,
         (SELECT COUNT(*)::int FROM subjects WHERE school_id = $1 AND status = 'ACTIVE') AS subjects,
         (SELECT COUNT(*)::int FROM rooms WHERE school_id = $1 AND status = 'ACTIVE') AS rooms,
         (SELECT COUNT(*)::int FROM class_homeroom_assignments WHERE school_id = $1 AND academic_period_id = $2) AS homerooms,
         (SELECT COUNT(*)::int FROM teacher_subject_grade_assignments WHERE school_id = $1 AND academic_period_id = $2 AND status = 'ACTIVE') AS professional_assignments,
         (SELECT COUNT(*)::int FROM lesson_requirements WHERE school_id = $1 AND academic_period_id = $2 AND status = 'ACTIVE') AS lessons`,
      [schoolId, periodId],
    ),
    client.query(
      `SELECT id::text, day, period, shift_code
         FROM time_slots
        WHERE school_id = $1 AND academic_period_id = $2
        ORDER BY day, CASE shift_code WHEN 'MORNING' THEN 1 ELSE 2 END, period`,
      [schoolId, periodId],
    ),
    client.query(
      `SELECT id::text, class_id::text, subject_id::text, teacher_id::text,
              required_sessions, fixed_slot_id::text, activity_type
         FROM lesson_requirements
        WHERE school_id = $1 AND academic_period_id = $2 AND status = 'ACTIVE'
        ORDER BY id`,
      [schoolId, periodId],
    ),
    client.query(`SELECT id::text FROM teachers WHERE school_id = $1 AND status = 'ACTIVE' ORDER BY code LIMIT 2`, [
      schoolId,
    ]),
    client.query(`SELECT id::text FROM classes WHERE school_id = $1 AND status = 'ACTIVE' ORDER BY code LIMIT 1`, [
      schoolId,
    ]),
  ]);

  assert.equal(counts.rows[0].classes, 55, JSON.stringify(counts.rows[0]));
  assert.equal(counts.rows[0].homerooms, 55, JSON.stringify(counts.rows[0]));
  assert.ok(counts.rows[0].lessons > 0, JSON.stringify(counts.rows[0]));
  assert.ok(slots.rows.length >= 60, `Thiếu slot pilot: ${slots.rows.length}`);
  assert.ok(teachers.rows.length >= 2, "Cần tối thiểu hai giáo viên để kiểm tra scope rule.");
  assert.ok(classes.rows.length >= 1, "Cần tối thiểu một lớp để kiểm tra rule planned.");

  return {
    counts: counts.rows[0],
    teachers: teachers.rows.map((row) => row.id),
    classes: classes.rows.map((row) => row.id),
    payload: {
      schemaVersion: "1.0",
      jobId: `${runPrefix}-55-classes`,
      schoolId,
      academicPeriodId: periodId,
      timeSlots: slots.rows.map((row) => ({
        id: row.id,
        day: row.day,
        period: row.period,
        ...(row.shift_code ? { shiftCode: row.shift_code } : {}),
      })),
      lessons: lessons.rows.map((row) => ({
        id: row.id,
        classId: row.class_id,
        subjectId: row.subject_id,
        teacherId: row.teacher_id,
        requiredSessions: row.required_sessions,
        ...(row.fixed_slot_id ? { fixedSlotId: row.fixed_slot_id } : {}),
      })),
      options: { timeLimitSeconds: 60 },
    },
  };
}

const client = new Pool({
  connectionString: process.env.P21_T14_DATABASE_URL ?? "postgresql://scheduler:scheduler@127.0.0.1:55432/scheduler",
});
await client.connect();

try {
  const health = await request("/health");
  assertStatus(health, 200, "health");

  const pilot = await loadPilotPayload(client);
  const catalog = await request(`/schools/${schoolId}/rule-catalog`, { headers: adminHeaders });
  assertStatus(catalog, 200, "catalog");
  assert.equal(catalog.body.catalogVersion, "RULE-CATALOG-1.0.0");
  for (const code of [
    "RULE-TEACHER-PREFERRED-OFF-DAYS",
    "RULE-TEACHER-MAX-WORKING-DAYS",
    "RULE-SCHEDULE-NO-INTERNAL-GAPS",
  ]) {
    assert.equal(
      catalog.body.ruleTypes.find((entry) => entry.code === code)?.implementationStatus,
      "SUPPORTED",
      `catalog ${code}`,
    );
  }

  const version = `${runPrefix}.0.0`;
  const profileBody = {
    version,
    name: `T14 regression ${runPrefix}`,
    sourceUrl: "https://schedule.local/evidence/p2.1-t14",
    sourceLocator: "P2.1-T14",
    effectiveFrom: "2026-02-02",
    scope: { schoolId, academicPeriodId: periodId, schoolLevel: "THCS" },
  };
  const forbiddenProfile = await request(`/schools/${schoolId}/academic-periods/${periodId}/rule-profiles`, {
    method: "POST",
    headers: viewerHeaders,
    body: JSON.stringify(profileBody),
  });
  assertStatus(forbiddenProfile, 403, "viewer write");

  const profile = await request(`/schools/${schoolId}/academic-periods/${periodId}/rule-profiles`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify(profileBody),
  });
  assertStatus(profile, 201, "create profile");
  const profileId = profile.body.id;

  const ruleBody = (teacherId, dayOfWeek, locator) => ({
    code: "RULE-TEACHER-PREFERRED-OFF-DAYS",
    kind: "SOFT",
    weight: 10,
    sourceUrl: profileBody.sourceUrl,
    sourceLocator: locator,
    effectiveFrom: "2026-02-02",
    scope: {
      schoolId,
      academicPeriodId: periodId,
      actorType: "TEACHER",
      actorId: teacherId,
      resourceType: "TEACHER",
      resourceIds: [teacherId],
    },
    parameters: { daysOfWeek: [dayOfWeek] },
  });
  const firstRule = await request(`/schools/${schoolId}/rule-profiles/${profileId}/rules`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify(ruleBody(pilot.teachers[0], 3, "P2.1-T14-R1")),
  });
  assertStatus(firstRule, 201, "create first rule");
  const secondRule = await request(`/schools/${schoolId}/rule-profiles/${profileId}/rules`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify(ruleBody(pilot.teachers[1], 4, "P2.1-T14-R2")),
  });
  assertStatus(secondRule, 201, "create second scoped rule");

  const duplicateRule = await request(`/schools/${schoolId}/rule-profiles/${profileId}/rules`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify(ruleBody(pilot.teachers[0], 3, "P2.1-T14-DUPLICATE")),
  });
  assertStatus(duplicateRule, 409, "duplicate rule");

  const plannedRule = await request(`/schools/${schoolId}/rule-profiles/${profileId}/rules`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      ...ruleBody(pilot.teachers[0], 5, "P2.1-T14-PLANNED"),
      code: "RULE-CLASS-MAIN-SHIFT",
      kind: "HARD",
      weight: null,
      scope: { schoolId, academicPeriodId: periodId, resourceType: "CLASS", resourceIds: [pilot.classes[0]] },
      parameters: { mainShiftCode: "MORNING", secondaryShiftCode: "AFTERNOON", allowSecondary: true },
    }),
  });
  assertStatus(plannedRule, 201, "save planned rule in draft");

  const invalidValidation = await request(`/schools/${schoolId}/rule-profiles/${profileId}/validation`, {
    headers: adminHeaders,
  });
  assertStatus(invalidValidation, 200, "planned rule validation");
  assert.equal(invalidValidation.body.valid, false, JSON.stringify(invalidValidation.body));
  assert.ok(
    invalidValidation.body.issues.some((issue) => issue.code === "RULE_NOT_SUPPORTED"),
    JSON.stringify(invalidValidation.body),
  );

  const removedPlannedRule = await request(
    `/schools/${schoolId}/rule-profiles/${profileId}/rules/${plannedRule.body.id}`,
    { method: "DELETE", headers: adminHeaders },
  );
  assertStatus(removedPlannedRule, 200, "remove planned rule");

  const validation = await request(`/schools/${schoolId}/rule-profiles/${profileId}/validation`, {
    headers: adminHeaders,
  });
  assertStatus(validation, 200, "validation");
  assert.equal(validation.body.valid, true, JSON.stringify(validation.body));
  assert.equal(validation.body.counts.total, 2);

  const pendingSnapshot = await request(`/schools/${schoolId}/rule-profiles/${profileId}/snapshots`, {
    method: "POST",
    headers: adminHeaders,
  });
  assertStatus(pendingSnapshot, 201, "pending snapshot");
  assert.equal(pendingSnapshot.body.approvalState, "PENDING_STAKEHOLDER");

  const forbiddenApproval = await request(
    `/schools/${schoolId}/rule-snapshots/${pendingSnapshot.body.snapshotId}/approve`,
    {
      method: "POST",
      headers: viewerHeaders,
      body: JSON.stringify({ approvalReason: "Viewer không được phê duyệt" }),
    },
  );
  assertStatus(forbiddenApproval, 403, "viewer approval");

  const approvedSnapshot = await request(
    `/schools/${schoolId}/rule-snapshots/${pendingSnapshot.body.snapshotId}/approve`,
    {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ approvalReason: "T14 regression approval" }),
    },
  );
  assertStatus(approvedSnapshot, 201, "approve snapshot");
  assert.equal(approvedSnapshot.body.approvalState, "APPROVED");
  assert.match(approvedSnapshot.body.snapshotHash, /^[0-9a-f]{64}$/);

  const active = await request(
    `/schools/${schoolId}/academic-periods/${periodId}/rule-snapshots/active?asOf=2026-09-03`,
    { headers: adminHeaders },
  );
  assertStatus(active, 200, "active snapshot");
  assert.equal(active.body.snapshot.snapshotId, approvedSnapshot.body.snapshotId);

  const outsideWindow = await request(
    `/schools/${schoolId}/academic-periods/${periodId}/rule-snapshots/active?asOf=2025-01-01`,
    { headers: adminHeaders },
  );
  assertStatus(outsideWindow, 200, "effective window");
  assert.equal(outsideWindow.body.resolved, false, JSON.stringify(outsideWindow.body));

  const preflight = await request("/optimization-jobs/preflight", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify(pilot.payload),
  });
  assertStatus(preflight, 201, "full pilot preflight");
  assert.equal(preflight.body.canSolve, true, JSON.stringify(preflight.body));

  const queued = await request("/optimization-jobs", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify(pilot.payload),
  });
  assertStatus(queued, 201, "full pilot enqueue");
  assert.equal(queued.body.ruleSnapshot.id, approvedSnapshot.body.snapshotId);
  assert.equal(queued.body.appliedRuleCount, 2);

  const idempotentReplay = await request("/optimization-jobs", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify(pilot.payload),
  });
  assertStatus(idempotentReplay, 201, "idempotent replay");
  assert.equal(idempotentReplay.body.runId, queued.body.runId);

  let status;
  for (let attempt = 0; attempt < 75; attempt += 1) {
    const result = await request(`/optimization-jobs/${encodeURIComponent(pilot.payload.jobId)}`, {
      headers: adminHeaders,
    });
    assertStatus(result, 200, "poll status");
    status = result.body;
    if (["OPTIMAL", "FEASIBLE", "INFEASIBLE", "FAILED", "UNKNOWN", "CANCELLED"].includes(status.state)) break;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  assert.ok(status, "Thiếu trạng thái run");
  assert.ok(["OPTIMAL", "FEASIBLE"].includes(status.state), JSON.stringify(status));
  assert.equal(status.ruleSnapshot.id, approvedSnapshot.body.snapshotId);
  assert.equal(status.ruleSnapshot.approvedBy, `${runPrefix}-admin`);
  assert.equal(status.ruleSnapshot.effectiveFrom, "2026-02-02");
  assert.equal(status.appliedRuleCount, 2);
  assert.equal(status.result.metadata.ruleSnapshotId, approvedSnapshot.body.snapshotId);
  assert.equal(status.result.metadata.ruleSnapshotHash, approvedSnapshot.body.snapshotHash);

  console.log(
    JSON.stringify(
      {
        contract: "P2.1-T14",
        timestampUtc: new Date().toISOString(),
        schoolId,
        academicPeriodId: periodId,
        snapshotId: approvedSnapshot.body.snapshotId,
        ruleSetVersion: approvedSnapshot.body.ruleSetVersion,
        snapshotHash: approvedSnapshot.body.snapshotHash,
        runId: queued.body.runId,
        resultStatus: status.state,
        appliedRuleCount: status.appliedRuleCount,
        counts: pilot.counts,
        checks: [
          "catalog",
          "RBAC write/approval",
          "scoped duplicate protection",
          "planned rule validation gate",
          "effective window",
          "preflight",
          "55-class enqueue/worker provenance",
          "idempotent replay",
        ],
        openGates: ["browser interactive QA", "stakeholder review"],
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}

process.exit(0);
