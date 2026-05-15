import { AuditRepository, type AuditLogInput, type AuditLogListParams, type AuditLogRecord } from "../storage/audit-repository";

export interface AuditLogListResult {
  audit_logs: AuditLogRecord[];
  limit: number;
  offset: number;
}

export class AuditService {
  constructor(private readonly repository: AuditRepository) {}
  async record(input: AuditLogInput): Promise<void> { await this.repository.create(input); }
  async listAuditLogs(params: AuditLogListParams = {}): Promise<AuditLogListResult> {
    const limit = normalizeLimit(params.limit);
    const offset = normalizeOffset(params.offset);
    const audit_logs = (await this.repository.list({ limit, offset, action: params.action })).map((log) => ({
      id: log.id,
      request_id: log.request_id,
      actor: log.actor,
      source: log.source,
      action: log.action,
      target_type: log.target_type,
      target_id: log.target_id,
      risk_level: log.risk_level,
      result: log.result,
      error_code: log.error_code,
      created_at: log.created_at
    }));
    return { audit_logs, limit, offset };
  }
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return 20;
  return Math.min(100, Math.max(1, Math.trunc(limit ?? 20)));
}

function normalizeOffset(offset: number | undefined): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.max(0, Math.trunc(offset ?? 0));
}
