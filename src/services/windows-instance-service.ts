import windowsStackScript from "./windows-stackscript-template";
import { WindowsIsoResolverService } from "./windows-iso-resolver-service";
import { WindowsInstallMonitorService } from "./windows-install-monitor-service";
import { WindowsInstallRepository } from "../storage/windows-install-repository";
import { addRdpFirewallRule, describeRdpFirewallStatus } from "./windows-firewall-service";
import { WindowsVersionService, type WindowsLanguageId, type WindowsVersionId } from "./windows-version-service";
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

export interface WindowsInstanceServiceContext { requestId: string; actor: string; source: string; telegramChatId?: string; telegramUserId?: string }
export interface WindowsStackScriptStatus { account: PublicAccount; stackscript_id: number | null; configured: boolean; version: string; version_label: string; base_image: string }
export interface WindowsCreateOptions { account: PublicAccount; stackscript: WindowsStackScriptStatus; regions: LinodeRegion[]; types: LinodeType[]; firewalls: LinodeFirewall[]; version: ReturnType<WindowsVersionService["getVersion"]>; lang: ReturnType<WindowsVersionService["getLanguage"]>; iso_resolve_required: boolean; iso_cached: boolean | null }
export interface CreateWindowsInstanceInput { region: string; type: string; firewall_id?: number | null; label?: string; version?: WindowsVersionId; lang?: WindowsLanguageId; administrator_password?: string; windows_username?: string; keep_administrator_fallback?: boolean }
export interface CreateWindowsInstanceResult { account: PublicAccount; instance: LinodeInstance; stackscript_id: number; windows_version: string; windows_version_label: string; windows_lang: string; windows_username: string; administrator_password: string; temp_root_password: string }

export class WindowsInstanceService {
  private readonly accounts: AccountsRepository;
  private readonly settings: SettingsRepository;
  private readonly audit?: AuditService;
  private readonly installs?: WindowsInstallRepository;
  private readonly versions = new WindowsVersionService();

  constructor(private readonly env: Env, accounts?: AccountsRepository, settings?: SettingsRepository, audit?: AuditService) {
    if (!env.DB && (!accounts || !settings)) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", "req_windows", 500);
    this.accounts = accounts ?? new AccountsRepository(env.DB as D1Database);
    this.settings = settings ?? new SettingsRepository(env.DB as D1Database);
    this.audit = audit ?? (env.DB ? new AuditService(new AuditRepository(env.DB)) : undefined);
    this.installs = env.DB ? new WindowsInstallRepository(env.DB as D1Database) : undefined;
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

  async getCreateOptions(accountId: number, requestId: string, input: { version?: WindowsVersionId; lang?: WindowsLanguageId } = {}): Promise<WindowsCreateOptions> {
    const account = await this.getActiveAccount(accountId, requestId);
    const version = this.versions.getVersion(input.version, requestId);
    const lang = this.versions.getLanguage(input.lang, requestId);
    const token = await this.decryptAccountToken(account);
    const client = new LinodeClient(token);
    const [regions, types, firewalls] = await Promise.all([client.listRegions(requestId), client.listTypes(requestId), client.listFirewalls(requestId).catch((error) => {
      if (error instanceof AppError && error.code === ErrorCode.TOKEN_PERMISSION_ERROR) return [] as LinodeFirewall[];
      throw error;
    })]);
    const isoCached = version.requires_iso_resolve ? await this.isIsoCached(version.id, lang.id) : null;
    return { account: await this.toPublicAccount(account), stackscript: await this.getStatus(account.id, requestId), regions: filterCoreRegions(regions), types: filterWindowsTypes(types, version.min_memory_mb, version.min_disk_mb), firewalls, version, lang, iso_resolve_required: version.requires_iso_resolve, iso_cached: isoCached };
  }

  async createWindowsInstance(accountId: number, input: CreateWindowsInstanceInput, context: WindowsInstanceServiceContext): Promise<CreateWindowsInstanceResult> {
    const account = await this.getActiveAccount(accountId, context.requestId);
    const publicAccount = await this.toPublicAccount(account);
    const stackscriptId = await this.ensureCurrentStackScript(account, context);
    const adminPassword = input.administrator_password ? validateWindowsPassword(input.administrator_password, context.requestId) : generateWindowsPassword();
    const windowsUsername = validateWindowsUsername(input.windows_username ?? "Administrator", context.requestId);
    const keepAdministratorFallback = input.keep_administrator_fallback !== false || windowsUsername === "Administrator";
    const tempRootPassword = generateLinuxPassword();
    const token = await this.decryptAccountToken(account);
    const version = this.versions.getVersion(input.version, context.requestId);
    const lang = this.versions.getLanguage(input.lang, context.requestId);
    const client = new LinodeClient(token);
    await this.validateCreateTarget(client, input.region, input.type, version, context.requestId);
    const firewallStatus = await this.validateRdpFirewall(client, input.firewall_id, context.requestId);
    if (input.firewall_id !== undefined && input.firewall_id !== null && !firewallStatus.ok) throw new AppError(ErrorCode.VALIDATION_ERROR, `${firewallStatus.message}，请先一键修复或选择不使用防火墙`, context.requestId, 400);
    const iso = version.requires_iso_resolve ? await new WindowsIsoResolverService(this.env, this.settings).resolve({ version: version.id, lang: lang.id, requestId: context.requestId }) : null;
    const installMonitor = this.installs ? new WindowsInstallMonitorService(this.env, this.installs) : null;
    const preliminaryLabel = this.resolveLabel(input, context.requestId);
    const install = installMonitor ? await installMonitor.createInstallRecord({ accountId: account.id, instanceLabel: preliminaryLabel, telegramChatId: context.telegramChatId ?? null, telegramUserId: context.telegramUserId ?? null, metadata: { version: version.id, lang: lang.id, firewall: firewallStatus } }) : null;
    const payload = await this.buildCreatePayload(input, stackscriptId, token, adminPassword, windowsUsername, keepAdministratorFallback, tempRootPassword, context.requestId, version, lang, iso?.iso_url ?? "NOURL", install?.callbackToken ?? "", preliminaryLabel);
    try {
      const instance = await client.createInstance(payload, context.requestId);
      if (this.installs && install) await this.installs.attachInstance(install.record.id, Number(instance.id), Array.isArray((instance as any).ipv4) ? (instance as any).ipv4[0] : null, { version: version.id, lang: lang.id, label: payload.label });
      await this.recordAudit(context, "windows_instance.create", "instance", String(instance.id || payload.label), "critical", "success", null, { account_id: account.id, region: payload.region, type: payload.type, stackscript_id: stackscriptId, version: version.id, lang: lang.id, iso_resolved: Boolean(iso) });
      return { account: publicAccount, instance, stackscript_id: stackscriptId, windows_version: version.id, windows_version_label: version.label, windows_lang: lang.id, windows_username: windowsUsername, administrator_password: adminPassword, temp_root_password: tempRootPassword };
    } catch (error) {
      const code = error instanceof AppError ? error.code : ErrorCode.LINODE_API_ERROR;
      await this.recordAudit(context, "windows_instance.create", "instance", input.label ?? null, "critical", "failed", code, { account_id: account.id, region: input.region, type: input.type, stackscript_id: stackscriptId, version: input.version ?? "2k22", lang: input.lang ?? "en-us" });
      if (error instanceof AppError) throw error;
      throw new AppError(ErrorCode.LINODE_API_ERROR, "Linode Windows 创建请求失败", context.requestId, 502);
    }
  }

  async getRdpFirewallStatus(accountId: number, firewallId: number, requestId: string): Promise<{ ok: boolean; message: string }> {
    const account = await this.getActiveAccount(accountId, requestId);
    const token = await this.decryptAccountToken(account);
    const firewall = await new LinodeClient(token).getFirewall(firewallId, requestId);
    return describeRdpFirewallStatus(firewall);
  }

  async fixRdpFirewall(accountId: number, firewallId: number, context: WindowsInstanceServiceContext): Promise<{ ok: boolean; message: string }> {
    const account = await this.getActiveAccount(accountId, context.requestId);
    const token = await this.decryptAccountToken(account);
    const client = new LinodeClient(token);
    const firewall = await client.getFirewall(firewallId, context.requestId);
    if (describeRdpFirewallStatus(firewall).ok) return describeRdpFirewallStatus(firewall);
    const rules = addRdpFirewallRule(firewall);
    const updated = await client.updateFirewallRules(firewallId, rules, context.requestId);
    const status = describeRdpFirewallStatus(updated);
    await this.recordAudit(context, "windows.firewall_fix_rdp", "firewall", String(firewallId), "high", status.ok ? "success" : "failed", status.ok ? null : ErrorCode.LINODE_API_ERROR, { account_id: account.id, firewall_id: firewallId, opened_port: 3389 });
    return status;
  }

  private async validateRdpFirewall(client: LinodeClient, firewallId: number | null | undefined, requestId: string): Promise<{ ok: boolean; message: string }> {
    if (firewallId === undefined || firewallId === null) return describeRdpFirewallStatus(null);
    const firewall = await client.getFirewall(Number(firewallId), requestId);
    return describeRdpFirewallStatus(firewall);
  }

  private async validateCreateTarget(client: LinodeClient, regionId: string, typeId: string, version: ReturnType<WindowsVersionService["getVersion"]>, requestId: string): Promise<void> {
    const [regions, types] = await Promise.all([client.listRegions(requestId), client.listTypes(requestId)]);
    const region = regions.find((item) => item.id === regionId);
    if (!region) throw new AppError(ErrorCode.VALIDATION_ERROR, "Windows 创建地区不可用，请重新选择 Region", requestId, 400);
    if (region.site_type && region.site_type !== "core") throw new AppError(ErrorCode.VALIDATION_ERROR, "Windows 创建只支持 Linode core region，请重新选择地区", requestId, 400);
    const type = types.find((item) => item.id === typeId);
    if (!type) throw new AppError(ErrorCode.VALIDATION_ERROR, "Windows 创建套餐不可用，请重新选择 Plan", requestId, 400);
    if (Number(type.memory ?? 0) < version.min_memory_mb || Number(type.disk ?? 0) < version.min_disk_mb) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, `该 Plan 不满足 ${version.label} 最低要求：${version.min_memory_mb}MB 内存 / ${version.min_disk_mb}MB 磁盘`, requestId, 400);
    }
  }

  private stackScriptPayload(): { label: string; description: string; script: string; images: string[]; is_public: boolean; rev_note: string } {
    return { label: WINDOWS_STACKSCRIPT_LABEL, description: "Windows Server 2022 deployment for Linode Guard Lite. API-first private StackScript route.", script: windowsStackScript, images: [WINDOWS_STACKSCRIPT_IMAGE], is_public: false, rev_note: "Linode Guard Lite Windows Server 2022 route" };
  }

  private async buildCreatePayload(input: CreateWindowsInstanceInput, stackscriptId: number, linodeToken: string, adminPassword: string, windowsUsername: string, keepAdministratorFallback: boolean, tempRootPassword: string, requestId: string, version: ReturnType<WindowsVersionService["getVersion"]>, lang: ReturnType<WindowsVersionService["getLanguage"]>, isoUrl: string, installCallbackToken: string, resolvedLabel?: string) {
    const region = typeof input.region === "string" ? input.region.trim() : "";
    const type = typeof input.type === "string" ? input.type.trim() : "";
    if (!region || !type) throw new AppError(ErrorCode.VALIDATION_ERROR, "region/type are required", requestId, 400);
    const label = resolvedLabel ?? this.resolveLabel(input, requestId);
    if (!/^[A-Za-z0-9._-]{3,64}$/.test(label)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid instance label", requestId, 400);
    const stackscriptVersion = version.id === "2k25" ? (lang.id === "zh-cn" ? "2k25-cn" : "2k25-en") : version.stackscript_version;
    const stackscriptData = { TOKEN: linodeToken, WINDOWS_PASSWORD: adminPassword, WINDOWS_USERNAME: windowsUsername, KEEP_ADMINISTRATOR_FALLBACK: keepAdministratorFallback ? "true" : "false", INSTALL_WINDOWS_VERSION: stackscriptVersion, WINDOWS_IMAGE_NAME: version.image_name, WINDOWS_LANG: lang.id, AUTOLOGIN: "true", W11_ISO_URL: isoUrl, INSTALL_CALLBACK_URL: await this.getWindowsInstallCallbackUrl(), INSTALL_CALLBACK_TOKEN: installCallbackToken };
    if (JSON.stringify(stackscriptData).length > 65535) throw new AppError(ErrorCode.VALIDATION_ERROR, "StackScript data is too large", requestId, 400);
    const payload: any = { region, type, image: WINDOWS_STACKSCRIPT_IMAGE, label, root_pass: tempRootPassword, backups_enabled: false, tags: ["linode-guard-lite", "windows-stackscript", version.id], stackscript_id: stackscriptId, stackscript_data: stackscriptData };
    if (input.firewall_id !== undefined && input.firewall_id !== null) {
      const firewallId = Number(input.firewall_id);
      if (!Number.isInteger(firewallId) || firewallId <= 0) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid firewall id", requestId, 400);
      payload.firewall_id = firewallId;
    }
    return payload;
  }

  private resolveLabel(input: CreateWindowsInstanceInput, requestId: string): string {
    const label = typeof input.label === "string" && input.label.trim() ? input.label.trim() : createDefaultWindowsLabel();
    if (!/^[A-Za-z0-9._-]{3,64}$/.test(label)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid instance label", requestId, 400);
    return label;
  }

  private async getWindowsInstallCallbackUrl(): Promise<string> {
    const fromSettings = await this.settings.get<string>("public_base_url").catch(() => null);
    const base = (typeof fromSettings === "string" && fromSettings.trim() ? fromSettings : (typeof this.env.PUBLIC_BASE_URL === "string" ? this.env.PUBLIC_BASE_URL : "")).trim().replace(/\/+$/, "");
    return base ? `${base}/api/v1/windows/install-callback` : "";
  }

  private async isIsoCached(version: WindowsVersionId, lang: WindowsLanguageId): Promise<boolean> {
    const cached = await this.settings.get<{ expires_at?: string; iso_url?: string }>(`windows_iso_cache:${version}:${lang}`).catch(() => null);
    return Boolean(cached?.iso_url && cached.expires_at && Date.parse(cached.expires_at) > Date.now());
  }

  private async ensureCurrentStackScript(account: LinodeAccountRecord, context: WindowsInstanceServiceContext): Promise<number> {
    const token = await this.decryptAccountToken(account);
    const client = new LinodeClient(token);
    const existingId = await this.getStackScriptId(account.id);
    const payload = this.stackScriptPayload();
    try {
      const script = existingId > 0 ? await client.updateStackScript(existingId, payload, context.requestId) : await client.createStackScript(payload, context.requestId);
      const id = Number(script.id || existingId);
      if (!Number.isInteger(id) || id <= 0) throw new AppError(ErrorCode.LINODE_API_ERROR, "StackScript did not return id", context.requestId, 502);
      await this.settings.set(this.stackScriptSettingKey(account.id), id);
      if (existingId <= 0 || id !== existingId) {
        await this.recordAudit(context, existingId > 0 ? "windows_stackscript.update" : "windows_stackscript.create", "account", String(account.id), "high", "success", null, { account_id: account.id, stackscript_id: id, image: WINDOWS_STACKSCRIPT_IMAGE, version: WINDOWS_STACKSCRIPT_VERSION });
      }
      return id;
    } catch (error) {
      const code = error instanceof AppError ? error.code : ErrorCode.LINODE_API_ERROR;
      await this.recordAudit(context, existingId > 0 ? "windows_stackscript.update" : "windows_stackscript.create", "account", String(account.id), "high", "failed", code, { account_id: account.id, stackscript_id: existingId || null });
      if (error instanceof AppError) throw error;
      throw new AppError(ErrorCode.LINODE_API_ERROR, "Linode StackScript 请求失败", context.requestId, 502);
    }
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

function filterWindowsTypes(types: LinodeType[], minMemoryMb = WINDOWS_STACKSCRIPT_MIN_MEMORY_MB, minDiskMb = WINDOWS_STACKSCRIPT_MIN_DISK_MB): LinodeType[] {
  return types.filter((item) => Number(item.memory ?? 0) >= minMemoryMb && Number(item.disk ?? 0) >= minDiskMb).sort((a, b) => Number(a.price?.monthly ?? 0) - Number(b.price?.monthly ?? 0));
}

function filterCoreRegions(regions: LinodeRegion[]): LinodeRegion[] {
  return regions.filter((item) => !item.site_type || item.site_type === "core");
}

function createDefaultWindowsLabel(): string {
  return `lgl-win-${new Date().toISOString().replace(/[-:]/g, "").slice(0, 13)}`;
}

export function validateWindowsPassword(password: string, requestId = "req_windows"): string {
  const value = typeof password === "string" ? password.trim() : "";
  if (value.length < 10 || value.length > 64) throw new AppError(ErrorCode.VALIDATION_ERROR, "Windows password must be 10-64 characters", requestId, 400);
  if (/\s/.test(value)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Windows password must not contain spaces", requestId, 400);
  if (/[<>&"']/.test(value)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Windows password contains unsupported XML characters", requestId, 400);
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/[0-9]/.test(value) || !/[!@#$%^*_.+=?-]/.test(value)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Windows password must include upper/lower letters, number and symbol", requestId, 400);
  if (/(password|administrator|admin|123456|qwerty)/i.test(value)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Windows password is too weak", requestId, 400);
  return value;
}

export function validateWindowsUsername(username: string, requestId = "req_windows"): string {
  const value = typeof username === "string" && username.trim() ? username.trim() : "Administrator";
  if (value === "Administrator") return value;
  if (!/^[A-Za-z][A-Za-z0-9_-]{2,19}$/.test(value)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Windows username must start with a letter and be 3-20 chars", requestId, 400);
  if (/^(admin|administrator|guest|defaultaccount|wdagutilityaccount)$/i.test(value)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Windows username is reserved", requestId, 400);
  return value;
}

function generateWindowsPassword(): string { return generatePassword(24); }
function generateLinuxPassword(): string { return generatePassword(32); }

function generatePassword(length: number): string {
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%^*_-+=?";
  const alphabet = lower + upper + digits + symbols;
  const required = [randomChar(lower), randomChar(upper), randomChar(digits), randomChar(symbols)];
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () => randomChar(alphabet));
  return shuffle([...required, ...rest]).join("");
}
function randomChar(chars: string): string { const array = new Uint32Array(1); crypto.getRandomValues(array); return chars[array[0] % chars.length]; }
function shuffle<T>(items: T[]): T[] { for (let i = items.length - 1; i > 0; i -= 1) { const array = new Uint32Array(1); crypto.getRandomValues(array); const j = array[0] % (i + 1); [items[i], items[j]] = [items[j], items[i]]; } return items; }
