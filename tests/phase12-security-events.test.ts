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

type AccountRecord = {
  id: number;
  alias: string;
  encrypted_token: string;
  token_fingerprint: string;
  token_status: string;
  status: string;
  last_seen_login_id: string | null;
  last_login_check_at: string | null;
  security_baseline_at?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type LoginEventRecord = {
  id: number;
  account_id: number;
  linode_login_id: string;
  username: string | null;
  ip: string | null;
  datetime: string;
  status: string | null;
  raw_json: string | null;
  created_at: string;
};

type SecurityEventRecord = {
  id: number;
  account_id: number | null;
  type: string;
  severity: string;
  status: string;
  login_event_id: number | null;
  linode_login_id: string | null;
  username: string | null;
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  occurred_at: string;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
};

type AuditRecord = {
  request_id: string;
  actor: string;
  source: string;
  action: string;
  target_type: string;
  target_id: string | null;
  risk_level: string;
  result: string;
  error_code: string | null;
  metadata_json: string | null;
};

class FakePreparedStatement {
  constructor(private db: FakeD1Database, private sql: string) {}
  private values: unknown[] = [];
  bind(...values: unknown[]) { this.values = values; return this; }
  first<T = unknown>() { return Promise.resolve(this.db.first<T>(this.sql, this.values)); }
  all<T = unknown>() { return Promise.resolve({ results: this.db.all<T>(this.sql, this.values), success: true, meta: {} }); }
  run() { const meta = this.db.run(this.sql, this.values); return Promise.resolve({ success: true, meta }); }
}

class FakeD1Database {
  accounts: AccountRecord[] = [];
  loginEvents: LoginEventRecord[] = [];
  securityEvents: SecurityEventRecord[] = [];
  auditLogs: AuditRecord[] = [];
  settings = new Map<string, unknown>();
  nextLoginEventId = 1;
  nextSecurityEventId = 1;
  prepare(sql: string) { return new FakePreparedStatement(this, sql); }

  first<T>(sql: string, values: unknown[]): T | null {
    if (sql.toLowerCase().includes("count(*)") && sql.includes("security_events")) {
      return ({ count: this.securityEvents.filter((event) => event.status === String(values[0])).length } as unknown) as T;
    }
    if (sql.includes("FROM settings") && sql.includes("WHERE key = ?")) {
      const value = this.settings.get(String(values[0]));
      return value === undefined ? null : ({ value_json: JSON.stringify(value) } as unknown) as T;
    }
    if (sql.includes("FROM linode_accounts") && sql.includes("WHERE id = ?")) {
      return (this.accounts.find((account) => account.id === Number(values[0])) as T | undefined) ?? null;
    }
    if (sql.includes("FROM login_events") && sql.includes("WHERE account_id = ?") && sql.includes("linode_login_id = ?")) {
      return (this.loginEvents.find((event) => event.account_id === Number(values[0]) && event.linode_login_id === String(values[1])) as T | undefined) ?? null;
    }
    if (sql.includes("FROM security_events") && sql.includes("WHERE id = ?")) {
      return (this.securityEvents.find((event) => event.id === Number(values[0])) as T | undefined) ?? null;
    }
    if (sql.includes("FROM security_events") && sql.includes("WHERE account_id = ?") && sql.includes("type = ?") && sql.includes("occurred_at >= ?")) {
      return (this.securityEvents.find((event) => event.account_id === Number(values[0]) && event.type === String(values[1]) && event.occurred_at >= String(values[2])) as T | undefined) ?? null;
    }
    return null;
  }

  all<T>(sql: string, values: unknown[] = []): T[] {
    if (sql.includes("FROM linode_accounts")) return this.accounts.filter((account) => account.status === "active") as T[];
    if (sql.includes("FROM security_events")) {
      const limit = Number(values.at(-2));
      const offset = Number(values.at(-1));
      const filters = values.slice(0, -2);
      let rows = [...this.securityEvents];
      const whereClause = sql.split("ORDER BY")[0];
      if (values.length === 5) rows = rows.filter((event) => event.status === values[0] && event.type === values[1] && event.account_id === Number(values[2]));
      if (values.length !== 5) {
        if (whereClause.includes("status = ?")) {
          const expected = filters.shift();
          rows = rows.filter((event) => event.status === expected);
        }
        if (whereClause.includes("type = ?")) {
          const expected = filters.shift();
          rows = rows.filter((event) => event.type === expected);
        }
        if (whereClause.includes("account_id = ?")) {
          const expected = Number(filters.shift());
          rows = rows.filter((event) => event.account_id === expected);
        }
      }
      return rows.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.id - a.id).slice(offset, offset + limit) as T[];
    }
    return [];
  }

  run(sql: string, values: unknown[]) {
    if (sql.includes("INTO login_events")) {
      const existing = this.loginEvents.find((event) => event.account_id === Number(values[0]) && event.linode_login_id === String(values[1]));
      if (existing) return { last_row_id: existing.id, changes: 0 };
      const now = new Date().toISOString();
      const event: LoginEventRecord = {
        id: this.nextLoginEventId++,
        account_id: Number(values[0]),
        linode_login_id: String(values[1]),
        username: values[2] as string | null,
        ip: values[3] as string | null,
        datetime: String(values[4]),
        status: values[5] as string | null,
        raw_json: values[6] as string | null,
        created_at: now
      };
      this.loginEvents.push(event);
      return { last_row_id: event.id, changes: 1 };
    }
    if (sql.includes("INTO security_events")) {
      const now = new Date().toISOString();
      const event: SecurityEventRecord = {
        id: this.nextSecurityEventId++,
        account_id: values[0] === null ? null : Number(values[0]),
        type: String(values[1]),
        severity: String(values[2]),
        status: String(values[3]),
        login_event_id: values[4] === null ? null : Number(values[4]),
        linode_login_id: values[5] as string | null,
        username: values[6] as string | null,
        ip: values[7] as string | null,
        country: (sql.includes("country, region, city") ? values[8] : null) as string | null,
        region: (sql.includes("country, region, city") ? values[9] : null) as string | null,
        city: (sql.includes("country, region, city") ? values[10] : null) as string | null,
        occurred_at: String(sql.includes("country, region, city") ? values[11] : values[8]),
        metadata_json: (sql.includes("country, region, city") ? values[12] : values[9]) as string | null,
        created_at: now,
        updated_at: now
      };
      this.securityEvents.push(event);
      return { last_row_id: event.id, changes: 1 };
    }
    if (sql.includes("INTO settings")) {
      this.settings.set(String(values[0]), JSON.parse(String(values[1])));
      return { changes: 1 };
    }
    if (sql.includes("UPDATE linode_accounts") && sql.includes("encrypted_token")) {
      const account = this.accounts.find((item) => item.id === Number(values[6]));
      if (account) {
        account.encrypted_token = String(values[0]);
        account.token_fingerprint = String(values[1]);
        account.token_status = String(values[2]);
        account.last_seen_login_id = values[3] as string | null;
        account.last_login_check_at = values[4] as string | null;
        account.security_baseline_at = values[5] as string | null;
      }
      return { changes: account ? 1 : 0 };
    }
    if (sql.includes("UPDATE linode_accounts") && sql.includes("last_seen_login_id")) {
      const account = this.accounts.find((item) => item.id === Number(values[2]));
      if (account) {
        account.last_seen_login_id = values[0] as string | null;
        account.last_login_check_at = values[1] as string;
      }
      return {};
    }
    if (sql.includes("UPDATE security_events") && sql.includes("type IN ('LOGIN_SUCCESS', 'LOGIN_FAILED')")) {
      const cutoff = String(values[2]);
      let changes = 0;
      for (const event of this.securityEvents) {
        if (event.status === String(values[1]) && ["LOGIN_SUCCESS", "LOGIN_FAILED"].includes(event.type) && event.occurred_at < cutoff) {
          event.status = String(values[0]);
          event.updated_at = new Date().toISOString();
          changes += 1;
        }
      }
      return { changes };
    }
    if (sql.includes("UPDATE security_events") && sql.includes("status = ?")) {
      const event = this.securityEvents.find((item) => item.id === Number(values[1]));
      if (event) {
        event.status = String(values[0]);
        event.updated_at = new Date().toISOString();
      }
      return { changes: event ? 1 : 0 };
    }
    if (sql.includes("INTO audit_logs")) {
      this.auditLogs.push({
        request_id: values[0] as string,
        actor: values[1] as string,
        source: values[2] as string,
        action: values[3] as string,
        target_type: values[4] as string,
        target_id: values[5] as string | null,
        risk_level: values[6] as string,
        result: values[7] as string,
        error_code: values[8] as string | null,
        metadata_json: values[9] as string | null
      });
      return {};
    }
    return {};
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
    headers: { "content-type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "telegram-secret" },
    body: JSON.stringify(update)
  });
}

function callbackUpdate(data: string) {
  return {
    update_id: 50,
    callback_query: {
      id: "cb_security",
      from: { id: 123456789 },
      message: { message_id: 11, chat: { id: 123456789 } },
      data
    }
  };
}

async function addAccount(db: FakeD1Database, input: { id: number; alias: string; token: string; status?: string; lastSeenLoginId?: string | null; lastLoginCheckAt?: string | null; securityBaselineAt?: string | null }) {
  db.accounts.push({
    id: input.id,
    alias: input.alias,
    encrypted_token: await encryptLinodeToken(input.token, "encryption-key"),
    token_fingerprint: `fp_${String(input.id).padStart(12, "0")}`,
    token_status: "valid",
    status: input.status ?? "active",
    last_seen_login_id: input.lastSeenLoginId ?? null,
    last_login_check_at: input.lastLoginCheckAt ?? null,
    security_baseline_at: input.securityBaselineAt ?? input.lastLoginCheckAt ?? null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null
  });
}

function linodeLogins(...rows: Array<{ id: number | string; username: string; ip: string; datetime: string; status: string }>) {
  return { data: rows.map((row) => ({ id: row.id, username: row.username, ip: row.ip, datetime: row.datetime, status: row.status })) };
}

describe("Phase 12 account security event monitor", () => {
  it("skips login history before the account security baseline and only creates events for newer logins", async () => {
    const db = new FakeD1Database();
    await addAccount(db, { id: 1, alias: "default", token: "token-default", lastSeenLoginId: "900", lastLoginCheckAt: "2026-01-01T00:00:00.000Z" });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(linodeLogins(
      { id: 901, username: "alice", ip: "203.0.113.10", datetime: "2026-01-02T00:00:00", status: "successful" },
      { id: 900, username: "baseline", ip: "203.0.113.9", datetime: "2026-01-01T00:00:00", status: "successful" },
      { id: 899, username: "history", ip: "203.0.113.8", datetime: "2025-12-31T00:00:00", status: "successful" }
    )), { status: 200 }));
    try {
      const response = await worker.fetch(apiRequest("/api/v1/security/check", { method: "POST" }), env as never);
      const body = await response.json() as { data: { new_login_events: number; new_security_events: number } };

      expect(response.status).toBe(200);
      expect(body.data).toMatchObject({ new_login_events: 1, new_security_events: 1 });
      expect(db.loginEvents.map((event) => event.linode_login_id)).toEqual(["901"]);
      expect(db.securityEvents.map((event) => event.linode_login_id)).toEqual(["901"]);
      expect(db.accounts[0].last_seen_login_id).toBe("901");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("does not backfill login history when a legacy account has a baseline time but no cursor", async () => {
    const db = new FakeD1Database();
    await addAccount(db, { id: 1, alias: "default", token: "token-default", lastSeenLoginId: null, securityBaselineAt: "2026-01-02T00:00:00.000Z" });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(linodeLogins(
      { id: "old-1", username: "alice", ip: "203.0.113.8", datetime: "2025-12-31T23:59:00.000Z", status: "successful" },
      { id: "baseline", username: "alice", ip: "203.0.113.9", datetime: "2026-01-02T00:00:00.000Z", status: "successful" },
      { id: "new-1", username: "alice", ip: "203.0.113.10", datetime: "2026-01-02T00:01:00.000Z", status: "successful" }
    )), { status: 200 }));
    try {
      const response = await worker.fetch(apiRequest("/api/v1/security/check", { method: "POST" }), env as never);
      const body = await response.json() as { data: { new_login_events: number; new_security_events: number } };

      expect(response.status).toBe(200);
      expect(body.data).toMatchObject({ new_login_events: 1, new_security_events: 1 });
      expect(db.loginEvents.map((event) => event.linode_login_id)).toEqual(["new-1"]);
      expect(db.securityEvents.map((event) => event.linode_login_id)).toEqual(["new-1"]);
      expect(db.accounts[0].last_seen_login_id).toBe("new-1");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("does not treat older logins as new when Linode returns login records oldest-first", async () => {
    const db = new FakeD1Database();
    await addAccount(db, { id: 1, alias: "default", token: "token-default", lastSeenLoginId: "900", lastLoginCheckAt: "2026-01-02T00:00:00.000Z" });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(linodeLogins(
      { id: 899, username: "history", ip: "203.0.113.8", datetime: "2026-01-01T23:59:00.000Z", status: "successful" },
      { id: 900, username: "baseline", ip: "203.0.113.9", datetime: "2026-01-02T00:00:00.000Z", status: "successful" },
      { id: 901, username: "alice", ip: "203.0.113.10", datetime: "2026-01-02T00:01:00.000Z", status: "successful" }
    )), { status: 200 }));
    try {
      const response = await worker.fetch(apiRequest("/api/v1/security/check", { method: "POST" }), env as never);
      const body = await response.json() as { data: { new_login_events: number; new_security_events: number } };

      expect(response.status).toBe(200);
      expect(body.data).toMatchObject({ new_login_events: 1, new_security_events: 1 });
      expect(db.loginEvents.map((event) => event.linode_login_id)).toEqual(["901"]);
      expect(db.securityEvents.map((event) => event.linode_login_id)).toEqual(["901"]);
      expect(db.accounts[0].last_seen_login_id).toBe("901");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("manual security check fetches /account/logins for active accounts, deduplicates login_events, creates LOGIN_SUCCESS/LOGIN_FAILED events, updates cursors, audits, and never returns tokens", async () => {
    const db = new FakeD1Database();
    await addAccount(db, { id: 1, alias: "default", token: "token-default" });
    await addAccount(db, { id: 2, alias: "backup", token: "token-backup" });
    db.loginEvents.push({ id: db.nextLoginEventId++, account_id: 1, linode_login_id: "900", username: "old", ip: "203.0.113.1", datetime: "2026-01-01T00:00:00", status: "successful", raw_json: "{}", created_at: "2026-01-01T00:00:00.000Z" });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const calls: string[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      calls.push(`${String(input)} ${new Headers(init?.headers).get("authorization")}`);
      if (new Headers(init?.headers).get("authorization") === "Bearer token-default") {
        return new Response(JSON.stringify(linodeLogins(
          { id: 900, username: "old", ip: "203.0.113.1", datetime: "2026-01-01T00:00:00", status: "successful" },
          { id: 901, username: "alice", ip: "203.0.113.10", datetime: "2026-01-02T00:00:00", status: "successful" },
          { id: 902, username: "alice", ip: "203.0.113.11", datetime: "2026-01-02T00:05:00", status: "failed" }
        )), { status: 200 });
      }
      return new Response(JSON.stringify(linodeLogins({ id: 1001, username: "bob", ip: "198.51.100.10", datetime: "2026-01-02T01:00:00", status: "successful" })), { status: 200 });
    });
    try {
      const response = await worker.fetch(apiRequest("/api/v1/security/check", { method: "POST" }), env as never);
      const body = await response.json() as { ok: boolean; data: { checked_accounts: number; failed_accounts: number; new_login_events: number; new_security_events: number; result: string; items: Array<{ account_id: number; account_alias: string; result: string; new_login_events: number; new_security_events: number }> } };
      const raw = JSON.stringify(body);

      expect(response.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data).toMatchObject({ checked_accounts: 2, failed_accounts: 0, new_login_events: 3, new_security_events: 3, result: "success" });
      expect(body.data.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ account_id: 1, account_alias: "default", result: "success", new_login_events: 2, new_security_events: 2 }),
        expect.objectContaining({ account_id: 2, account_alias: "backup", result: "success", new_login_events: 1, new_security_events: 1 })
      ]));
      expect(calls).toEqual(expect.arrayContaining([
        "https://api.linode.com/v4/account/logins Bearer token-default",
        "https://api.linode.com/v4/account/logins Bearer token-backup"
      ]));
      expect(db.loginEvents.filter((event) => event.account_id === 1).map((event) => event.linode_login_id)).toEqual(["900", "901", "902"]);
      expect(db.securityEvents.map((event) => event.type)).toEqual(expect.arrayContaining(["LOGIN_SUCCESS", "LOGIN_FAILED"]));
      expect(db.accounts[0].last_seen_login_id).toBe("902");
      expect(db.accounts[1].last_seen_login_id).toBe("1001");
      expect(db.auditLogs).toEqual(expect.arrayContaining([
        expect.objectContaining({ action: "security.check", target_type: "security", risk_level: "medium", result: "success" })
      ]));
      expect(raw).not.toContain("token-default");
      expect(raw).not.toContain("token-backup");
      expect(raw).not.toContain("encrypted_token");
      expect(raw).not.toContain("raw_json");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("records TOKEN_INVALID and TOKEN_PERMISSION_ERROR security check item failures without blocking other accounts and writes partial_failed audit", async () => {
    const db = new FakeD1Database();
    await addAccount(db, { id: 1, alias: "invalid", token: "token-invalid" });
    await addAccount(db, { id: 2, alias: "permission", token: "token-permission" });
    await addAccount(db, { id: 3, alias: "ok", token: "token-ok" });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const auth = new Headers(init?.headers).get("authorization");
      if (auth === "Bearer token-invalid") return new Response(JSON.stringify({ errors: [{ reason: "bad token" }] }), { status: 401 });
      if (auth === "Bearer token-permission") return new Response(JSON.stringify({ errors: [{ reason: "forbidden" }] }), { status: 403 });
      return new Response(JSON.stringify(linodeLogins({ id: 3001, username: "ok", ip: "192.0.2.1", datetime: "2026-01-02T02:00:00", status: "successful" })), { status: 200 });
    });
    try {
      const response = await worker.fetch(apiRequest("/api/v1/security/check", { method: "POST" }), env as never);
      const body = await response.json() as { data: { checked_accounts: number; failed_accounts: number; new_login_events: number; new_security_events: number; result: string; items: Array<{ account_id: number; result: string; error_code?: string }> } };

      expect(response.status).toBe(200);
      expect(body.data).toMatchObject({ checked_accounts: 3, failed_accounts: 2, new_login_events: 1, new_security_events: 3, result: "partial_failed" });
      expect(body.data.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ account_id: 1, result: "failed", error_code: "TOKEN_INVALID" }),
        expect.objectContaining({ account_id: 2, result: "failed", error_code: "TOKEN_PERMISSION_ERROR" }),
        expect.objectContaining({ account_id: 3, result: "success" })
      ]));
      expect(db.securityEvents.map((event) => event.type)).toEqual(expect.arrayContaining(["TOKEN_INVALID", "TOKEN_PERMISSION_ERROR", "LOGIN_SUCCESS"]));
      expect(db.auditLogs).toEqual(expect.arrayContaining([
        expect.objectContaining({ action: "security.check", target_type: "security", risk_level: "medium", result: "partial_failed" })
      ]));
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("applies security settings for IP geo, allowlist, country policy, night login, and token error dedupe", async () => {
    const db = new FakeD1Database();
    await addAccount(db, { id: 1, alias: "geo", token: "token-geo" });
    await addAccount(db, { id: 2, alias: "bad", token: "token-bad" });
    db.settings.set("security_settings", {
      enabled: true,
      ip_geo_enabled: true,
      ip_allowlist: ["198.51.100.10"],
      allowed_countries: ["US"],
      blocked_countries: ["CN"],
      night_login_enabled: true,
      night_start: "00:00",
      night_end: "06:00",
      timezone: "Asia/Shanghai",
      token_error_dedupe_minutes: 1440,
      auto_generate_linode_token_enabled: false,
      auto_generated_token_scopes: "*",
      auto_generated_token_expiry_days: null
    });
    db.securityEvents.push({ id: db.nextSecurityEventId++, account_id: 2, type: "TOKEN_INVALID", severity: "high", status: "open", login_event_id: null, linode_login_id: null, username: null, ip: null, country: null, region: null, city: null, occurred_at: new Date().toISOString(), metadata_json: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const auth = new Headers(init?.headers).get("authorization");
      if (url.includes("ipwho.is/198.51.100.10")) return new Response(JSON.stringify({ success: true, ip: "198.51.100.10", country_code: "US", region: "California", city: "Los Angeles", connection: { asn: 64500, org: "Trusted ISP" } }), { status: 200 });
      if (url.includes("ipwho.is/203.0.113.66")) return new Response(JSON.stringify({ success: true, ip: "203.0.113.66", country_code: "CN", region: "Shanghai", city: "Shanghai", connection: { asn: 64501, org: "Risk ISP" } }), { status: 200 });
      if (auth === "Bearer token-geo") return new Response(JSON.stringify(linodeLogins(
        { id: 101, username: "trusted", ip: "198.51.100.10", datetime: "2026-01-02T00:00:00.000Z", status: "successful" },
        { id: 102, username: "risk", ip: "203.0.113.66", datetime: "2026-01-02T18:30:00.000Z", status: "successful" }
      )), { status: 200 });
      return new Response(JSON.stringify({ errors: [{ reason: "bad token" }] }), { status: 401 });
    });
    try {
      const first = await worker.fetch(apiRequest("/api/v1/security/check", { method: "POST" }), env as never);
      const firstBody = await first.json() as { data: { new_login_events: number; new_security_events: number; items: Array<{ account_id: number; new_security_events: number; message?: string }> } };
      expect(first.status).toBe(200);
      expect(firstBody.data.new_login_events).toBe(2);
      expect(firstBody.data.new_security_events).toBe(1);
      expect(db.securityEvents.find((event) => event.linode_login_id === "102")).toMatchObject({ country: "CN", region: "Shanghai", city: "Shanghai", severity: "high" });
      expect(db.securityEvents.find((event) => event.linode_login_id === "101")).toBeUndefined();

      const second = await worker.fetch(apiRequest("/api/v1/security/check", { method: "POST" }), env as never);
      const secondBody = await second.json() as { data: { items: Array<{ account_id: number; new_security_events: number; message?: string }> } };
      expect(second.status).toBe(200);
      expect(secondBody.data.items.find((item) => item.account_id === 2)).toMatchObject({ new_security_events: 0, message: expect.stringContaining("已去重") });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("updates security settings through API and exposes Telegram settings toggles", async () => {
    const db = new FakeD1Database();
    await addAccount(db, { id: 1, alias: "default", token: "token-default" });
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    const patch = await worker.fetch(apiRequest("/api/v1/security/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ip_allowlist: ["198.51.100.10"], blocked_countries: ["CN"], auto_generate_linode_token_enabled: true }) }), env as never);
    const patchBody = await patch.json() as { data: { settings: { ip_allowlist: string[]; blocked_countries: string[]; auto_generate_linode_token_enabled: boolean } } };
    expect(patch.status).toBe(200);
    expect(patchBody.data.settings).toMatchObject({ ip_allowlist: ["198.51.100.10"], blocked_countries: ["CN"], auto_generate_linode_token_enabled: true });

    const telegram = await worker.fetch(telegramRequest(callbackUpdate("security:settings")), env as never);
    const telegramBody = await telegram.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    const buttons = telegramBody.data.telegram.payload.reply_markup.inline_keyboard.flat();
    expect(telegramBody.data.telegram.payload.text).toContain("🛡 安全设置");
    expect(telegramBody.data.telegram.payload.text).toContain("198.51.100.10");
    expect(buttons).toEqual(expect.arrayContaining([{ text: "停用自动生成 Token", callback_data: "security:settings:auto_token:off" }]));

    const toggle = await worker.fetch(telegramRequest(callbackUpdate("security:settings:auto_token:off")), env as never);
    const toggleBody = await toggle.json() as { data: { telegram: { payload: { text: string } } } };
    expect(toggleBody.data.telegram.payload.text).toContain("自动生成 Linode Token：停用");
  });

  it("auto-generates a replacement Linode token without returning the raw token", async () => {
    const db = new FakeD1Database();
    await addAccount(db, { id: 1, alias: "default", token: "old-token" });
    db.settings.set("security_settings", { auto_generate_linode_token_enabled: true });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const auth = new Headers(init?.headers).get("authorization");
      if (url === "https://api.linode.com/v4/profile/tokens") {
        expect(auth).toBe("Bearer old-token");
        return new Response(JSON.stringify({ id: 88, label: "generated", token: "new-token", scopes: "*", created: "2026-01-02T00:00:00", expiry: null }), { status: 200 });
      }
      if (url === "https://api.linode.com/v4/account/logins" && auth === "Bearer new-token") {
        return new Response(JSON.stringify(linodeLogins({ id: 500, username: "me", ip: "192.0.2.10", datetime: "2026-01-02T00:00:00", status: "successful" })), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    try {
      const response = await worker.fetch(apiRequest("/api/v1/security/accounts/1/generate-token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ label: "generated" }) }), env as never);
      const body = await response.json() as { data: { account_id: number; token_label: string; token_id: number; token_fingerprint: string } };
      const raw = JSON.stringify(body);
      expect(response.status).toBe(200);
      expect(body.data).toMatchObject({ account_id: 1, token_label: "generated", token_id: 88 });
      expect(db.accounts[0].last_seen_login_id).toBe("500");
      expect(db.accounts[0].encrypted_token).not.toContain("new-token");
      expect(raw).not.toContain("new-token");
      expect(raw).not.toContain("old-token");
      expect(db.auditLogs).toEqual(expect.arrayContaining([expect.objectContaining({ action: "account.token.auto_generate", result: "success" })]));
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("lists security events via authenticated HTTP API with limit/offset/status/type/account_id filters without leaking sensitive fields", async () => {
    const db = new FakeD1Database();
    db.securityEvents.push(
      { id: 1, account_id: 1, type: "LOGIN_SUCCESS", severity: "medium", status: "open", login_event_id: 1, linode_login_id: "901", username: "alice", ip: "203.0.113.10", country: null, region: null, city: null, occurred_at: "2026-01-02T00:00:00", metadata_json: JSON.stringify({ token: "plain-token", encrypted_token: "v1:cipher" }), created_at: "2026-01-02T00:00:00.000Z", updated_at: "2026-01-02T00:00:00.000Z" },
      { id: 2, account_id: 1, type: "LOGIN_FAILED", severity: "medium", status: "closed", login_event_id: 2, linode_login_id: "902", username: "alice", ip: "203.0.113.11", country: null, region: null, city: null, occurred_at: "2026-01-02T00:05:00", metadata_json: null, created_at: "2026-01-02T00:05:00.000Z", updated_at: "2026-01-02T00:05:00.000Z" },
      { id: 3, account_id: 2, type: "TOKEN_INVALID", severity: "high", status: "open", login_event_id: null, linode_login_id: null, username: null, ip: null, country: null, region: null, city: null, occurred_at: "2026-01-02T00:10:00", metadata_json: null, created_at: "2026-01-02T00:10:00.000Z", updated_at: "2026-01-02T00:10:00.000Z" }
    );
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    const unauthorized = await worker.fetch(new Request("https://example.com/api/v1/security/events"), env as never);
    expect(unauthorized.status).toBe(401);

    const response = await worker.fetch(apiRequest("/api/v1/security/events?limit=5&offset=0&status=open&type=LOGIN_SUCCESS&account_id=1"), env as never);
    const body = await response.json() as { ok: boolean; data: { security_events: Array<Record<string, unknown>>; limit: number; offset: number } };
    const raw = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.limit).toBe(5);
    expect(body.data.offset).toBe(0);
    expect(body.data.security_events).toHaveLength(1);
    expect(body.data.security_events[0]).toMatchObject({ id: 1, account_id: 1, type: "LOGIN_SUCCESS", status: "open", linode_login_id: "901", username: "alice", ip: "203.0.113.10" });
    expect(raw).not.toContain("plain-token");
    expect(raw).not.toContain("encrypted_token");
    expect(raw).not.toContain("metadata_json");
  });

  it("exposes Telegram account security event menu, event list, and manual check callbacks through Service Layer", async () => {
    const db = new FakeD1Database();
    await addAccount(db, { id: 1, alias: "default", token: "token-default" });
    db.securityEvents.push({ id: 1, account_id: 1, type: "LOGIN_SUCCESS", severity: "medium", status: "open", login_event_id: 1, linode_login_id: "901", username: "alice", ip: "203.0.113.10", country: null, region: null, city: null, occurred_at: "2026-01-02T00:00:00", metadata_json: JSON.stringify({ token: "plain-token" }), created_at: "2026-01-02T00:00:00.000Z", updated_at: "2026-01-02T00:00:00.000Z" });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(linodeLogins({ id: 902, username: "alice", ip: "203.0.113.11", datetime: "2026-01-02T00:05:00", status: "failed" })), { status: 200 }));
    try {
      const menuResponse = await worker.fetch(telegramRequest(callbackUpdate("menu:security")), env as never);
      const menuBody = await menuResponse.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      const menuKeyboard = menuBody.data.telegram.payload.reply_markup.inline_keyboard.flat();
      expect(menuBody.data.telegram.payload.text).toContain("🛡 安全事件");
      expect(menuBody.data.telegram.payload.text).toContain("需要确认：1 条安全事件");
      expect(menuKeyboard).toEqual(expect.arrayContaining([
        { text: "🚨 未确认事件", callback_data: "security:events:open" },
        { text: "📋 最近事件", callback_data: "security:events" },
        { text: "🔄 手动检查", callback_data: "security:check" }
      ]));

      const openEventsResponse = await worker.fetch(telegramRequest(callbackUpdate("security:events:open")), env as never);
      const openEventsBody = await openEventsResponse.json() as { data: { telegram: { payload: { text: string } } } };
      expect(openEventsBody.data.telegram.payload.text).toContain("未确认安全事件");
      expect(openEventsBody.data.telegram.payload.text).toContain("成功登录");
      expect(openEventsBody.data.telegram.payload.text).not.toContain("LOGIN_SUCCESS");

      const eventsResponse = await worker.fetch(telegramRequest(callbackUpdate("security:events")), env as never);
      const eventsBody = await eventsResponse.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      expect(eventsBody.data.telegram.payload.text).toContain("最近安全事件");
      expect(eventsBody.data.telegram.payload.text).toContain("成功登录");
      expect(eventsBody.data.telegram.payload.text).not.toContain("LOGIN_SUCCESS");
      const eventKeyboard = eventsBody.data.telegram.payload.reply_markup.inline_keyboard.flat();
      expect(eventKeyboard).toEqual(expect.arrayContaining([
        { text: "是我", callback_data: "security:confirm:1" },
        { text: "不是我", callback_data: "security:suspicious:1" }
      ]));
      expect(eventKeyboard.map((button) => button.text)).not.toContain("#1 是我");
      expect(eventKeyboard.map((button) => button.text)).not.toContain("#1 不是我");
      expect(JSON.stringify(eventsBody)).not.toContain("plain-token");
      expect(JSON.stringify(eventsBody)).not.toContain("encrypted_token");
      expect(JSON.stringify(eventsBody)).not.toContain("metadata_json");

      const loginDeleteResponse = await worker.fetch(telegramRequest(callbackUpdate("security:login_delete:1")), env as never);
      const loginDeleteBody = await loginDeleteResponse.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      expect(loginDeleteBody.data.telegram.payload.text).toContain("登录确认超时后将执行删机保护");
      expect(loginDeleteBody.data.telegram.payload.text).toContain("不会立即删机");
      expect(loginDeleteBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
        { text: "🛑 一键关机", callback_data: "batch:all:shutdown" },
        { text: "查看安全事件", callback_data: "security:events" }
      ]));

      const checkResponse = await worker.fetch(telegramRequest(callbackUpdate("security:check")), env as never);
      const checkBody = await checkResponse.json() as { data: { telegram: { payload: { text: string } } } };
      const raw = JSON.stringify(checkBody);
      expect(checkBody.data.telegram.payload.text).toContain("安全检查发现新事件");
      expect(checkBody.data.telegram.payload.text).toContain("检查账号：1");
      expect(checkBody.data.telegram.payload.text).toContain("新增登录记录：1");
      expect(checkBody.data.telegram.payload.text).toContain("新增安全事件：1");
      expect(raw).not.toContain("token-default");
      expect(raw).not.toContain("encrypted_token");
      expect(raw).not.toContain("raw_json");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("confirms and marks security events suspicious through API and Telegram callbacks", async () => {
    const db = new FakeD1Database();
    db.securityEvents.push({ id: 1, account_id: 1, type: "LOGIN_SUCCESS", severity: "medium", status: "open", login_event_id: 1, linode_login_id: "901", username: "alice", ip: "203.0.113.10", country: null, region: null, city: null, occurred_at: "2026-01-02T00:00:00", metadata_json: null, created_at: "2026-01-02T00:00:00.000Z", updated_at: "2026-01-02T00:00:00.000Z" });
    db.securityEvents.push({ id: 2, account_id: 1, type: "LOGIN_FAILED", severity: "medium", status: "open", login_event_id: 2, linode_login_id: "902", username: "alice", ip: "203.0.113.11", country: null, region: null, city: null, occurred_at: "2026-01-02T00:05:00", metadata_json: null, created_at: "2026-01-02T00:05:00.000Z", updated_at: "2026-01-02T00:05:00.000Z" });
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    const apiResponse = await worker.fetch(apiRequest("/api/v1/security/events/1/confirm", { method: "POST" }), env as never);
    const apiBody = await apiResponse.json() as { data: { security_event: { status: string } } };
    expect(apiResponse.status).toBe(200);
    expect(apiBody.data.security_event.status).toBe("confirmed");

    const confirmTelegramResponse = await worker.fetch(telegramRequest(callbackUpdate("security:confirm:1")), env as never);
    const confirmTelegramBody = await confirmTelegramResponse.json() as { data: { telegram: { payload: { text: string } } } };
    expect(confirmTelegramBody.data.telegram.payload.text).toContain("✅ 已确认登录 901 是本人操作");

    const telegramResponse = await worker.fetch(telegramRequest(callbackUpdate("security:suspicious:2")), env as never);
    const telegramBody = await telegramResponse.json() as { data: { telegram: { payload: { text: string } } } };
    expect(telegramBody.data.telegram.payload.text).toContain("🚨 已标记登录 902：不是本人操作");
    expect(telegramBody.data.telegram.payload.text).toContain("建议立即处理");
    expect(telegramBody.data.telegram.payload.text).toContain("撤销或重置可疑 Linode Token");
    expect(telegramBody.data.telegram.payload.text).not.toContain("suspicious");
    expect(db.securityEvents.map((event) => event.status)).toEqual(["confirmed", "suspicious"]);
    expect(db.auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "security.event.confirmed", target_id: "1", source: "api" }),
      expect.objectContaining({ action: "security.event.suspicious", target_id: "2", source: "telegram" })
    ]));
  });

  it("documents security APIs and Telegram flow with security settings and no token leakage", async () => {
    const apiDoc = await import("node:fs/promises").then((fs) => fs.readFile("docs/api.md", "utf8"));
    const telegramDoc = await import("node:fs/promises").then((fs) => fs.readFile("docs/telegram.md", "utf8"));

    expect(apiDoc).toContain("GET /api/v1/security/events");
    expect(apiDoc).toContain("POST /api/v1/security/check");
    expect(apiDoc).toContain("LOGIN_SUCCESS");
    expect(apiDoc).toContain("TOKEN_PERMISSION_ERROR");
    expect(apiDoc).toContain("不会返回 token 明文或 encrypted_token");
    expect(telegramDoc).toContain("callback: menu:security");
    expect(telegramDoc).toContain("security:check");
    expect(telegramDoc).toContain("security:events");
    expect(telegramDoc).toContain("IP Geo / ASN");
    expect(telegramDoc).toContain("允许/禁止国家");
    expect(telegramDoc).toContain("夜间登录策略");
    expect(telegramDoc).toContain("自动生成 Linode Token");
    expect(telegramDoc).toContain("当前仍不实现登录确认超时 Job");
    expect(telegramDoc).not.toContain("OAuth");
    expect(telegramDoc).not.toContain("多管理员");
    expect(telegramDoc).not.toContain("Web UI");
  });
});
