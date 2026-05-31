import windowsStackScript from "./windows-stackscript-template";
import { LinodeClient, type LinodeFirewall, type LinodeInstance, type LinodeRegion, type LinodeType } from "../clients/linode-client";
import { decryptLinodeToken } from "../crypto/token-crypto";
import type { Env } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { AccountsRepository, isActiveAccountStatus, type LinodeAccountRecord } from "../storage/accounts-repository";
import { AuditRepository } from "../storage/audit-repository";
import { SettingsRepository } from "../storage/settings-repository";
import { AuditService } from "./audit-service";
import { getLinodeTokenEncryptionKey } from "./runtime-secret-service";
import type { PublicAccount } from "./account-service";

export const WINDOWS_STACKSCRIPT_IMAGE = "linode/ubuntu22.04";
export const WINDOWS_STACKSCRIPT_LABEL = "Linode Guard Lite Windows Server";
export const WINDOWS_STACKSCRIPT_VERSION = "2k22";
export const WINDOWS_STACKSCRIPT_VERSION_LABEL = "Windows Server 2022 Evaluation";
export const WINDOWS_STACKSCRIPT_MIN_MEMORY_MB = 4096;
export const WINDOWS_STACKSCRIPT_MIN_DISK_MB = 81920;

export interface WindowsInstanceServiceContext { requestId: string; actor: string; source: string }
export interface WindowsStackScriptStatus { account: PublicAccount; stackscript_id: number | null; configured: boolean; version: string; version_label: string; base_image: string }
export interface WindowsCreateOptions { account: PublicAccount; stackscript: WindowsStackScriptStatus; regions: LinodeRegion[]; types: LinodeType[]; firewalls: LinodeFirewall[] }
export interface CreateWindowsInstanceInput { region: string; type: string; firewall_id?: number | null; label?: string }
export interface CreateWindowsInstanceResult { account: PublicAccount; instance: LinodeInstance; stackscript_id: number; windows_version: string; administrator_password: string; temp_root_password: string }

export class WindowsInstanceService {
  private readonly accounts: AccountsRepository;
  private readonly settings: SettingsRepository;
  private readonly audit?: AuditService;

  constructor(private readonly env: Env, accounts?: AccountsRepository, settings?: SettingsRepository, audit?: AuditService) {
    if (!env.DB && (!accounts || !settings)) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", "req_windows", 500);
    this.accounts = accounts ?? new AccountsRepository(env.DB as D1Database);
    this.settings = settings ?? new SettingsRepository(env.DB as D1Database);
    this.audit = audit ?? (env.DB ? new AuditService(new AuditRepository(env.DB)) : undefined);
  }

  async getStatus(accountId: number, requestId: string): Promise<WindowsStackScriptStatus> {
    const account = await this.getActiveAccount(accountId, requestId);
    const stackscriptId = await this.getStackScriptId(account.id);
    return { account: await this.toPublicAccount(account), stackscript_id: stackscriptId, configured: stackscriptId > 0, version: WINDOWS_STACKSCRIPT_VERSION, version_label: WINDOWS_STACKSCRIPT_VERSION_LABEL, base_image: WINDOWS_STACKSCRIPT_IMAGE };
  }

  async ensureStackScript(accountId: number, context: WindowsInstanceServiceContext): Promise<WindowsStackScriptStatus> {
    const account = await this.getActiveAccount(accountId, context.requestId);
    const publicAccount = await this.toPublicAccount(account);
    const token = await this.decryptAccountToken(account);
    const client = new LinodeClient(token);
    const existingId = await this.getStackScriptId(account.id);
    try {
      const payload = this.stackScriptPayload();
      const script = existingId > 0 ? await client.updateStackScript(existingId, payload, context.requestId) : await client.createStackScript(payload, context.requestId);
      const id = Number(script.id || existingId);
      if (!Number.isInteger(id) || id <= 0) throw new AppError(ErrorCode.LINODE_API_ERROR, "StackScript did not return id", context.requestId, 502);
      await this.settings.set(this.stackScriptSettingKey(account.id), id);
      await this.recordAudit(context, existingId > 0 ? "windows_stackscript.update" : "windows_stackscript.create", "account", String(account.id), "high", "success", null, { account_id: account.id, stackscript_id: id, image: WINDOWS_STACKSCRIPT_IMAGE, version: WINDOWS_STACKSCRIPT_VERSION });
      return { account: publicAccount, stackscript_id: id, configured: true, version: WINDOWS_STACKSCRIPT_VERSION, version_label: WINDOWS_STACKSCRIPT_VERSION_LABEL, base_image: WINDOWS_STACKSCRIPT_IMAGE };
    } catch (error) {
      const code = error instanceof AppError ? error.code : ErrorCode.LINODE_API_ERROR;
      await this.recordAudit(context, existingId > 0 ? "windows_stackscript.update" : "windows_stackscript.create", "account", String(account.id), "high", "failed", code, { account_id: account.id, stackscript_id: existingId || null });
      if (error instanceof AppError) throw error;
      throw new AppError(ErrorCode.LINODE_API_ERROR, "Linode StackScript 请求失败", context.requestId, 502);
    }
  }

  async getCreateOptions(accountId: number, requestId: string): Promise<WindowsCreateOptions> {
    const account = await this.getActiveAccount(accountId, requestId);
    const token = await this.decryptAccountToken(account);
    const client = new LinodeClient(token);
    const [regions, types, firewalls] = await Promise.all([client.listRegions(requestId), client.listTypes(requestId), client.listFirewalls(requestId).catch((error) => {
      if (error instanceof AppError && error.code === ErrorCode.TOKEN_PERMISSION_ERROR) return [] as LinodeFirewall[];
      throw error;
    })]);
    return { account: await this.toPublicAccount(account), stackscript: await this.getStatus(account.id, requestId), regions, types: filterWindowsTypes(types), firewalls };
  }

  async createWindowsInstance(accountId: number, input: CreateWindowsInstanceInput, context: WindowsInstanceServiceContext): Promise<CreateWindowsInstanceResult> {
    const account = await this.getActiveAccount(accountId, context.requestId);
    const publicAccount = await this.toPublicAccount(account);
    const stackscriptId = await this.getStackScriptId(account.id);
    if (stackscriptId <= 0) throw new AppError(ErrorCode.VALIDATION_ERROR, "Windows StackScript is not configured for this account", context.requestId, 400);
    const adminPassword = generateWindowsPassword();
    const tempRootPassword = generateLinuxPassword();
    const token = await this.decryptAccountToken(account);
    const payload = this.buildCreatePayload(input, stackscriptId, token, adminPassword, tempRootPassword, context.requestId);
    try {
      const instance = await new LinodeClient(token).createInstance(payload, context.requestId);
      await this.recordAudit(context, "windows_instance.create", "instance", String(instance.id || payload.label), "critical", "success", null, { account_id: account.id, region: payload.region, type: payload.type, stackscript_id: stackscriptId, version: WINDOWS_STACKSCRIPT_VERSION });
      return { account: publicAccount, instance, stackscript_id: stackscriptId, windows_version: WINDOWS_STACKSCRIPT_VERSION, administrator_password: adminPassword, temp_root_password: tempRootPassword };
    } catch (error) {
      const code = error instanceof AppError ? error.code : ErrorCode.LINODE_API_ERROR;
      await this.recordAudit(context, "windows_instance.create", "instance", input.label ?? null, "critical", "failed", code, { account_id: account.id, region: input.region, type: input.type, stackscript_id: stackscriptId });
      if (error instanceof AppError) throw error;
      throw new AppError(ErrorCode.LINODE_API_ERROR, "Linode Windows 创建请求失败", context.requestId, 502);
    }
  }

  private stackScriptPayload(): { label: string; description: string; script: string; images: string[]; is_public: boolean; rev_note: string } {
    return { label: WINDOWS_STACKSCRIPT_LABEL, description: "Windows Server 2022 deployment for Linode Guard Lite. API-first private StackScript route.", script: windowsStackScript, images: [WINDOWS_STACKSCRIPT_IMAGE], is_public: false, rev_note: "Linode Guard Lite Windows Server 2022 route" };
  }

  private buildCreatePayload(input: CreateWindowsInstanceInput, stackscriptId: number, linodeToken: string, adminPassword: string, tempRootPassword: string, requestId: string) {
    const region = typeof input.region === "string" ? input.region.trim() : "";
    const type = typeof input.type === "string" ? input.type.trim() : "";
    if (!region || !type) throw new AppError(ErrorCode.VALIDATION_ERROR, "region/type are required", requestId, 400);
    const label = typeof input.label === "string" && input.label.trim() ? input.label.trim() : createDefaultWindowsLabel();
    if (!/^[A-Za-z0-9._-]{3,64}$/.test(label)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid instance label", requestId, 400);
    const payload: any = { region, type, image: WINDOWS_STACKSCRIPT_IMAGE, label, root_pass: tempRootPassword, backups_enabled: false, tags: ["linode-guard-lite", "windows-stackscript", "windows-server-2022-eval"], stackscript_id: stackscriptId, stackscript_data: { TOKEN: linodeToken, WINDOWS_PASSWORD: adminPassword, INSTALL_WINDOWS_VERSION: WINDOWS_STACKSCRIPT_VERSION, AUTOLOGIN: "true", W11_ISO_URL: "NOURL" } };
    if (input.firewall_id !== undefined && input.firewall_id !== null) {
      const firewallId = Number(input.firewall_id);
      if (!Number.isInteger(firewallId) || firewallId <= 0) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid firewall id", requestId, 400);
      payload.firewall_id = firewallId;
    }
    return payload;
  }

  private async getActiveAccount(accountId: number, requestId: string): Promise<LinodeAccountRecord> {
    if (!Number.isInteger(accountId) || accountId <= 0) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid account id", requestId, 400);
    const account = await this.accounts.getById(accountId);
    if (!account || !isActiveAccountStatus(account.status)) throw new AppError(ErrorCode.ACCOUNT_NOT_FOUND, "Account not found", requestId, 404);
    return account;
  }

  private async decryptAccountToken(account: LinodeAccountRecord): Promise<string> {
    return await decryptLinodeToken(account.encrypted_token, await getLinodeTokenEncryptionKey(this.env));
  }

  private async getStackScriptId(accountId: number): Promise<number> {
    const value = await this.settings.get<number | string>(this.stackScriptSettingKey(accountId)).catch(() => null);
    const parsed = typeof value === "object" ? 0 : Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
  }

  private stackScriptSettingKey(accountId: number): string { return `windows_stackscript_id:${accountId}`; }

  private async toPublicAccount(account: LinodeAccountRecord): Promise<PublicAccount> {
    return { id: account.id, alias: account.alias, token_fingerprint: account.token_fingerprint, token_status: account.token_status, status: account.status || "active", created_at: account.created_at, updated_at: account.updated_at, deleted_at: account.deleted_at, security_baseline_at: account.security_baseline_at, group_id: account.group_id ?? null };
  }

  private async recordAudit(context: WindowsInstanceServiceContext, action: string, resourceType: string, resourceId: string | null, severity: "low" | "medium" | "high" | "critical", result: "success" | "failed", errorCode: string | null, metadata: Record<string, unknown>): Promise<void> {
    await this.audit?.record({ request_id: context.requestId, actor: context.actor, source: context.source, action, target_type: resourceType, target_id: resourceId, risk_level: severity, result, error_code: errorCode, metadata_json: JSON.stringify(metadata) });
  }
}

function filterWindowsTypes(types: LinodeType[]): LinodeType[] {
  return types.filter((item) => Number(item.memory ?? 0) >= WINDOWS_STACKSCRIPT_MIN_MEMORY_MB && Number(item.disk ?? 0) >= WINDOWS_STACKSCRIPT_MIN_DISK_MB).sort((a, b) => Number(a.price?.monthly ?? 0) - Number(b.price?.monthly ?? 0));
}

function createDefaultWindowsLabel(): string {
  return `lgl-win-${new Date().toISOString().replace(/[-:]/g, "").slice(0, 13)}`;
}

function generateWindowsPassword(): string { return generatePassword(24); }
function generateLinuxPassword(): string { return generatePassword(32); }

function generatePassword(length: number): string {
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%^&*_-+=?";
  const alphabet = lower + upper + digits + symbols;
  const required = [randomChar(lower), randomChar(upper), randomChar(digits), randomChar(symbols)];
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () => randomChar(alphabet));
  return shuffle([...required, ...rest]).join("");
}
function randomChar(chars: string): string { const array = new Uint32Array(1); crypto.getRandomValues(array); return chars[array[0] % chars.length]; }
function shuffle<T>(items: T[]): T[] { for (let i = items.length - 1; i > 0; i -= 1) { const array = new Uint32Array(1); crypto.getRandomValues(array); const j = array[0] % (i + 1); [items[i], items[j]] = [items[j], items[i]]; } return items; }
