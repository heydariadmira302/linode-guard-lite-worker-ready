export type AuditLogInput = {
  request_id: string;
  actor: string;
  source: string;
  action: string;
  target_type: string;
  target_id?: string | null;
  risk_level: string;
  result: string;
  error_code?: string | null;
  metadata_json?: string | null;
};

export type AuditLogRecord = {
  id: number;
  request_id: string;
  actor: string;
  source: string;
  action: string;
  target_type: string;
  target_id: string | null;
  risk_level: string;
  result: string;
  error_code: string | null;
  created_at: string;
};

export type AuditLogListParams = {
  limit?: number;
  offset?: number;
  action?: string | null;
  target_type?: string | null;
  risk_level?: string | null;
  result?: string | null;
  source?: string | null;
};

export class AuditRepository {
  constructor(private readonly db: D1Database) {}

  async create(input: AuditLogInput): Promise<void> {
    await this.db.prepare(`INSERT INTO audit_logs
      (request_id, actor, source, action, target_type, target_id, risk_level, result, error_code, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(input.request_id, input.actor, input.source, input.action, input.target_type, input.target_id ?? null, input.risk_level, input.result, input.error_code ?? null, input.metadata_json ?? null)
      .run();
  }

  async list(params: AuditLogListParams = {}): Promise<AuditLogRecord[]> {
    const limit = clampLimit(params.limit);
    const offset = normalizeOffset(params.offset);
    const filters: string[] = [];
    const values: unknown[] = [];
    if (params.action) {
      filters.push("action = ?");
      values.push(params.action);
    }
    if (params.target_type) {
      filters.push("target_type = ?");
      values.push(params.target_type);
    }
    if (params.risk_level) {
      filters.push("risk_level = ?");
      values.push(params.risk_level);
    }
    if (params.result) {
      filters.push("result = ?");
      values.push(params.result);
    }
    if (params.source) {
      filters.push("source = ?");
      values.push(params.source);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const result = await this.db.prepare(`SELECT id, request_id, actor, source, action, target_type, target_id, risk_level, result, error_code, created_at
      FROM audit_logs
      ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?`)
      .bind(...values, limit, offset)
      .all<AuditLogRecord>();
    return result.results ?? [];
  }

  async cleanupBefore(cutoffIso: string): Promise<number> {
    const result = await this.db.prepare("DELETE FROM audit_logs WHERE created_at < ?").bind(cutoffIso).run();
    return Number(result.meta.changes ?? 0);
  }
}

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return 20;
  return Math.min(100, Math.max(1, Math.trunc(limit ?? 20)));
}

function normalizeOffset(offset: number | undefined): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.max(0, Math.trunc(offset ?? 0));
}
