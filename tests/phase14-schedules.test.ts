import { describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { encryptLinodeToken } from "../src/crypto/token-crypto";

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

type ScheduleRecord = { id: number; name: string; enabled: number; action: string; scope: string; account_id: number | null; group_id?: number | null; instance_id?: number | null; cron_expr: string; timezone: string; last_run_at: string | null; next_run_at: string | null; created_at: string; updated_at: string; deleted_at: string | null; metadata_json: string | null };
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
  groups: GroupRecord[] = [{ id: 1, name: "未分组", is_default: 1, created_at: "2026-01-01T00:50:00.000Z", updated_at: "2026-01-01T00:50:00.000Z", deleted_at: null }];
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
      const row: ScheduleRecord = { id: this.nextScheduleId++, name: String(values[0]), enabled: Number(values[1]), action: String(values[2]), scope: String(values[3]), account_id: values[4] === null ? null : Number(values[4]), group_id: values[5] === null ? null : Number(values[5]), instance_id: values[6] === null ? null : Number(values[6]), cron_expr: String(values[7]), timezone: String(values[8]), next_run_at: values[9] as string | null, metadata_json: values[10] as string | null, last_run_at: null, created_at: now, updated_at: now, deleted_at: null };
      this.schedules.push(row);
      return { last_row_id: row.id, changes: 1 };
    }
    if (sql.includes("UPDATE power_schedules") && sql.includes("SET enabled = 1") && values.length === 0) { const targets = this.schedules.filter((x) => x.deleted_at === null && x.enabled !== 1); targets.forEach((s) => { s.enabled = 1; }); return { changes: targets.length }; }
    if (sql.includes("UPDATE power_schedules") && sql.includes("SET enabled = 0") && values.length === 0) { const targets = this.schedules.filter((x) => x.deleted_at === null && x.enabled === 1); targets.forEach((s) => { s.enabled = 0; }); return { changes: targets.length }; }
    if (sql.includes("UPDATE power_schedules") && sql.includes("SET name = ?")) {
      const id = Number(values[11]);
      const s = this.schedules.find((x) => x.id === id && x.deleted_at === null);
      if (s) {
        s.name = String(values[0]);
        s.enabled = Number(values[1]);
        s.action = String(values[2]);
        s.scope = String(values[3]);
        s.account_id = values[4] === null ? null : Number(values[4]);
        s.group_id = values[5] === null ? null : Number(values[5]);
        s.instance_id = values[6] === null ? null : Number(values[6]);
        s.cron_expr = String(values[7]);
        s.timezone = String(values[8]);
        s.next_run_at = values[9] as string | null;
        s.metadata_json = values[10] as string | null;
        s.updated_at = now;
      }
      return { changes: s ? 1 : 0 };
    }
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
    created_at: "2026-01-01T00:50:00.000Z",
    updated_at: "2026-01-01T00:50:00.000Z",
    deleted_at: null
  });
}

function collectCallbackData(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const node = value as { callback_data?: unknown; inline_keyboard?: unknown };
  const current = typeof node.callback_data === "string" ? [node.callback_data] : [];
  const rows = Array.isArray(node.inline_keyboard) ? node.inline_keyboard.flatMap((row) => Array.isArray(row) ? row : []) : [];
  return [...current, ...rows.flatMap(collectCallbackData)];
}

describe("Phase 14 power schedules", () => {
  it("creates/lists/enables/disables/deletes boot/shutdown/reboot schedules via authenticated API with scope validation and audit logs", async () => {
    const db = new FakeD1Database();
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    expect((await worker.fetch(new Request("https://example.com/api/v1/schedules"), env as never)).status).toBe(401);
    const invalidAction = await worker.fetch(apiRequest("/api/v1/schedules", { method: "POST", body: JSON.stringify({ name: "bad", action: "delete", scope: "all", cron_expr: "5 23 * * *" }) }), env as never);
    expect(invalidAction.status).toBe(400);
    const invalidScope = await worker.fetch(apiRequest("/api/v1/schedules", { method: "POST", body: JSON.stringify({ name: "bad", action: "shutdown", scope: "tag", cron_expr: "5 23 * * *" }) }), env as never);
    expect(invalidScope.status).toBe(400);
    const invalidInstanceScope = await worker.fetch(apiRequest("/api/v1/schedules", { method: "POST", body: JSON.stringify({ name: "bad instance", action: "reboot", scope: "instance", account_id: 1, cron_expr: "5 23 * * *" }) }), env as never);
    expect(invalidInstanceScope.status).toBe(400);

    addAccount(db, 1, "default");
    db.accounts[0].encrypted_token = await encryptLinodeToken("token-1", "encryption-key");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (url.includes("api.linode.com") && url.endsWith("/linode/instances/101")) return new Response(JSON.stringify({ id: 101, label: "web-1", status: "running", region: "es-mad", type: "g6-standard-1" }), { status: 200 });
      if (url.includes("api.linode.com") && url.endsWith("/linode/instances/999")) return new Response(JSON.stringify({ errors: [{ reason: "not found" }] }), { status: 404 });
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });

    const missingAccount = await worker.fetch(apiRequest("/api/v1/schedules", { method: "POST", body: JSON.stringify({ name: "missing account", action: "shutdown", scope: "account", account_id: 404, cron_expr: "5 23 * * *" }) }), env as never);
    expect(missingAccount.status).toBe(404);

    const missingInstance = await worker.fetch(apiRequest("/api/v1/schedules", { method: "POST", body: JSON.stringify({ name: "missing instance", action: "reboot", scope: "instance", account_id: 1, instance_id: 999, cron_expr: "5 23 * * *" }) }), env as never);
    expect(missingInstance.status).toBe(404);

    const create = await worker.fetch(apiRequest("/api/v1/schedules", { method: "POST", body: JSON.stringify({ name: "night shutdown", action: "shutdown", scope: "account", account_id: 1, cron_expr: "5 23 * * *", timezone: "Asia/Shanghai" }) }), env as never);
    const createBody = await create.json() as { ok: boolean; data: { schedule: ScheduleRecord } };
    expect(create.status).toBe(200);
    expect(createBody.data.schedule).toMatchObject({ id: 1, name: "night shutdown", action: "shutdown", scope: "account", account_id: 1, enabled: 1, cron_expr: "5 23 * * *", timezone: "Asia/Shanghai" });
    expect(createBody.data.schedule.next_run_at).toEqual(expect.any(String));
    expect(createBody.data.schedule.next_run_at?.endsWith("T15:05:00.000Z")).toBe(true);

    const createRebootInstance = await worker.fetch(apiRequest("/api/v1/schedules", { method: "POST", body: JSON.stringify({ name: "single reboot", action: "reboot", scope: "instance", account_id: 1, instance_id: 101, cron_expr: "30 6 * * *", timezone: "Asia/Shanghai" }) }), env as never);
    const createRebootInstanceBody = await createRebootInstance.json() as { data: { schedule: ScheduleRecord } };
    expect(createRebootInstance.status).toBe(200);
    expect(createRebootInstanceBody.data.schedule).toMatchObject({ id: 2, name: "single reboot", action: "reboot", scope: "instance", account_id: 1, instance_id: 101, enabled: 1, cron_expr: "30 6 * * *" });

    const list = await worker.fetch(apiRequest("/api/v1/schedules?limit=10&offset=0"), env as never);
    const listBody = await list.json() as { data: { schedules: ScheduleRecord[]; limit: number; offset: number } };
    expect(list.status).toBe(200);
    expect(listBody.data.schedules).toHaveLength(2);

    expect((await worker.fetch(apiRequest("/api/v1/schedules/1/disable", { method: "POST" }), env as never)).status).toBe(200);
    expect(db.schedules[0].enabled).toBe(0);
    expect((await worker.fetch(apiRequest("/api/v1/schedules/1/enable", { method: "POST" }), env as never)).status).toBe(200);
    expect(db.schedules[0].enabled).toBe(1);
    const disableAll = await worker.fetch(apiRequest("/api/v1/schedules/disable-all", { method: "POST" }), env as never);
    const disableAllBody = await disableAll.json() as { data: { affected: number } };
    expect(disableAll.status).toBe(200);
    expect(disableAllBody.data.affected).toBe(2);
    expect(db.schedules[0].enabled).toBe(0);
    const enableAll = await worker.fetch(apiRequest("/api/v1/schedules/enable-all", { method: "POST" }), env as never);
    const enableAllBody = await enableAll.json() as { data: { affected: number } };
    expect(enableAll.status).toBe(200);
    expect(enableAllBody.data.affected).toBe(2);
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
    fetchMock.mockRestore();
  });

  it("exposes Telegram schedules menu and list callbacks as a thin service adapter", async () => {
    const db = new FakeD1Database();
    db.schedules.push({ id: 1, name: "morning boot", enabled: 1, action: "boot", scope: "all", account_id: null, cron_expr: "50 8 * * *", timezone: "Asia/Shanghai", last_run_at: null, next_run_at: "2026-01-02T00:50:00.000Z", created_at: "2026-01-01T00:50:00.000Z", updated_at: "2026-01-01T00:50:00.000Z", deleted_at: null, metadata_json: null });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const menu = await worker.fetch(telegramRequest(callbackUpdate("menu:schedules")), env as never);
    const menuBody = await menu.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(menuBody.data.telegram.payload.text).toContain("⏰ 定时任务");
    expect(menuBody.data.telegram.payload.text).toContain("开机 / 关机");
    expect(menuBody.data.telegram.payload.text).not.toContain("boot / shutdown");
    expect(menuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "➕ 新增定时任务", callback_data: "schedules:create" },
      { text: "📋 查看定时任务", callback_data: "schedules:list" },
      { text: "⏸ 暂停全部", callback_data: "schedules:disable_all_confirm" },
      { text: "✅ 启用全部", callback_data: "schedules:enable_all" }
    ]));

    const list = await worker.fetch(telegramRequest(callbackUpdate("schedules:list")), env as never);
    const listBody = await list.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    const listRaw = JSON.stringify(listBody);
    expect(listBody.data.telegram.payload.text).toContain("⏰ 定时任务列表");
    expect(listBody.data.telegram.payload.text).toContain("morning boot");
    expect(listBody.data.telegram.payload.text).toContain("动作：✅ 开机");
    expect(listBody.data.telegram.payload.text).toContain("范围：🌐 全部账号");
    expect(listBody.data.telegram.payload.text).not.toContain("动作：boot");
    expect(listBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "⏸ #1 停用", callback_data: "schedules:disable:1" },
      { text: "🗑 #1 删除", callback_data: "schedules:delete_confirm:1" }
    ]));
    expect(listRaw).not.toContain("metadata_json");

    const confirm = await worker.fetch(telegramRequest(callbackUpdate("schedules:disable_all_confirm")), env as never);
    const confirmBody = await confirm.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(confirmBody.data.telegram.payload.text).toContain("确认暂停全部定时任务");
    expect(confirmBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toContainEqual({ text: "⏸ 确认暂停全部", callback_data: "schedules:disable_all" });

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
    expect(createMenuBody.data.telegram.payload.text).toContain("先选择要做什么");
    expect(createMenuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "✅ 定时开机", callback_data: "sc:a:b" },
      { text: "⚠️ 定时关机", callback_data: "sc:a:s" },
      { text: "🔄 定时重启", callback_data: "sc:a:r" }
    ]));
    expect(collectCallbackData(createMenuBody.data.telegram.payload.reply_markup).every((value) => Buffer.byteLength(value) <= 64)).toBe(true);
    expect(JSON.stringify(createMenuBody)).not.toContain("boot / shutdown");

    const scopeMenu = await worker.fetch(telegramRequest(callbackUpdate("sc:a:s")), env as never);
    const scopeMenuBody = await scopeMenu.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(scopeMenuBody.data.telegram.payload.text).toContain("已选动作：⚠️ 关机");
    expect(scopeMenuBody.data.telegram.payload.text).toContain("选择作用对象");
    expect(scopeMenuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "🌐 全部账号", callback_data: "sc:s:s:a" },
      { text: "👤 选择账号", callback_data: "sc:s:s:u" },
      { text: "📁 选择分组", callback_data: "sc:s:s:g" },
      { text: "🖥 选择单台服务器", callback_data: "sc:s:s:i" }
    ]));
    expect(collectCallbackData(scopeMenuBody.data.telegram.payload.reply_markup).every((value) => Buffer.byteLength(value) <= 64)).toBe(true);

    const presetMenu = await worker.fetch(telegramRequest(callbackUpdate("sc:s:s:a")), env as never);
    const presetMenuBody = await presetMenu.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(presetMenuBody.data.telegram.payload.text).toContain("已选动作：⚠️ 关机");
    expect(presetMenuBody.data.telegram.payload.text).toContain("已选范围：🌐 全部账号");
    expect(presetMenuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "🌅 每天 08:50", callback_data: "sc:p:s:a:0850" },
      { text: "🌙 每天 23:05", callback_data: "sc:p:s:a:2305" },
      { text: "🕘 选择其他时间", callback_data: "sc:th:s:a" }
    ]));
    expect(collectCallbackData(presetMenuBody.data.telegram.payload.reply_markup).every((value) => Buffer.byteLength(value) <= 64)).toBe(true);

    const created = await worker.fetch(telegramRequest(callbackUpdate("sc:p:s:a:2305")), env as never);
    const createdBody = await created.json() as { data: { telegram: { payload: { text: string } } } };
    expect(createdBody.data.telegram.payload.text).toContain("定时任务已创建");
    expect(createdBody.data.telegram.payload.text).toContain("动作：⚠️ 关机");
    expect(createdBody.data.telegram.payload.text).toContain("范围：🌐 全部账号");
    expect(createdBody.data.telegram.payload.text).toContain("Cron：5 23 * * *");
    expect(db.schedules[0]).toMatchObject({ name: "每天 23:05 关机", action: "shutdown", scope: "all", account_id: null, enabled: 1, cron_expr: "5 23 * * *", timezone: "Asia/Shanghai" });
    expect(db.schedules[0].next_run_at?.endsWith("T15:05:00.000Z")).toBe(true);
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

    const accountMenu = await worker.fetch(telegramRequest(callbackUpdate("sc:s:b:u")), env as never);
    const accountMenuBody = await accountMenu.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(accountMenuBody.data.telegram.payload.text).toContain("已选范围：👤 单账号");
    expect(accountMenuBody.data.telegram.payload.text).toContain("请选择账号");
    expect(accountMenuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "#7 西班牙1", callback_data: "sc:u:b:7" },
      { text: "#8 日本备用", callback_data: "sc:u:b:8" },
      { text: "⬅️ 上一步：选择范围", callback_data: "sc:a:b" }
    ]));
    expect(JSON.stringify(accountMenuBody)).not.toContain("encrypted-7");

    const presetMenu = await worker.fetch(telegramRequest(callbackUpdate("sc:u:b:7")), env as never);
    const presetMenuBody = await presetMenu.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(presetMenuBody.data.telegram.payload.text).toContain("已选动作：✅ 开机");
    expect(presetMenuBody.data.telegram.payload.text).toContain("已选范围：👤 单账号 #7");
    expect(presetMenuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "🌅 每天 08:50", callback_data: "sc:p:b:u7:0850" },
      { text: "🌙 每天 23:05", callback_data: "sc:p:b:u7:2305" },
      { text: "⬅️ 上一步：选择账号", callback_data: "sc:s:b:u" }
    ]));

    const created = await worker.fetch(telegramRequest(callbackUpdate("sc:p:b:u7:0850")), env as never);
    const createdBody = await created.json() as { data: { telegram: { payload: { text: string } } } };
    expect(createdBody.data.telegram.payload.text).toContain("定时任务已创建");
    expect(createdBody.data.telegram.payload.text).toContain("动作：✅ 开机");
    expect(createdBody.data.telegram.payload.text).toContain("范围：👤 单账号 #7");
    expect(createdBody.data.telegram.payload.text).toContain("Cron：50 8 * * *");
    expect(db.schedules[0]).toMatchObject({ name: "每天 08:50 账号 #7 开机", action: "boot", scope: "account", account_id: 7, enabled: 1, cron_expr: "50 8 * * *" });
    expect(db.auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "schedule.create", target_id: "1", source: "telegram" })
    ]));
    expect(JSON.stringify(createdBody)).not.toContain("encrypted_token");
    expect(JSON.stringify(createdBody)).not.toContain("metadata_json");
  });

  it("creates instance-scoped reboot quick preset schedules from Telegram", async () => {
    const db = new FakeD1Database();
    addAccount(db, 7, "西班牙1");
    db.accounts[0].encrypted_token = await encryptLinodeToken("token-7", "encryption-key");
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (url.endsWith("/linode/instances")) {
        return new Response(JSON.stringify({ data: [{ id: 101, label: "web-1", status: "running", region: "es-mad", type: "g6-standard-1", ipv4: ["203.0.113.10"] }] }), { status: 200 });
      }
      if (url.endsWith("/linode/instances/101")) {
        return new Response(JSON.stringify({ id: 101, label: "web-1", status: "running", region: "es-mad", type: "g6-standard-1", ipv4: ["203.0.113.10"] }), { status: 200 });
      }
      return new Response(null, { status: 204 });
    });
    try {
      const accountMenu = await worker.fetch(telegramRequest(callbackUpdate("sc:s:r:i")), env as never);
      const accountMenuBody = await accountMenu.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      expect(accountMenuBody.data.telegram.payload.text).toContain("已选范围：🖥 单台服务器");
      expect(accountMenuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
        { text: "#7 西班牙1", callback_data: "sc:ia:r:7" }
      ]));

      const instanceMenu = await worker.fetch(telegramRequest(callbackUpdate("sc:ia:r:7")), env as never);
      const instanceMenuBody = await instanceMenu.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      expect(instanceMenuBody.data.telegram.payload.text).toContain("请选择服务器");
      expect(instanceMenuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
        { text: "#101 web-1", callback_data: "sc:i:r:7:101" },
        { text: "⬅️ 上一步：选择账号", callback_data: "sc:s:r:i" }
      ]));

      const presetMenu = await worker.fetch(telegramRequest(callbackUpdate("sc:i:r:7:101")), env as never);
      const presetMenuBody = await presetMenu.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      expect(presetMenuBody.data.telegram.payload.text).toContain("已选动作：🔄 重启");
      expect(presetMenuBody.data.telegram.payload.text).toContain("实例 #101");
      expect(presetMenuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
        { text: "🌅 每天 08:50", callback_data: "sc:p:r:i7_101:0850" },
        { text: "⬅️ 上一步：选择服务器", callback_data: "sc:s:r:i" }
      ]));

      const created = await worker.fetch(telegramRequest(callbackUpdate("sc:p:r:i7_101:0850")), env as never);
      const createdBody = await created.json() as { data: { telegram: { payload: { text: string } } } };
      expect(createdBody.data.telegram.payload.text).toContain("定时任务已创建");
      expect(createdBody.data.telegram.payload.text).toContain("动作：🔄 重启");
      expect(createdBody.data.telegram.payload.text).toContain("实例 #101");
      expect(db.schedules[0]).toMatchObject({ name: "每天 08:50 实例 #101 重启", action: "reboot", scope: "instance", account_id: 7, instance_id: 101, enabled: 1, cron_expr: "50 8 * * *" });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("creates group-scoped quick preset schedules from Telegram", async () => {
    const db = new FakeD1Database();
    db.groups.push({ id: 2, name: "西班牙", is_default: 0, created_at: "2026-01-01T00:50:00.000Z", updated_at: "2026-01-01T00:50:00.000Z", deleted_at: null });
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    const groupMenu = await worker.fetch(telegramRequest(callbackUpdate("sc:s:s:g")), env as never);
    const groupMenuBody = await groupMenu.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(groupMenuBody.data.telegram.payload.text).toContain("已选范围：📁 分组");
    expect(groupMenuBody.data.telegram.payload.text).toContain("请选择分组");
    expect(groupMenuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "📁 西班牙", callback_data: "sc:g:s:2" },
      { text: "⬅️ 上一步：选择范围", callback_data: "sc:a:s" }
    ]));

    const presetMenu = await worker.fetch(telegramRequest(callbackUpdate("sc:g:s:2")), env as never);
    const presetMenuBody = await presetMenu.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(presetMenuBody.data.telegram.payload.text).toContain("已选动作：⚠️ 关机");
    expect(presetMenuBody.data.telegram.payload.text).toContain("已选范围：📁 分组 #2");
    expect(presetMenuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "🌅 每天 08:50", callback_data: "sc:p:s:g2:0850" },
      { text: "🌙 每天 23:05", callback_data: "sc:p:s:g2:2305" },
      { text: "⬅️ 上一步：选择分组", callback_data: "sc:s:s:g" }
    ]));

    const created = await worker.fetch(telegramRequest(callbackUpdate("sc:p:s:g2:2305")), env as never);
    const createdBody = await created.json() as { data: { telegram: { payload: { text: string } } } };
    expect(createdBody.data.telegram.payload.text).toContain("定时任务已创建");
    expect(createdBody.data.telegram.payload.text).toContain("动作：⚠️ 关机");
    expect(createdBody.data.telegram.payload.text).toContain("范围：📁 分组 #2");
    expect(createdBody.data.telegram.payload.text).toContain("Cron：5 23 * * *");
    expect(db.schedules[0]).toMatchObject({ name: "每天 23:05 分组 #2 关机", action: "shutdown", scope: "group", group_id: 2, account_id: null, enabled: 1, cron_expr: "5 23 * * *" });
  });


  it("creates button-selected hour/minute schedules from Telegram like the legacy bot", async () => {
    const db = new FakeD1Database();
    db.groups.push({ id: 2, name: "西班牙", is_default: 0, created_at: "2026-01-01T00:50:00.000Z", updated_at: "2026-01-01T00:50:00.000Z", deleted_at: null });
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    const hourMenu = await worker.fetch(telegramRequest(callbackUpdate("sc:th:s:g2")), env as never);
    const hourMenuBody = await hourMenu.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(hourMenuBody.data.telegram.payload.text).toContain("选择小时");
    expect(hourMenuBody.data.telegram.payload.text).toContain("已选范围：📁 分组 #2");
    expect(hourMenuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "00", callback_data: "sc:tm:s:g2:00" },
      { text: "09", callback_data: "sc:tm:s:g2:09" },
      { text: "23", callback_data: "sc:tm:s:g2:23" },
      { text: "⬅️ 上一步：选择执行时间", callback_data: "sc:pback:s:g2" }
    ]));
    expect(collectCallbackData(hourMenuBody.data.telegram.payload.reply_markup).every((value) => Buffer.byteLength(value) <= 64)).toBe(true);

    const minuteMenu = await worker.fetch(telegramRequest(callbackUpdate("sc:tm:s:g2:09")), env as never);
    const minuteMenuBody = await minuteMenu.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(minuteMenuBody.data.telegram.payload.text).toContain("选择分钟");
    expect(minuteMenuBody.data.telegram.payload.text).toContain("已选小时：09:__");
    expect(minuteMenuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "00", callback_data: "sc:t:s:g2:09:00" },
      { text: "45", callback_data: "sc:t:s:g2:09:45" },
      { text: "55", callback_data: "sc:t:s:g2:09:55" },
      { text: "⬅️ 上一步：重选小时", callback_data: "sc:th:s:g2" }
    ]));
    expect(collectCallbackData(minuteMenuBody.data.telegram.payload.reply_markup).every((value) => Buffer.byteLength(value) <= 64)).toBe(true);

    const created = await worker.fetch(telegramRequest(callbackUpdate("sc:t:s:g2:09:45")), env as never);
    const createdBody = await created.json() as { data: { telegram: { payload: { text: string } } } };
    expect(createdBody.data.telegram.payload.text).toContain("定时任务已创建");
    expect(createdBody.data.telegram.payload.text).toContain("范围：📁 分组 #2");
    expect(createdBody.data.telegram.payload.text).toContain("Cron：45 9 * * *");
    expect(db.schedules[0]).toMatchObject({ name: "每天 09:45 分组 #2 关机", action: "shutdown", scope: "group", group_id: 2, cron_expr: "45 9 * * *", enabled: 1 });
  });


  it("updates schedules via authenticated API and Telegram edit flow", async () => {
    const db = new FakeD1Database();
    db.groups.push({ id: 2, name: "西班牙", is_default: 0, created_at: "2026-01-01T00:50:00.000Z", updated_at: "2026-01-01T00:50:00.000Z", deleted_at: null });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    db.schedules.push({ id: 1, name: "old", enabled: 1, action: "boot", scope: "all", account_id: null, group_id: null, instance_id: null, cron_expr: "50 8 * * *", timezone: "Asia/Shanghai", last_run_at: null, next_run_at: "2026-01-02T00:50:00.000Z", created_at: "2026-01-01T00:50:00.000Z", updated_at: "2026-01-01T00:50:00.000Z", deleted_at: null, metadata_json: null });

    const apiUpdated = await worker.fetch(apiRequest("/api/v1/schedules/1", { method: "PATCH", body: JSON.stringify({ name: "new name", action: "shutdown", scope: "group", group_id: 2, cron_expr: "45 9 * * *" }) }), env as never);
    expect(apiUpdated.status).toBe(200);
    expect(db.schedules[0]).toMatchObject({ name: "new name", action: "shutdown", scope: "group", group_id: 2, account_id: null, cron_expr: "45 9 * * *" });
    expect(db.auditLogs).toEqual(expect.arrayContaining([expect.objectContaining({ action: "schedule.update", source: "api", target_id: "1" })]));

    const detail = await worker.fetch(telegramRequest(callbackUpdate("schedules:detail:1")), env as never);
    const detailBody = await detail.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(detailBody.data.telegram.payload.text).toContain("定时任务详情");
    expect(detailBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "✏️ 修改任务", callback_data: "schedules:edit:1" }
    ]));

    const edit = await worker.fetch(telegramRequest(callbackUpdate("schedules:edit:1")), env as never);
    const editBody = await edit.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(editBody.data.telegram.payload.text).toContain("修改定时任务");
    expect(editBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "修改动作", callback_data: "schedules:edit_action:1" },
      { text: "修改作用范围", callback_data: "schedules:edit_scope:1" },
      { text: "修改执行时间", callback_data: "schedules:edit_time:1" }
    ]));

    const actionUpdated = await worker.fetch(telegramRequest(callbackUpdate("sc:ea:1:r")), env as never);
    const actionUpdatedBody = await actionUpdated.json() as { data: { telegram: { payload: { text: string } } } };
    expect(actionUpdatedBody.data.telegram.payload.text).toContain("定时任务已更新");
    expect(actionUpdatedBody.data.telegram.payload.text).toContain("动作：🔄 重启");
    expect(db.schedules[0].action).toBe("reboot");

    const timeUpdated = await worker.fetch(telegramRequest(callbackUpdate("sc:et:1:10:35")), env as never);
    const timeUpdatedBody = await timeUpdated.json() as { data: { telegram: { payload: { text: string } } } };
    expect(timeUpdatedBody.data.telegram.payload.text).toContain("Cron：35 10 * * *");
    expect(db.schedules[0].cron_expr).toBe("35 10 * * *");
    expect(db.auditLogs).toEqual(expect.arrayContaining([expect.objectContaining({ action: "schedule.update", source: "telegram", target_id: "1" })]));
  });

  it("creates custom time and cron schedules from Telegram message flow", async () => {
    const db = new FakeD1Database();
    addAccount(db, 7, "西班牙1");
    db.accounts[0].encrypted_token = await encryptLinodeToken("token-7", "encryption-key");
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (url.endsWith("/linode/instances/101")) return new Response(JSON.stringify({ id: 101, label: "web-1", status: "running", region: "es-mad", type: "g6-standard-1" }), { status: 200 });
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    try {

    const customPrompt = await worker.fetch(telegramRequest(callbackUpdate("sc:c:r:i7_101")), env as never);
    const customPromptBody = await customPrompt.json() as { data: { telegram: { payload: { text: string } } } };
    expect(customPromptBody.data.telegram.payload.text).toContain("自定义定时任务时间");
    expect(customPromptBody.data.telegram.payload.text).toContain("09:30");
    expect((customPromptBody as { data: { telegram: { payload: { reply_markup?: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } }).data.telegram.payload.reply_markup?.inline_keyboard.flat()).toContainEqual({ text: "⬅️ 上一步：选择执行时间", callback_data: "sc:pback:r:i7_101" });
    expect(db.botSessions[0]).toMatchObject({ state: "creating_schedule_custom_time" });
    expect(db.botSessions[0].data_json).toContain("reboot");
    expect(db.botSessions[0].data_json).toContain("101");

    const createdTime = await worker.fetch(telegramRequest(messageUpdate("09:45")), env as never);
    const createdTimeBody = await createdTime.json() as { data: { telegram: { payload: { text: string } } } };
    expect(createdTimeBody.data.telegram.payload.text).toContain("定时任务已创建");
    expect(createdTimeBody.data.telegram.payload.text).toContain("范围：🖥 单台服务器 账号 #7 / 实例 #101");
    expect(createdTimeBody.data.telegram.payload.text).toContain("Cron：45 9 * * *");
    expect(db.schedules[0]).toMatchObject({ action: "reboot", scope: "instance", account_id: 7, instance_id: 101, cron_expr: "45 9 * * *", timezone: "Asia/Shanghai" });
    expect(db.schedules[0].next_run_at?.endsWith("T01:45:00.000Z")).toBe(true);
    expect(db.botSessions).toHaveLength(0);

    await worker.fetch(telegramRequest(callbackUpdate("sc:c:b:a")), env as never);
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
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("enables, disables, and delete-confirms schedules from Telegram with Chinese copy", async () => {
    const db = new FakeD1Database();
    db.schedules.push({ id: 1, name: "morning boot", enabled: 1, action: "boot", scope: "all", account_id: null, cron_expr: "50 8 * * *", timezone: "Asia/Shanghai", last_run_at: null, next_run_at: "2026-01-02T00:50:00.000Z", created_at: "2026-01-01T00:50:00.000Z", updated_at: "2026-01-01T00:50:00.000Z", deleted_at: null, metadata_json: JSON.stringify({ token: "secret-api-token" }) });
    db.schedules.push({ id: 2, name: "night shutdown", enabled: 0, action: "shutdown", scope: "account", account_id: 7, cron_expr: "5 23 * * *", timezone: "Asia/Shanghai", last_run_at: null, next_run_at: "2026-01-02T15:05:00.000Z", created_at: "2026-01-01T00:50:00.000Z", updated_at: "2026-01-01T00:50:00.000Z", deleted_at: null, metadata_json: null });
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    const disable = await worker.fetch(telegramRequest(callbackUpdate("schedules:disable:1")), env as never);
    const disableBody = await disable.json() as { data: { telegram: { payload: { text: string } } } };
    expect(disableBody.data.telegram.payload.text).toContain("定时任务已停用");
    expect(disableBody.data.telegram.payload.text).toContain("动作：✅ 开机");
    expect(db.schedules[0].enabled).toBe(0);

    const enable = await worker.fetch(telegramRequest(callbackUpdate("schedules:enable:2")), env as never);
    const enableBody = await enable.json() as { data: { telegram: { payload: { text: string } } } };
    expect(enableBody.data.telegram.payload.text).toContain("定时任务已启用");
    expect(enableBody.data.telegram.payload.text).toContain("动作：⚠️ 关机");
    expect(enableBody.data.telegram.payload.text).toContain("范围：👤 单账号 #7");
    expect(db.schedules[1].enabled).toBe(1);

    const confirm = await worker.fetch(telegramRequest(callbackUpdate("schedules:delete_confirm:2")), env as never);
    const confirmBody = await confirm.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    const confirmRaw = JSON.stringify(confirmBody);
    expect(confirmBody.data.telegram.payload.text).toContain("确认删除定时任务");
    expect(confirmBody.data.telegram.payload.text).toContain("动作：⚠️ 关机");
    expect(confirmBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "🗑 确认删除任务", callback_data: "schedules:delete:2" },
      { text: "❌ 取消", callback_data: "schedules:list" }
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
