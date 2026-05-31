import type { Env } from "../env";
import { hasExplicitSuperAdmin } from "../env";
import { SettingsRepository } from "../storage/settings-repository";

export type SuperAdminRecord = { telegram_user_id?: string; chat_id?: string; bootstrapped_at?: string; source?: string };

export async function getSuperAdminChatId(env: Env): Promise<string | null> {
  if (hasExplicitSuperAdmin(env)) return env.SUPER_ADMIN_TELEGRAM_ID;
  if (!env.DB) return null;
  const record = await new SettingsRepository(env.DB).get<SuperAdminRecord>("super_admin");
  return record?.chat_id ?? record?.telegram_user_id ?? null;
}

export async function bootstrapOrVerifySuperAdmin(env: Env, fromId: string, chatId: string): Promise<boolean> {
  if (hasExplicitSuperAdmin(env)) return String(fromId) === env.SUPER_ADMIN_TELEGRAM_ID;
  if (!env.DB) return false;
  const repository = new SettingsRepository(env.DB);
  const existing = await repository.get<SuperAdminRecord>("super_admin");
  if (!existing?.telegram_user_id) {
    await repository.set("super_admin", { telegram_user_id: String(fromId), chat_id: String(chatId), bootstrapped_at: new Date().toISOString(), source: "telegram:first_message" });
    return true;
  }
  if (String(existing.telegram_user_id) !== String(fromId)) return false;
  if (!existing.chat_id || String(existing.chat_id) !== String(chatId)) await repository.set("super_admin", { ...existing, chat_id: String(chatId) });
  return true;
}
