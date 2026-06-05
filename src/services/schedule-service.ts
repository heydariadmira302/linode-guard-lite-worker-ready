import { LinodeClient } from "../clients/linode-client";
import { decryptLinodeToken } from "../crypto/token-crypto";
import type { Env } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { AccountsRepository, isActiveAccountStatus, type LinodeAccountRecord } from "../storage/accounts-repository";
import { AuditRepository } from "../storage/audit-repository";
import { GroupsRepository } from "../storage/groups-repository";
import { SchedulesRepository, type PowerScheduleRecord } from "../storage/schedules-repository";
import { AuditService } from "./audit-service";
import { BatchService, type BatchAction, type BatchOperationResult } from "./batch-service";
import { getLinodeTokenEncryptionKey } from "./runtime-secret-service";

export type ScheduleAction = "boot" | "shutdown" | "reboot";
export type ScheduleScope = "all" | "account" | "group" | "instance";
export type ScheduleContext = { requestId: string; actor: string; source: string };
export type ScheduleListResult = { schedules: PowerScheduleRecord[]; limit: number; offset: number };
export type ScheduleBulkToggleResult = { affected: number; schedules: PowerScheduleRecord[] };
export type ScheduleRunItem = { schedule_id: number; name: string; action: ScheduleAction; scope: ScheduleScope; account_id: number | null; group_id: number | null; instance_id: number | null; cron_expr: string; result: "success" | "partial_failed" | "failed" | "skipped"; batch?: BatchOperationResult; error_code?: string };
export type ScheduleRunResult = { checked: number; executed: number; failed: number; result: "success" | "partial_failed" | "failed" | "skipped"; items: ScheduleRunItem[] };
export type QuickPowerSettings = { boot: PowerScheduleRecord | null; shutdown: PowerScheduleRecord | null; scope: ScheduleScope; account_id: number | null; group_id: number | null; enabled: "all" | "partial" | "none" };

const QUICK_POWER_PRESET = "daily_power";
const QUICK_POWER_DEFAULTS = {
  boot: { hour: "08", minute: "50", cron: "50 8 * * *", label: "08:50" },
  shutdown: { hour: "23", minute: "05", cron: "5 23 * * *", label: "23:05" }
} as const;

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
    const accountId = scope === "account" || scope === "instance" ? validateEntityId(input.account_id, "account_id is required for account/instance scope", context.requestId) : null;
    const groupId = scope === "group" ? validateEntityId(input.group_id, "group_id is required for group scope", context.requestId) : null;
    const instanceId = scope === "instance" ? validateEntityId(input.instance_id, "instance_id is required for instance scope", context.requestId) : null;
    if (scope === "instance" && accountId === null) throw new AppError(ErrorCode.VALIDATION_ERROR, "account_id is required for instance scope", context.requestId, 400);
    await this.validateScheduleTarget(scope, accountId, groupId, instanceId, context.requestId);
    const cronExpr = validateCron(input.cron_expr, context.requestId);
    const name = typeof input.name === "string" && input.name.trim() ? input.name.trim() : `${action} schedule`;
    const timezone = typeof input.timezone === "string" && input.timezone.trim() ? input.timezone.trim() : this.env.APP_TIMEZONE ?? "Asia/Shanghai";
    const metadataJson = typeof input.metadata_json === "string" ? input.metadata_json : null;
    const schedule = await this.repository.create({ name, enabled: input.enabled !== false, action, scope, account_id: accountId, group_id: groupId, instance_id: instanceId, cron_expr: cronExpr, timezone, next_run_at: computeNextRunAt(cronExpr, new Date(), timezone), metadata_json: metadataJson });
    await this.auditSchedule(context, "schedule.create", schedule, "success", null);
    return { schedule };
  }


  async getSchedule(id: number, requestId = "req_schedule_get"): Promise<{ schedule: PowerScheduleRecord }> {
    try {
      return { schedule: await this.repository.getById(id) };
    } catch {
      throw new AppError(ErrorCode.SCHEDULE_NOT_FOUND, "Schedule not found", requestId, 404);
    }
  }

  async updateSchedule(id: number, input: Record<string, unknown>, context: ScheduleContext): Promise<{ schedule: PowerScheduleRecord }> {
    const current = await this.repository.getById(id).catch(() => {
      throw new AppError(ErrorCode.SCHEDULE_NOT_FOUND, "Schedule not found", context.requestId, 404);
    });
    const action = input.action === undefined ? current.action as ScheduleAction : validateAction(input.action, context.requestId);
    const scope = input.scope === undefined ? current.scope as ScheduleScope : validateScope(input.scope, context.requestId);
    const accountId = scope === "account" || scope === "instance"
      ? validateEntityId(input.account_id === undefined ? current.account_id : input.account_id, "account_id is required for account/instance scope", context.requestId)
      : null;
    const groupId = scope === "group"
      ? validateEntityId(input.group_id === undefined ? current.group_id : input.group_id, "group_id is required for group scope", context.requestId)
      : null;
    const instanceId = scope === "instance"
      ? validateEntityId(input.instance_id === undefined ? current.instance_id : input.instance_id, "instance_id is required for instance scope", context.requestId)
      : null;
    await this.validateScheduleTarget(scope, accountId, groupId, instanceId, context.requestId);
    const cronExpr = input.cron_expr === undefined ? current.cron_expr : validateCron(input.cron_expr, context.requestId);
    const timezone = typeof input.timezone === "string" && input.timezone.trim() ? input.timezone.trim() : current.timezone || this.env.APP_TIMEZONE || "Asia/Shanghai";
    const name = typeof input.name === "string" && input.name.trim() ? input.name.trim() : current.name;
    const enabled = input.enabled === undefined ? current.enabled : input.enabled !== false ? 1 : 0;
    const metadataJson = typeof input.metadata_json === "string" ? input.metadata_json : current.metadata_json;
    try {
      const schedule = await this.repository.update(id, {
        name,
        enabled,
        action,
        scope,
        account_id: accountId,
        group_id: groupId,
        instance_id: instanceId,
        cron_expr: cronExpr,
        timezone,
        next_run_at: Number(enabled) === 1 ? computeNextRunAt(cronExpr, new Date(), timezone) : current.next_run_at,
        metadata_json: metadataJson
      });
      await this.auditSchedule(context, "schedule.update", schedule, "success", null);
      return { schedule };
    } catch (error) {
      await this.audit?.record({ request_id: context.requestId, actor: context.actor, source: context.source, action: "schedule.update", target_type: "power_schedule", target_id: String(id), risk_level: "medium", result: "failed", error_code: error instanceof AppError ? error.code : ErrorCode.SCHEDULE_NOT_FOUND, metadata_json: null });
      throw error instanceof AppError ? error : new AppError(ErrorCode.SCHEDULE_NOT_FOUND, "Schedule not found", context.requestId, 404);
    }
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

  async getQuickPowerSettings(): Promise<QuickPowerSettings> {
    const schedules = await this.repository.list({ limit: 100, offset: 0 });
    const boot = schedules.find((schedule) => isQuickPowerSchedule(schedule, "boot")) ?? null;
    const shutdown = schedules.find((schedule) => isQuickPowerSchedule(schedule, "shutdown")) ?? null;
    const source = boot ?? shutdown;
    const enabledCount = [boot, shutdown].filter((schedule) => schedule && Number(schedule.enabled) === 1).length;
    return {
      boot,
      shutdown,
      scope: (source?.scope as ScheduleScope | undefined) ?? "all",
      account_id: source?.account_id ?? null,
      group_id: source?.group_id ?? null,
      enabled: enabledCount === 2 ? "all" : enabledCount === 0 ? "none" : "partial"
    };
  }

  async upsertQuickPowerTime(action: "boot" | "shutdown", hour: string, minute: string, context: ScheduleContext): Promise<{ schedule: PowerScheduleRecord }> {
    const settings = await this.getQuickPowerSettings();
    const current = action === "boot" ? settings.boot : settings.shutdown;
    const cronExpr = `${Number(minute)} ${Number(hour)} * * *`;
    const timeLabel = `${hour}:${minute}`;
    const input = {
      name: `默认每天 ${timeLabel} ${action === "boot" ? "开机" : "关机"}`,
      action,
      scope: settings.scope,
      account_id: settings.account_id,
      group_id: settings.group_id,
      instance_id: null,
      cron_expr: cronExpr,
      timezone: this.env.APP_TIMEZONE ?? "Asia/Shanghai",
      enabled: true,
      metadata_json: quickPowerMetadata(action)
    };
    if (current) return this.updateSchedule(current.id, input, context);
    return this.createSchedule(input, context);
  }

  async updateQuickPowerScope(input: { scope: "all" | "account" | "group"; account_id?: number | null; group_id?: number | null }, context: ScheduleContext): Promise<ScheduleBulkToggleResult> {
    await this.validateScheduleTarget(input.scope, input.account_id ?? null, input.group_id ?? null, null, context.requestId);
    const settings = await this.ensureQuickPowerDefaults(context, false);
    const targets = [settings.boot, settings.shutdown].filter(Boolean) as PowerScheduleRecord[];
    const updated: PowerScheduleRecord[] = [];
    for (const schedule of targets) {
      const result = await this.updateSchedule(schedule.id, { scope: input.scope, account_id: input.account_id ?? null, group_id: input.group_id ?? null, instance_id: null }, context);
      updated.push(result.schedule);
    }
    return { affected: updated.length, schedules: updated };
  }

  async setQuickPowerEnabled(enabled: boolean, context: ScheduleContext): Promise<ScheduleBulkToggleResult> {
    const settings = await this.ensureQuickPowerDefaults(context, enabled);
    const targets = [settings.boot, settings.shutdown].filter(Boolean) as PowerScheduleRecord[];
    const changed: PowerScheduleRecord[] = [];
    for (const schedule of targets) {
      if (enabled && Number(schedule.enabled) === 1) {
        changed.push(schedule);
      } else if (!enabled && Number(schedule.enabled) === 0) {
        changed.push(schedule);
      } else {
        const result = enabled ? await this.enableSchedule(schedule.id, context) : await this.disableSchedule(schedule.id, context);
        changed.push(result.schedule);
      }
    }
    return { affected: changed.length, schedules: changed };
  }

  private async ensureQuickPowerDefaults(context: ScheduleContext, enabled: boolean): Promise<QuickPowerSettings> {
    const settings = await this.getQuickPowerSettings();
    const created: Partial<Record<"boot" | "shutdown", PowerScheduleRecord>> = {};
    if (!settings.boot) {
      created.boot = (await this.createSchedule(defaultQuickPowerInput("boot", settings, enabled, this.env.APP_TIMEZONE ?? "Asia/Shanghai"), context)).schedule;
    }
    if (!settings.shutdown) {
      created.shutdown = (await this.createSchedule(defaultQuickPowerInput("shutdown", settings, enabled, this.env.APP_TIMEZONE ?? "Asia/Shanghai"), context)).schedule;
    }
    if (!created.boot && !created.shutdown) return settings;
    return this.getQuickPowerSettings();
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
    const executed = items.filter((item) => item.result !== "skipped").length;
    const result = executed === 0 ? "skipped" : failed === executed ? "failed" : failed > 0 || partialFailed > 0 ? "partial_failed" : "success";
    return { checked: due.length, executed, failed, result, items };
  }

  private async runOne(schedule: PowerScheduleRecord, context: ScheduleContext, now: Date): Promise<ScheduleRunItem> {
    const started = now.toISOString();
    const currentNextRunAt = schedule.next_run_at;
    const nextRunAt = computeNextRunAt(schedule.cron_expr, now, schedule.timezone);
    if (!currentNextRunAt || !(await this.repository.claimDueRun(schedule.id, currentNextRunAt, nextRunAt, started))) {
      return scheduleRunItemBase(schedule, "skipped", { error_code: "SCHEDULE_ALREADY_CLAIMED" });
    }
    try {
      const batchService = new BatchService(this.env);
      const batch = schedule.scope === "instance"
        ? await batchService.runAccountBatch(Number(schedule.account_id), schedule.action as BatchAction, context, { instanceIds: [Number(schedule.instance_id)] })
        : schedule.scope === "account"
          ? await batchService.runAccountBatch(Number(schedule.account_id), schedule.action as BatchAction, context)
          : schedule.scope === "group"
            ? await batchService.runGroupBatch(Number(schedule.group_id), schedule.action as BatchAction, context)
            : await batchService.runAllAccountsBatch(schedule.action as BatchAction, context);
      await this.repository.createRun({ schedule_id: schedule.id, action: schedule.action, scope: schedule.scope, instance_id: schedule.instance_id, started_at: started, finished_at: new Date().toISOString(), status: batch.result, summary: JSON.stringify({ total: batch.total, success: batch.success, failed: batch.failed }), metadata_json: JSON.stringify({ result: batch.result }) });
      return scheduleRunItemBase(schedule, batch.result === "failed" ? "failed" : batch.result, { batch });
    } catch (error) {
      const code = error instanceof AppError ? error.code : ErrorCode.JOB_FAILED;
      await this.repository.createRun({ schedule_id: schedule.id, action: schedule.action, scope: schedule.scope, instance_id: schedule.instance_id, started_at: started, finished_at: new Date().toISOString(), status: "failed", error_code: code });
      return scheduleRunItemBase(schedule, "failed", { error_code: code });
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

  private async validateScheduleTarget(scope: ScheduleScope, accountId: number | null, groupId: number | null, instanceId: number | null, requestId: string): Promise<void> {
    if (!this.env.DB && scope !== "all") throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", requestId, 500);
    if (scope === "account") {
      await this.getActiveAccount(Number(accountId), requestId);
      return;
    }
    if (scope === "group") {
      try {
        await new GroupsRepository(this.env.DB as D1Database).getById(Number(groupId));
      } catch {
        throw new AppError(ErrorCode.VALIDATION_ERROR, "Group not found", requestId, 404);
      }
      return;
    }
    if (scope === "instance") {
      const account = await this.getActiveAccount(Number(accountId), requestId);
      const token = await decryptLinodeToken(account.encrypted_token, await getLinodeTokenEncryptionKey(this.env));
      try {
        const instance = await new LinodeClient(token).getInstance(Number(instanceId), requestId);
        if (instance.id !== Number(instanceId)) throw new AppError(ErrorCode.INSTANCE_NOT_FOUND, "Instance not found in this account", requestId, 404);
      } catch (error) {
        if (error instanceof AppError && error.code !== ErrorCode.LINODE_API_ERROR) throw error;
        throw new AppError(ErrorCode.INSTANCE_NOT_FOUND, "Instance not found in this account", requestId, 404);
      }
    }
  }

  private async getActiveAccount(accountId: number, requestId: string): Promise<LinodeAccountRecord> {
    if (!Number.isInteger(accountId) || accountId <= 0) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid account id", requestId, 400);
    const account = await new AccountsRepository(this.env.DB as D1Database).getById(accountId);
    if (!account || !isActiveAccountStatus(account.status)) throw new AppError(ErrorCode.ACCOUNT_NOT_FOUND, "Account not found", requestId, 404);
    return account;
  }

  private async auditSchedule(context: ScheduleContext, action: string, schedule: PowerScheduleRecord, result: string, errorCode: string | null): Promise<void> {
    await this.audit?.record({ request_id: context.requestId, actor: context.actor, source: context.source, action, target_type: "power_schedule", target_id: String(schedule.id), risk_level: "medium", result, error_code: errorCode, metadata_json: JSON.stringify({ schedule_action: schedule.action, scope: schedule.scope, account_id: schedule.account_id, group_id: schedule.group_id, instance_id: schedule.instance_id }) });
  }

  private async auditScheduleBulk(context: ScheduleContext, action: string, result: ScheduleBulkToggleResult): Promise<void> {
    await this.audit?.record({ request_id: context.requestId, actor: context.actor, source: context.source, action, target_type: "power_schedule", target_id: null, risk_level: "medium", result: "success", error_code: null, metadata_json: JSON.stringify({ affected: result.affected, schedule_ids: result.schedules.map((schedule) => schedule.id) }) });
  }
}

function scheduleRunItemBase(schedule: PowerScheduleRecord, result: ScheduleRunItem["result"], extra: { batch?: BatchOperationResult; error_code?: string } = {}): ScheduleRunItem {
  return {
    schedule_id: schedule.id,
    name: schedule.name,
    action: schedule.action as ScheduleAction,
    scope: schedule.scope as ScheduleScope,
    account_id: schedule.account_id ?? null,
    group_id: schedule.group_id ?? null,
    instance_id: schedule.instance_id ?? null,
    cron_expr: schedule.cron_expr,
    result,
    ...extra
  };
}

function defaultQuickPowerInput(action: "boot" | "shutdown", settings: QuickPowerSettings, enabled: boolean, timezone: string): Record<string, unknown> {
  const preset = QUICK_POWER_DEFAULTS[action];
  return {
    name: `默认每天 ${preset.label} ${action === "boot" ? "开机" : "关机"}`,
    action,
    scope: settings.scope,
    account_id: settings.account_id,
    group_id: settings.group_id,
    instance_id: null,
    cron_expr: preset.cron,
    timezone,
    enabled,
    metadata_json: quickPowerMetadata(action)
  };
}

function isQuickPowerSchedule(schedule: PowerScheduleRecord, action: "boot" | "shutdown"): boolean {
  if (schedule.action !== action || schedule.scope === "instance") return false;
  try {
    const metadata = schedule.metadata_json ? JSON.parse(schedule.metadata_json) as { preset?: string; action?: string } : null;
    return metadata?.preset === QUICK_POWER_PRESET && metadata?.action === action;
  } catch {
    return false;
  }
}

function quickPowerMetadata(action: "boot" | "shutdown"): string {
  return JSON.stringify({ preset: QUICK_POWER_PRESET, action });
}

function validateAction(value: unknown, requestId: string): ScheduleAction {
  if (value === "boot" || value === "shutdown" || value === "reboot") return value;
  throw new AppError(ErrorCode.VALIDATION_ERROR, "Power schedule only supports boot/shutdown/reboot", requestId, 400);
}
function validateScope(value: unknown, requestId: string): ScheduleScope {
  if (value === "all" || value === "account" || value === "group" || value === "instance") return value;
  throw new AppError(ErrorCode.VALIDATION_ERROR, "Power schedule only supports all/account/group/instance scope", requestId, 400);
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
export function computeNextRunAt(cronExpr: string, from: Date, timezone = "UTC"): string {
  const schedule = parseCronExpression(cronExpr);
  const normalizedTimezone = validateTimezone(timezone);
  const candidate = new Date(from.getTime());
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  const searchLimitMinutes = 5 * 366 * 24 * 60;
  for (let checked = 0; checked < searchLimitMinutes; checked += 1) {
    if (matchesCron(candidate, schedule, normalizedTimezone)) return candidate.toISOString();
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

function matchesCron(date: Date, schedule: CronSchedule, timezone: string): boolean {
  const parts = getZonedDateParts(date, timezone);
  return schedule.minutes.has(parts.minute)
    && schedule.hours.has(parts.hour)
    && schedule.daysOfMonth.has(parts.day)
    && schedule.months.has(parts.month)
    && schedule.daysOfWeek.has(parts.weekday);
}

function validateTimezone(timezone: string): string {
  const normalized = timezone.trim() || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: normalized }).format(new Date(0));
    return normalized;
  } catch {
    throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid timezone", "req_schedule", 400);
  }
}

function getZonedDateParts(date: Date, timezone: string): { minute: number; hour: number; day: number; month: number; weekday: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short"
  });
  const values: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") values[part.type] = part.value;
  }
  return {
    minute: Number(values.minute),
    hour: Number(values.hour),
    day: Number(values.day),
    month: Number(values.month),
    weekday: weekdayToCron(values.weekday)
  };
}

function weekdayToCron(value: string): number {
  const key = value.toLowerCase().slice(0, 3);
  const map: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  return map[key] ?? 0;
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return 20;
  return Math.min(100, Math.max(1, Math.trunc(limit ?? 20)));
}

function normalizeOffset(offset: number | undefined): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.max(0, Math.trunc(offset ?? 0));
}
