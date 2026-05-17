import { LinodeClient, type LinodeInstance } from "../clients/linode-client";
import { decryptLinodeToken } from "../crypto/token-crypto";
import type { Env } from "../env";
import { getLinodeTokenEncryptionKey } from "./runtime-secret-service";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { AccountsRepository, type LinodeAccountRecord } from "../storage/accounts-repository";
import { AuditRepository } from "../storage/audit-repository";
import { GroupsRepository } from "../storage/groups-repository";
import type { PublicAccount } from "./account-service";
import { AuditService } from "./audit-service";

export interface AccountInstancesResult {
  account: PublicAccount;
  instances: LinodeInstance[];
}

export interface InstanceDetailResult {
  account: PublicAccount;
  instance: LinodeInstance;
}

export interface InstanceServiceContext {
  requestId: string;
  actor: string;
  source: string;
}

export interface InstanceActionResult {
  action: "boot" | "shutdown" | "reboot" | "delete";
  account: PublicAccount;
  instance_id: number;
  result: "success";
}

type InstanceAction = "boot" | "shutdown" | "reboot" | "delete";

export class InstanceService {
  private readonly accounts: AccountsRepository;
  private readonly groups?: GroupsRepository;
  private readonly audit?: AuditService;

  constructor(private readonly env: Env, accounts?: AccountsRepository, audit?: AuditService, groups?: GroupsRepository) {
    if (!env.DB && !accounts) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", "req_config", 500);
    this.accounts = accounts ?? new AccountsRepository(env.DB as D1Database);
    this.groups = groups ?? (env.DB ? new GroupsRepository(env.DB as D1Database) : undefined);
    this.audit = audit ?? (env.DB ? new AuditService(new AuditRepository(env.DB)) : undefined);
  }

  async listAllActiveAccountInstances(requestId: string): Promise<{ accounts: AccountInstancesResult[] }> {
    const accounts = await this.accounts.listActive();
    const results: AccountInstancesResult[] = [];
    for (const account of accounts) {
      results.push(await this.listForAccountRecord(account, requestId));
    }
    return { accounts: results };
  }

  async listAccountInstances(accountId: number, requestId: string): Promise<AccountInstancesResult> {
    const account = await this.getActiveAccount(accountId, requestId);
    return await this.listForAccountRecord(account, requestId);
  }

  async listGroupInstances(groupId: number, requestId: string): Promise<{ accounts: AccountInstancesResult[] }> {
    if (!Number.isInteger(groupId) || groupId <= 0) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid group id", requestId, 400);
    const accounts = (await this.accounts.listActive()).filter((account) => Number(account.group_id ?? 1) === groupId);
    const results: AccountInstancesResult[] = [];
    for (const account of accounts) results.push(await this.listForAccountRecord(account, requestId));
    return { accounts: results };
  }

  async getAccountInstance(accountId: number, instanceId: number, requestId: string): Promise<InstanceDetailResult> {
    this.validateInstanceId(instanceId, requestId);
    const account = await this.getActiveAccount(accountId, requestId);
    const token = await decryptLinodeToken(account.encrypted_token, await getLinodeTokenEncryptionKey(this.env));
    const instance = await new LinodeClient(token).getInstance(instanceId, requestId);
    return { account: await this.toPublicAccount(account), instance };
  }

  async bootInstance(accountId: number, instanceId: number, context: InstanceServiceContext): Promise<InstanceActionResult> {
    return await this.runInstanceAction(accountId, instanceId, context, "boot");
  }

  async shutdownInstance(accountId: number, instanceId: number, context: InstanceServiceContext): Promise<InstanceActionResult> {
    return await this.runInstanceAction(accountId, instanceId, context, "shutdown");
  }

  async rebootInstance(accountId: number, instanceId: number, context: InstanceServiceContext): Promise<InstanceActionResult> {
    return await this.runInstanceAction(accountId, instanceId, context, "reboot");
  }

  async deleteInstance(accountId: number, instanceId: number, context: InstanceServiceContext): Promise<InstanceActionResult> {
    return await this.runInstanceAction(accountId, instanceId, context, "delete");
  }

  private async runInstanceAction(accountId: number, instanceId: number, context: InstanceServiceContext, action: InstanceAction): Promise<InstanceActionResult> {
    this.validateInstanceId(instanceId, context.requestId);
    const account = await this.getActiveAccount(accountId, context.requestId);
    const auditAction = `instance.${action}`;
    try {
      const token = await decryptLinodeToken(account.encrypted_token, await getLinodeTokenEncryptionKey(this.env));
      const client = new LinodeClient(token);
      if (action === "boot") await client.bootInstance(instanceId, context.requestId);
      else if (action === "shutdown") await client.shutdownInstance(instanceId, context.requestId);
      else if (action === "reboot") await client.rebootInstance(instanceId, context.requestId);
      else await client.deleteInstance(instanceId, context.requestId);
      const riskLevel = action === "delete" ? "critical" : "medium";
      await this.recordAudit(context, auditAction, "instance", String(instanceId), riskLevel, "success", null, { account_id: account.id, account_alias: account.alias });
      return { action, account: await this.toPublicAccount(account), instance_id: instanceId, result: "success" };
    } catch (error) {
      const code = error instanceof AppError ? error.code : ErrorCode.LINODE_API_ERROR;
      const riskLevel = action === "delete" ? "critical" : "medium";
      await this.recordAudit(context, auditAction, "instance", String(instanceId), riskLevel, "failed", code, { account_id: account.id, account_alias: account.alias });
      if (error instanceof AppError) throw error;
      throw new AppError(ErrorCode.LINODE_API_ERROR, "Linode API error", context.requestId, 502);
    }
  }

  private async listForAccountRecord(account: LinodeAccountRecord, requestId: string): Promise<AccountInstancesResult> {
    const token = await decryptLinodeToken(account.encrypted_token, await getLinodeTokenEncryptionKey(this.env));
    const instances = await new LinodeClient(token).listInstances(requestId);
    return { account: await this.toPublicAccount(account), instances };
  }

  private validateInstanceId(instanceId: number, requestId: string): void {
    if (!Number.isInteger(instanceId) || instanceId <= 0) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid instance id", requestId, 400);
    }
  }

  private async recordAudit(context: InstanceServiceContext, action: string, targetType: string, targetId: string | null, riskLevel: string, result: string, errorCode: string | null, metadata: unknown): Promise<void> {
    await this.audit?.record({
      request_id: context.requestId,
      actor: context.actor,
      source: context.source,
      action,
      target_type: targetType,
      target_id: targetId,
      risk_level: riskLevel,
      result,
      error_code: errorCode,
      metadata_json: JSON.stringify(metadata)
    });
  }

  private async getActiveAccount(accountId: number, requestId: string): Promise<LinodeAccountRecord> {
    if (!Number.isInteger(accountId) || accountId <= 0) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid account id", requestId, 400);
    }
    const account = await this.accounts.getById(accountId);
    if (!account || account.status !== "active") {
      throw new AppError(ErrorCode.ACCOUNT_NOT_FOUND, "Account not found", requestId, 404);
    }
    return account;
  }

  private async toPublicAccount(account: LinodeAccountRecord): Promise<PublicAccount> {
    const groupId = account.group_id ?? 1;
    let groupName: string | null = null;
    try {
      groupName = (await this.groups?.getById(groupId))?.name ?? null;
    } catch {
      groupName = groupId === 1 ? "未分组" : null;
    }
    return {
      id: account.id,
      alias: account.alias,
      token_fingerprint: account.token_fingerprint,
      token_status: account.token_status,
      status: account.status,
      created_at: account.created_at,
      updated_at: account.updated_at,
      deleted_at: account.deleted_at ?? null,
      group_id: groupId,
      group_name: groupName
    };
  }
}
