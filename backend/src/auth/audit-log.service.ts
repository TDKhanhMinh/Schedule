import { Inject, Injectable } from "@nestjs/common";
import type { Pool } from "pg";
import { PG_POOL } from "../database/database.module";
import type { Role } from "./auth.constants";

export const AUDIT_ACTIONS = ["CREATE", "UPDATE", "DELETE", "IMPORT", "SOLVE", "PUBLISH"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEventInput {
  schoolId: string;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  entityKey?: string | null;
  actorId: string;
  actorRole: Role;
  correlationId: string;
  metadata?: Record<string, unknown>;
}

interface AuditLogRow {
  id: string;
  school_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_key: string | null;
  actor_id: string;
  actor_role: string | null;
  correlation_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string | Date;
}

type Queryable = Pick<Pool, "query">;

@Injectable()
export class AuditLogService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async record(event: AuditEventInput) {
    return this.insert(this.pool, event);
  }

  async recordInTransaction(client: Queryable, event: AuditEventInput) {
    return this.insert(client, event);
  }

  private async insert(client: Queryable, event: AuditEventInput) {
    const entityId = this.isUuid(event.entityId) ? event.entityId : null;
    const entityKey = event.entityKey ?? (event.entityId && !entityId ? event.entityId : null);
    const result = await client.query<AuditLogRow>(
      `INSERT INTO audit_logs
        (school_id, action, entity_type, entity_id, entity_key, actor_id, actor_role, correlation_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       RETURNING id::text, school_id::text, action, entity_type, entity_id::text, entity_key,
                 actor_id, actor_role, correlation_id, metadata, created_at`,
      [
        event.schoolId,
        event.action,
        event.entityType,
        entityId,
        entityKey,
        event.actorId,
        event.actorRole,
        event.correlationId,
        JSON.stringify(this.sanitizeMetadata(event.metadata ?? {})),
      ],
    );
    return this.toAuditLog(result.rows[0]);
  }

  async listBySchool(schoolId: string, limit = 100) {
    const boundedLimit = Math.min(Math.max(Number.isFinite(limit) ? Math.trunc(limit) : 100, 1), 100);
    const result = await this.pool.query<AuditLogRow>(
      `SELECT id::text, school_id::text, action, entity_type, entity_id::text, entity_key,
              actor_id, actor_role, correlation_id, metadata, created_at
         FROM audit_logs
        WHERE school_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2`,
      [schoolId, boundedLimit],
    );
    return result.rows.map((row) => this.toAuditLog(row));
  }

  async listByScheduleVersion(schoolId: string, scheduleVersionId: string, limit = 100) {
    const boundedLimit = Math.min(Math.max(Number.isFinite(limit) ? Math.trunc(limit) : 100, 1), 100);
    const result = await this.pool.query<AuditLogRow>(
      `SELECT id::text, school_id::text, action, entity_type, entity_id::text, entity_key,
              actor_id, actor_role, correlation_id, metadata, created_at
        FROM audit_logs
        WHERE school_id = $1
          AND (
            entity_key = $2
            OR metadata ->> 'scheduleVersionId' = $2
            OR metadata ->> 'sourceVersionId' = $2
            OR metadata ->> 'rollbackTargetVersionId' = $2
          )
        ORDER BY created_at DESC, id DESC
        LIMIT $3`,
      [schoolId, scheduleVersionId, boundedLimit],
    );
    return result.rows.map((row) => this.toAuditLog(row));
  }

  private sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    const safe: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (/(password|secret|token|authorization|cookie|buffer|file|body|content)/i.test(key)) {
        safe[key] = "[REDACTED]";
      } else if (value !== undefined) {
        safe[key] = typeof value === "string" ? value.slice(0, 512) : value;
      }
    }
    return safe;
  }

  private isUuid(value: string | null | undefined): value is string {
    return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
  }

  private toAuditLog(row: AuditLogRow) {
    return {
      id: row.id,
      schoolId: row.school_id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      entityKey: row.entity_key,
      actorId: row.actor_id,
      actorRole: row.actor_role,
      correlationId: row.correlation_id,
      metadata: row.metadata,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }
}
