import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Pool } = pg;
const root = resolve(import.meta.dirname, "..");
const defaultOutput = resolve(root, "outputs", "P3.1-T02", "pilot-reconciliation-report.json");
const args = process.argv.slice(2);
const outputFlagIndex = args.indexOf("--output");
const outputPath = resolve(
  root,
  outputFlagIndex >= 0 && args[outputFlagIndex + 1] ? args[outputFlagIndex + 1] : defaultOutput,
);
const databaseUrl = process.env.DATABASE_URL ?? "postgresql://scheduler:scheduler@localhost:55432/scheduler";
const schoolId = process.env.PILOT_SCHOOL_ID ?? "00000000-0000-0000-0000-000000000001";
const periodId = process.env.PILOT_PERIOD_ID ?? "00000000-0000-0000-0000-000000000101";
const batchReportPath = resolve(root, "outputs", "P3.1-T01", "pilot-import-evidence.json");

if (existsSync(outputPath) && !args.includes("--force")) {
  throw new Error(`Report already exists: ${outputPath}. Use --force for an intentional refresh.`);
}

const batchEvidence = JSON.parse(readFileSync(batchReportPath, "utf8"));
const batchId = batchEvidence.serverEvidence.preview.batchId;
const sourceChecksum = batchEvidence.source.sha256;
const pool = new Pool({ connectionString: databaseUrl });
const query = async (text, values = []) => (await pool.query(text, values)).rows;

try {
  const [school] = await query("SELECT id, code, name, timezone, status FROM schools WHERE id = $1", [schoolId]);
  const [period] = await query(
    "SELECT id, name, academic_year, term_code, starts_on, ends_on, status FROM academic_periods WHERE school_id = $1 AND id = $2",
    [schoolId, periodId],
  );
  const [masterCounts] = await query(
    `SELECT
       (SELECT count(*)::int FROM classes WHERE school_id = $1 AND status = 'ACTIVE') AS active_classes,
       (SELECT count(*)::int FROM classes WHERE school_id = $1) AS all_classes,
       (SELECT count(*)::int FROM classes WHERE school_id = $1 AND status = 'ARCHIVED') AS archived_classes,
       (SELECT count(*)::int FROM teachers WHERE school_id = $1 AND status = 'ACTIVE') AS active_teachers,
       (SELECT count(*)::int FROM teachers WHERE school_id = $1) AS all_teachers,
       (SELECT count(*)::int FROM teachers WHERE school_id = $1 AND status = 'ARCHIVED') AS archived_teachers,
       (SELECT count(*)::int FROM subjects WHERE school_id = $1 AND status = 'ACTIVE') AS active_subjects,
       (SELECT count(*)::int FROM subjects WHERE school_id = $1) AS all_subjects,
       (SELECT count(*)::int FROM subjects WHERE school_id = $1 AND status = 'ARCHIVED') AS archived_subjects,
       (SELECT count(*)::int FROM rooms WHERE school_id = $1 AND status = 'ACTIVE') AS active_rooms,
       (SELECT count(*)::int FROM rooms WHERE school_id = $1) AS all_rooms,
       (SELECT count(*)::int FROM rooms WHERE school_id = $1 AND status = 'ARCHIVED') AS archived_rooms,
       (SELECT count(*)::int FROM time_slots WHERE school_id = $1) AS time_slots`,
    [schoolId],
  );
  const [batch] = await query(
    `SELECT id, original_filename, template_version, file_checksum, status, row_count, valid_row_count,
            error_count, created_by, created_at, confirmed_by, confirmed_at
       FROM import_batches WHERE id = $1 AND school_id = $2`,
    [batchId, schoolId],
  );
  const [batchDemand] = await query(
    `SELECT count(*)::int AS rows,
            coalesce(sum((payload->>'requiredSessions')::int), 0)::int AS required_sessions,
            count(*) FILTER (WHERE errors = '[]'::jsonb)::int AS error_free_rows,
            count(*) FILTER (WHERE payload->>'academicPeriodId' IS NULL)::int AS rows_without_period
       FROM import_rows WHERE batch_id = $1`,
    [batchId],
  );
  const batchReferences = await query(
    `SELECT row_number, payload->>'classId' AS class_id, payload->>'subjectId' AS subject_id,
            payload->>'teacherId' AS teacher_id, payload->>'roomId' AS room_id,
            (payload->>'requiredSessions')::int AS required_sessions
       FROM import_rows WHERE batch_id = $1 ORDER BY row_number`,
    [batchId],
  );
  const batchWorkload = await query(
    `SELECT t.code AS teacher_code, t.display_name,
            count(DISTINCT payload->>'classId')::int AS class_count,
            count(DISTINCT payload->>'subjectId')::int AS subject_count,
            coalesce(sum((payload->>'requiredSessions')::int), 0)::int AS required_sessions,
            count(*)::int AS lesson_rows
       FROM import_rows i
       JOIN teachers t ON t.id = (i.payload->>'teacherId')::uuid
      WHERE i.batch_id = $1
      GROUP BY t.id, t.code, t.display_name
      ORDER BY t.code`,
    [batchId],
  );
  const [lessonSummary] = await query(
    `SELECT count(*)::int AS rows,
            count(DISTINCT (class_id, subject_id, teacher_id))::int AS distinct_natural_keys,
            coalesce(sum(required_sessions), 0)::int AS required_sessions,
            count(*) FILTER (WHERE academic_period_id IS NULL)::int AS rows_without_period,
            count(*) FILTER (WHERE room_id IS NULL)::int AS rows_without_room
       FROM lesson_requirements WHERE school_id = $1 AND status = 'ACTIVE'`,
    [schoolId],
  );
  const duplicateNaturalKeys = await query(
    `SELECT c.code AS class_code, sub.code AS subject_code, t.code AS teacher_code,
            count(*)::int AS occurrences, coalesce(sum(l.required_sessions), 0)::int AS required_sessions,
            count(*) FILTER (WHERE l.academic_period_id IS NULL)::int AS rows_without_period
       FROM lesson_requirements l
       JOIN classes c ON c.id = l.class_id
       JOIN subjects sub ON sub.id = l.subject_id
       JOIN teachers t ON t.id = l.teacher_id
      WHERE l.school_id = $1 AND l.status = 'ACTIVE'
      GROUP BY c.code, sub.code, t.code
      HAVING count(*) > 1
      ORDER BY occurrences DESC, class_code, subject_code, teacher_code`,
    [schoolId],
  );
  const teacherWorkload = await query(
    `SELECT t.code AS teacher_code, t.display_name,
            count(DISTINCT l.class_id)::int AS class_count,
            count(DISTINCT l.subject_id)::int AS subject_count,
            coalesce(sum(l.required_sessions), 0)::int AS required_sessions,
            count(*)::int AS lesson_rows
       FROM teachers t
       LEFT JOIN lesson_requirements l
         ON l.teacher_id = t.id AND l.school_id = t.school_id AND l.status = 'ACTIVE'
      WHERE t.school_id = $1 AND t.status = 'ACTIVE'
      GROUP BY t.id, t.code, t.display_name
      ORDER BY t.code`,
    [schoolId],
  );
  const [publishedSchedule] = await query(
    `SELECT sv.id, sv.version_number, sv.status, sv.rule_set_version, sv.rule_snapshot_hash,
            count(sa.id)::int AS assignment_count
       FROM schedule_versions sv
       LEFT JOIN schedule_assignments sa ON sa.schedule_version_id = sv.id
      WHERE sv.school_id = $1 AND sv.status = 'PUBLISHED'
      GROUP BY sv.id
      ORDER BY sv.version_number DESC
      LIMIT 1`,
    [schoolId],
  );
  const optimizationRuns = await query(
    `SELECT id, job_id, status, attempts, requested_at, completed_at,
            rule_set_version, rule_snapshot_hash, payload_checksum, output_checksum
       FROM optimization_runs WHERE school_id = $1 ORDER BY requested_at DESC LIMIT 10`,
    [schoolId],
  );
  const ruleProfiles = await query(
    `SELECT p.id, p.version, p.name, p.status, p.approval_state, p.source_url, p.source_locator,
            p.effective_from, p.effective_to, count(d.id)::int AS rule_count,
            count(d.id) FILTER (WHERE d.kind = 'HARD')::int AS hard_rule_count,
            count(d.id) FILTER (WHERE d.kind = 'SOFT')::int AS soft_rule_count
       FROM rule_profiles p
       LEFT JOIN rule_definitions d ON d.rule_profile_id = p.id
      WHERE p.school_id = $1 AND (p.academic_period_id = $2 OR p.academic_period_id IS NULL)
      GROUP BY p.id
      ORDER BY p.created_at`,
    [schoolId, periodId],
  );
  const ruleSnapshots = await query(
    `SELECT id, rule_set_version, profile_version, register_version, approval_state,
            source_url, source_locator, effective_from, effective_to, snapshot_hash, captured_at
       FROM rule_set_snapshots WHERE school_id = $1 ORDER BY captured_at DESC`,
    [schoolId],
  );
  const availability = await query(
    `SELECT d.code, d.kind, d.approval_state, d.source_locator, d.parameters
       FROM rule_definitions d
       JOIN rule_profiles p ON p.id = d.rule_profile_id
      WHERE p.school_id = $1 AND (p.academic_period_id = $2 OR p.academic_period_id IS NULL)
      ORDER BY d.code`,
    [schoolId, periodId],
  );

  const exceptions = [
    {
      id: "REC-001",
      severity: duplicateNaturalKeys.length > 0 ? "BLOCKER" : "INFO",
      finding: "Duplicate lesson natural keys in active local snapshot",
      evidence: { duplicateKeyCount: duplicateNaturalKeys.length, examples: duplicateNaturalKeys.slice(0, 10) },
      owner: "Pilot data steward",
      action: "Quarantine repeated dev imports and confirm one approved batch/period before solve",
      status: duplicateNaturalKeys.length > 0 ? "OPEN" : "CLEAR",
    },
    {
      id: "REC-002",
      severity: Number(lessonSummary.rows_without_period) > 0 ? "BLOCKER" : "INFO",
      finding: "Lesson rows without academic period",
      evidence: { rowsWithoutPeriod: Number(lessonSummary.rows_without_period) },
      owner: "Product/API owner",
      action: "Bind the approved pilot snapshot to an academic period before production solve",
      status: Number(lessonSummary.rows_without_period) > 0 ? "OPEN" : "CLEAR",
    },
    {
      id: "REC-003",
      severity: ruleProfiles.some((profile) => profile.approval_state !== "APPROVED" || profile.rule_count === 0)
        ? "BLOCKER"
        : "INFO",
      finding: "Rule profile/source is not approved and complete",
      evidence: { profiles: ruleProfiles, snapshots: ruleSnapshots, availabilityRuleCount: availability.length },
      owner: "School coordinator / rule approver",
      action: "Confirm legal/school rule source, effective period, hard/soft rules and stakeholder approval",
      status: ruleProfiles.some((profile) => profile.approval_state !== "APPROVED" || profile.rule_count === 0)
        ? "OPEN"
        : "CLEAR",
    },
    {
      id: "REC-004",
      severity:
        !publishedSchedule || Number(publishedSchedule.assignment_count) < Number(batchDemand.required_sessions)
          ? "BLOCKER"
          : "INFO",
      finding: "Published schedule assignment coverage versus imported demand",
      evidence: {
        importedRequiredSessions: Number(batchDemand.required_sessions),
        publishedAssignmentCount: Number(publishedSchedule?.assignment_count ?? 0),
        publishedSchedule: publishedSchedule ?? null,
      },
      owner: "Solver/pilot coordinator",
      action: "Do not evaluate solver quality or sign off until the approved snapshot is solved and reconciled",
      status:
        !publishedSchedule || Number(publishedSchedule.assignment_count) < Number(batchDemand.required_sessions)
          ? "OPEN"
          : "CLEAR",
    },
  ];

  const canonical = {
    school,
    period,
    sourceChecksum,
    batchId,
    masterCounts,
    batch,
    batchDemand,
    batchReferences,
    batchWorkload,
    lessonSummary,
    duplicateNaturalKeys,
    teacherWorkload,
    publishedSchedule: publishedSchedule ?? null,
    optimizationRuns,
    ruleProfiles,
    ruleSnapshots,
    availability,
    exceptions,
  };
  const snapshotHash = createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
  const report = {
    task: "P3.1-T02",
    generatedAt: new Date().toISOString(),
    snapshotHash,
    environment: "local Docker/dev; read-only reconciliation",
    schoolId,
    academicPeriodId: periodId,
    source: {
      workbookEvidence: "outputs/P3.1-T01/pilot-import-evidence.json",
      workbookChecksum: sourceChecksum,
      importBatchId: batchId,
    },
    counts: { master: masterCounts, importedBatch: batchDemand, activeLessonSnapshot: lessonSummary },
    workload: { importedBatch: batchWorkload, activeSnapshot: teacherWorkload },
    rules: { profiles: ruleProfiles, snapshots: ruleSnapshots, availabilityDefinitions: availability },
    schedule: { published: publishedSchedule ?? null, recentOptimizationRuns: optimizationRuns },
    exceptions,
    gate: {
      snapshotReconciled: exceptions.every((exception) => exception.status === "CLEAR"),
      solveAllowed: exceptions.every((exception) => exception.status === "CLEAR"),
      pilotApproved: false,
      productionApproved: false,
      openOwners: [
        ...new Set(exceptions.filter((exception) => exception.status === "OPEN").map((exception) => exception.owner)),
      ],
    },
    limitations: [
      "Current local database includes historical/dev runtime imports and is not a school-approved baseline.",
      "Teacher target workload and rule approval cannot be inferred from code or local fixture data.",
      "No solve or production approval is claimed while blocker exceptions remain open.",
    ],
  };
  mkdirSync(resolve(outputPath, ".."), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        outputPath,
        snapshotHash,
        exceptionCount: exceptions.length,
        openExceptions: exceptions.filter((item) => item.status === "OPEN").length,
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
}
