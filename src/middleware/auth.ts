import type { Env } from "../env";
import { getExplicitSuperAdminTelegramIds } from "../env";
import { getRuntimeSecrets } from "../services/runtime-secret-service";

export async function verifyApiBearerToken(request: Request, env: Env): Promise<boolean> {
  const secrets = await getRuntimeSecrets(env);
  if (!secrets.api_auth_token) return false;
  const header = request.headers.get("Authorization") ?? "";
  return header === `Bearer ${secrets.api_auth_token}`;
}

export async function verifyTelegramWebhookSecret(request: Request, env: Env): Promise<boolean> {
  const secrets = await getRuntimeSecrets(env);
  if (!secrets.telegram_webhook_secret) return false;
  return request.headers.get("X-Telegram-Bot-Api-Secret-Token") === secrets.telegram_webhook_secret;
}

export function isSuperAdmin(userId: string | number | undefined | null, env: Pick<Env, "SUPER_ADMIN_TELEGRAM_ID" | "SUPER_ADMIN_TELEGRAM_IDS">): boolean {
  const normalized = String(userId ?? "").trim();
  if (!normalized) return false;
  return getExplicitSuperAdminTelegramIds(env).includes(normalized);
}
