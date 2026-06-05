import type { Env } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { AdminPresenceRepository, type AdminPresencePolicyRecord, type AdminPresenceRecord } from "../storage/admin-presence-repository";
import { AuditRepository } from "../storage/audit-repository";
import { AccountsRepository, isActiveAccountStatus } from "../storage/accounts-repository";
import { GroupsRepository } from "../storage/groups-repository";
import { TelegramMessagesRepository } from "../storage/telegram-messages-repository";
import { sendTelegramAction } from "../telegram/action-sender";
import type { TelegramClientAction } from "../telegram/types";
import { AuditService } from "./audit-service";

export type AdminPresenceAction = "notify" | "shutdown_all_instances" | "delete_all_instances";

export type AdminPresenceContext = {
  requestId: string;
  actor: string;
  source: string;
};

export type AdminPresenceRule = {
  rule_id: string;
  after_minutes: number;
  action: AdminPresenceAction;
};

export type AdminPresenceScopeType = "all" | "account" | "group";

export type PublicAdminPresencePolicy = Omit<AdminPresencePolicyRecord, "rules_json"> & {
  action: AdminPresenceAction;
  scope_type: AdminPresenceScopeType;
  account_id: number | null;
  group_id: number | null;
  remind_after_minutes: number | null;
  final_after_minutes: number | null;
  hourly_reminder_before_minutes: number | null;
  rules: AdminPresenceRule[];
};

export type AdminPresenceStatusResult = {
  status: AdminPresenceRecord;
  enabled_policy_count: number;
};

export type AdminPresenceCheckinResult = {
  status: AdminPresenceRecord;
  deleted_reminders: number;
};

export type AdminPresencePolicyListResult = {
  policies: PublicAdminPresencePolicy[];
  limit: number;
  offset: number;
};

export class AdminPresenceService {
  private readonly repository: AdminPresenceRepository;
  private readonly audit?: AuditService;

  constructor(private readonly env: Env, repository?: AdminPresenceRepository, audit?: AuditService) {
    if (!env.DB && !repository) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", "req_config", 500);
    this.repository = repository ?? new AdminPresenceRepository(env.DB as D1Database);
    this.audit = audit ?? (env.DB ? new AuditService(new AuditRepository(env.DB)) : undefined);
  }

  async getStatus(): Promise<AdminPresenceStatusResult> {
    const status = await this.repository.getStatus();
    const enabled_policy_count = await this.repository.countEnabledPolicies();
    return { status, enabled_policy_count };
  }

  async checkin(context: AdminPresenceContext): Promise<AdminPresenceCheckinResult> {
    try {
      const status = await this.repository.updateCheckin({
        last_checkin_at: new Date().toISOString(),
        last_checkin_actor: context.actor,
        current_cycle_id: createCycleId()
      });
      const deleted_reminders = await this.deletePresenceReminderMessages();
      await this.audit?.record({
        request_id: context.requestId,
        actor: context.actor,
        source: context.source,
        action: "admin_presence.checkin",
        target_type: "admin_presence",
        target_id: "1",
        risk_level: "medium",
        result: "success",
        error_code: null,
        metadata_json: JSON.stringify({ current_cycle_id: status.current_cycle_id, deleted_reminders })
      });
      return { status, deleted_reminders };
    } catch (error) {
      await this.audit?.record({
        request_id: context.requestId,
        actor: context.actor,
        source: context.source,
        action: "admin_presence.checkin",
        target_type: "admin_presence",
        target_id: "1",
        risk_level: "medium",
        result: "failed",
        error_code: error instanceof AppError ? error.code : ErrorCode.D1_ERROR,
        metadata_json: null
      });
      throw error;
    }
  }

  async createPolicy(input: { name?: unknown; scope?: unknown; account_id?: unknown; group_id?: unknown; action?: unknown; enabled?: unknown; remind_after_minutes?: unknown; final_after_minutes?: unknown; hourly_reminder_before_minutes?: unknown }, context: AdminPresenceContext): Promise<{ policy: PublicAdminPresencePolicy }> {
    const name = typeof input.name === "string" && input.name.trim() ? input.name.trim() : "管理员保活确认策略";
    const config = await this.resolvePolicyConfig(input, context.requestId);
    const risk = riskForAction(config.action);
    try {
      const policy = toPublicPolicy(await this.repository.createPolicy({ name, enabled: input.enabled !== false, scope: config.scope, rules_json: JSON.stringify({ rules: config.rules }) }));
      await this.auditPolicyChange("admin_presence.policy.create", policy, risk, context, "success");
      return { policy };
    } catch (error) {
      await this.audit?.record({ request_id: context.requestId, actor: context.actor, source: context.source, action: "admin_presence.policy.create", target_type: "admin_presence_policy", target_id: null, risk_level: risk, result: "failed", error_code: error instanceof AppError ? error.code : ErrorCode.D1_ERROR, metadata_json: null });
      throw error;
    }
  }

  async updatePolicy(id: number, input: { name?: unknown; scope?: unknown; account_id?: unknown; group_id?: unknown; action?: unknown; enabled?: unknown; remind_after_minutes?: unknown; final_after_minutes?: unknown; hourly_reminder_before_minutes?: unknown }, context: AdminPresenceContext): Promise<{ policy: PublicAdminPresencePolicy }> {
    const current = await this.getPolicy(id, context.requestId).then((data) => data.policy);
    const nextName = input.name === undefined ? current.name : normalizePolicyName(input.name, context.requestId);
    const nextEnabled = input.enabled === undefined ? Number(current.enabled) === 1 : input.enabled !== false;
    const touchesConfig = input.scope !== undefined || input.account_id !== undefined || input.group_id !== undefined || input.action !== undefined || input.remind_after_minutes !== undefined || input.final_after_minutes !== undefined || input.hourly_reminder_before_minutes !== undefined;
    const nextAction = input.action ?? current.action;
    const risk = riskForAction(validateAction(nextAction, context.requestId));
    try {
      if (!touchesConfig) {
        const policy = toPublicPolicy(await this.repository.updatePolicy(id, { name: nextName, enabled: nextEnabled }));
        await this.auditPolicyChange("admin_presence.policy.update", policy, risk, context, "success");
        return { policy };
      }
      const actionChanged = input.action !== undefined && input.action !== current.action;
      const configInput = {
        action: nextAction,
        scope: input.scope ?? current.scope,
        account_id: input.account_id ?? current.account_id ?? undefined,
        group_id: input.group_id ?? current.group_id ?? undefined,
        remind_after_minutes: input.remind_after_minutes ?? (Number(current.remind_after_minutes) > 0 ? current.remind_after_minutes : 12 * 60),
        final_after_minutes: input.final_after_minutes ?? (actionChanged ? 24 * 60 : Number(current.final_after_minutes) > 0 ? current.final_after_minutes : Number(current.remind_after_minutes) > 0 ? current.remind_after_minutes : 24 * 60),
        hourly_reminder_before_minutes: input.hourly_reminder_before_minutes ?? current.hourly_reminder_before_minutes ?? 0
      };
      const config = await this.resolvePolicyConfig(configInput, context.requestId);
      const policy = toPublicPolicy(await this.repository.updatePolicy(id, { name: nextName, enabled: nextEnabled, scope: config.scope, rules_json: JSON.stringify({ rules: config.rules }) }));
      await this.auditPolicyChange("admin_presence.policy.update", policy, riskForAction(config.action), context, "success");
      return { policy };
    } catch (error) {
      await this.audit?.record({ request_id: context.requestId, actor: context.actor, source: context.source, action: "admin_presence.policy.update", target_type: "admin_presence_policy", target_id: String(id), risk_level: risk, result: "failed", error_code: error instanceof AppError ? error.code : ErrorCode.D1_ERROR, metadata_json: null });
      throw error;
    }
  }

  async getPolicy(id: number, requestId = "req_policy_get"): Promise<{ policy: PublicAdminPresencePolicy }> {
    try {
      return { policy: toPublicPolicy(await this.repository.getPolicy(id)) };
    } catch {
      throw new AppError(ErrorCode.POLICY_NOT_FOUND, "Admin presence policy not found", requestId, 404);
    }
  }

  async listPolicies(params: { limit?: number; offset?: number } = {}): Promise<AdminPresencePolicyListResult> {
    const limit = normalizeLimit(params.limit);
    const offset = normalizeOffset(params.offset);
    const policies = (await this.repository.listPolicies({ limit, offset })).map(toPublicPolicy);
    return { policies, limit, offset };
  }

  async enablePolicy(id: number, context: AdminPresenceContext): Promise<{ policy: PublicAdminPresencePolicy }> {
    return this.changePolicy(id, context, "admin_presence.policy.enable", () => this.repository.enablePolicy(id));
  }

  async disablePolicy(id: number, context: AdminPresenceContext): Promise<{ policy: PublicAdminPresencePolicy }> {
    return this.changePolicy(id, context, "admin_presence.policy.disable", () => this.repository.disablePolicy(id));
  }

  async deletePolicy(id: number, context: AdminPresenceContext): Promise<{ policy: PublicAdminPresencePolicy }> {
    return this.changePolicy(id, context, "admin_presence.policy.delete", () => this.repository.deletePolicy(id));
  }

  private async changePolicy(id: number, context: AdminPresenceContext, actionName: string, fn: () => Promise<AdminPresencePolicyRecord>): Promise<{ policy: PublicAdminPresencePolicy }> {
    try {
      const policy = toPublicPolicy(await fn());
      await this.auditPolicyChange(actionName, policy, riskForAction(policy.action), context, "success");
      return { policy };
    } catch (error) {
      await this.audit?.record({ request_id: context.requestId, actor: context.actor, source: context.source, action: actionName, target_type: "admin_presence_policy", target_id: String(id), risk_level: "medium", result: "failed", error_code: ErrorCode.POLICY_NOT_FOUND, metadata_json: null });
      throw new AppError(ErrorCode.POLICY_NOT_FOUND, "Admin presence policy not found", context.requestId, 404);
    }
  }

  private async auditPolicyChange(action: string, policy: PublicAdminPresencePolicy, risk_level: string, context: AdminPresenceContext, result: "success" | "failed"): Promise<void> {
    await this.audit?.record({ request_id: context.requestId, actor: context.actor, source: context.source, action, target_type: "admin_presence_policy", target_id: String(policy.id), risk_level, result, error_code: null, metadata_json: JSON.stringify({ scope: policy.scope, action: policy.action }) });
  }

  private async resolvePolicyConfig(input: { scope?: unknown; account_id?: unknown; group_id?: unknown; action?: unknown; remind_after_minutes?: unknown; final_after_minutes?: unknown; hourly_reminder_before_minutes?: unknown }, requestId: string): Promise<{ action: AdminPresenceAction; scope: string; remindAfter: number; finalAfter: number; hourlyBefore: number; rules: AdminPresenceRule[] }> {
    const action = validateAction(input.action, requestId);
    const scope = await this.resolveScope(input, requestId);
    const remindAfter = normalizePolicyMinutes(input.remind_after_minutes, 12 * 60, "提醒时间", requestId);
    const finalAfter = action === "notify" ? remindAfter : normalizePolicyMinutes(input.final_after_minutes, 24 * 60, "最终动作时间", requestId);
    if (action !== "notify" && finalAfter <= remindAfter) throw new AppError(ErrorCode.VALIDATION_ERROR, "Final action time must be later than reminder time", requestId, 400);
    const rawHourlyBefore = action === "notify" ? 0 : normalizePolicyMinutes(input.hourly_reminder_before_minutes, 6 * 60, "最终动作前每小时提醒窗口", requestId, true);
    const hourlyBefore = action === "delete_all_instances" && rawHourlyBefore <= 0 ? 6 * 60 : rawHourlyBefore;
    return { action, scope, remindAfter, finalAfter, hourlyBefore, rules: buildRules(action, remindAfter, finalAfter, hourlyBefore) };
  }

  private async resolveScope(input: { scope?: unknown; account_id?: unknown; group_id?: unknown }, requestId: string): Promise<string> {
    const rawScope = input.scope ?? "all";
    if (rawScope === "all" || rawScope === undefined || rawScope === null) return "all";
    if (rawScope === "account" || (typeof rawScope === "string" && rawScope.startsWith("account:"))) {
      const accountId = rawScope === "account" ? Number(input.account_id) : Number(String(rawScope).split(":")[1]);
      if (!Number.isInteger(accountId) || accountId <= 0) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid account id", requestId, 400);
      if (!this.env.DB) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", requestId, 500);
      const account = await new AccountsRepository(this.env.DB).getById(accountId);
      if (!account || !isActiveAccountStatus(account.status)) throw new AppError(ErrorCode.ACCOUNT_NOT_FOUND, "Account not found", requestId, 404);
      return `account:${accountId}`;
    }
    if (rawScope === "group" || (typeof rawScope === "string" && rawScope.startsWith("group:"))) {
      const groupId = rawScope === "group" ? Number(input.group_id) : Number(String(rawScope).split(":")[1]);
      if (!Number.isInteger(groupId) || groupId <= 0) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid group id", requestId, 400);
      if (!this.env.DB) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", requestId, 500);
      await new GroupsRepository(this.env.DB).getById(groupId).catch(() => {
        throw new AppError(ErrorCode.VALIDATION_ERROR, "Group not found", requestId, 404);
      });
      return `group:${groupId}`;
    }
    throw new AppError(ErrorCode.VALIDATION_ERROR, "Unsupported admin presence scope", requestId, 400);
  }

  private async deletePresenceReminderMessages(): Promise<number> {
    if (!this.env.DB) return 0;
    const repository = new TelegramMessagesRepository(this.env.DB);
    let deleted = 0;
    while (true) {
      const messages = await repository.listPendingByPurpose("admin_presence_reminder", 100);
      if (messages.length === 0) break;
      for (const message of messages) {
        try {
          await sendTelegramAction(this.env.TELEGRAM_BOT_TOKEN, { method: "deleteMessage", payload: { chat_id: message.chat_id, message_id: Number(message.message_id) } });
          await repository.markDeleted(message.id);
          await repository.markDeletedByMessagePurpose({ chat_id: message.chat_id, message_id: message.message_id, purpose: "auto_delete" });
          deleted += 1;
        } catch (error) {
          await repository.markDeleteFailed(message.id, error instanceof AppError ? error.code : ErrorCode.TELEGRAM_API_ERROR);
        }
      }
      if (messages.length < 100) break;
    }
    return deleted;
  }
}

function validateAction(action: unknown, requestId: string): AdminPresenceAction {
  if (action === "notify" || action === "shutdown_all_instances" || action === "delete_all_instances") return action;
  throw new AppError(ErrorCode.VALIDATION_ERROR, "Unsupported admin presence action", requestId, 400);
}

function normalizePolicyName(name: unknown, requestId: string): string {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 64) throw new AppError(ErrorCode.VALIDATION_ERROR, "Policy name must be 1-64 characters", requestId, 400);
  return name.trim();
}

function riskForAction(action: AdminPresenceAction): "medium" | "high" | "critical" {
  if (action === "delete_all_instances") return "critical";
  if (action === "shutdown_all_instances") return "high";
  return "medium";
}

function toPublicPolicy(policy: AdminPresencePolicyRecord): PublicAdminPresencePolicy {
  const rules = parseRules(policy.rules_json);
  const finalRule = [...rules].reverse().find((rule) => rule.action !== "notify") ?? rules[0];
  const action = finalRule?.action ?? "notify";
  const notifyRules = rules.filter((rule) => rule.action === "notify").sort((a, b) => a.after_minutes - b.after_minutes);
  const remindRule = notifyRules[0];
  const finalAfter = finalRule?.after_minutes ?? null;
  const countdownStart = action === "notify" || !finalAfter ? null : notifyRules.find((rule) => rule.after_minutes > (remindRule?.after_minutes ?? 0))?.after_minutes ?? null;
  return {
    id: policy.id,
    name: policy.name,
    enabled: policy.enabled,
    scope: policy.scope,
    created_at: policy.created_at,
    updated_at: policy.updated_at,
    deleted_at: policy.deleted_at,
    action,
    ...parseScope(policy.scope),
    remind_after_minutes: remindRule?.after_minutes ?? null,
    final_after_minutes: finalAfter,
    hourly_reminder_before_minutes: countdownStart && finalAfter ? finalAfter - countdownStart : null,
    rules
  };
}

function parseScope(scope: string): { scope_type: AdminPresenceScopeType; account_id: number | null; group_id: number | null } {
  if (scope.startsWith("account:")) return { scope_type: "account", account_id: Number(scope.split(":")[1]), group_id: null };
  if (scope.startsWith("group:")) return { scope_type: "group", account_id: null, group_id: Number(scope.split(":")[1]) };
  return { scope_type: "all", account_id: null, group_id: null };
}

function parseRules(rulesJson: string): AdminPresenceRule[] {
  try {
    const parsed = JSON.parse(rulesJson) as { rules?: AdminPresenceRule[]; action?: AdminPresenceAction; after_minutes?: number };
    if (Array.isArray(parsed.rules)) {
      const rules = parsed.rules
        .filter((rule) => isAction(rule.action) && Number.isFinite(rule.after_minutes) && rule.after_minutes >= 0)
        .map((rule) => ({ rule_id: String(rule.rule_id || rule.action), after_minutes: Math.trunc(rule.after_minutes), action: rule.action }));
      if (rules.length > 0) return rules;
    }
    if (isAction(parsed.action)) return [{ rule_id: parsed.action, after_minutes: Math.max(0, Math.trunc(Number(parsed.after_minutes ?? 0))), action: parsed.action }];
  } catch (_error) {
    // fall through to safe default
  }
  return [{ rule_id: "notify", after_minutes: 0, action: "notify" }];
}

function buildRules(action: AdminPresenceAction, remindAfter: number, finalAfter: number, hourlyBefore: number): AdminPresenceRule[] {
  if (action === "notify") return [{ rule_id: "notify", after_minutes: remindAfter, action: "notify" }];
  const rules: AdminPresenceRule[] = [{ rule_id: "notify", after_minutes: remindAfter, action: "notify" }];
  const countdownStart = Math.max(remindAfter + 60, finalAfter - hourlyBefore);
  if (hourlyBefore > 0 && countdownStart < finalAfter) {
    for (let minute = countdownStart; minute < finalAfter; minute += 60) rules.push({ rule_id: `notify_countdown_${minute}`, after_minutes: minute, action: "notify" });
  }
  rules.push({ rule_id: action, after_minutes: finalAfter, action });
  return dedupeRules(rules);
}

function dedupeRules(rules: AdminPresenceRule[]): AdminPresenceRule[] {
  const seen = new Set<string>();
  return rules.filter((rule) => {
    const key = `${rule.action}:${rule.after_minutes}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizePolicyMinutes(value: unknown, fallback: number, label: string, requestId: string, allowZero = false): number {
  if (value === undefined || value === null || value === "") return fallback;
  const minutes = typeof value === "number" ? value : Number(value);
  const min = allowZero ? 0 : 1;
  if (!Number.isFinite(minutes) || minutes < min || minutes > 365 * 24 * 60) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${label} must be between ${min} minute and 365 days`, requestId, 400);
  }
  const normalized = Math.trunc(minutes);
  if (!allowZero && normalized % 5 !== 0) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${label} must use 5-minute increments`, requestId, 400);
  }
  if (allowZero && normalized !== 0 && normalized % 5 !== 0) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${label} must use 5-minute increments`, requestId, 400);
  }
  return normalized;
}

function isAction(action: unknown): action is AdminPresenceAction {
  return action === "notify" || action === "shutdown_all_instances" || action === "delete_all_instances";
}

function createCycleId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `presence_cycle_${suffix}`;
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return 20;
  return Math.min(100, Math.max(1, Math.trunc(limit ?? 20)));
}

function normalizeOffset(offset: number | undefined): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.max(0, Math.trunc(offset ?? 0));
}
