import { LinodeClient } from "../clients/linode-client";
import { createTokenFingerprint } from "../crypto/fingerprint";
import { decryptLinodeToken, encryptLinodeToken } from "../crypto/token-crypto";
import type { Env } from "../env";
import { getLinodeTokenEncryptionKey } from "./runtime-secret-service";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { AccountsRepository, type LinodeAccountRecord } from "../storage/accounts-repository";
import { AuditRepository } from "../storage/audit-repository";
import { AuditService } from "./audit-service";

export interface AccountServiceContext {
  requestId: string;
  actor: string;
  source: string;
}

export interface PublicAccount {
  id: number;
  alias: string;
  token_fingerprint: string;
  token_status: string;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export class AccountService {
  private readonly accounts: AccountsRepository;
  private readonly audit?: AuditService;

  constructor(private readonly env: Env, accounts?: AccountsRepository, audit?: AuditService) {
    if (!env.DB && !accounts) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", "req_config", 500);
    this.accounts = accounts ?? new AccountsRepository(env.DB as D1Database);
    this.audit = audit ?? (env.DB ? new AuditService(new AuditRepository(env.DB)) : undefined);
  }

  async createAccount(input: { alias: string; token: string }, context: AccountServiceContext): Promise<PublicAccount> {
    const alias = this.validateAlias(input.alias, context.requestId);
    const token = input.token?.trim();
    if (!token) throw new AppError(ErrorCode.VALIDATION_ERROR, "Token is required", context.requestId, 400);
    if (await this.accounts.getByAlias(alias)) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Account alias already exists", context.requestId, 400);
    }

    try {
      await new LinodeClient(token).testToken(context.requestId);
      const encryptedToken = await encryptLinodeToken(token, await getLinodeTokenEncryptionKey(this.env));
      const fingerprint = await createTokenFingerprint(token);
      const account = await this.accounts.create({ alias, encrypted_token: encryptedToken, token_fingerprint: fingerprint, token_status: "valid" });
      await this.recordAudit(context, "account.create", "account", String(account.id), "high", "success", null, { alias, token_fingerprint: fingerprint });
      return toPublicAccount(account);
    } catch (error) {
      if (error instanceof AppError) {
        await this.recordAudit(context, "account.create", "account", null, "high", "failed", error.code, { alias });
        throw error;
      }
      await this.recordAudit(context, "account.create", "account", null, "high", "failed", ErrorCode.D1_ERROR, { alias });
      throw new AppError(ErrorCode.D1_ERROR, "Failed to create account", context.requestId, 500);
    }
  }

  async listAccounts(): Promise<PublicAccount[]> {
    return (await this.accounts.listActive()).map(toPublicAccount);
  }

  async testAccount(accountId: number, context: AccountServiceContext): Promise<PublicAccount> {
    const account = await this.getActiveAccount(accountId, context.requestId);
    try {
      const token = await decryptLinodeToken(account.encrypted_token, await getLinodeTokenEncryptionKey(this.env));
      await new LinodeClient(token).testToken(context.requestId);
      await this.accounts.updateTokenStatus(account.id, "valid");
      await this.recordAudit(context, "account.test", "account", String(account.id), "medium", "success", null, { alias: account.alias, token_fingerprint: account.token_fingerprint });
      return { ...toPublicAccount(account), token_status: "valid" };
    } catch (error) {
      const code = error instanceof AppError ? error.code : ErrorCode.LINODE_API_ERROR;
      const status = code === ErrorCode.TOKEN_PERMISSION_ERROR ? "permission_error" : code === ErrorCode.TOKEN_INVALID ? "invalid" : "unknown";
      await this.accounts.updateTokenStatus(account.id, status);
      await this.recordAudit(context, "account.test", "account", String(account.id), "medium", "failed", code, { alias: account.alias, token_fingerprint: account.token_fingerprint });
      if (error instanceof AppError) throw error;
      throw new AppError(ErrorCode.LINODE_API_ERROR, "Linode API error", context.requestId, 502);
    }
  }

  async deleteAccount(accountId: number, context: AccountServiceContext): Promise<{ deleted: true; account: PublicAccount }> {
    const account = await this.getActiveAccount(accountId, context.requestId);
    await this.accounts.softDelete(account.id);
    await this.recordAudit(context, "account.delete", "account", String(account.id), "high", "success", null, { alias: account.alias, token_fingerprint: account.token_fingerprint });
    return { deleted: true, account: { ...toPublicAccount(account), status: "deleted", deleted_at: new Date().toISOString() } };
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

  private validateAlias(alias: string, requestId: string): string {
    const normalized = alias?.trim();
    if (!normalized || !/^[a-zA-Z0-9_-]{1,32}$/.test(normalized)) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Alias must be 1-32 chars and only contain letters, numbers, underscore, or hyphen", requestId, 400);
    }
    return normalized;
  }

  private async recordAudit(context: AccountServiceContext, action: string, targetType: string, targetId: string | null, riskLevel: string, result: string, errorCode: string | null, metadata: unknown): Promise<void> {
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
}

function toPublicAccount(account: LinodeAccountRecord): PublicAccount {
  return {
    id: account.id,
    alias: account.alias,
    token_fingerprint: account.token_fingerprint,
    token_status: account.token_status,
    status: account.status,
    created_at: account.created_at,
    updated_at: account.updated_at,
    deleted_at: account.deleted_at ?? null
  };
}
