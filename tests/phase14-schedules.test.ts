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

type ScheduleRecord = { id: number; name: string; enabled: number; action: string; scope: string; account_id: number | null; cron_expr: string; timezone: string; last_run_at: string | null; next_run_at: string | null; created_at: string; updated_at: string; deleted_at: string | null; metadata_json: string | null };
type AuditRecord = { action: string; target_type: string; target_id: string | null; risk_level: string; result: string; error_code: string | null; metadata_json: string | null; request_id: string; actor: string; source: string };

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
  auditLogs: AuditRecord[] = [];
  nextScheduleId = 1;
  prepare(sql: string) { return new FakePreparedStatement(this, sql); }
  first<T>(sql: string, values: unknown[] = []): T | null {
    if (sql.includes("FROM power_schedules") && sql.includes("WHERE id = ?")) return (this.schedules.find((s) => s.id === Number(values[0]) && s.deleted_at === null) as T | undefined) ?? null;
    return null;
  }
  all<T>(sql: string, values: unknown[] = []): T[] {
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
      const row: ScheduleRecord = { id: this.nextScheduleId++, name: String(values[0]), enabled: Number(values[1]), action: String(values[2]), scope: String(values[3]), account_id: values[4] === null ? null : Number(values[4]), cron_expr: String(values[5]), timezone: String(values[6]), next_run_at: values[7] as string | null, metadata_json: values[8] as string | null, last_run_at: null, created_at: now, updated_at: now, deleted_at: null };
      this.schedules.push(row);
      return { last_row_id: row.id, changes: 1 };
    }
    if (sql.includes("UPDATE power_schedules") && sql.includes("enabled = 1")) { const s = this.schedules.find((x) => x.id === Number(values[0]) && x.deleted_at === null); if (s) s.enabled = 1; return { changes: s ? 1 : 0 }; }
    if (sql.includes("UPDATE power_schedules") && sql.includes("enabled = 0")) { const s = this.schedules.find((x) => x.id === Number(values[0]) && x.deleted_at === null); if (s) s.enabled = 0; return { changes: s ? 1 : 0 }; }
    if (sql.includes("UPDATE power_schedules") && sql.includes("deleted_at")) { const s = this.schedules.find((x) => x.id === Number(values[0]) && x.deleted_at === null); if (s) s.deleted_at = now; return { changes: s ? 1 : 0 }; }
    if (sql.includes("INTO audit_logs")) { this.auditLogs.push({ request_id: values[0] as string, actor: values[1] as string, source: values[2] as string, action: values[3] as string, target_type: values[4] as string, target_id: values[5] as string | null, risk_level: values[6] as string, result: values[7] as string, error_code: values[8] as string | null, metadata_json: values[9] as string | null }); return { changes: 1 }; }
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
    expect((await worker.fetch(apiRequest("/api/v1/schedules/1", { method: "DELETE" }), env as never)).status).toBe(200);
    expect(db.schedules[0].deleted_at).toEqual(expect.any(String));

    expect(db.auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "schedule.create", target_type: "power_schedule", target_id: "1", risk_level: "medium", result: "success" }),
      expect.objectContaining({ action: "schedule.disable", target_type: "power_schedule", target_id: "1", risk_level: "medium", result: "success" }),
      expect.objectContaining({ action: "schedule.enable", target_type: "power_schedule", target_id: "1", risk_level: "medium", result: "success" }),
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
    expect(menuBody.data.telegram.payload.text).toContain("定时开关机");
    expect(menuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([{ text: "查看定时任务", callback_data: "schedules:list" }]));

    const list = await worker.fetch(telegramRequest(callbackUpdate("schedules:list")), env as never);
    const listBody = await list.json() as { data: { telegram: { payload: { text: string } } } };
    expect(listBody.data.telegram.payload.text).toContain("定时任务列表");
    expect(listBody.data.telegram.payload.text).toContain("morning boot");
    expect(listBody.data.telegram.payload.text).toContain("boot");
  });
});
