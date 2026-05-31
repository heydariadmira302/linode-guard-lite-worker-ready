import { AuditRepository, type AuditLogInput, type AuditLogListParams, type AuditLogRecord } from "../storage/audit-repository";
import { formatAuditAction, formatAuditActor, formatAuditError, formatAuditResult, formatAuditRiskLevel, formatAuditSource, formatAuditTargetType } from "../utils/audit-labels";

export interface AuditLogListResult {
  audit_logs: PublicAuditLogRecord[];
  limit: number;
  offset: number;
}

export type PublicAuditLogRecord = AuditLogRecord & {
  action_label: string;
  target_type_label: string;
  risk_level_label: string;
  result_label: string;
  error_message: string | null;
  actor_label: string;
  source_label: string;
};

export class AuditService {
  constructor(private readonly repository: AuditRepository) {}
  async record(input: AuditLogInput): Promise<void> { await this.repository.create(input); }
  async listAuditLogs(params: AuditLogListParams = {}): Promise<AuditLogListResult> {
    const limit = normalizeLimit(params.limit);
    const offset = normalizeOffset(params.offset);
    const audit_logs = (await this.repository.list({
      limit,
      offset,
      action: params.action,
      target_type: params.target_type,
      risk_level: params.risk_level,
      result: params.result,
      source: params.source
    })).map((log) => ({
      id: log.id,
      request_id: log.request_id,
      actor: log.actor,
      actor_label: formatAuditActor(log.actor),
      source: log.source,
      source_label: formatAuditSource(log.source),
      action: log.action,
      action_label: formatAuditAction(log.action),
      target_type: log.target_type,
      target_type_label: formatAuditTargetType(log.target_type),
      target_id: log.target_id,
      risk_level: log.risk_level,
      risk_level_label: formatAuditRiskLevel(log.risk_level),
      result: log.result,
      result_label: formatAuditResult(log.result),
      error_code: log.error_code,
      error_message: log.error_code ? formatAuditError(log.error_code) : null,
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
