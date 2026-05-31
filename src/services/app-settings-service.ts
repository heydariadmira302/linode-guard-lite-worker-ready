import type { Env } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { SettingsRepository } from "../storage/settings-repository";

export type BootSafetyMode = "bot_managed_only" | "all_offline";

export type ProtectedInstanceRule = {
  account_id?: number | null;
  instance_id?: number | null;
  label?: string | null;
};

export type AppSettings = {
  timezone: string;
  batch_concurrency: number;
  operation_log_retention_days: number;
  login_event_retention_days: number;
  boot_safety_mode: BootSafetyMode;
  protected_instances: ProtectedInstanceRule[];
  telegram_auto_delete_minutes: number;
  dangerous_action_cooldown_enabled: boolean;
};

const DEFAULT_APP_SETTINGS: AppSettings = {
  timezone: "Asia/Shanghai",
  batch_concurrency: 5,
  operation_log_retention_days: 1,
  login_event_retention_days: 1,
  boot_safety_mode: "bot_managed_only",
  protected_instances: [],
  telegram_auto_delete_minutes: 0,
  dangerous_action_cooldown_enabled: true
};

export class AppSettingsService {
  private readonly settings: SettingsRepository;

  constructor(private readonly env: Env, settings?: SettingsRepository) {
    if (!env.DB && !settings) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", "req_app_settings", 500);
    this.settings = settings ?? new SettingsRepository(env.DB as D1Database);
  }

  async getSettings(): Promise<AppSettings> {
    const raw = await this.settings.get<Partial<AppSettings>>("app_settings").catch(() => null);
    return normalizeAppSettings(raw ?? {}, this.env);
  }

  async updateSettings(input: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.getSettings();
    const next = normalizeAppSettings({ ...current, ...input }, this.env);
    await this.settings.set("app_settings", next);
    return next;
  }

  async addProtectedInstance(rule: ProtectedInstanceRule): Promise<AppSettings> {
    const current = await this.getSettings();
    return await this.updateSettings({ protected_instances: [...current.protected_instances, rule] });
  }

  async removeProtectedInstance(index: number): Promise<AppSettings> {
    const current = await this.getSettings();
    if (!Number.isInteger(index) || index < 0 || index >= current.protected_instances.length) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Protected instance rule not found", "req_app_settings", 404);
    }
    return await this.updateSettings({ protected_instances: current.protected_instances.filter((_, itemIndex) => itemIndex !== index) });
  }

  async estimateProtectedMatches(input: { account_id?: number | null; group_id?: number | null; instance_ids?: number[] | null } = {}): Promise<{ protected_count: number; rules: ProtectedInstanceRule[] }> {
    const current = await this.getSettings();
    const scopedRules = current.protected_instances.filter((rule) => {
      if (input.account_id && rule.account_id && Number(rule.account_id) !== Number(input.account_id)) return false;
      if (input.instance_ids?.length && rule.instance_id && !input.instance_ids.includes(Number(rule.instance_id))) return false;
      return true;
    });
    return { protected_count: scopedRules.length, rules: scopedRules };
  }
}

export function normalizeAppSettings(input: Partial<AppSettings>, env: Pick<Env, "APP_TIMEZONE" | "BATCH_CONCURRENCY" | "OPERATION_LOG_RETENTION_DAYS" | "LOGIN_EVENT_RETENTION_DAYS"> = {}): AppSettings {
  return {
    timezone: typeof input.timezone === "string" && input.timezone.trim() ? input.timezone.trim() : env.APP_TIMEZONE || DEFAULT_APP_SETTINGS.timezone,
    batch_concurrency: normalizePositiveInteger(input.batch_concurrency, normalizePositiveInteger(env.BATCH_CONCURRENCY, DEFAULT_APP_SETTINGS.batch_concurrency)),
    operation_log_retention_days: normalizePositiveInteger(input.operation_log_retention_days, normalizePositiveInteger(env.OPERATION_LOG_RETENTION_DAYS, DEFAULT_APP_SETTINGS.operation_log_retention_days)),
    login_event_retention_days: normalizePositiveInteger(input.login_event_retention_days, normalizePositiveInteger(env.LOGIN_EVENT_RETENTION_DAYS, DEFAULT_APP_SETTINGS.login_event_retention_days)),
    boot_safety_mode: input.boot_safety_mode === "all_offline" ? "all_offline" : "bot_managed_only",
    protected_instances: normalizeProtectedInstances(input.protected_instances),
    telegram_auto_delete_minutes: normalizeAutoDeleteMinutes(input.telegram_auto_delete_minutes),
    dangerous_action_cooldown_enabled: input.dangerous_action_cooldown_enabled !== false
  };
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.trunc(parsed);
}

function normalizeAutoDeleteMinutes(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(48 * 60, Math.trunc(parsed));
}

function normalizeProtectedInstances(value: unknown): ProtectedInstanceRule[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const rules: ProtectedInstanceRule[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const accountId = normalizeOptionalId(raw.account_id);
    const instanceId = normalizeOptionalId(raw.instance_id);
    const label = typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : null;
    if (!accountId && !instanceId && !label) continue;
    const rule: ProtectedInstanceRule = { account_id: accountId, instance_id: instanceId, label };
    const key = `${accountId ?? ""}:${instanceId ?? ""}:${label ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rules.push(rule);
  }
  return rules.slice(0, 100);
}

function normalizeOptionalId(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}
