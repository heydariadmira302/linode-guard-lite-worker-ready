import { LinodeClient, type LinodeInstance } from "../clients/linode-client";
import { decryptLinodeToken } from "../crypto/token-crypto";
import type { Env } from "../env";
import { getLinodeTokenEncryptionKey } from "./runtime-secret-service";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { AccountsRepository, isActiveAccountStatus, type LinodeAccountRecord } from "../storage/accounts-repository";
import { AuditRepository } from "../storage/audit-repository";
import { GroupsRepository } from "../storage/groups-repository";
import { AuditService } from "./audit-service";
import { AppSettingsService, type BootSafetyMode } from "./app-settings-service";
import { BotManagedInstancesRepository } from "../storage/bot-managed-instances-repository";

export type BatchAction = "boot" | "shutdown" | "reboot" | "delete";
export type BatchScope = "account" | "group" | "all";
export type BatchResultStatus = "success" | "partial_failed" | "failed";

export interface BatchServiceContext {
  requestId: string;
  actor: string;
  source: string;
}

export interface BatchOperationOptions {
  instanceIds?: number[];
  bootSafetyMode?: BootSafetyMode;
}

export interface BatchOperationItemResult {
  account_id: number;
  account_alias: string;
  instance_id: number;
  label: string;
  result: "success" | "failed" | "skipped";
  error_code?: string;
  message?: string;
}

export interface BatchOperationResult {
  action: BatchAction;
  scope: BatchScope;
  total: number;
  success: number;
  failed: number;
  result: BatchResultStatus;
  items: BatchOperationItemResult[];
}

interface BatchTarget {
  account: LinodeAccountRecord;
  token: string;
  instance: LinodeInstance;
}

export class BatchService {
  private readonly accounts: AccountsRepository;
  private readonly audit?: AuditService;
  private readonly managed?: BotManagedInstancesRepository;

  constructor(private readonly env: Env, accounts?: AccountsRepository, audit?: AuditService) {
    if (!env.DB && !accounts) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", "req_config", 500);
    this.accounts = accounts ?? new AccountsRepository(env.DB as D1Database);
    this.audit = audit ?? (env.DB ? new AuditService(new AuditRepository(env.DB)) : undefined);
    this.managed = env.DB ? new BotManagedInstancesRepository(env.DB) : undefined;
  }

  async runAccountBatch(accountId: number, action: BatchAction, context: BatchServiceContext, options: BatchOperationOptions = {}): Promise<BatchOperationResult> {
    this.validateAction(action, context.requestId);
    const account = await this.getActiveAccount(accountId, context.requestId);
    const token = await decryptLinodeToken(account.encrypted_token, await getLinodeTokenEncryptionKey(this.env));
    const instances = await this.resolveInstances(account.id, token, action, context.requestId, options);
    return await this.runTargets("account", action, context, instances.map((instance) => ({ account, token, instance })));
  }

  async runGroupBatch(groupId: number, action: BatchAction, context: BatchServiceContext, options: BatchOperationOptions = {}): Promise<BatchOperationResult> {
    this.validateAction(action, context.requestId);
    if (!Number.isInteger(groupId) || groupId <= 0) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid group id", context.requestId, 400);
    if (!this.env.DB) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", context.requestId, 500);
    await new GroupsRepository(this.env.DB).getById(groupId).catch(() => {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Group not found", context.requestId, 404);
    });
    const accounts = (await this.accounts.listActive()).filter((account) => Number(account.group_id ?? 1) === groupId);
    const targets = await this.resolveAccountTargets(accounts, action, context.requestId, options);
    return await this.runTargets("group", action, context, targets);
  }

  async runAllAccountsBatch(action: BatchAction, context: BatchServiceContext, options: BatchOperationOptions = {}): Promise<BatchOperationResult> {
    this.validateAction(action, context.requestId);
    const accounts = await this.accounts.listActive();
    const targets = await this.resolveAccountTargets(accounts, action, context.requestId, options);
    return await this.runTargets("all", action, context, targets);
  }

  private async resolveAccountTargets(accounts: LinodeAccountRecord[], action: BatchAction, requestId: string, options: BatchOperationOptions): Promise<BatchTarget[]> {
    const targets: BatchTarget[] = [];
    for (const account of accounts) {
      try {
        const token = await decryptLinodeToken(account.encrypted_token, await getLinodeTokenEncryptionKey(this.env));
        const instances = await this.resolveInstances(account.id, token, action, requestId, options);
        targets.push(...instances.map((instance) => ({ account, token, instance })));
      } catch (error) {
        const code = error instanceof AppError ? error.code : ErrorCode.LINODE_API_ERROR;
        await this.recordAudit({ requestId, actor: "batch:resolver", source: "batch" }, action, String(account.id), riskLevelForAction(action), "failed", code, {
          account_id: account.id,
          account_alias: account.alias,
          reason: "resolve_account_targets_failed"
        });
        targets.push({ account, token: "", instance: { id: 0, label: "账号级失败", status: "unknown", region: "", type: "", raw: { error_code: code } } });
      }
    }
    return targets;
  }

  private async runTargets(scope: BatchScope, action: BatchAction, context: BatchServiceContext, targets: BatchTarget[]): Promise<BatchOperationResult> {
    const concurrency = normalizeConcurrency(this.env.BATCH_CONCURRENCY);
    const items = await mapWithConcurrency(targets, concurrency, (target) => this.runOneTarget(target, action, context));
    const success = items.filter((item) => item.result === "success").length;
    const failed = items.filter((item) => item.result === "failed").length;
    const actionable = success + failed;
    return {
      action,
      scope,
      total: items.length,
      success,
      failed,
      result: failed === 0 ? "success" : actionable === 0 ? "success" : success === 0 ? "failed" : "partial_failed",
      items
    };
  }

  private async runOneTarget(target: BatchTarget, action: BatchAction, context: BatchServiceContext): Promise<BatchOperationItemResult> {
    const baseItem = {
      account_id: target.account.id,
      account_alias: target.account.alias,
      instance_id: target.instance.id,
      label: target.instance.label
    };
    if (target.instance.id === 0 && target.token === "") {
      const code = String((target.instance.raw as { error_code?: unknown } | undefined)?.error_code ?? ErrorCode.LINODE_API_ERROR);
      return { ...baseItem, result: "failed", error_code: code, message: mapBatchItemMessage(code) };
    }
    try {
      if (isProtectedForAction(target, action, await this.getProtectedInstances())) {
        await this.recordAudit(context, action, String(target.instance.id), riskLevelForAction(action), "skipped", ErrorCode.VALIDATION_ERROR, {
          account_id: target.account.id,
          account_alias: target.account.alias,
          label: target.instance.label,
          reason: "protected_instance"
        });
        return { ...baseItem, result: "skipped", error_code: ErrorCode.VALIDATION_ERROR, message: "已被保护规则跳过" };
      }
      const client = new LinodeClient(target.token);
      if (action === "boot") await client.bootInstance(target.instance.id, context.requestId);
      else if (action === "shutdown") await client.shutdownInstance(target.instance.id, context.requestId);
      else if (action === "reboot") await client.rebootInstance(target.instance.id, context.requestId);
      else await client.deleteInstance(target.instance.id, context.requestId);
      await this.recordManagedPowerState(target, action, context);
      await this.recordAudit(context, action, String(target.instance.id), riskLevelForAction(action), "success", null, {
        account_id: target.account.id,
        account_alias: target.account.alias,
        label: target.instance.label
      });
      return { ...baseItem, result: "success" };
    } catch (error) {
      const code = error instanceof AppError ? error.code : ErrorCode.LINODE_API_ERROR;
      await this.recordAudit(context, action, String(target.instance.id), riskLevelForAction(action), "failed", code, {
        account_id: target.account.id,
        account_alias: target.account.alias,
        label: target.instance.label
      });
      return { ...baseItem, result: "failed", error_code: code, message: mapBatchItemMessage(code) };
    }
  }

  private async resolveInstances(accountId: number, token: string, action: BatchAction, requestId: string, options: BatchOperationOptions = {}): Promise<LinodeInstance[]> {
    if (options.instanceIds !== undefined) this.validateInstanceIds(options.instanceIds, requestId);
    const instances = await new LinodeClient(token).listInstances(requestId);
    const scoped = options.instanceIds ? filterRequestedInstances(instances, options.instanceIds, requestId) : instances;
    if (action !== "boot") return scoped;
    const mode = options.bootSafetyMode ?? await this.getBootSafetyMode();
    if (mode === "all_offline") return scoped;
    const managed = this.managed;
    if (!managed) return scoped;
    const safe: LinodeInstance[] = [];
    for (const instance of scoped) {
      if (await managed.isBotManagedOffline(accountId, instance.id)) safe.push(instance);
    }
    return safe;
  }

  private validateAction(action: string, requestId: string): asserts action is BatchAction {
    if (!["boot", "shutdown", "reboot", "delete"].includes(action)) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid batch action", requestId, 400);
    }
  }

  private validateInstanceIds(instanceIds: number[], requestId: string): void {
    if (!Array.isArray(instanceIds) || instanceIds.some((id) => !Number.isInteger(id) || id <= 0)) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid instance_ids", requestId, 400);
    }
  }

  private async getActiveAccount(accountId: number, requestId: string): Promise<LinodeAccountRecord> {
    if (!Number.isInteger(accountId) || accountId <= 0) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid account id", requestId, 400);
    }
    const account = await this.accounts.getById(accountId);
    if (!account || !isActiveAccountStatus(account.status)) throw new AppError(ErrorCode.ACCOUNT_NOT_FOUND, "Account not found", requestId, 404);
    return account;
  }

  private async recordManagedPowerState(target: BatchTarget, action: BatchAction, context: BatchServiceContext): Promise<void> {
    if (!this.managed || (action !== "shutdown" && action !== "boot" && action !== "delete")) return;
    await this.managed.markAction({
      account_id: target.account.id,
      instance_id: target.instance.id,
      label: target.instance.label,
      last_action: action,
      actor: context.actor,
      source: context.source,
      request_id: context.requestId,
      metadata_json: JSON.stringify({ account_alias: target.account.alias })
    });
  }

  private async getBootSafetyMode(): Promise<BootSafetyMode> {
    if (!this.env.DB) return "all_offline";
    return (await new AppSettingsService(this.env).getSettings()).boot_safety_mode;
  }

  private async getProtectedInstances() {
    if (!this.env.DB) return [];
    return (await new AppSettingsService(this.env).getSettings()).protected_instances;
  }

  private async recordAudit(context: BatchServiceContext, action: BatchAction, targetId: string, riskLevel: string, result: string, errorCode: string | null, metadata: unknown): Promise<void> {
    await this.audit?.record({
      request_id: context.requestId,
      actor: context.actor,
      source: context.source,
      action: `batch.${action}`,
      target_type: "instance",
      target_id: targetId,
      risk_level: riskLevel,
      result,
      error_code: errorCode,
      metadata_json: JSON.stringify(metadata)
    });
  }
}

function riskLevelForAction(action: BatchAction): "medium" | "critical" {
  return action === "delete" ? "critical" : "medium";
}

function filterRequestedInstances(instances: LinodeInstance[], instanceIds: number[], requestId: string): LinodeInstance[] {
  const allowed = new Set(instanceIds);
  const matched = instances.filter((instance) => allowed.has(instance.id));
  if (matched.length !== allowed.size) {
    throw new AppError(ErrorCode.INSTANCE_NOT_FOUND, "One or more instance_ids were not found in this account", requestId, 404);
  }
  return matched;
}

function normalizeConcurrency(raw: string | undefined): number {
  const parsed = Number(raw ?? "5");
  if (!Number.isFinite(parsed)) return 5;
  return Math.max(1, Math.trunc(parsed));
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  });
  await Promise.all(workers);
  return results;
}

function isProtectedForAction(target: BatchTarget, action: BatchAction, rules: Array<{ account_id?: number | null; instance_id?: number | null; label?: string | null }>): boolean {
  if (action !== "shutdown" && action !== "delete") return false;
  return rules.some((rule) => {
    const accountMatches = !rule.account_id || Number(rule.account_id) === target.account.id;
    const instanceMatches = !rule.instance_id || Number(rule.instance_id) === target.instance.id;
    const labelMatches = !rule.label || rule.label === target.instance.label;
    return accountMatches && instanceMatches && labelMatches;
  });
}

function mapBatchItemMessage(code: string): string {
  if (code === ErrorCode.TOKEN_INVALID) return "Linode Token 无效";
  if (code === ErrorCode.TOKEN_PERMISSION_ERROR) return "Linode Token 权限不足";
  if (code === ErrorCode.RATE_LIMITED) return "Linode API 限流，请稍后重试";
  return "Linode API 请求失败";
}
