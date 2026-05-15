import { LinodeClient, type LinodeInstance } from "../clients/linode-client";
import { decryptLinodeToken } from "../crypto/token-crypto";
import type { Env } from "../env";
import { getLinodeTokenEncryptionKey } from "./runtime-secret-service";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { AccountsRepository, type LinodeAccountRecord } from "../storage/accounts-repository";
import { AuditRepository } from "../storage/audit-repository";
import { AuditService } from "./audit-service";

export type BatchAction = "boot" | "shutdown" | "delete";
export type BatchScope = "account" | "all";
export type BatchResultStatus = "success" | "partial_failed" | "failed";

export interface BatchServiceContext {
  requestId: string;
  actor: string;
  source: string;
}

export interface BatchOperationOptions {
  instanceIds?: number[];
}

export interface BatchOperationItemResult {
  account_id: number;
  account_alias: string;
  instance_id: number;
  label: string;
  result: "success" | "failed";
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

  constructor(private readonly env: Env, accounts?: AccountsRepository, audit?: AuditService) {
    if (!env.DB && !accounts) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", "req_config", 500);
    this.accounts = accounts ?? new AccountsRepository(env.DB as D1Database);
    this.audit = audit ?? (env.DB ? new AuditService(new AuditRepository(env.DB)) : undefined);
  }

  async runAccountBatch(accountId: number, action: BatchAction, context: BatchServiceContext, options: BatchOperationOptions = {}): Promise<BatchOperationResult> {
    this.validateAction(action, context.requestId);
    const account = await this.getActiveAccount(accountId, context.requestId);
    const token = await decryptLinodeToken(account.encrypted_token, await getLinodeTokenEncryptionKey(this.env));
    const instances = await this.resolveInstances(token, context.requestId, options.instanceIds);
    return await this.runTargets("account", action, context, instances.map((instance) => ({ account, token, instance })));
  }

  async runAllAccountsBatch(action: BatchAction, context: BatchServiceContext, options: BatchOperationOptions = {}): Promise<BatchOperationResult> {
    this.validateAction(action, context.requestId);
    const accounts = await this.accounts.listActive();
    const targets: BatchTarget[] = [];
    for (const account of accounts) {
      const token = await decryptLinodeToken(account.encrypted_token, await getLinodeTokenEncryptionKey(this.env));
      const instances = await this.resolveInstances(token, context.requestId, options.instanceIds);
      targets.push(...instances.map((instance) => ({ account, token, instance })));
    }
    return await this.runTargets("all", action, context, targets);
  }

  private async runTargets(scope: BatchScope, action: BatchAction, context: BatchServiceContext, targets: BatchTarget[]): Promise<BatchOperationResult> {
    const concurrency = normalizeConcurrency(this.env.BATCH_CONCURRENCY);
    const items = await mapWithConcurrency(targets, concurrency, (target) => this.runOneTarget(target, action, context));
    const success = items.filter((item) => item.result === "success").length;
    const failed = items.length - success;
    return {
      action,
      scope,
      total: items.length,
      success,
      failed,
      result: failed === 0 ? "success" : success === 0 ? "failed" : "partial_failed",
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
    try {
      const client = new LinodeClient(target.token);
      if (action === "boot") await client.bootInstance(target.instance.id, context.requestId);
      else if (action === "shutdown") await client.shutdownInstance(target.instance.id, context.requestId);
      else await client.deleteInstance(target.instance.id, context.requestId);
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

  private async resolveInstances(token: string, requestId: string, instanceIds?: number[]): Promise<LinodeInstance[]> {
    if (instanceIds !== undefined) this.validateInstanceIds(instanceIds, requestId);
    const instances = await new LinodeClient(token).listInstances(requestId);
    if (!instanceIds) return instances;
    const allowed = new Set(instanceIds);
    return instances.filter((instance) => allowed.has(instance.id));
  }

  private validateAction(action: string, requestId: string): asserts action is BatchAction {
    if (!["boot", "shutdown", "delete"].includes(action)) {
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
    if (!account || account.status !== "active") throw new AppError(ErrorCode.ACCOUNT_NOT_FOUND, "Account not found", requestId, 404);
    return account;
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

function mapBatchItemMessage(code: string): string {
  if (code === ErrorCode.TOKEN_INVALID) return "Linode Token is invalid";
  if (code === ErrorCode.TOKEN_PERMISSION_ERROR) return "Linode Token permission is insufficient";
  return "Linode API error";
}
