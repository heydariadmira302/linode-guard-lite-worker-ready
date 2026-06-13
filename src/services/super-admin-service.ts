import type { Env } from "../env";
import { getExplicitSuperAdminTelegramIds } from "../env";
import { SettingsRepository } from "../storage/settings-repository";

export type SuperAdminRecord = { telegram_user_id?: string; chat_id?: string; bootstrapped_at?: string; source?: string };
export type D1SuperAdminRecord = { telegram_user_id: string; added_at: string; added_by?: string; chat_id?: string; source: "telegram" };
export type ListedSuperAdmin = { telegram_user_id: string; source: "env" | "bootstrap" | "d1"; protected: boolean; removable: boolean; added_at?: string; added_by?: string; chat_id?: string };
export type PublicSuperAdmin = ListedSuperAdmin;

const D1_SUPER_ADMINS_SETTING_KEY = "super_admins_d1";

export function canManageSuperAdmins(env: Pick<Env, "SUPER_ADMIN_TELEGRAM_ID" | "SUPER_ADMIN_TELEGRAM_IDS">, telegramUserId: string | number | undefined | null): boolean {
  if (telegramUserId === undefined || telegramUserId === null) return false;
  return getExplicitSuperAdminTelegramIds(env).includes(String(telegramUserId));
}

export async function getSuperAdminChatId(env: Env): Promise<string | null> {
  const explicitIds = getExplicitSuperAdminTelegramIds(env);
  if (explicitIds.length > 0) return explicitIds[0];
  if (!env.DB) return null;
  const d1Admins = await getD1SuperAdmins(env);
  if (d1Admins.length > 0) return d1Admins[0].telegram_user_id;
  const record = await new SettingsRepository(env.DB).get<SuperAdminRecord>("super_admin");
  return record?.chat_id ?? record?.telegram_user_id ?? null;
}

export async function bootstrapOrVerifySuperAdmin(env: Env, fromId: string, chatId: string): Promise<boolean> {
  const userId = String(fromId);
  const explicitIds = getExplicitSuperAdminTelegramIds(env);
  if (explicitIds.includes(userId)) return true;
  if (!env.DB) return false;

  if (await isD1SuperAdmin(env, userId)) return true;

  const repository = new SettingsRepository(env.DB);
  const existing = await repository.get<SuperAdminRecord>("super_admin");
  if (explicitIds.length > 0) return false;
  if (!existing?.telegram_user_id) {
    await repository.set("super_admin", { telegram_user_id: userId, chat_id: String(chatId), bootstrapped_at: new Date().toISOString(), source: "telegram:first_message" });
    return true;
  }
  if (String(existing.telegram_user_id) !== userId) return false;
  if (!existing.chat_id || String(existing.chat_id) !== String(chatId)) await repository.set("super_admin", { ...existing, chat_id: String(chatId) });
  return true;
}

export async function listSuperAdmins(env: Env): Promise<ListedSuperAdmin[]> {
  const byId = new Map<string, ListedSuperAdmin>();
  for (const id of getExplicitSuperAdminTelegramIds(env)) {
    byId.set(String(id), { telegram_user_id: String(id), source: "env", protected: true, removable: false });
  }

  if (env.DB) {
    const repository = new SettingsRepository(env.DB);
    const bootstrap = await repository.get<SuperAdminRecord>("super_admin");
    if (bootstrap?.telegram_user_id && !byId.has(String(bootstrap.telegram_user_id))) {
      byId.set(String(bootstrap.telegram_user_id), {
        telegram_user_id: String(bootstrap.telegram_user_id),
        source: "bootstrap",
        protected: true,
        removable: false,
        added_at: bootstrap.bootstrapped_at,
        chat_id: bootstrap.chat_id
      });
    }
    for (const admin of await getD1SuperAdmins(env)) {
      if (!byId.has(admin.telegram_user_id)) {
        byId.set(admin.telegram_user_id, { ...admin, source: "d1", protected: false, removable: true });
      }
    }
  }

  return Array.from(byId.values()).sort((a, b) => sourceOrder(a.source) - sourceOrder(b.source) || a.telegram_user_id.localeCompare(b.telegram_user_id));
}

export async function addD1SuperAdmin(env: Env, telegramUserId: string, actor: string, chatId?: string): Promise<D1SuperAdminRecord> {
  if (!env.DB) throw new Error("D1 database is required");
  const userId = normalizeTelegramUserId(telegramUserId);
  if (!userId) throw new Error("Invalid Telegram numeric ID");
  if (getExplicitSuperAdminTelegramIds(env).includes(userId)) {
    throw new Error("Telegram user is already configured as an env Super Admin");
  }

  const repository = new SettingsRepository(env.DB);
  const admins = await readD1SuperAdmins(repository);
  const existing = admins.find((admin) => admin.telegram_user_id === userId);
  if (existing) return existing;
  const record: D1SuperAdminRecord = { telegram_user_id: userId, added_at: new Date().toISOString(), added_by: actor, chat_id: chatId, source: "telegram" };
  admins.push(record);
  await repository.set(D1_SUPER_ADMINS_SETTING_KEY, admins);
  return record;
}

export async function deleteD1SuperAdmin(env: Env, telegramUserId: string): Promise<boolean> {
  if (!env.DB) throw new Error("D1 database is required");
  const userId = normalizeTelegramUserId(telegramUserId);
  if (!userId) throw new Error("Invalid Telegram numeric ID");
  if (getExplicitSuperAdminTelegramIds(env).includes(userId)) {
    throw new Error("Cannot delete env Super Admin from Telegram");
  }
  const repository = new SettingsRepository(env.DB);
  const admins = await readD1SuperAdmins(repository);
  const next = admins.filter((admin) => admin.telegram_user_id !== userId);
  if (next.length === admins.length) return false;
  await repository.set(D1_SUPER_ADMINS_SETTING_KEY, next);
  return true;
}

export async function isD1SuperAdmin(env: Env, telegramUserId: string): Promise<boolean> {
  return (await getD1SuperAdmins(env)).some((admin) => admin.telegram_user_id === String(telegramUserId));
}

export async function addManagedSuperAdmin(env: Env, telegramUserId: string, options: { actorTelegramUserId: string; chatId?: string }): Promise<ListedSuperAdmin[]> {
  await addD1SuperAdmin(env, telegramUserId, `telegram:${options.actorTelegramUserId}`, options.chatId);
  return listSuperAdmins(env);
}

export async function removeManagedSuperAdmin(env: Env, telegramUserId: string): Promise<ListedSuperAdmin[]> {
  await deleteD1SuperAdmin(env, telegramUserId);
  return listSuperAdmins(env);
}

async function getD1SuperAdmins(env: Env): Promise<D1SuperAdminRecord[]> {
  if (!env.DB) return [];
  return readD1SuperAdmins(new SettingsRepository(env.DB));
}

async function readD1SuperAdmins(repository: SettingsRepository): Promise<D1SuperAdminRecord[]> {
  const raw = await repository.get<unknown>(D1_SUPER_ADMINS_SETTING_KEY);
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const records: D1SuperAdminRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Partial<D1SuperAdminRecord>;
    const userId = normalizeTelegramUserId(candidate.telegram_user_id);
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    records.push({
      telegram_user_id: userId,
      added_at: typeof candidate.added_at === "string" ? candidate.added_at : new Date(0).toISOString(),
      added_by: typeof candidate.added_by === "string" ? candidate.added_by : undefined,
      chat_id: typeof candidate.chat_id === "string" ? candidate.chat_id : undefined,
      source: "telegram"
    });
  }
  return records;
}

export function normalizeTelegramUserId(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const id = String(value).trim();
  return /^\d+$/.test(id) ? id : null;
}

function sourceOrder(source: ListedSuperAdmin["source"]): number {
  if (source === "env") return 0;
  if (source === "bootstrap") return 1;
  return 2;
}
