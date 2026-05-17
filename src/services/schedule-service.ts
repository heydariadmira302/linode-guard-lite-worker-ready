import type { Env } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { AuditRepository } from "../storage/audit-repository";
import { SchedulesRepository, type PowerScheduleRecord } from "../storage/schedules-repository";
import { AuditService } from "./audit-service";
import { BatchService, type BatchAction, type BatchOperationResult } from "./batch-service";

export type ScheduleAction = "boot" | "shutdown";
export type ScheduleScope = "all" | "account" | "group";
export type ScheduleContext = { requestId: string; actor: string; source: string };
export type ScheduleListResult = { schedules: PowerScheduleRecord[]; limit: number; offset: number };
export type ScheduleBulkToggleResult = { affected: number; schedules: PowerScheduleRecord[] };
export type ScheduleRunItem = { schedule_id: number; name: string; result: "success" | "partial_failed" | "failed"; batch?: BatchOperationResult; error_code?: string };
export type ScheduleRunResult = { checked: number; executed: number; failed: number; result: "success" | "partial_failed" | "failed" | "skipped"; items: ScheduleRunItem[] };

export class ScheduleService {
  private readonly repository: SchedulesRepository;
  private readonly audit?: AuditService;

  constructor(private readonly env: Env, repository?: SchedulesRepository, audit?: AuditService) {
    if (!env.DB && !repository) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", "req_config", 500);
    this.repository = repository ?? new SchedulesRepository(env.DB as D1Database);
    this.audit = audit ?? (env.DB ? new AuditService(new AuditRepository(env.DB)) : undefined);
  }

  async createSchedule(input: Record<string, unknown>, context: ScheduleContext): Promise<{ schedule: PowerScheduleRecord }> {
    const action = validateAction(input.action, context.requestId);
    const scope = validateScope(input.scope, context.requestId);
    const accountId = scope === "account" ? validateEntityId(input.account_id, "account_id is required for account scope", context.requestId) : null;
    const groupId = scope === "group" ? validateEntityId(input.group_id, "group_id is required for group scope", context.requestId) : null;
    const cronExpr = validateCron(input.cron_expr, context.requestId);
    const name = typeof input.name === "string" && input.name.trim() ? input.name.trim() : `${action} schedule`;
    const timezone = typeof input.timezone === "string" && input.timezone.trim() ? input.timezone.trim() : this.env.APP_TIMEZONE ?? "Asia/Shanghai";
    const schedule = await this.repository.create({ name, enabled: input.enabled !== false, action, scope, account_id: accountId, group_id: groupId, cron_expr: cronExpr, timezone, next_run_at: computeNextRunAt(cronExpr, new Date()) });
    await this.auditSchedule(context, "schedule.create", schedule, "success", null);
    return { schedule };
  }

  async listSchedules(params: { limit?: number; offset?: number } = {}): Promise<ScheduleListResult> {
    const limit = normalizeLimit(params.limit);
    const offset = normalizeOffset(params.offset);
    const schedules = await this.repository.list({ limit, offset });
    return { schedules, limit, offset };
  }

  async enableSchedule(id: number, context: ScheduleContext): Promise<{ schedule: PowerScheduleRecord }> {
    const schedule = await this.change(id, context, "schedule.enable", () => this.repository.enable(id));
    return { schedule };
  }

  async disableSchedule(id: number, context: ScheduleContext): Promise<{ schedule: PowerScheduleRecord }> {
    const schedule = await this.change(id, context, "schedule.disable", () => this.repository.disable(id));
    return { schedule };
  }

  async deleteSchedule(id: number, context: ScheduleContext): Promise<{ schedule: PowerScheduleRecord }> {
    const schedule = await this.change(id, context, "schedule.delete", () => this.repository.delete(id));
    return { schedule };
  }

  async enableAllSchedules(context: ScheduleContext): Promise<ScheduleBulkToggleResult> {
    const result = await this.repository.enableAll();
    await this.auditScheduleBulk(context, "schedule.enable_all", result);
    return result;
  }

  async disableAllSchedules(context: ScheduleContext): Promise<ScheduleBulkToggleResult> {
    const result = await this.repository.disableAll();
    await this.auditScheduleBulk(context, "schedule.disable_all", result);
    return result;
  }

  async runDueSchedules(context: ScheduleContext, now = new Date()): Promise<ScheduleRunResult> {
    const due = await this.repository.listDue(now.toISOString());
    const items: ScheduleRunItem[] = [];
    for (const schedule of due) items.push(await this.runOne(schedule, context, now));
    const failed = items.filter((item) => item.result === "failed").length;
    const partialFailed = items.filter((item) => item.result === "partial_failed").length;
    const executed = items.length;
    const result = executed === 0 ? "skipped" : failed === executed ? "failed" : failed > 0 || partialFailed > 0 ? "partial_failed" : "success";
    return { checked: due.length, executed, failed, result, items };
  }

  private async runOne(schedule: PowerScheduleRecord, context: ScheduleContext, now: Date): Promise<ScheduleRunItem> {
    const started = now.toISOString();
    try {
      const batchService = new BatchService(this.env);
      const batch = schedule.scope === "account"
        ? await batchService.runAccountBatch(Number(schedule.account_id), schedule.action as BatchAction, context)
        : schedule.scope === "group"
          ? await batchService.runGroupBatch(Number(schedule.group_id), schedule.action as BatchAction, context)
          : await batchService.runAllAccountsBatch(schedule.action as BatchAction, context);
      await this.repository.createRun({ schedule_id: schedule.id, action: schedule.action, scope: schedule.scope, started_at: started, finished_at: new Date().toISOString(), status: batch.result, summary: JSON.stringify({ total: batch.total, success: batch.success, failed: batch.failed }), metadata_json: JSON.stringify({ result: batch.result }) });
      await this.repository.markRun(schedule.id, started, computeNextRunAt(schedule.cron_expr, now));
      return { schedule_id: schedule.id, name: schedule.name, result: batch.result === "failed" ? "failed" : batch.result, batch };
    } catch (error) {
      const code = error instanceof AppError ? error.code : ErrorCode.JOB_FAILED;
      await this.repository.createRun({ schedule_id: schedule.id, action: schedule.action, scope: schedule.scope, started_at: started, finished_at: new Date().toISOString(), status: "failed", error_code: code });
      await this.repository.markRun(schedule.id, started, computeNextRunAt(schedule.cron_expr, now));
      return { schedule_id: schedule.id, name: schedule.name, result: "failed", error_code: code };
    }
  }

  private async change(id: number, context: ScheduleContext, action: string, fn: () => Promise<PowerScheduleRecord>): Promise<PowerScheduleRecord> {
    try {
      const schedule = await fn();
      await this.auditSchedule(context, action, schedule, "success", null);
      return schedule;
    } catch {
      await this.audit?.record({ request_id: context.requestId, actor: context.actor, source: context.source, action, target_type: "power_schedule", target_id: String(id), risk_level: "medium", result: "failed", error_code: ErrorCode.SCHEDULE_NOT_FOUND, metadata_json: null });
      throw new AppError(ErrorCode.SCHEDULE_NOT_FOUND, "Schedule not found", context.requestId, 404);
    }
  }

  private async auditSchedule(context: ScheduleContext, action: string, schedule: PowerScheduleRecord, result: string, errorCode: string | null): Promise<void> {
    await this.audit?.record({ request_id: context.requestId, actor: context.actor, source: context.source, action, target_type: "power_schedule", target_id: String(schedule.id), risk_level: "medium", result, error_code: errorCode, metadata_json: JSON.stringify({ schedule_action: schedule.action, scope: schedule.scope, account_id: schedule.account_id, group_id: schedule.group_id }) });
  }

  private async auditScheduleBulk(context: ScheduleContext, action: string, result: ScheduleBulkToggleResult): Promise<void> {
    await this.audit?.record({ request_id: context.requestId, actor: context.actor, source: context.source, action, target_type: "power_schedule", target_id: null, risk_level: "medium", result: "success", error_code: null, metadata_json: JSON.stringify({ affected: result.affected, schedule_ids: result.schedules.map((schedule) => schedule.id) }) });
  }
}

function validateAction(value: unknown, requestId: string): ScheduleAction {
  if (value === "boot" || value === "shutdown") return value;
  throw new AppError(ErrorCode.VALIDATION_ERROR, "Power schedule only supports boot/shutdown", requestId, 400);
}
function validateScope(value: unknown, requestId: string): ScheduleScope {
  if (value === "all" || value === "account" || value === "group") return value;
  throw new AppError(ErrorCode.VALIDATION_ERROR, "Power schedule only supports all/account/group scope", requestId, 400);
}
function validateEntityId(value: unknown, message: string, requestId: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(ErrorCode.VALIDATION_ERROR, message, requestId, 400);
  return id;
}
function validateCron(value: unknown, requestId: string): string {
  if (typeof value !== "string" || value.trim().split(/\s+/).length !== 5) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid cron_expr", requestId, 400);
  return value.trim();
}
export function computeNextRunAt(cronExpr: string, from: Date): string {
  const schedule = parseCronExpression(cronExpr);
  const candidate = new Date(from.getTime());
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  const searchLimitMinutes = 5 * 366 * 24 * 60;
  for (let checked = 0; checked < searchLimitMinutes; checked += 1) {
    if (matchesCron(candidate, schedule)) return candidate.toISOString();
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }
  throw new AppError(ErrorCode.VALIDATION_ERROR, "Unable to compute next_run_at from cron_expr", "req_schedule", 400);
}

type CronSchedule = { minutes: Set<number>; hours: Set<number>; daysOfMonth: Set<number>; months: Set<number>; daysOfWeek: Set<number> };

function parseCronExpression(cronExpr: string): CronSchedule {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid cron_expr", "req_schedule", 400);
  return {
    minutes: parseCronField(parts[0], 0, 59),
    hours: parseCronField(parts[1], 0, 23),
    daysOfMonth: parseCronField(parts[2], 1, 31),
    months: parseCronField(parts[3], 1, 12),
    daysOfWeek: parseCronField(parts[4], 0, 7)
  };
}

function parseCronField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();
  for (const segment of field.split(",")) {
    if (!segment) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid cron_expr", "req_schedule", 400);
    const [rangePart, stepPart] = segment.split("/");
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step <= 0) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid cron_expr", "req_schedule", 400);
    let start: number;
    let end: number;
    if (rangePart === "*") {
      start = min;
      end = max;
    } else if (rangePart.includes("-")) {
      const [rawStart, rawEnd] = rangePart.split("-").map(Number);
      start = rawStart;
      end = rawEnd;
    } else {
      start = Number(rangePart);
      end = Number(rangePart);
    }
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < min || end > max || start > end) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid cron_expr", "req_schedule", 400);
    }
    for (let value = start; value <= end; value += step) values.add(value === 7 && min === 0 && max === 7 ? 0 : value);
  }
  return values;
}

function matchesCron(date: Date, schedule: CronSchedule): boolean {
  return schedule.minutes.has(date.getUTCMinutes())
    && schedule.hours.has(date.getUTCHours())
    && schedule.daysOfMonth.has(date.getUTCDate())
    && schedule.months.has(date.getUTCMonth() + 1)
    && schedule.daysOfWeek.has(date.getUTCDay());
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return 20;
  return Math.min(100, Math.max(1, Math.trunc(limit ?? 20)));
}

function normalizeOffset(offset: number | undefined): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.max(0, Math.trunc(offset ?? 0));
}
