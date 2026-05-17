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

type AuditRecord = {
  id: number;
  request_id: string;
  actor: string;
  source: string;
  action: string;
  target_type: string;
  target_id: string | null;
  risk_level: string;
  result: string;
  error_code: string | null;
  created_at: string;
  metadata_json: string | null;
};

class FakePreparedStatement {
  constructor(private db: FakeD1Database, private sql: string) {}
  private values: unknown[] = [];
  bind(...values: unknown[]) { this.values = values; return this; }
  first<T = unknown>() { return Promise.resolve(this.db.first<T>(this.sql, this.values)); }
  all<T = unknown>() { return Promise.resolve({ results: this.db.all<T>(this.sql, this.values), success: true, meta: {} }); }
  run() { return Promise.resolve({ success: true, meta: {} }); }
}

class FakeD1Database {
  auditLogs: AuditRecord[] = [];
  prepare(sql: string) { return new FakePreparedStatement(this, sql); }
  first<T>(_sql: string, _values: unknown[]): T | null { return null; }
  all<T>(sql: string, values: unknown[]): T[] {
    if (sql.includes("FROM audit_logs")) {
      const hasActionFilter = sql.includes("action = ?");
      const action = hasActionFilter ? String(values[0]) : null;
      const limit = Number(values[hasActionFilter ? 1 : 0]);
      const offset = Number(values[hasActionFilter ? 2 : 1]);
      return this.auditLogs
        .filter((log) => !action || log.action === action)
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
        .slice(offset, offset + limit) as T[];
    }
    return [];
  }
}

function apiRequest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("Authorization")) headers.set("Authorization", "Bearer secret-api-token");
  return new Request(`https://example.com${path}`, { ...init, headers });
}

function telegramRequest(update: unknown) {
  return new Request("https://example.com/telegram/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": "telegram-secret"
    },
    body: JSON.stringify(update)
  });
}

function callbackUpdate(data: string) {
  return {
    update_id: 30,
    callback_query: {
      id: "cb_audit",
      from: { id: 123456789 },
      message: { message_id: 11, chat: { id: 123456789 } },
      data
    }
  };
}

function addAudit(db: FakeD1Database, log: Partial<AuditRecord> & Pick<AuditRecord, "id" | "action" | "target_type" | "risk_level" | "result" | "created_at">) {
  db.auditLogs.push({
    request_id: `req_${log.id}`,
    actor: "api:default",
    source: "api",
    target_id: null,
    error_code: null,
    metadata_json: null,
    ...log
  });
}

describe("Phase 10 audit logs API and Telegram menu", () => {
  it("lists audit logs via authenticated HTTP API with limit/offset and never returns sensitive metadata", async () => {
    const db = new FakeD1Database();
    addAudit(db, { id: 1, action: "instance.boot", target_type: "instance", target_id: "101", risk_level: "medium", result: "success", created_at: "2026-01-01T00:00:00.000Z" });
    addAudit(db, { id: 2, action: "instance.delete", target_type: "instance", target_id: "102", risk_level: "critical", result: "failed", error_code: "TOKEN_INVALID", created_at: "2026-01-02T00:00:00.000Z", metadata_json: JSON.stringify({ token: "plain-token", encrypted_token: "v1:cipher" }) });
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    const response = await worker.fetch(apiRequest("/api/v1/audit-logs?limit=1&offset=0"), env as never);
    const body = await response.json() as { ok: boolean; data: { audit_logs: Array<Record<string, unknown>>; limit: number; offset: number } };
    const raw = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.limit).toBe(1);
    expect(body.data.offset).toBe(0);
    expect(body.data.audit_logs).toHaveLength(1);
    expect(body.data.audit_logs[0]).toMatchObject({ id: 2, action: "instance.delete", target_type: "instance", target_id: "102", risk_level: "critical", result: "failed", error_code: "TOKEN_INVALID" });
    expect(raw).not.toContain("plain-token");
    expect(raw).not.toContain("encrypted_token");
  });

  it("requires API Bearer Token and supports action filter", async () => {
    const db = new FakeD1Database();
    addAudit(db, { id: 1, action: "instance.boot", target_type: "instance", risk_level: "medium", result: "success", created_at: "2026-01-01T00:00:00.000Z" });
    addAudit(db, { id: 2, action: "instance.delete", target_type: "instance", risk_level: "critical", result: "success", created_at: "2026-01-02T00:00:00.000Z" });
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    const unauthorized = await worker.fetch(new Request("https://example.com/api/v1/audit-logs"), env as never);
    expect(unauthorized.status).toBe(401);
    expect(((await unauthorized.json()) as { error: { code: string } }).error.code).toBe("UNAUTHORIZED");

    const filtered = await worker.fetch(apiRequest("/api/v1/audit-logs?action=instance.boot"), env as never);
    const body = await filtered.json() as { data: { audit_logs: Array<{ action: string }> } };
    expect(filtered.status).toBe(200);
    expect(body.data.audit_logs).toHaveLength(1);
    expect(body.data.audit_logs[0].action).toBe("instance.boot");
  });

  it("shows recent audit logs from Telegram menu", async () => {
    const db = new FakeD1Database();
    addAudit(db, { id: 1, action: "instance.boot", target_type: "instance", target_id: "101", risk_level: "medium", result: "success", created_at: "2026-01-01T00:00:00.000Z" });
    addAudit(db, { id: 2, action: "instance.delete", target_type: "instance", target_id: "102", risk_level: "critical", result: "failed", error_code: "TOKEN_INVALID", created_at: "2026-01-02T00:00:00.000Z", metadata_json: JSON.stringify({ token: "plain-token", encrypted_token: "v1:cipher" }) });
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    const response = await worker.fetch(telegramRequest(callbackUpdate("menu:audit_logs")), env as never);
    const body = await response.json() as { ok: boolean; data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    const text = body.data.telegram.payload.text;
    const raw = JSON.stringify(body);
    const keyboard = body.data.telegram.payload.reply_markup.inline_keyboard.flat();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(text).toContain("审计日志");
    expect(text).toContain("2026-01-02T00:00:00.000Z");
    expect(text).toContain("action：instance.delete");
    expect(text).toContain("target_type：instance");
    expect(text).toContain("target_id：102");
    expect(text).toContain("risk_level：critical");
    expect(text).toContain("result：failed");
    expect(text).toContain("error_code：TOKEN_INVALID");
    expect(keyboard).toEqual(expect.arrayContaining([{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]));
    expect(raw).not.toContain("plain-token");
    expect(raw).not.toContain("encrypted_token");
  });

  it("documents audit logs API and Telegram entry", async () => {
    const apiDoc = await import("node:fs/promises").then((fs) => fs.readFile("docs/api.md", "utf8"));
    const telegramDoc = await import("node:fs/promises").then((fs) => fs.readFile("docs/telegram.md", "utf8"));

    expect(apiDoc).toContain("GET /api/v1/audit-logs");
    expect(apiDoc).toContain("limit");
    expect(apiDoc).toContain("offset");
    expect(apiDoc).toContain("action");
    expect(apiDoc).toContain("不会返回 token 明文或 encrypted_token");
    expect(telegramDoc).toContain("审计日志");
    expect(telegramDoc).toContain("menu:audit_logs");
    expect(telegramDoc).toContain("created_at");
    expect(telegramDoc).toContain("error_code");
  });
});
