export interface Env {
  DB?: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  SUPER_ADMIN_TELEGRAM_ID?: string;
  API_AUTH_TOKEN?: string;
  LINODE_TOKEN_ENCRYPTION_KEY?: string;
  APP_TIMEZONE?: string;
  BATCH_CONCURRENCY?: string;
  OPERATION_LOG_RETENTION_DAYS?: string;
  LOGIN_EVENT_RETENTION_DAYS?: string;
  CF_VERSION_METADATA?: WorkerVersionMetadata;
  PUBLIC_BASE_URL?: string;
  WINDOWS_2025_CN_DD_IMAGE_URL?: string;
  WINDOWS_11_CN_DD_IMAGE_URL?: string;
}

function hasValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function hasExplicitSuperAdmin(env: Pick<Env, "SUPER_ADMIN_TELEGRAM_ID">): env is Pick<Env, "SUPER_ADMIN_TELEGRAM_ID"> & { SUPER_ADMIN_TELEGRAM_ID: string } {
  return hasValue(env.SUPER_ADMIN_TELEGRAM_ID);
}

export function getSuperAdminTelegramId(env: Pick<Env, "SUPER_ADMIN_TELEGRAM_ID">): string {
  return hasValue(env.SUPER_ADMIN_TELEGRAM_ID) ? env.SUPER_ADMIN_TELEGRAM_ID : "";
}
