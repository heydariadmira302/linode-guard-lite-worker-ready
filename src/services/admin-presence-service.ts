import type { Env } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { AdminPresenceRepository, type AdminPresencePolicyRecord, type AdminPresenceRecord } from "../storage/admin-presence-repository";
import { AuditRepository } from "../storage/audit-repository";
import { TelegramMessagesRepository } from "../storage/telegram-messages-repository";
import type { TelegramClientAction } from "../telegram/types";
import { AuditService } from "./audit-service";

export type AdminPresenceAction = "notify" | "shutdown_all_instances" | "delete_all_instances";

export type AdminPresenceContext = {
  requestId: string;
  actor: string;
  source: string;
};

export type PublicAdminPresencePolicy = Omit<AdminPresencePolicyRecord, "rules_json"> & {
  action: AdminPresenceAction;
  rules: { action: AdminPresenceAction };
};

export type AdminPresenceStatusResult = {
  status: AdminPresenceRecord;
  enabled_policy_count: number;
};

export type AdminPresenceCheckinResult = {
  status: AdminPresenceRecord;
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
      return { status };
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

  async createPolicy(input: { name?: unknown; scope?: unknown; action?: unknown; enabled?: unknown }, context: AdminPresenceContext): Promise<{ policy: PublicAdminPresencePolicy }> {
    const name = typeof input.name === "string" && input.name.trim() ? input.name.trim() : "管理员保活确认策略";
    const action = validateAction(input.action, context.requestId);
    validateScope(input.scope, context.requestId);
    const risk = riskForAction(action);
    try {
      const policy = toPublicPolicy(await this.repository.createPolicy({ name, enabled: input.enabled !== false, scope: "all", rules_json: JSON.stringify({ action }) }));
      await this.auditPolicyChange("admin_presence.policy.create", policy, risk, context, "success");
      return { policy };
    } catch (error) {
      await this.audit?.record({ request_id: context.requestId, actor: context.actor, source: context.source, action: "admin_presence.policy.create", target_type: "admin_presence_policy", target_id: null, risk_level: risk, result: "failed", error_code: error instanceof AppError ? error.code : ErrorCode.D1_ERROR, metadata_json: null });
      throw error;
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

  private async deletePresenceReminderMessages(): Promise<number> {
    if (!this.env.DB) return 0;
    const repository = new TelegramMessagesRepository(this.env.DB);
    const messages = await repository.listPendingByPurpose("admin_presence_reminder");
    let deleted = 0;
    for (const message of messages) {
      try {
        await sendTelegramAction(this.env.TELEGRAM_BOT_TOKEN, { method: "deleteMessage", payload: { chat_id: message.chat_id, message_id: Number(message.message_id) } });
        await repository.markDeleted(message.id);
        deleted += 1;
      } catch (error) {
        await repository.markDeleteFailed(message.id, error instanceof AppError ? error.code : ErrorCode.TELEGRAM_API_ERROR);
      }
    }
    return deleted;
  }
}

function validateScope(scope: unknown, requestId: string): void {
  if (scope !== undefined && scope !== "all") throw new AppError(ErrorCode.VALIDATION_ERROR, "Admin presence MVP only supports scope = all", requestId, 400);
}

function validateAction(action: unknown, requestId: string): AdminPresenceAction {
  if (action === "notify" || action === "shutdown_all_instances" || action === "delete_all_instances") return action;
  throw new AppError(ErrorCode.VALIDATION_ERROR, "Unsupported admin presence action", requestId, 400);
}

function riskForAction(action: AdminPresenceAction): "medium" | "high" | "critical" {
  if (action === "delete_all_instances") return "critical";
  if (action === "shutdown_all_instances") return "high";
  return "medium";
}

function toPublicPolicy(policy: AdminPresencePolicyRecord): PublicAdminPresencePolicy {
  const rules = parseRules(policy.rules_json);
  return { id: policy.id, name: policy.name, enabled: policy.enabled, scope: policy.scope, created_at: policy.created_at, updated_at: policy.updated_at, deleted_at: policy.deleted_at, action: rules.action, rules };
}

function parseRules(rulesJson: string): { action: AdminPresenceAction } {
  try {
    const parsed = JSON.parse(rulesJson) as { action?: AdminPresenceAction };
    if (parsed.action === "notify" || parsed.action === "shutdown_all_instances" || parsed.action === "delete_all_instances") return { action: parsed.action };
  } catch (_error) {
    // fall through to safe default
  }
  return { action: "notify" };
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

async function sendTelegramAction(botToken: string, action: TelegramClientAction): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${action.method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(action.payload)
  });
  if (!response.ok) throw new AppError(ErrorCode.TELEGRAM_API_ERROR, "Telegram API error", "req_telegram", 502);
}
