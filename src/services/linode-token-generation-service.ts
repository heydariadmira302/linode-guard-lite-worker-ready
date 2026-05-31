import { LinodeClient } from "../clients/linode-client";
import { createTokenFingerprint } from "../crypto/fingerprint";
import { decryptLinodeToken, encryptLinodeToken } from "../crypto/token-crypto";
import type { Env } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { AccountsRepository, isActiveAccountStatus } from "../storage/accounts-repository";
import { AuditRepository } from "../storage/audit-repository";
import { AuditService } from "./audit-service";
import { getLinodeTokenEncryptionKey } from "./runtime-secret-service";
import { SecuritySettingsService } from "./security-settings-service";

export type LinodeTokenGenerationContext = { requestId: string; actor: string; source: string };

export type LinodeTokenGenerationResult = {
  account_id: number;
  alias: string;
  token_fingerprint: string;
  token_status: string;
  token_label: string;
  token_id: number | null;
  security_baseline_at: string;
};

export class LinodeTokenGenerationService {
  private readonly accounts: AccountsRepository;
  private readonly audit?: AuditService;

  constructor(private readonly env: Env, accounts?: AccountsRepository, audit?: AuditService) {
    if (!env.DB && !accounts) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", "req_token_generation", 500);
    this.accounts = accounts ?? new AccountsRepository(env.DB as D1Database);
    this.audit = audit ?? (env.DB ? new AuditService(new AuditRepository(env.DB)) : undefined);
  }

  async generateReplacementToken(accountId: number, input: { label?: string; scopes?: string; expiry_days?: number | null } = {}, context: LinodeTokenGenerationContext): Promise<LinodeTokenGenerationResult> {
    if (!Number.isInteger(accountId) || accountId <= 0) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid account id", context.requestId, 400);
    const account = await this.accounts.getById(accountId);
    if (!account || !isActiveAccountStatus(account.status)) throw new AppError(ErrorCode.ACCOUNT_NOT_FOUND, "Account not found", context.requestId, 404);
    const settings = await new SecuritySettingsService(this.env).getSettings();
    if (!settings.auto_generate_linode_token_enabled) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Auto token generation is disabled in security settings", context.requestId, 400);
    }
    try {
      const currentToken = await decryptLinodeToken(account.encrypted_token, await getLinodeTokenEncryptionKey(this.env));
      const label = input.label?.trim() || `linode-guard-lite-${account.id}-${new Date().toISOString().slice(0, 10)}`;
      const expiry = toExpiryIso(input.expiry_days ?? settings.auto_generated_token_expiry_days);
      const created = await new LinodeClient(currentToken).createPersonalAccessToken({ label, scopes: input.scopes ?? settings.auto_generated_token_scopes, expiry }, context.requestId);
      const tokenTest = await new LinodeClient(created.token).testToken(context.requestId);
      const encryptedToken = await encryptLinodeToken(created.token, await getLinodeTokenEncryptionKey(this.env));
      const fingerprint = await createTokenFingerprint(created.token);
      const baselineAt = new Date().toISOString();
      const updated = await this.accounts.updateToken({
        id: account.id,
        encrypted_token: encryptedToken,
        token_fingerprint: fingerprint,
        token_status: "valid",
        last_seen_login_id: tokenTest.latest_login_id ?? null,
        last_login_check_at: baselineAt,
        security_baseline_at: baselineAt
      });
      await this.audit?.record({ request_id: context.requestId, actor: context.actor, source: context.source, action: "account.token.auto_generate", target_type: "account", target_id: String(account.id), risk_level: "high", result: "success", error_code: null, metadata_json: JSON.stringify({ alias: account.alias, token_fingerprint: fingerprint, token_label: created.label ?? label, token_id: created.id ?? null }) });
      return { account_id: updated.id, alias: updated.alias, token_fingerprint: fingerprint, token_status: "valid", token_label: created.label ?? label, token_id: created.id ?? null, security_baseline_at: baselineAt };
    } catch (error) {
      const code = error instanceof AppError ? error.code : ErrorCode.LINODE_API_ERROR;
      await this.audit?.record({ request_id: context.requestId, actor: context.actor, source: context.source, action: "account.token.auto_generate", target_type: "account", target_id: String(account.id), risk_level: "high", result: "failed", error_code: code, metadata_json: JSON.stringify({ alias: account.alias }) });
      if (error instanceof AppError) throw error;
      throw new AppError(ErrorCode.LINODE_API_ERROR, "Failed to auto-generate Linode token", context.requestId, 502);
    }
  }
}

function toExpiryIso(days: number | null | undefined): string | null {
  if (days === null || days === undefined) return null;
  const normalized = Math.max(1, Math.min(365, Math.trunc(Number(days))));
  return new Date(Date.now() + normalized * 24 * 60 * 60 * 1000).toISOString();
}
