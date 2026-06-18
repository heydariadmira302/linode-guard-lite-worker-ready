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
  "groups",
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
  "bot_managed_instances",
  "bot_sessions",
  "telegram_messages",
  "windows_installs"
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
  columns = new Map<string, Set<string>>(requiredTables.map((table) => [table, new Set<string>()]));
  adminPresenceInitialized = false;
  botManagedInstances = [{ account_id: 1, instance_id: 101, label: "vm-101", last_action: "shutdown", last_action_at: "2026-01-01T00:00:00.000Z" }];

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
      if (!this.existingTables.has("settings")) throw new Error("D1_ERROR: no such table: settings: SQLITE_ERROR");
      const value = this.settings.get(values[0] as string);
      return value ? ({ key: values[0], value_json: value } as T) : null;
    }
    return null;
  }

  all<T>(sql: string): T[] {
    const pragmaMatch = sql.match(/PRAGMA table_info\(([^)]+)\)/i);
    if (pragmaMatch) return [...(this.columns.get(pragmaMatch[1]) ?? new Set<string>())].map((name) => ({ name })) as T[];
    if (sql.includes("FROM jobs")) return [...this.jobs.values()] as T[];
    if (sql.includes("FROM bot_managed_instances")) return this.botManagedInstances as T[];
    return [];
  }

  resetColumns() {
    this.columns = new Map<string, Set<string>>([
      ["linode_accounts", new Set(["id", "alias", "encrypted_token", "token_fingerprint", "status"])],
      ["power_schedules", new Set(["id", "name", "enabled", "action", "scope", "account_id", "cron_expr", "timezone", "next_run_at"])],
      ["schedule_runs", new Set(["id", "schedule_id", "action", "scope", "started_at", "status"])],
      ["jobs", new Set(["id", "name", "type", "enabled", "last_run_at", "next_run_at"])],
      ["windows_installs", new Set(["id", "account_id", "status", "callback_token_hash"])]
    ]);
  }

  run(sql: string, values: unknown[]) {
    const createTableMatch = sql.match(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/i);
    if (createTableMatch) {
      this.existingTables.add(createTableMatch[1]);
      if (!this.columns.has(createTableMatch[1])) this.columns.set(createTableMatch[1], new Set<string>());
    }
    const alterColumnMatch = sql.match(/ALTER TABLE\s+([a-z_]+)\s+ADD COLUMN\s+([a-z_]+)/i);
    if (alterColumnMatch) this.columns.get(alterColumnMatch[1])?.add(alterColumnMatch[2]);
    if (sql.includes("INTO settings")) {
      if (!this.existingTables.has("settings")) throw new Error("D1_ERROR: no such table: settings: SQLITE_ERROR");
      const key = values[0] as string;
      if (sql.includes("DO NOTHING") && this.settings.has(key)) return;
      this.settings.set(key, values[1] as string);
    }
    if (sql.includes("INTO jobs")) {
      if (!this.existingTables.has("jobs")) throw new Error("D1_ERROR: no such table: jobs: SQLITE_ERROR");
      const name = values[0] as string;
      if (!this.jobs.has(name)) this.jobs.set(name, { name, type: values[1], enabled: values[2], last_run_at: null, last_status: null, summary: null });
    }
    if (sql.includes("INTO admin_presence")) {
      if (!this.existingTables.has("admin_presence")) throw new Error("D1_ERROR: no such table: admin_presence: SQLITE_ERROR");
      this.adminPresenceInitialized = true;
    }
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
    const body = await response.json() as { ok: boolean; data: { status: string; checks: Record<string, { ok: boolean; missing?: string[] }>; app_settings: { boot_safety_mode: string }; boot_safety: { mode: string; bot_managed_offline_count: number } } };
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
    expect(body.data.app_settings.boot_safety_mode).toBe("bot_managed_only");
    expect(body.data.boot_safety).toMatchObject({ mode: "bot_managed_only", bot_managed_offline_count: 1 });
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
    expect(text).toContain("Linode Guard Lite 一键安装");
    expect(text).toContain("一键安装 / 初始化");
    expect(text).toContain("自动完成建表、默认设置、系统 jobs 和运行时密钥初始化");
    expect(text).toContain("/api/v1/setup/initialize");
    expect(text).toContain("手动指定 runtime secrets");
    expect(text).toContain("留空自动生成");
    expect(text).not.toContain("reveal_runtime_secrets: true");
    expect(text).toContain("默认不会展示运行时密钥");
    const script = text.split("<script>")[1]?.split("</script>")[0] ?? "";
    expect(() => new Function(script)).not.toThrow();
  });


  it("allows one-click bootstrap initialize when settings table does not exist yet", async () => {
    const db = new FakeD1Database();
    db.existingTables.clear();
    const env = { ...baseEnv, API_AUTH_TOKEN: undefined, TELEGRAM_WEBHOOK_SECRET: undefined, LINODE_TOKEN_ENCRYPTION_KEY: undefined, DB: db as unknown as D1Database };
    const headers = new Headers({ Authorization: "Bearer bot-token", "content-type": "application/json" });

    const response = await worker.fetch(new Request("https://example.com/api/v1/setup/initialize", { method: "POST", headers, body: JSON.stringify({ runtime_secrets: {} }) }), env as never);
    const body = await response.json() as { ok: boolean; data: { schema?: { initialized: boolean; missing_after: string[] }; runtime_secrets: { values?: unknown; created: string[] }; jobs: { created: string[] } } };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.schema?.initialized).toBe(true);
    expect(body.data.schema?.missing_after).toEqual([]);
    expect(body.data.runtime_secrets.values).toBeUndefined();
    expect(body.data.runtime_secrets.created).toEqual(expect.arrayContaining(["api_auth_token", "telegram_webhook_secret", "linode_token_encryption_key"]));
    expect(JSON.stringify(body)).not.toContain("lg_api_");
    expect(JSON.stringify(body)).not.toContain("lg_wh_");
    expect(JSON.stringify(body)).not.toContain("lg_enc_");
    expect(body.data.jobs.created).toEqual(expect.arrayContaining(["login_monitor", "security_event_cleanup"]));
    expect(db.existingTables).toEqual(new Set(requiredTables));
  });

  it("repairs legacy D1 tables that exist but are missing newer columns", async () => {
    const db = new FakeD1Database();
    db.resetColumns();
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    const response = await worker.fetch(apiRequest("/api/v1/setup/initialize", { method: "POST", body: JSON.stringify({ runtime_secrets: {} }) }), env as never);
    const body = await response.json() as { ok: boolean; data: { schema: { initialized: boolean; missing_after: string[] } } };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.schema).toMatchObject({ initialized: true, missing_after: [] });
    expect([...(db.columns.get("linode_accounts") ?? [])]).toEqual(expect.arrayContaining(["group_id"]));
    expect([...(db.columns.get("power_schedules") ?? [])]).toEqual(expect.arrayContaining(["group_id", "instance_id"]));
    expect([...(db.columns.get("schedule_runs") ?? [])]).toEqual(expect.arrayContaining(["instance_id"]));
    expect([...(db.columns.get("jobs") ?? [])]).toEqual(expect.arrayContaining(["locked_until", "locked_by", "lock_started_at"]));
    expect([...(db.columns.get("windows_installs") ?? [])]).toEqual(expect.arrayContaining(["rdp_ready_at", "rdp_notified_at", "rdp_check_attempts", "last_rdp_check_error"]));
  });


  it("does not reveal encryption or webhook secrets even when explicit reveal is requested", async () => {
    const db = new FakeD1Database();
    db.existingTables.clear();
    const env = { ...baseEnv, API_AUTH_TOKEN: undefined, TELEGRAM_WEBHOOK_SECRET: undefined, LINODE_TOKEN_ENCRYPTION_KEY: undefined, DB: db as unknown as D1Database };
    const headers = new Headers({ Authorization: "Bearer bot-token", "content-type": "application/json" });

    const response = await worker.fetch(new Request("https://example.com/api/v1/setup/initialize", { method: "POST", headers, body: JSON.stringify({ runtime_secrets: {}, reveal_runtime_secrets: true }) }), env as never);
    const body = await response.json() as { ok: boolean; data: { runtime_secrets: { values?: { api_auth_token?: string; telegram_webhook_secret?: string; linode_token_encryption_key?: string } } } };
    const raw = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.data.runtime_secrets.values?.api_auth_token).toMatch(/^lg_api_/);
    expect(body.data.runtime_secrets.values?.telegram_webhook_secret).toBe("");
    expect(body.data.runtime_secrets.values?.linode_token_encryption_key).toBe("");
    expect(raw).not.toContain("lg_wh_");
    expect(raw).not.toContain("lg_enc_");
  });

  it("one-click initialize can configure Telegram webhook automatically", async () => {
    const db = new FakeD1Database();
    db.existingTables.clear();
    const env = { ...baseEnv, TELEGRAM_BOT_TOKEN: "123456:realish-token", API_AUTH_TOKEN: undefined, TELEGRAM_WEBHOOK_SECRET: undefined, LINODE_TOKEN_ENCRYPTION_KEY: undefined, DB: db as unknown as D1Database };
    const calls: Array<{ url: string; body: string }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), body: String(init?.body ?? "") });
      return new Response(JSON.stringify({ ok: true, result: true, description: "Webhook was set" }), { status: 200 });
    }) as typeof fetch;
    try {
      const headers = new Headers({ Authorization: "Bearer 123456:realish-token", "content-type": "application/json" });
      const response = await worker.fetch(new Request("https://worker.example.com/api/v1/setup/initialize", { method: "POST", headers, body: JSON.stringify({ runtime_secrets: {}, configure_telegram_webhook: true }) }), env as never);
      const body = await response.json() as { ok: boolean; data: { telegram_webhook?: { ok: boolean; webhook_url?: string }; public_base_url?: { value: string; saved: boolean } } };

      expect(response.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.telegram_webhook).toMatchObject({ ok: true, webhook_url: "https://worker.example.com/telegram/webhook" });
      expect(body.data.public_base_url).toMatchObject({ value: "https://worker.example.com", saved: true });
      expect(db.settings.get("public_base_url")).toBe(JSON.stringify("https://worker.example.com"));
      expect(body.data).toMatchObject({ install_notification: { attempted: true, ok: true, chat_id: "123456789" } });
      expect(calls).toHaveLength(2);
      expect(calls[0].url).toBe("https://api.telegram.org/bot123456:realish-token/setWebhook");
      expect(calls[0].body).toContain("https://worker.example.com/telegram/webhook");
      expect(calls[1].url).toBe("https://api.telegram.org/bot123456:realish-token/sendMessage");
      expect(calls[1].body).toContain("安装成功");
    } finally {
      globalThis.fetch = originalFetch;
    }
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
    expect(await new JobsRepository(env.DB).list()).toHaveLength(8);
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
    expect(body.data.jobs).toHaveLength(8);
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
