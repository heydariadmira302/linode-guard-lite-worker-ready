export interface Env {
  DB?: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  SUPER_ADMIN_TELEGRAM_ID?: string;
  SUPER_ADMIN_TELEGRAM_IDS?: string;
  API_AUTH_TOKEN?: string;
  LINODE_TOKEN_ENCRYPTION_KEY?: string;
  APP_TIMEZONE?: string;
  BATCH_CONCURRENCY?: string;
  OPERATION_LOG_RETENTION_DAYS?: string;
  LOGIN_EVENT_RETENTION_DAYS?: string;
  CF_VERSION_METADATA?: WorkerVersionMetadata;
  PUBLIC_BASE_URL?: string;
}

function hasValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseSuperAdminTelegramIds(value: unknown): string[] {
  if (!hasValue(value)) return [];
  return Array.from(new Set(value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean)));
}

export function getExplicitSuperAdminTelegramIds(env: Pick<Env, "SUPER_ADMIN_TELEGRAM_ID" | "SUPER_ADMIN_TELEGRAM_IDS">): string[] {
  const multi = parseSuperAdminTelegramIds(env.SUPER_ADMIN_TELEGRAM_IDS);
  return multi.length > 0 ? multi : parseSuperAdminTelegramIds(env.SUPER_ADMIN_TELEGRAM_ID);
}

export function hasExplicitSuperAdmin(env: Pick<Env, "SUPER_ADMIN_TELEGRAM_ID" | "SUPER_ADMIN_TELEGRAM_IDS">): boolean {
  return getExplicitSuperAdminTelegramIds(env).length > 0;
}

export function isConfiguredSuperAdminTelegramId(userId: string | number | undefined | null, env: Pick<Env, "SUPER_ADMIN_TELEGRAM_ID" | "SUPER_ADMIN_TELEGRAM_IDS">): boolean {
  if (userId === undefined || userId === null) return false;
  return getExplicitSuperAdminTelegramIds(env).includes(String(userId));
}

export function getSuperAdminTelegramId(env: Pick<Env, "SUPER_ADMIN_TELEGRAM_ID" | "SUPER_ADMIN_TELEGRAM_IDS">): string {
  return getExplicitSuperAdminTelegramIds(env)[0] ?? "";
}
