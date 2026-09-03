const { Pool } = require("pg");

const BASE_URL = process.env.P21_PROD_API_BASE_URL ?? "http://localhost:3011/api/v1";
const DATABASE_URL = process.env.P21_PROD_DATABASE_URL ?? "postgresql://scheduler:scheduler@127.0.0.1:55432/scheduler";
const TENANT_ID = process.env.P21_PROD_TENANT_ID ?? "34ec13a2-7f70-4325-8439-408885feca58";
const SCHOOL_ID = process.env.P21_PROD_SCHOOL_ID ?? "00000000-0000-0000-0000-000000000001";
const PERIOD_ID = process.env.P21_PROD_PERIOD_ID ?? "00000000-0000-0000-0000-000000000101";
const ACTOR_ID = process.env.P21_PROD_ACTOR_ID ?? "production-rule-bootstrap";
const LEGAL_SOURCE = "https://vanban.chinhphu.vn/?classid=1&docid=213113&orggroupid=4&pageid=27160";
const PERIOD_START = "2026-02-02";
const PROFILE_VERSION = "PROD-2026.1.0";
const adminHeaders = {
  "x-user-id": ACTOR_ID,
  "x-user-role": "ADMIN",
  "x-school-id": SCHOOL_ID,
  "x-tenant-id": TENANT_ID,
  "content-type": "application/json",
};

async function main() {
  async function request(path, options = {}) {
    const response = await fetch(`${BASE_URL}${path}`, options);
    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("json") ? await response.json() : await response.text();
    return { response, body };
  }

  function assertStatus(result, status, label) {
    if (result.response.status !== status) {
      throw new Error(`${label}: HTTP ${result.response.status} ${JSON.stringify(result.body)}`);
    }
  }

  async function cleanTestProfiles(pool) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const profiles = await client.query(
        `SELECT id::text, version, name, status, approval_state
         FROM rule_profiles
        WHERE school_id = $1 AND academic_period_id = $2
          AND (
            source_url LIKE 'https://schedule.local/%'
            OR version LIKE 'e2e-%'
            OR version LIKE 'p21-t14-%'
          )
        ORDER BY version`,
        [SCHOOL_ID, PERIOD_ID],
      );
      for (const profile of profiles.rows) {
        await client.query(
          `UPDATE rule_definitions
            SET approval_state = 'REVOKED', approved_by = NULL, approved_at = NULL,
                approval_reason = $2, updated_at = now()
          WHERE rule_profile_id = $1`,
          [profile.id, `Dọn dữ liệu kiểm thử trước khi nạp baseline production bởi ${ACTOR_ID}.`],
        );
        await client.query(
          `UPDATE rule_profiles
            SET status = 'RETIRED', approval_state = 'REVOKED', approved_by = NULL,
                approved_at = NULL, approval_reason = $2, updated_at = now()
          WHERE id = $1 AND school_id = $3 AND academic_period_id = $4`,
          [
            profile.id,
            `Dọn profile kiểm thử; snapshot lịch sử được giữ append-only bởi ${ACTOR_ID}.`,
            SCHOOL_ID,
            PERIOD_ID,
          ],
        );
        await client.query(
          `INSERT INTO audit_logs
           (tenant_id, school_id, action, entity_type, entity_id, actor_id, actor_role, correlation_id, metadata)
         VALUES ($1, $2, 'UPDATE', 'rule_profile', $3, $4, 'ADMIN', $5, $6::jsonb)`,
          [
            TENANT_ID,
            SCHOOL_ID,
            profile.id,
            ACTOR_ID,
            `production-rule-cleanup:${profile.id}`,
            JSON.stringify({
              operation: "RETIRE_TEST_RULE_PROFILE",
              previousStatus: profile.status,
              previousApprovalState: profile.approval_state,
              profileVersion: profile.version,
            }),
          ],
        );
      }

      const homeroom = await client.query(
        `UPDATE class_homeroom_assignments
          SET weekly_reduction_periods = 4, rule_code = 'TT_05_2025_D9_1', updated_at = now()
        WHERE school_id = $1 AND academic_period_id = $2
      RETURNING id`,
        [SCHOOL_ID, PERIOD_ID],
      );
      await client.query("COMMIT");
      return { retiredProfiles: profiles.rows, homeroomAssignments: homeroom.rowCount };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function loadProductionProfile() {
    const profileBody = {
      version: PROFILE_VERSION,
      name: "Baseline production THCS Bình Phú — định mức và GVCN",
      sourceUrl: LEGAL_SOURCE,
      sourceLocator: "Thông tư 05/2025/TT-BGDĐT; Điều 7 khoản 2, khoản 3 điểm a; Điều 9 khoản 1",
      effectiveFrom: PERIOD_START,
      scope: { schoolId: SCHOOL_ID, academicPeriodId: PERIOD_ID, schoolLevel: "THCS" },
    };
    const profileResult = await request(`/schools/${SCHOOL_ID}/academic-periods/${PERIOD_ID}/rule-profiles`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify(profileBody),
    });
    assertStatus(profileResult, 201, "create production profile");
    const profileId = profileResult.body.id;

    const rules = [
      {
        code: "RULE-TEACH-002",
        kind: "HARD",
        sourceLocator: "Điều 7 khoản 3 điểm a",
        scope: { schoolLevel: "THCS" },
        parameters: { weeklyNormBySchoolLevel: { THCS: 19, THPT: 17, THCS_THPT: 19 } },
      },
      {
        code: "RULE-TEACH-003",
        kind: "HARD",
        sourceLocator: "Điều 7 khoản 2; 35 tuần thực dạy, không gồm 2 tuần dự phòng",
        scope: { schoolLevel: "THCS" },
        parameters: { teachingWeeksForNorm: 35 },
      },
    ];

    const homeroomRows = await loadHomeroomRows();
    for (const homeroom of homeroomRows) {
      rules.push({
        code: `RULE-TEACH-REDUCTION-HOMEROOM-${homeroom.class_code}`,
        kind: "HARD",
        sourceLocator: "Điều 9 khoản 1 — giáo viên chủ nhiệm lớp giảm 04 tiết/tuần",
        scope: {
          actorType: "TEACHER",
          actorId: homeroom.teacher_id,
          resourceType: "TEACHER",
          resourceIds: [homeroom.teacher_id],
        },
        parameters: { roleCode: "HOMEROOM_TEACHER", reductionSessionsPerWeek: 4 },
      });
    }

    for (const rule of rules) {
      const result = await request(`/schools/${SCHOOL_ID}/rule-profiles/${profileId}/rules`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          ...rule,
          sourceUrl: LEGAL_SOURCE,
          effectiveFrom: PERIOD_START,
        }),
      });
      assertStatus(result, 201, `create ${rule.code}`);
    }

    const validation = await request(`/schools/${SCHOOL_ID}/rule-profiles/${profileId}/validation`, {
      headers: adminHeaders,
    });
    assertStatus(validation, 200, "validate production profile");
    if (!validation.body.valid || !validation.body.canCreateSnapshot) {
      throw new Error(`production profile không hợp lệ: ${JSON.stringify(validation.body)}`);
    }

    const snapshot = await request(`/schools/${SCHOOL_ID}/rule-profiles/${profileId}/snapshots`, {
      method: "POST",
      headers: adminHeaders,
    });
    assertStatus(snapshot, 201, "create production pending snapshot");
    if (snapshot.body.approvalState !== "PENDING_STAKEHOLDER") {
      throw new Error(`Snapshot production phải chờ stakeholder approve: ${JSON.stringify(snapshot.body)}`);
    }

    return {
      profile: profileResult.body,
      validation: validation.body,
      snapshot: snapshot.body,
      ruleCount: rules.length,
      homeroomCount: homeroomRows.length,
    };
  }

  async function loadHomeroomRows() {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      const result = await pool.query(
        `SELECT class.code AS class_code, assignment.teacher_id::text AS teacher_id
         FROM class_homeroom_assignments assignment
         JOIN classes class ON class.id = assignment.class_id AND class.school_id = assignment.school_id
        WHERE assignment.school_id = $1 AND assignment.academic_period_id = $2
        ORDER BY class.code`,
        [SCHOOL_ID, PERIOD_ID],
      );
      if (result.rows.length !== 55) throw new Error(`Cần 55 GVCN production, hiện có ${result.rows.length}.`);
      return result.rows;
    } finally {
      await pool.end();
    }
  }

  if (process.env.P21_PROD_CLEAN_CONFIRM !== "YES") {
    throw new Error("Để tránh dọn nhầm dữ liệu, đặt P21_PROD_CLEAN_CONFIRM=YES khi chạy bootstrap.");
  }

  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    const cleanup = await cleanTestProfiles(pool);
    const production = await loadProductionProfile();
    console.log(
      JSON.stringify(
        {
          operation: "P2.1 production rule baseline bootstrap",
          timestampUtc: new Date().toISOString(),
          schoolId: SCHOOL_ID,
          academicPeriodId: PERIOD_ID,
          legalSource: LEGAL_SOURCE,
          retiredTestProfiles: cleanup.retiredProfiles.map((profile) => profile.version),
          homeroomAssignmentsNormalized: cleanup.homeroomAssignments,
          productionProfileId: production.profile.id,
          productionProfileVersion: production.profile.version,
          productionSnapshotId: production.snapshot.snapshotId,
          productionSnapshotState: production.snapshot.approvalState,
          productionRuleCount: production.ruleCount,
          productionHomeroomReductionRules: production.homeroomCount,
          validation: production.validation,
          note: "Baseline đã nạp ở trạng thái PENDING_STAKEHOLDER; chưa tự phê duyệt production thay stakeholder trường.",
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
