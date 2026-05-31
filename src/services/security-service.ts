import { LinodeClient, type LinodeLoginEvent } from "../clients/linode-client";
import { decryptLinodeToken } from "../crypto/token-crypto";
import type { Env } from "../env";
import { getLinodeTokenEncryptionKey } from "./runtime-secret-service";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { AccountsRepository, type LinodeAccountRecord } from "../storage/accounts-repository";
import { AuditRepository } from "../storage/audit-repository";
import { SecurityEventsRepository, type SecurityEventListParams, type SecurityEventRecord } from "../storage/events-repository";
import { AuditService } from "./audit-service";
import { IpIntelligenceService } from "./ip-intelligence-service";
import { assessLogin, loginStatusToSecurityType } from "./security-login-policy";
import { LinodeTokenGenerationService } from "./linode-token-generation-service";
import { SecuritySettingsService, type SecuritySettings } from "./security-settings-service";

export interface SecurityServiceContext {
  requestId: string;
  actor: string;
  source: string;
}

export interface SecurityCheckItem {
  account_id: number;
  account_alias: string;
  result: "success" | "failed";
  new_login_events: number;
  new_security_events: number;
  new_events: SecurityEventRecord[];
  error_code?: string;
  message?: string;
}

export interface SecurityCheckResult {
  checked_accounts: number;
  failed_accounts: number;
  new_login_events: number;
  new_security_events: number;
  result: "success" | "partial_failed" | "failed";
  items: SecurityCheckItem[];
}

export interface SecurityEventListResult {
  security_events: SecurityEventRecord[];
  limit: number;
  offset: number;
}

export interface SecurityOverviewResult {
  open_events: number;
  recent_events: SecurityEventRecord[];
}

export class SecurityService {
  private readonly accounts: AccountsRepository;
  private readonly events: SecurityEventsRepository;
  private readonly audit?: AuditService;
  private readonly ipIntel: IpIntelligenceService;

  constructor(private readonly env: Env, accounts?: AccountsRepository, events?: SecurityEventsRepository, audit?: AuditService, ipIntel?: IpIntelligenceService) {
    if (!env.DB && (!accounts || !events)) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", "req_config", 500);
    this.accounts = accounts ?? new AccountsRepository(env.DB as D1Database);
    this.events = events ?? new SecurityEventsRepository(env.DB as D1Database);
    this.audit = audit ?? (env.DB ? new AuditService(new AuditRepository(env.DB)) : undefined);
    this.ipIntel = ipIntel ?? new IpIntelligenceService();
  }

  async checkAccounts(context: SecurityServiceContext): Promise<SecurityCheckResult> {
    const settings = await new SecuritySettingsService(this.env).getSettings();
    if (!settings.enabled) {
      await this.audit?.record({ request_id: context.requestId, actor: context.actor, source: context.source, action: "security.check", target_type: "security", target_id: null, risk_level: "medium", result: "success", error_code: null, metadata_json: JSON.stringify({ disabled: true }) });
      return { checked_accounts: 0, failed_accounts: 0, new_login_events: 0, new_security_events: 0, result: "success", items: [] };
    }
    const accounts = await this.accounts.listActive();
    const items: SecurityCheckItem[] = [];
    for (const account of accounts) items.push(await this.checkOneAccount(account, context, settings));
    const failed_accounts = items.filter((item) => item.result === "failed").length;
    const new_login_events = items.reduce((sum, item) => sum + item.new_login_events, 0);
    const new_security_events = items.reduce((sum, item) => sum + item.new_security_events, 0);
    const result = failed_accounts === 0 ? "success" : failed_accounts === items.length ? "failed" : "partial_failed";
    await this.audit?.record({
      request_id: context.requestId,
      actor: context.actor,
      source: context.source,
      action: "security.check",
      target_type: "security",
      target_id: null,
      risk_level: "medium",
      result,
      error_code: result === "success" ? null : items.find((item) => item.result === "failed")?.error_code ?? ErrorCode.LINODE_API_ERROR,
      metadata_json: JSON.stringify({ checked_accounts: accounts.length, failed_accounts, new_login_events, new_security_events })
    });
    return { checked_accounts: accounts.length, failed_accounts, new_login_events, new_security_events, result, items };
  }

  async listSecurityEvents(params: SecurityEventListParams = {}): Promise<SecurityEventListResult> {
    const limit = normalizeLimit(params.limit);
    const offset = normalizeOffset(params.offset);
    const security_events = (await this.events.listSecurityEvents({ ...params, limit, offset })).map(toPublicSecurityEvent);
    return { security_events, limit, offset };
  }

  async getOverview(): Promise<SecurityOverviewResult> {
    const recent_events = await this.events.listSecurityEvents({ limit: 5, offset: 0 });
    const open_events = await this.events.countOpenSecurityEvents();
    return { open_events, recent_events };
  }

  async generateReplacementLinodeToken(accountId: number, input: { label?: string; scopes?: string; expiry_days?: number | null }, context: SecurityServiceContext) {
    return await new LinodeTokenGenerationService(this.env).generateReplacementToken(accountId, input, context);
  }

  async updateSecurityEventStatus(id: number, status: "confirmed" | "suspicious", context: SecurityServiceContext): Promise<{ security_event: SecurityEventRecord }> {
    if (!Number.isInteger(id) || id <= 0) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid security event id", context.requestId, 400);
    const event = await this.events.updateSecurityEventStatus(id, status);
    if (!event) throw new AppError(ErrorCode.VALIDATION_ERROR, "Security event not found", context.requestId, 404);
    await this.audit?.record({
      request_id: context.requestId,
      actor: context.actor,
      source: context.source,
      action: `security.event.${status}`,
      target_type: "security_event",
      target_id: String(id),
      risk_level: status === "suspicious" ? "high" : "medium",
      result: "success",
      error_code: null,
      metadata_json: JSON.stringify({ account_id: event.account_id, type: event.type })
    });
    return { security_event: toPublicSecurityEvent(event) };
  }

  private async findRecentTokenError(accountId: number, type: string, dedupeMinutes: number): Promise<SecurityEventRecord | null> {
    const since = new Date(Date.now() - dedupeMinutes * 60 * 1000).toISOString();
    return await this.events.findRecentSecurityEvent({ account_id: accountId, type, since });
  }

  private async checkOneAccount(account: LinodeAccountRecord, context: SecurityServiceContext, settings: SecuritySettings): Promise<SecurityCheckItem> {
    try {
      const token = await decryptLinodeToken(account.encrypted_token, await getLinodeTokenEncryptionKey(this.env));
      const logins = await new LinodeClient(token).listAccountLogins(context.requestId);
      let newLoginEvents = 0;
      let newSecurityEvents = 0;
      const newEvents: SecurityEventRecord[] = [];
      const previousLastSeenLoginId = account.last_seen_login_id ?? null;
      const baselineAt = parseOptionalTime(account.security_baseline_at ?? account.last_login_check_at ?? null);
      const lastSeenLoginId = findNewestLoginId(logins) ?? previousLastSeenLoginId;
      const newLogins = filterLoginsAfterCursor(logins, previousLastSeenLoginId, baselineAt);
      for (const login of newLogins) {
        const ipInfo = settings.ip_geo_enabled && login.ip ? await this.ipIntel.lookup(login.ip) : null;
        const saved = await this.events.createLoginEventIfNew({
          account_id: account.id,
          linode_login_id: login.id,
          username: login.username ?? null,
          ip: login.ip ?? null,
          datetime: login.datetime,
          status: login.status ?? null,
          raw_json: JSON.stringify({ ...login.raw ?? {}, ip_intelligence: ipInfo ?? undefined })
        });
        if (!saved.created) continue;
        newLoginEvents += 1;
        const assessment = assessLogin(login, settings, ipInfo);
        if (!assessment.shouldCreateSecurityEvent) continue;
        const event = await this.events.createSecurityEvent({
          account_id: account.id,
          type: loginStatusToSecurityType(login),
          severity: assessment.severity,
          status: "open",
          login_event_id: saved.event.id,
          linode_login_id: login.id,
          username: login.username ?? null,
          ip: login.ip ?? null,
          country: ipInfo?.country ?? null,
          region: ipInfo?.region ?? null,
          city: ipInfo?.city ?? null,
          occurred_at: login.datetime,
          metadata_json: JSON.stringify({ account_alias: account.alias, reasons: assessment.reasons, ip_intelligence: ipInfo })
        });
        newEvents.push(toPublicSecurityEvent(event));
        newSecurityEvents += 1;
      }
      await this.accounts.updateLoginCursor(account.id, lastSeenLoginId, new Date().toISOString());
      return { account_id: account.id, account_alias: account.alias, result: "success", new_login_events: newLoginEvents, new_security_events: newSecurityEvents, new_events: newEvents };
    } catch (error) {
      const code = error instanceof AppError ? error.code : ErrorCode.LINODE_API_ERROR;
      let newSecurityEvents = 0;
      if (code === ErrorCode.TOKEN_INVALID || code === ErrorCode.TOKEN_PERMISSION_ERROR) {
        const duplicate = await this.findRecentTokenError(account.id, code, settings.token_error_dedupe_minutes);
        if (duplicate) {
          return { account_id: account.id, account_alias: account.alias, result: "failed", new_login_events: 0, new_security_events: 0, new_events: [], error_code: code, message: `${mapSecurityItemMessage(code)}（已去重）` };
        }
        const event = await this.events.createSecurityEvent({
          account_id: account.id,
          type: code,
          severity: code === ErrorCode.TOKEN_INVALID ? "high" : "medium",
          status: "open",
          occurred_at: new Date().toISOString(),
          metadata_json: JSON.stringify({ account_alias: account.alias, dedupe_minutes: settings.token_error_dedupe_minutes })
        });
        return { account_id: account.id, account_alias: account.alias, result: "failed", new_login_events: 0, new_security_events: 1, new_events: [toPublicSecurityEvent(event)], error_code: code, message: mapSecurityItemMessage(code) };
      }
      return { account_id: account.id, account_alias: account.alias, result: "failed", new_login_events: 0, new_security_events: newSecurityEvents, new_events: [], error_code: code, message: mapSecurityItemMessage(code) };
    }
  }
}

function findNewestLoginId(logins: LinodeLoginEvent[]): string | null {
  let newest: LinodeLoginEvent | null = null;
  for (const login of logins) {
    if (!newest || Date.parse(login.datetime) > Date.parse(newest.datetime)) newest = login;
  }
  return newest?.id ?? null;
}

function filterLoginsAfterCursor(logins: LinodeLoginEvent[], lastSeenLoginId: string | null, baselineAt: number | null): LinodeLoginEvent[] {
  const afterCursor = filterByCursor(logins, lastSeenLoginId);
  if (baselineAt === null) return afterCursor;
  return afterCursor.filter((login) => {
    const loginTime = Date.parse(login.datetime);
    return Number.isFinite(loginTime) && loginTime > baselineAt;
  });
}

function filterByCursor(logins: LinodeLoginEvent[], lastSeenLoginId: string | null): LinodeLoginEvent[] {
  if (!lastSeenLoginId) return logins;
  const cursorIndex = logins.findIndex((login) => login.id === lastSeenLoginId);
  if (cursorIndex >= 0) return logins.slice(0, cursorIndex);
  const cursorNumber = Number(lastSeenLoginId);
  if (Number.isFinite(cursorNumber)) return logins.filter((login) => Number.isFinite(Number(login.id)) && Number(login.id) > cursorNumber);
  return [];
}

function parseOptionalTime(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapSecurityItemMessage(code: string): string {
  if (code === ErrorCode.TOKEN_INVALID) return "Linode Token 无效，请重新添加或更换 Token。";
  if (code === ErrorCode.TOKEN_PERMISSION_ERROR) return "Linode Token 权限不足，请检查 read_only 等权限范围。";
  return "Linode API 请求失败，请稍后重试。";
}

function toPublicSecurityEvent(event: SecurityEventRecord): SecurityEventRecord {
  return {
    id: event.id,
    account_id: event.account_id,
    type: event.type,
    severity: event.severity,
    status: event.status,
    login_event_id: event.login_event_id,
    linode_login_id: event.linode_login_id,
    username: event.username,
    ip: event.ip,
    country: event.country,
    region: event.region,
    city: event.city,
    occurred_at: event.occurred_at,
    created_at: event.created_at,
    updated_at: event.updated_at
  };
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return 20;
  return Math.min(100, Math.max(1, Math.trunc(limit ?? 20)));
}

function normalizeOffset(offset: number | undefined): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.max(0, Math.trunc(offset ?? 0));
}
