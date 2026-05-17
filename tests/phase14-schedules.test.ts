import { describe, expect, it } from "vitest";
import worker from "../src/index";

const baseEnv = {
  API_AUTH_TOKEN: "secret-api-token",
  TELEGRAM_WEBHOOK_SECRET: "telegram-secret",
  SUPER_ADMIN_TELEGRAM_ID: "123456789",
  TELEGRAM_BOT_TOKEN: "bot-token",
  LINODE_TOKEN_ENCRYPTION_KEY: "encryption-key",
  APP_TIMEZONE: "Asia/Shanghai",
  BATCH_CONCURRENCY: "5",
  OPERATION_LOG_RETENTION_DAYS: "1",
  LOGIN_EVENT_RETENTION_DAYS: "1"
};

type ScheduleRecord = { id: number; name: string; enabled: number; action: string; scope: string; account_id: number | null; group_id?: number | null; cron_expr: string; timezone: string; last_run_at: string | null; next_run_at: string | null; created_at: string; updated_at: string; deleted_at: string | null; metadata_json: string | null };
type AccountRecord = { id: number; alias: string; encrypted_token: string; token_fingerprint: string; token_status: string; status: string; group_id: number | null; last_seen_login_id: string | null; last_login_check_at: string | null; security_baseline_at: string | null; created_at: string; updated_at: string; deleted_at: string | null };
type GroupRecord = { id: number; name: string; is_default: number; created_at: string; updated_at: string; deleted_at: string | null };
type AuditRecord = { action: string; target_type: string; target_id: string | null; risk_level: string; result: string; error_code: string | null; metadata_json: string | null; request_id: string; actor: string; source: string };
type BotSessionRecord = { telegram_user_id: string; chat_id: string; state: string; data_json: string | null; expires_at: string; created_at?: string; updated_at?: string };

class FakePreparedStatement {
  constructor(private db: FakeD1Database, private sql: string) {}
  private values: unknown[] = [];
  bind(...values: unknown[]) { this.values = values; return this; }
  first<T = unknown>() { return Promise.resolve(this.db.first<T>(this.sql, this.values)); }
  all<T = unknown>() { return Promise.resolve({ results: this.db.all<T>(this.sql, this.values), success: true, meta: {} }); }
  run() { return Promise.resolve({ success: true, meta: this.db.run(this.sql, this.values) }); }
}

class FakeD1Database {
  schedules: ScheduleRecord[] = [];
  accounts: AccountRecord[] = [];
  groups: GroupRecord[] = [{ id: 1, name: "未分组", is_default: 1, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", deleted_at: null }];
  auditLogs: AuditRecord[] = [];
  botSessions: BotSessionRecord[] = [];
  nextScheduleId = 1;
  prepare(sql: string) { return new FakePreparedStatement(this, sql); }
  first<T>(sql: string, values: unknown[] = []): T | null {
    if (sql.includes("FROM power_schedules") && sql.includes("WHERE id = ?")) return (this.schedules.find((s) => s.id === Number(values[0]) && s.deleted_at === null) as T | undefined) ?? null;
    if (sql.includes("FROM linode_accounts") && sql.includes("WHERE id = ?")) return (this.accounts.find((account) => account.id === Number(values[0])) as T | undefined) ?? null;
    if (sql.includes("FROM groups") && sql.includes("WHERE id = ?")) return (this.groups.find((group) => group.id === Number(values[0]) && group.deleted_at === null) as T | undefined) ?? null;
    if (sql.includes("FROM groups") && sql.includes("WHERE is_default = 1")) return (this.groups.find((group) => group.is_default === 1 && group.deleted_at === null) as T | undefined) ?? null;
    if (sql.includes("FROM bot_sessions")) return (this.botSessions.find((session) => session.telegram_user_id === String(values[0])) as T | undefined) ?? null;
    return null;
  }
  all<T>(sql: string, values: unknown[] = []): T[] {
    if (sql.includes("FROM linode_accounts")) return this.accounts.filter((account) => account.status === "active") as T[];
    if (sql.includes("FROM groups")) return this.groups.filter((group) => group.deleted_at === null).map((group) => ({ ...group, account_count: this.accounts.filter((account) => Number(account.group_id ?? 1) === group.id && account.status === "active").length })) as T[];
    if (sql.includes("FROM power_schedules")) {
      const limit = Number(values[values.length - 2] ?? 100);
      const offset = Number(values[values.length - 1] ?? 0);
      return this.schedules.filter((s) => s.deleted_at === null).sort((a, b) => b.id - a.id).slice(offset, offset + limit) as T[];
    }
    return [];
  }
  run(sql: string, values: unknown[]) {
    const now = new Date().toISOString();
    if (sql.includes("INTO power_schedules")) {
      const row: ScheduleRecord = { id: this.nextScheduleId++, name: String(values[0]), enabled: Number(values[1]), action: String(values[2]), scope: String(values[3]), account_id: values[4] === null ? null : Number(values[4]), group_id: values[5] === null ? null : Number(values[5]), cron_expr: String(values[6]), timezone: String(values[7]), next_run_at: values[8] as string | null, metadata_json: values[9] as string | null, last_run_at: null, created_at: now, updated_at: now, deleted_at: null };
      this.schedules.push(row);
      return { last_row_id: row.id, changes: 1 };
    }
    if (sql.includes("UPDATE power_schedules") && sql.includes("SET enabled = 1") && values.length === 0) { const targets = this.schedules.filter((x) => x.deleted_at === null && x.enabled !== 1); targets.forEach((s) => { s.enabled = 1; }); return { changes: targets.length }; }
    if (sql.includes("UPDATE power_schedules") && sql.includes("SET enabled = 0") && values.length === 0) { const targets = this.schedules.filter((x) => x.deleted_at === null && x.enabled === 1); targets.forEach((s) => { s.enabled = 0; }); return { changes: targets.length }; }
    if (sql.includes("UPDATE power_schedules") && sql.includes("SET enabled = 1")) { const s = this.schedules.find((x) => x.id === Number(values[0]) && x.deleted_at === null); if (s) s.enabled = 1; return { changes: s ? 1 : 0 }; }
    if (sql.includes("UPDATE power_schedules") && sql.includes("SET enabled = 0")) { const s = this.schedules.find((x) => x.id === Number(values[0]) && x.deleted_at === null); if (s) s.enabled = 0; return { changes: s ? 1 : 0 }; }
    if (sql.includes("UPDATE power_schedules") && sql.includes("deleted_at")) { const s = this.schedules.find((x) => x.id === Number(values[0]) && x.deleted_at === null); if (s) s.deleted_at = now; return { changes: s ? 1 : 0 }; }
    if (sql.includes("INTO audit_logs")) { this.auditLogs.push({ request_id: values[0] as string, actor: values[1] as string, source: values[2] as string, action: values[3] as string, target_type: values[4] as string, target_id: values[5] as string | null, risk_level: values[6] as string, result: values[7] as string, error_code: values[8] as string | null, metadata_json: values[9] as string | null }); return { changes: 1 }; }
    if (sql.includes("INTO bot_sessions")) { this.botSessions = this.botSessions.filter((session) => session.telegram_user_id !== String(values[0])); this.botSessions.push({ telegram_user_id: String(values[0]), chat_id: String(values[1]), state: String(values[2]), data_json: values[3] as string | null, expires_at: String(values[4]) }); return { changes: 1 }; }
    if (sql.includes("DELETE FROM bot_sessions")) { this.botSessions = this.botSessions.filter((session) => session.telegram_user_id !== String(values[0])); return { changes: 1 }; }
    return { changes: 0 };
  }
}

function apiRequest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("Authorization")) headers.set("Authorization", "Bearer secret-api-token");
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return new Request(`https://example.com${path}`, { ...init, headers });
}

function telegramRequest(update: unknown) {
  return new Request("https://example.com/telegram/webhook", { method: "POST", headers: { "content-type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "telegram-secret" }, body: JSON.stringify(update) });
}
function callbackUpdate(data: string) { return { update_id: 70, callback_query: { id: "cb_schedules", from: { id: 123456789 }, message: { message_id: 11, chat: { id: 123456789 } }, data } }; }
function messageUpdate(text: string) { return { update_id: 71, message: { message_id: 12, chat: { id: 123456789, type: "private" }, from: { id: 123456789, is_bot: false, first_name: "Admin" }, text } }; }
function addAccount(db: FakeD1Database, id: number, alias: string) {
  db.accounts.push({
    id,
    alias,
    encrypted_token: `encrypted-${id}`,
    token_fingerprint: `fp_${String(id).padStart(12, "0")}`,
    token_status: "valid",
    status: "active",
    group_id: 1,
    last_seen_login_id: null,
    last_login_check_at: null,
    security_baseline_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null
  });
}

describe("Phase 14 power schedules", () => {
  it("creates/lists/enables/disables/deletes boot/shutdown schedules via authenticated API with scope validation and audit logs", async () => {
    const db = new FakeD1Database();
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    expect((await worker.fetch(new Request("https://example.com/api/v1/schedules"), env as never)).status).toBe(401);
    const invalidAction = await worker.fetch(apiRequest("/api/v1/schedules", { method: "POST", body: JSON.stringify({ name: "bad", action: "delete", scope: "all", cron_expr: "0 22 * * *" }) }), env as never);
    expect(invalidAction.status).toBe(400);
    const invalidScope = await worker.fetch(apiRequest("/api/v1/schedules", { method: "POST", body: JSON.stringify({ name: "bad", action: "shutdown", scope: "tag", cron_expr: "0 22 * * *" }) }), env as never);
    expect(invalidScope.status).toBe(400);

    const create = await worker.fetch(apiRequest("/api/v1/schedules", { method: "POST", body: JSON.stringify({ name: "night shutdown", action: "shutdown", scope: "account", account_id: 1, cron_expr: "0 22 * * *", timezone: "Asia/Shanghai" }) }), env as never);
    const createBody = await create.json() as { ok: boolean; data: { schedule: ScheduleRecord } };
    expect(create.status).toBe(200);
    expect(createBody.data.schedule).toMatchObject({ id: 1, name: "night shutdown", action: "shutdown", scope: "account", account_id: 1, enabled: 1, cron_expr: "0 22 * * *" });
    expect(createBody.data.schedule.next_run_at).toEqual(expect.any(String));

    const list = await worker.fetch(apiRequest("/api/v1/schedules?limit=10&offset=0"), env as never);
    const listBody = await list.json() as { data: { schedules: ScheduleRecord[]; limit: number; offset: number } };
    expect(list.status).toBe(200);
    expect(listBody.data.schedules).toHaveLength(1);

    expect((await worker.fetch(apiRequest("/api/v1/schedules/1/disable", { method: "POST" }), env as never)).status).toBe(200);
    expect(db.schedules[0].enabled).toBe(0);
    expect((await worker.fetch(apiRequest("/api/v1/schedules/1/enable", { method: "POST" }), env as never)).status).toBe(200);
    expect(db.schedules[0].enabled).toBe(1);
    const disableAll = await worker.fetch(apiRequest("/api/v1/schedules/disable-all", { method: "POST" }), env as never);
    const disableAllBody = await disableAll.json() as { data: { affected: number } };
    expect(disableAll.status).toBe(200);
    expect(disableAllBody.data.affected).toBe(1);
    expect(db.schedules[0].enabled).toBe(0);
    const enableAll = await worker.fetch(apiRequest("/api/v1/schedules/enable-all", { method: "POST" }), env as never);
    const enableAllBody = await enableAll.json() as { data: { affected: number } };
    expect(enableAll.status).toBe(200);
    expect(enableAllBody.data.affected).toBe(1);
    expect(db.schedules[0].enabled).toBe(1);
    expect((await worker.fetch(apiRequest("/api/v1/schedules/1", { method: "DELETE" }), env as never)).status).toBe(200);
    expect(db.schedules[0].deleted_at).toEqual(expect.any(String));

    expect(db.auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "schedule.create", target_type: "power_schedule", target_id: "1", risk_level: "medium", result: "success" }),
      expect.objectContaining({ action: "schedule.disable", target_type: "power_schedule", target_id: "1", risk_level: "medium", result: "success" }),
      expect.objectContaining({ action: "schedule.enable", target_type: "power_schedule", target_id: "1", risk_level: "medium", result: "success" }),
      expect.objectContaining({ action: "schedule.disable_all", target_type: "power_schedule", target_id: null, risk_level: "medium", result: "success" }),
      expect.objectContaining({ action: "schedule.enable_all", target_type: "power_schedule", target_id: null, risk_level: "medium", result: "success" }),
      expect.objectContaining({ action: "schedule.delete", target_type: "power_schedule", target_id: "1", risk_level: "medium", result: "success" })
    ]));
    expect(JSON.stringify(listBody)).not.toContain("encrypted_token");
  });

  it("exposes Telegram schedules menu and list callbacks as a thin service adapter", async () => {
    const db = new FakeD1Database();
    db.schedules.push({ id: 1, name: "morning boot", enabled: 1, action: "boot", scope: "all", account_id: null, cron_expr: "0 8 * * *", timezone: "Asia/Shanghai", last_run_at: null, next_run_at: "2026-01-02T00:00:00.000Z", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", deleted_at: null, metadata_json: null });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const menu = await worker.fetch(telegramRequest(callbackUpdate("menu:schedules")), env as never);
    const menuBody = await menu.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(menuBody.data.telegram.payload.text).toContain("⏰ 定时任务");
    expect(menuBody.data.telegram.payload.text).toContain("开机 / 关机");
    expect(menuBody.data.telegram.payload.text).not.toContain("boot / shutdown");
    expect(menuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "新增任务", callback_data: "schedules:create" },
      { text: "查看定时任务", callback_data: "schedules:list" },
      { text: "暂停全部", callback_data: "schedules:disable_all_confirm" },
      { text: "启用全部", callback_data: "schedules:enable_all" }
    ]));

    const list = await worker.fetch(telegramRequest(callbackUpdate("schedules:list")), env as never);
    const listBody = await list.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    const listRaw = JSON.stringify(listBody);
    expect(listBody.data.telegram.payload.text).toContain("⏰ 定时任务列表");
    expect(listBody.data.telegram.payload.text).toContain("morning boot");
    expect(listBody.data.telegram.payload.text).toContain("动作：开机");
    expect(listBody.data.telegram.payload.text).toContain("范围：全部账号");
    expect(listBody.data.telegram.payload.text).not.toContain("动作：boot");
    expect(listBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "#1 停用", callback_data: "schedules:disable:1" },
      { text: "#1 删除", callback_data: "schedules:delete_confirm:1" }
    ]));
    expect(listRaw).not.toContain("metadata_json");

    const confirm = await worker.fetch(telegramRequest(callbackUpdate("schedules:disable_all_confirm")), env as never);
    const confirmBody = await confirm.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(confirmBody.data.telegram.payload.text).toContain("确认暂停全部定时任务");
    expect(confirmBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toContainEqual({ text: "确认暂停全部", callback_data: "schedules:disable_all" });

    const disabled = await worker.fetch(telegramRequest(callbackUpdate("schedules:disable_all")), env as never);
    const disabledBody = await disabled.json() as { data: { telegram: { payload: { text: string } } } };
    expect(disabledBody.data.telegram.payload.text).toContain("已暂停全部定时任务");
    expect(disabledBody.data.telegram.payload.text).toContain("本次影响任务数：1");
    expect(db.schedules[0].enabled).toBe(0);

    const enabled = await worker.fetch(telegramRequest(callbackUpdate("schedules:enable_all")), env as never);
    const enabledBody = await enabled.json() as { data: { telegram: { payload: { text: string } } } };
    expect(enabledBody.data.telegram.payload.text).toContain("已启用全部定时任务");
    expect(enabledBody.data.telegram.payload.text).toContain("本次影响任务数：1");
    expect(db.schedules[0].enabled).toBe(1);
    expect(db.auditLogs.map((log) => log.action)).toEqual(expect.arrayContaining(["schedule.disable_all", "schedule.enable_all"]));
  });

  it("creates quick preset schedules from Telegram with Chinese copy through ScheduleService", async () => {
    const db = new FakeD1Database();
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    const createMenu = await worker.fetch(telegramRequest(callbackUpdate("schedules:create")), env as never);
    const createMenuBody = await createMenu.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(createMenuBody.data.telegram.payload.text).toContain("新增定时任务");
    expect(createMenuBody.data.telegram.payload.text).toContain("请选择动作");
    expect(createMenuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "开机", callback_data: "schedules:create:action:boot" },
      { text: "关机", callback_data: "schedules:create:action:shutdown" }
    ]));
    expect(JSON.stringify(createMenuBody)).not.toContain("boot / shutdown");

    const scopeMenu = await worker.fetch(telegramRequest(callbackUpdate("schedules:create:action:shutdown")), env as never);
    const scopeMenuBody = await scopeMenu.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(scopeMenuBody.data.telegram.payload.text).toContain("动作：关机");
    expect(scopeMenuBody.data.telegram.payload.text).toContain("请选择范围");
    expect(scopeMenuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "全部账号", callback_data: "schedules:create:scope:shutdown:all" },
      { text: "选择账号", callback_data: "schedules:create:scope:shutdown:account" },
      { text: "选择分组", callback_data: "schedules:create:scope:shutdown:group" }
    ]));

    const presetMenu = await worker.fetch(telegramRequest(callbackUpdate("schedules:create:scope:shutdown:all")), env as never);
    const presetMenuBody = await presetMenu.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(presetMenuBody.data.telegram.payload.text).toContain("动作：关机");
    expect(presetMenuBody.data.telegram.payload.text).toContain("范围：全部账号");
    expect(presetMenuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "每天 08:00", callback_data: "schedules:create:preset:shutdown:all:daily_0800" },
      { text: "每天 22:00", callback_data: "schedules:create:preset:shutdown:all:daily_2200" }
    ]));

    const created = await worker.fetch(telegramRequest(callbackUpdate("schedules:create:preset:shutdown:all:daily_2200")), env as never);
    const createdBody = await created.json() as { data: { telegram: { payload: { text: string } } } };
    expect(createdBody.data.telegram.payload.text).toContain("定时任务已创建");
    expect(createdBody.data.telegram.payload.text).toContain("动作：关机");
    expect(createdBody.data.telegram.payload.text).toContain("范围：全部账号");
    expect(createdBody.data.telegram.payload.text).toContain("Cron：0 22 * * *");
    expect(db.schedules[0]).toMatchObject({ name: "每天 22:00 关机", action: "shutdown", scope: "all", account_id: null, enabled: 1, cron_expr: "0 22 * * *" });
    expect(db.auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "schedule.create", target_id: "1", source: "telegram" })
    ]));
    expect(JSON.stringify(createdBody)).not.toContain("encrypted_token");
    expect(JSON.stringify(createdBody)).not.toContain("metadata_json");
  });

  it("creates account-scoped quick preset schedules from Telegram", async () => {
    const db = new FakeD1Database();
    addAccount(db, 7, "西班牙1");
    addAccount(db, 8, "日本备用");
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    const accountMenu = await worker.fetch(telegramRequest(callbackUpdate("schedules:create:scope:boot:account")), env as never);
    const accountMenuBody = await accountMenu.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(accountMenuBody.data.telegram.payload.text).toContain("范围：单账号");
    expect(accountMenuBody.data.telegram.payload.text).toContain("请选择账号");
    expect(accountMenuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "#7 西班牙1", callback_data: "schedules:create:account:boot:7" },
      { text: "#8 日本备用", callback_data: "schedules:create:account:boot:8" }
    ]));
    expect(JSON.stringify(accountMenuBody)).not.toContain("encrypted-7");

    const presetMenu = await worker.fetch(telegramRequest(callbackUpdate("schedules:create:account:boot:7")), env as never);
    const presetMenuBody = await presetMenu.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(presetMenuBody.data.telegram.payload.text).toContain("动作：开机");
    expect(presetMenuBody.data.telegram.payload.text).toContain("范围：单账号 #7");
    expect(presetMenuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "每天 08:00", callback_data: "schedules:create:preset:boot:account:7:daily_0800" },
      { text: "每天 22:00", callback_data: "schedules:create:preset:boot:account:7:daily_2200" }
    ]));

    const created = await worker.fetch(telegramRequest(callbackUpdate("schedules:create:preset:boot:account:7:daily_0800")), env as never);
    const createdBody = await created.json() as { data: { telegram: { payload: { text: string } } } };
    expect(createdBody.data.telegram.payload.text).toContain("定时任务已创建");
    expect(createdBody.data.telegram.payload.text).toContain("动作：开机");
    expect(createdBody.data.telegram.payload.text).toContain("范围：单账号 #7");
    expect(createdBody.data.telegram.payload.text).toContain("Cron：0 8 * * *");
    expect(db.schedules[0]).toMatchObject({ name: "每天 08:00 账号 #7 开机", action: "boot", scope: "account", account_id: 7, enabled: 1, cron_expr: "0 8 * * *" });
    expect(db.auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "schedule.create", target_id: "1", source: "telegram" })
    ]));
    expect(JSON.stringify(createdBody)).not.toContain("encrypted_token");
    expect(JSON.stringify(createdBody)).not.toContain("metadata_json");
  });

  it("creates group-scoped quick preset schedules from Telegram", async () => {
    const db = new FakeD1Database();
    db.groups.push({ id: 2, name: "西班牙", is_default: 0, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", deleted_at: null });
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    const groupMenu = await worker.fetch(telegramRequest(callbackUpdate("schedules:create:scope:shutdown:group")), env as never);
    const groupMenuBody = await groupMenu.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(groupMenuBody.data.telegram.payload.text).toContain("范围：分组");
    expect(groupMenuBody.data.telegram.payload.text).toContain("请选择分组");
    expect(groupMenuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "西班牙", callback_data: "schedules:create:group:shutdown:2" }
    ]));

    const presetMenu = await worker.fetch(telegramRequest(callbackUpdate("schedules:create:group:shutdown:2")), env as never);
    const presetMenuBody = await presetMenu.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(presetMenuBody.data.telegram.payload.text).toContain("动作：关机");
    expect(presetMenuBody.data.telegram.payload.text).toContain("范围：分组 #2");
    expect(presetMenuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "每天 08:00", callback_data: "schedules:create:preset:shutdown:group:2:daily_0800" },
      { text: "每天 22:00", callback_data: "schedules:create:preset:shutdown:group:2:daily_2200" }
    ]));

    const created = await worker.fetch(telegramRequest(callbackUpdate("schedules:create:preset:shutdown:group:2:daily_2200")), env as never);
    const createdBody = await created.json() as { data: { telegram: { payload: { text: string } } } };
    expect(createdBody.data.telegram.payload.text).toContain("定时任务已创建");
    expect(createdBody.data.telegram.payload.text).toContain("动作：关机");
    expect(createdBody.data.telegram.payload.text).toContain("范围：分组 #2");
    expect(createdBody.data.telegram.payload.text).toContain("Cron：0 22 * * *");
    expect(db.schedules[0]).toMatchObject({ name: "每天 22:00 分组 #2 关机", action: "shutdown", scope: "group", group_id: 2, account_id: null, enabled: 1, cron_expr: "0 22 * * *" });
  });

  it("creates custom time and cron schedules from Telegram message flow", async () => {
    const db = new FakeD1Database();
    addAccount(db, 7, "西班牙1");
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    const customPrompt = await worker.fetch(telegramRequest(callbackUpdate("schedules:create:custom:shutdown:account:7")), env as never);
    const customPromptBody = await customPrompt.json() as { data: { telegram: { payload: { text: string } } } };
    expect(customPromptBody.data.telegram.payload.text).toContain("自定义定时任务时间");
    expect(customPromptBody.data.telegram.payload.text).toContain("09:30");
    expect(db.botSessions[0]).toMatchObject({ state: "creating_schedule_custom_time" });
    expect(db.botSessions[0].data_json).toContain("shutdown");

    const createdTime = await worker.fetch(telegramRequest(messageUpdate("09:45")), env as never);
    const createdTimeBody = await createdTime.json() as { data: { telegram: { payload: { text: string } } } };
    expect(createdTimeBody.data.telegram.payload.text).toContain("定时任务已创建");
    expect(createdTimeBody.data.telegram.payload.text).toContain("范围：单账号 #7");
    expect(createdTimeBody.data.telegram.payload.text).toContain("Cron：45 9 * * *");
    expect(db.schedules[0]).toMatchObject({ action: "shutdown", scope: "account", account_id: 7, cron_expr: "45 9 * * *" });
    expect(db.botSessions).toHaveLength(0);

    await worker.fetch(telegramRequest(callbackUpdate("schedules:create:custom:boot:all")), env as never);
    const invalid = await worker.fetch(telegramRequest(messageUpdate("25:99")), env as never);
    const invalidBody = await invalid.json() as { data: { telegram: { payload: { text: string } } } };
    expect(invalidBody.data.telegram.payload.text).toContain("时间格式不正确");
    expect(db.botSessions).toHaveLength(1);

    const createdCron = await worker.fetch(telegramRequest(messageUpdate("30 6 * * *")), env as never);
    const createdCronBody = await createdCron.json() as { data: { telegram: { payload: { text: string } } } };
    expect(createdCronBody.data.telegram.payload.text).toContain("Cron：30 6 * * *");
    expect(db.schedules[1]).toMatchObject({ action: "boot", scope: "all", account_id: null, cron_expr: "30 6 * * *" });
    expect(db.botSessions).toHaveLength(0);
    expect(JSON.stringify(createdCronBody)).not.toContain("encrypted_token");
    expect(JSON.stringify(createdCronBody)).not.toContain("metadata_json");
  });

  it("enables, disables, and delete-confirms schedules from Telegram with Chinese copy", async () => {
    const db = new FakeD1Database();
    db.schedules.push({ id: 1, name: "morning boot", enabled: 1, action: "boot", scope: "all", account_id: null, cron_expr: "0 8 * * *", timezone: "Asia/Shanghai", last_run_at: null, next_run_at: "2026-01-02T00:00:00.000Z", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", deleted_at: null, metadata_json: JSON.stringify({ token: "secret-api-token" }) });
    db.schedules.push({ id: 2, name: "night shutdown", enabled: 0, action: "shutdown", scope: "account", account_id: 7, cron_expr: "0 22 * * *", timezone: "Asia/Shanghai", last_run_at: null, next_run_at: "2026-01-02T14:00:00.000Z", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", deleted_at: null, metadata_json: null });
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    const disable = await worker.fetch(telegramRequest(callbackUpdate("schedules:disable:1")), env as never);
    const disableBody = await disable.json() as { data: { telegram: { payload: { text: string } } } };
    expect(disableBody.data.telegram.payload.text).toContain("定时任务已停用");
    expect(disableBody.data.telegram.payload.text).toContain("动作：开机");
    expect(db.schedules[0].enabled).toBe(0);

    const enable = await worker.fetch(telegramRequest(callbackUpdate("schedules:enable:2")), env as never);
    const enableBody = await enable.json() as { data: { telegram: { payload: { text: string } } } };
    expect(enableBody.data.telegram.payload.text).toContain("定时任务已启用");
    expect(enableBody.data.telegram.payload.text).toContain("动作：关机");
    expect(enableBody.data.telegram.payload.text).toContain("范围：单账号 #7");
    expect(db.schedules[1].enabled).toBe(1);

    const confirm = await worker.fetch(telegramRequest(callbackUpdate("schedules:delete_confirm:2")), env as never);
    const confirmBody = await confirm.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    const confirmRaw = JSON.stringify(confirmBody);
    expect(confirmBody.data.telegram.payload.text).toContain("确认删除定时任务");
    expect(confirmBody.data.telegram.payload.text).toContain("动作：关机");
    expect(confirmBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "确认删除", callback_data: "schedules:delete:2" },
      { text: "取消", callback_data: "schedules:list" }
    ]));
    expect(confirmRaw).not.toContain("secret-api-token");
    expect(confirmRaw).not.toContain("metadata_json");

    const deleted = await worker.fetch(telegramRequest(callbackUpdate("schedules:delete:2")), env as never);
    const deletedBody = await deleted.json() as { data: { telegram: { payload: { text: string } } } };
    expect(deletedBody.data.telegram.payload.text).toContain("定时任务已删除");
    expect(db.schedules[1].deleted_at).toEqual(expect.any(String));
    expect(db.auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "schedule.disable", target_id: "1", source: "telegram" }),
      expect.objectContaining({ action: "schedule.enable", target_id: "2", source: "telegram" }),
      expect.objectContaining({ action: "schedule.delete", target_id: "2", source: "telegram" })
    ]));
  });
});
