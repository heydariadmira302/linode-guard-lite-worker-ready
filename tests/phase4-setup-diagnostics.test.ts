import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { JobsRepository } from "../src/storage/jobs-repository";
import { SettingsRepository } from "../src/storage/settings-repository";

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

const requiredTables = [
  "settings",
  "linode_accounts",
  "login_events",
  "security_events",
  "audit_logs",
  "admin_presence",
  "admin_presence_policies",
  "admin_presence_policy_runs",
  "power_schedules",
  "schedule_runs",
  "jobs",
  "job_runs",
  "bot_sessions",
  "telegram_messages"
];

class FakePreparedStatement {
  constructor(private db: FakeD1Database, private sql: string) {}
  private values: unknown[] = [];
  bind(...values: unknown[]) { this.values = values; return this; }
  first<T = unknown>() { return Promise.resolve(this.db.first<T>(this.sql, this.values)); }
  all<T = unknown>() { return Promise.resolve({ results: this.db.all<T>(this.sql), success: true, meta: {} }); }
  run() { this.db.run(this.sql, this.values); return Promise.resolve({ success: true, meta: {} }); }
}

class FakeD1Database {
  settings = new Map<string, string>();
  jobs = new Map<string, Record<string, unknown>>();
  existingTables = new Set<string>(requiredTables);
  adminPresenceInitialized = false;

  prepare(sql: string) { return new FakePreparedStatement(this, sql); }
  async exec(sql: string) {
    const tableMatches = Array.from(sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/gi));
    for (const match of tableMatches) this.existingTables.add(match[1]);
    return { count: this.existingTables.size, duration: 1 };
  }

  first<T>(sql: string, values: unknown[]): T | null {
    if (sql.includes("sqlite_master")) {
      const table = values[0] as string;
      return this.existingTables.has(table) ? ({ name: table } as T) : null;
    }
    if (sql.includes("FROM settings")) {
      const value = this.settings.get(values[0] as string);
      return value ? ({ key: values[0], value_json: value } as T) : null;
    }
    return null;
  }

  all<T>(sql: string): T[] {
    if (sql.includes("FROM jobs")) return [...this.jobs.values()] as T[];
    return [];
  }

  run(sql: string, values: unknown[]) {
    const createTableMatch = sql.match(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/i);
    if (createTableMatch) this.existingTables.add(createTableMatch[1]);
    if (sql.includes("INTO settings")) {
      const key = values[0] as string;
      if (sql.includes("DO NOTHING") && this.settings.has(key)) return;
      this.settings.set(key, values[1] as string);
    }
    if (sql.includes("INTO jobs")) {
      const name = values[0] as string;
      if (!this.jobs.has(name)) this.jobs.set(name, { name, type: values[1], enabled: values[2], last_run_at: null, last_status: null, summary: null });
    }
    if (sql.includes("INTO admin_presence")) this.adminPresenceInitialized = true;
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

function messageUpdate(text: string) {
  return {
    update_id: 1,
    message: {
      message_id: 10,
      chat: { id: 123456789, type: "private" },
      from: { id: 123456789, is_bot: false, first_name: "Admin" },
      text
    }
  };
}

describe("Phase 4 setup wizard and diagnostics", () => {
  it("returns deployment diagnostics without leaking secret values", async () => {
    const db = new FakeD1Database();
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const response = await worker.fetch(apiRequest("/api/v1/diagnostics/deployment"), env as never);
    const body = await response.json() as { ok: boolean; data: { status: string; checks: Record<string, { ok: boolean; missing?: string[] }> } };
    const raw = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("ok");
    expect(body.data.checks.telegram_bot_token.ok).toBe(true);
    expect(body.data.checks.telegram_webhook_secret.ok).toBe(true);
    expect(body.data.checks.super_admin_telegram_id.ok).toBe(true);
    expect(body.data.checks.api_auth_token.ok).toBe(true);
    expect(body.data.checks.linode_token_encryption_key.ok).toBe(true);
    expect(body.data.checks.db.ok).toBe(true);
    expect(body.data.checks.tables).toMatchObject({ ok: true, missing: [] });
    expect(raw).not.toContain("secret-api-token");
    expect(raw).not.toContain("bot-token");
    expect(raw).not.toContain("encryption-key");
  });

  it("marks missing DB binding and missing tables in deployment diagnostics", async () => {
    const missingDbResponse = await worker.fetch(apiRequest("/api/v1/diagnostics/deployment"), baseEnv as never);
    const missingDbBody = await missingDbResponse.json() as { ok: boolean; data: { checks: Record<string, { ok: boolean; error_code?: string }> } };
    expect(missingDbResponse.status).toBe(200);
    expect(missingDbBody.data.checks.db).toMatchObject({ ok: false, error_code: "CONFIG_MISSING" });

    const db = new FakeD1Database();
    db.existingTables.delete("jobs");
    db.existingTables.delete("settings");
    const tableResponse = await worker.fetch(apiRequest("/api/v1/diagnostics/deployment"), { ...baseEnv, DB: db as unknown as D1Database } as never);
    const tableBody = await tableResponse.json() as { ok: boolean; data: { checks: Record<string, { ok: boolean; missing?: string[] }> } };
    expect(tableBody.data.checks.tables.ok).toBe(false);
    expect(tableBody.data.checks.tables.missing).toEqual(expect.arrayContaining(["jobs", "settings"]));
  });

  it("requires API bearer token for Phase 4 HTTP APIs", async () => {
    const response = await worker.fetch(new Request("https://example.com/api/v1/diagnostics/jobs"), { ...baseEnv, DB: new FakeD1Database() as unknown as D1Database } as never);
    const body = await response.json() as { ok: boolean; error: { code: string } };

    expect(response.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("renders a browser setup page for activating D1 schema and defaults", async () => {
    const response = await worker.fetch(new Request("https://example.com/setup"), baseEnv as never);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(text).toContain("Linode Guard Lite 初始化安装");
    expect(text).toContain("初始化数据库表结构");
    expect(text).toContain("初始化默认设置和系统 jobs");
    expect(text).toContain("/api/v1/setup/schema");
    expect(text).toContain("/api/v1/setup/initialize");
    expect(text).toContain("自动生成独立的 API_AUTH_TOKEN、Telegram webhook secret 和加密密钥");
  });

  it("initializes D1 schema from the deployed Worker before default settings and jobs", async () => {
    const db = new FakeD1Database();
    db.existingTables.clear();
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    const response = await worker.fetch(apiRequest("/api/v1/setup/schema", { method: "POST" }), env as never);
    const body = await response.json() as { ok: boolean; data: { schema: { initialized: boolean; missing_after: string[] } } };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.schema.initialized).toBe(true);
    expect(body.data.schema.missing_after).toEqual([]);
    expect(db.existingTables).toEqual(new Set(requiredTables));
  });

  it("initializes default settings and jobs without overwriting existing settings", async () => {
    const db = new FakeD1Database();
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    await new SettingsRepository(env.DB).set("security_settings", { enabled: false, custom: "keep-me" });

    const response = await worker.fetch(apiRequest("/api/v1/setup/initialize", { method: "POST" }), env as never);
    const body = await response.json() as { ok: boolean; data: { settings: { created: string[]; existing: string[] }; jobs: { created: string[]; existing: string[] } } };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.settings.existing).toContain("security_settings");
    expect(body.data.settings.created).toContain("app_settings");
    expect(await new SettingsRepository(env.DB).get("security_settings")).toEqual({ enabled: false, custom: "keep-me" });
    expect(await new JobsRepository(env.DB).list()).toHaveLength(7);
    expect(body.data.jobs.created).toEqual(expect.arrayContaining([
      "login_monitor",
      "login_timeout",
      "checkin_monitor",
      "schedule_power",
      "message_cleanup",
      "audit_log_cleanup",
      "security_event_cleanup"
    ]));
    expect(db.adminPresenceInitialized).toBe(true);
  });

  it("returns job diagnostics with default job presence and enabled status", async () => {
    const db = new FakeD1Database();
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    await worker.fetch(apiRequest("/api/v1/setup/initialize", { method: "POST" }), env as never);

    const response = await worker.fetch(apiRequest("/api/v1/diagnostics/jobs"), env as never);
    const body = await response.json() as { ok: boolean; data: { status: string; missing: string[]; jobs: Array<{ name: string; exists: boolean; enabled: boolean }> } };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("ok");
    expect(body.data.missing).toEqual([]);
    expect(body.data.jobs).toHaveLength(7);
    expect(body.data.jobs).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "login_monitor", exists: true, enabled: true }),
      expect.objectContaining({ name: "security_event_cleanup", exists: true, enabled: true })
    ]));
  });

  it("renders Telegram /setup as a readable setup wizard result", async () => {
    const db = new FakeD1Database();
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    const response = await worker.fetch(telegramRequest(messageUpdate("/setup")), env as never);
    const body = await response.json() as { ok: boolean; data: { telegram: { payload: { text: string } } } };
    const text = body.data.telegram.payload.text;

    expect(response.status).toBe(200);
    expect(text).toContain("Linode Guard Lite Setup Wizard");
    expect(text).toContain("Telegram Bot Token");
    expect(text).toContain("D1 Binding DB");
    expect(text).toContain("默认 Jobs");
    expect(text).not.toContain("bot-token");
    expect(text).not.toContain("secret-api-token");
    expect(text).not.toContain("encryption-key");
  });
});
