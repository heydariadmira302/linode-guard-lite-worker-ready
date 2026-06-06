import { LinodeClient, type CreateLinodeInstanceInput, type LinodeFirewall, type LinodeImage, type LinodeInstance, type LinodeRegion, type LinodeType } from "../clients/linode-client";
import { decryptLinodeToken } from "../crypto/token-crypto";
import type { Env } from "../env";
import { getLinodeTokenEncryptionKey } from "./runtime-secret-service";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { AccountsRepository, isActiveAccountStatus, type LinodeAccountRecord } from "../storage/accounts-repository";
import { AuditRepository } from "../storage/audit-repository";
import { GroupsRepository } from "../storage/groups-repository";
import type { PublicAccount } from "./account-service";
import { AuditService } from "./audit-service";
import { BotManagedInstancesRepository } from "../storage/bot-managed-instances-repository";
import { AppSettingsService } from "./app-settings-service";

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

export interface CreateInstanceOptionsResult {
  account: PublicAccount;
  regions: LinodeRegion[];
  types: LinodeType[];
  images: LinodeImage[];
  firewalls: LinodeFirewall[];
}

export interface CreateInstanceInput {
  region: string;
  type: string;
  image: string;
  label?: string;
  firewall_id?: number | null;
  root_pass?: string;
}

export interface CreateInstanceResult {
  account: PublicAccount;
  instance: LinodeInstance;
  root_password?: string;
}

type InstanceAction = "boot" | "shutdown" | "reboot" | "delete";

export class InstanceService {
  private readonly accounts: AccountsRepository;
  private readonly groups?: GroupsRepository;
  private readonly audit?: AuditService;
  private readonly managed?: BotManagedInstancesRepository;

  constructor(private readonly env: Env, accounts?: AccountsRepository, audit?: AuditService, groups?: GroupsRepository) {
    if (!env.DB && !accounts) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", "req_config", 500);
    this.accounts = accounts ?? new AccountsRepository(env.DB as D1Database);
    this.groups = groups ?? (env.DB ? new GroupsRepository(env.DB as D1Database) : undefined);
    this.audit = audit ?? (env.DB ? new AuditService(new AuditRepository(env.DB)) : undefined);
    this.managed = env.DB ? new BotManagedInstancesRepository(env.DB) : undefined;
  }

  async listAllActiveAccountInstances(requestId: string): Promise<{ accounts: AccountInstancesResult[] }> {
    const accounts = await this.accounts.listActive();
    const results: AccountInstancesResult[] = [];
    for (const account of accounts) {
      try {
        results.push(await this.listForAccountRecord(account, requestId));
      } catch (error) {
        if (isRecoverableAccountListError(error)) {
          await this.markTokenStatusFromError(account.id, error);
          results.push({ account: await this.toPublicAccount({ ...account, token_status: tokenStatusFromError(error) }), instances: [] });
          continue;
        }
        throw error;
      }
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
    for (const account of accounts) {
      try {
        results.push(await this.listForAccountRecord(account, requestId));
      } catch (error) {
        if (isRecoverableAccountListError(error)) {
          await this.markTokenStatusFromError(account.id, error);
          results.push({ account: await this.toPublicAccount({ ...account, token_status: tokenStatusFromError(error) }), instances: [] });
          continue;
        }
        throw error;
      }
    }
    return { accounts: results };
  }

  async getAccountInstance(accountId: number, instanceId: number, requestId: string): Promise<InstanceDetailResult> {
    this.validateInstanceId(instanceId, requestId);
    const account = await this.getActiveAccount(accountId, requestId);
    const token = await decryptLinodeToken(account.encrypted_token, await getLinodeTokenEncryptionKey(this.env));
    const instance = await new LinodeClient(token).getInstance(instanceId, requestId);
    return { account: await this.toPublicAccount(account), instance };
  }

  async getCreateOptions(accountId: number, requestId: string): Promise<CreateInstanceOptionsResult> {
    const account = await this.getActiveAccount(accountId, requestId);
    const token = await decryptLinodeToken(account.encrypted_token, await getLinodeTokenEncryptionKey(this.env));
    const client = new LinodeClient(token);
    const [regions, types, images, firewalls] = await Promise.all([
      client.listRegions(requestId),
      client.listTypes(requestId),
      client.listImages(requestId),
      client.listFirewalls(requestId).catch((error) => {
        if (error instanceof AppError && error.code === ErrorCode.TOKEN_PERMISSION_ERROR) return [] as LinodeFirewall[];
        throw error;
      })
    ]);
    return { account: await this.toPublicAccount(account), regions, types, images, firewalls };
  }

  async createInstance(accountId: number, input: CreateInstanceInput, context: InstanceServiceContext): Promise<CreateInstanceResult> {
    const account = await this.getActiveAccount(accountId, context.requestId);
    const publicAccount = await this.toPublicAccount(account);
    const rootPassword = input.root_pass ?? generateRootPassword();
    const payload = this.buildCreateInstancePayload(input, rootPassword, context.requestId);
    try {
      const token = await decryptLinodeToken(account.encrypted_token, await getLinodeTokenEncryptionKey(this.env));
      const instance = await new LinodeClient(token).createInstance(payload, context.requestId);
      await this.recordAudit(context, "instance.create", "instance", String(instance.id || payload.label), "medium", "success", null, { account_id: account.id, account_alias: account.alias, region: payload.region, type: payload.type, image: payload.image, firewall_id: payload.firewall_id ?? null });
      return { account: publicAccount, instance, root_password: rootPassword };
    } catch (error) {
      const code = error instanceof AppError ? error.code : ErrorCode.LINODE_API_ERROR;
      await this.recordAudit(context, "instance.create", "instance", input.label ?? null, "medium", "failed", code, { account_id: account.id, account_alias: account.alias, region: input.region, type: input.type, image: input.image, firewall_id: input.firewall_id ?? null });
      if (error instanceof AppError) throw error;
      throw new AppError(ErrorCode.LINODE_API_ERROR, "Linode API 请求失败", context.requestId, 502);
    }
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
      if ((action === "shutdown" || action === "delete") && await this.isProtectedInstance(account, instanceId, client, context.requestId)) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, "Protected instance cannot be modified by this action", context.requestId, 400);
      }
      if (action === "boot") await client.bootInstance(instanceId, context.requestId);
      else if (action === "shutdown") await client.shutdownInstance(instanceId, context.requestId);
      else if (action === "reboot") await client.rebootInstance(instanceId, context.requestId);
      else await client.deleteInstance(instanceId, context.requestId);
      await this.recordManagedPowerState(account, instanceId, action, context);
      const riskLevel = action === "delete" ? "critical" : "medium";
      await this.recordAudit(context, auditAction, "instance", String(instanceId), riskLevel, "success", null, { account_id: account.id, account_alias: account.alias });
      return { action, account: await this.toPublicAccount(account), instance_id: instanceId, result: "success" };
    } catch (error) {
      const code = error instanceof AppError ? error.code : ErrorCode.LINODE_API_ERROR;
      const riskLevel = action === "delete" ? "critical" : "medium";
      await this.recordAudit(context, auditAction, "instance", String(instanceId), riskLevel, "failed", code, { account_id: account.id, account_alias: account.alias });
      if (error instanceof AppError) throw error;
      throw new AppError(ErrorCode.LINODE_API_ERROR, "Linode API 请求失败", context.requestId, 502);
    }
  }

  private buildCreateInstancePayload(input: CreateInstanceInput, rootPassword: string, requestId: string): CreateLinodeInstanceInput {
    const region = typeof input.region === "string" ? input.region.trim() : "";
    const type = typeof input.type === "string" ? input.type.trim() : "";
    const image = typeof input.image === "string" ? input.image.trim() : "";
    const label = typeof input.label === "string" && input.label.trim() ? input.label.trim() : createDefaultInstanceLabel();
    if (!region || !type || !image) throw new AppError(ErrorCode.VALIDATION_ERROR, "region/type/image are required", requestId, 400);
    if (!/^[A-Za-z0-9._-]{3,64}$/.test(label)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid instance label", requestId, 400);
    const payload: CreateLinodeInstanceInput = {
      region,
      type,
      image,
      label,
      root_pass: rootPassword,
      backups_enabled: false,
      tags: ["linode-guard-lite"]
    };
    if (input.firewall_id !== undefined && input.firewall_id !== null) {
      const firewallId = Number(input.firewall_id);
      if (!Number.isInteger(firewallId) || firewallId <= 0) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid firewall id", requestId, 400);
      payload.firewall_id = firewallId;
    }
    return payload;
  }

  private async listForAccountRecord(account: LinodeAccountRecord, requestId: string): Promise<AccountInstancesResult> {
    const token = await decryptLinodeToken(account.encrypted_token, await getLinodeTokenEncryptionKey(this.env));
    const instances = await new LinodeClient(token).listInstances(requestId);
    if (account.token_status !== "valid") await this.accounts.updateTokenStatus(account.id, "valid").catch(() => undefined);
    return { account: await this.toPublicAccount({ ...account, token_status: "valid" }), instances };
  }

  private async markTokenStatusFromError(accountId: number, error: unknown): Promise<void> {
    await this.accounts.updateTokenStatus(accountId, tokenStatusFromError(error)).catch(() => undefined);
  }

  private validateInstanceId(instanceId: number, requestId: string): void {
    if (!Number.isInteger(instanceId) || instanceId <= 0) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid instance id", requestId, 400);
    }
  }

  private async isProtectedInstance(account: LinodeAccountRecord, instanceId: number, client: LinodeClient, requestId: string): Promise<boolean> {
    if (!this.env.DB) return false;
    const rules = (await new AppSettingsService(this.env).getSettings()).protected_instances;
    if (rules.length === 0) return false;
    let label: string | undefined;
    if (rules.some((rule) => rule.label)) {
      label = (await client.getInstance(instanceId, requestId)).label;
    }
    return rules.some((rule) => {
      const accountMatches = !rule.account_id || Number(rule.account_id) === account.id;
      const instanceMatches = !rule.instance_id || Number(rule.instance_id) === instanceId;
      const labelMatches = !rule.label || rule.label === label;
      return accountMatches && instanceMatches && labelMatches;
    });
  }

  private async recordManagedPowerState(account: LinodeAccountRecord, instanceId: number, action: InstanceAction, context: InstanceServiceContext): Promise<void> {
    if (!this.managed || (action !== "shutdown" && action !== "boot" && action !== "delete")) return;
    await this.managed.markAction({
      account_id: account.id,
      instance_id: instanceId,
      last_action: action,
      actor: context.actor,
      source: context.source,
      request_id: context.requestId,
      metadata_json: JSON.stringify({ account_alias: account.alias })
    });
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
    if (!account || !isActiveAccountStatus(account.status)) {
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
      status: account.status || "active",
      created_at: account.created_at,
      updated_at: account.updated_at,
      deleted_at: account.deleted_at ?? null,
      group_id: groupId,
      group_name: groupName
    };
  }
}

function isRecoverableAccountListError(error: unknown): boolean {
  return error instanceof AppError && (error.code === ErrorCode.TOKEN_INVALID || error.code === ErrorCode.TOKEN_PERMISSION_ERROR || error.code === ErrorCode.RATE_LIMITED);
}

function tokenStatusFromError(error: unknown): string {
  if (error instanceof AppError && error.code === ErrorCode.TOKEN_PERMISSION_ERROR) return "permission_error";
  if (error instanceof AppError && error.code === ErrorCode.RATE_LIMITED) return "rate_limited";
  return "invalid";
}

function createDefaultInstanceLabel(): string {
  return `lgl-${new Date().toISOString().replace(/[-:]/g, "").slice(0, 13)}`;
}

function generateRootPassword(): string {
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%^&*_-+=?";
  const alphabet = lower + upper + digits + symbols;
  const required = [randomChar(lower), randomChar(upper), randomChar(digits), randomChar(symbols)];
  const rest = Array.from({ length: 28 }, () => randomChar(alphabet));
  return shuffle([...required, ...rest]).join("");
}

function randomChar(chars: string): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return chars[array[0] % chars.length];
}

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    const j = array[0] % (i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
