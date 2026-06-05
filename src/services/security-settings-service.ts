import type { Env } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCode } from "../errors/error-codes";
import { SettingsRepository } from "../storage/settings-repository";

export type SecuritySettings = {
  enabled: boolean;
  ip_geo_enabled: boolean;
  ip_allowlist: string[];
  allowed_countries: string[];
  blocked_countries: string[];
  night_login_enabled: boolean;
  night_start: string;
  night_end: string;
  timezone: string;
  token_error_dedupe_minutes: number;
  login_confirmation_timeout_minutes: number;
  auto_generate_linode_token_enabled: boolean;
  auto_generated_token_scopes: string;
  auto_generated_token_expiry_days: number | null;
};

const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  enabled: true,
  ip_geo_enabled: true,
  ip_allowlist: [],
  allowed_countries: [],
  blocked_countries: [],
  night_login_enabled: true,
  night_start: "00:00",
  night_end: "06:00",
  timezone: "Asia/Shanghai",
  token_error_dedupe_minutes: 24 * 60,
  login_confirmation_timeout_minutes: 30,
  auto_generate_linode_token_enabled: false,
  auto_generated_token_scopes: "*",
  auto_generated_token_expiry_days: null
};

export class SecuritySettingsService {
  private readonly settings: SettingsRepository;

  constructor(private readonly env: Env, settings?: SettingsRepository) {
    if (!env.DB && !settings) throw new AppError(ErrorCode.CONFIG_MISSING, "Missing D1 binding DB", "req_security_settings", 500);
    this.settings = settings ?? new SettingsRepository(env.DB as D1Database);
  }

  async getSettings(): Promise<SecuritySettings> {
    const raw = await this.settings.get<Partial<SecuritySettings>>("security_settings").catch(() => null);
    return normalizeSecuritySettings(raw ?? {}, this.env.APP_TIMEZONE || "Asia/Shanghai");
  }

  async updateSettings(input: Partial<SecuritySettings>): Promise<SecuritySettings> {
    const current = await this.getSettings();
    const next = normalizeSecuritySettings({ ...current, ...input }, this.env.APP_TIMEZONE || current.timezone);
    await this.settings.set("security_settings", next);
    return next;
  }
}

export function normalizeSecuritySettings(input: Partial<SecuritySettings>, fallbackTimezone = "Asia/Shanghai"): SecuritySettings {
  return {
    enabled: input.enabled !== false,
    ip_geo_enabled: input.ip_geo_enabled !== false,
    ip_allowlist: normalizeStringList(input.ip_allowlist),
    allowed_countries: normalizeCountryList(input.allowed_countries),
    blocked_countries: normalizeCountryList(input.blocked_countries),
    night_login_enabled: input.night_login_enabled !== false,
    night_start: normalizeTime(input.night_start, "00:00"),
    night_end: normalizeTime(input.night_end, "06:00"),
    timezone: typeof input.timezone === "string" && input.timezone.trim() ? input.timezone.trim() : fallbackTimezone,
    token_error_dedupe_minutes: normalizeMinutes(input.token_error_dedupe_minutes, 24 * 60),
    login_confirmation_timeout_minutes: normalizeMinutes(input.login_confirmation_timeout_minutes, 30),
    auto_generate_linode_token_enabled: input.auto_generate_linode_token_enabled === true,
    auto_generated_token_scopes: typeof input.auto_generated_token_scopes === "string" && input.auto_generated_token_scopes.trim() ? input.auto_generated_token_scopes.trim() : "*",
    auto_generated_token_expiry_days: input.auto_generated_token_expiry_days === null || input.auto_generated_token_expiry_days === undefined ? null : Math.max(1, Math.min(365, Math.trunc(Number(input.auto_generated_token_expiry_days))))
  };
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).map((item) => item.trim()).filter(Boolean))];
}

function normalizeCountryList(value: unknown): string[] {
  return normalizeStringList(value).map((item) => item.toUpperCase());
}

function normalizeTime(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeMinutes(value: unknown, fallback: number): number {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes < 1) return fallback;
  return Math.min(365 * 24 * 60, Math.trunc(minutes));
}
