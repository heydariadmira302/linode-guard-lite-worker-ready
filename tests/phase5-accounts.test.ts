import { describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { decryptLinodeToken, encryptLinodeToken } from "../src/crypto/token-crypto";
import { createTokenFingerprint } from "../src/crypto/fingerprint";

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
  group_id?: number | null;
  encrypted_token: string;
  token_fingerprint: string;
  token_status: string;
  status: string;
  last_seen_login_id?: string | null;
  last_login_check_at?: string | null;
  security_baseline_at?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
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
  auditLogs: AuditRecord[] = [];
  botSessions: Record<string, unknown>[] = [];
  settings = new Map<string, string>();
  groups = [{ id: 1, name: "未分组", is_default: 1, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", deleted_at: null }];
  nextAccountId = 1;

  prepare(sql: string) { return new FakePreparedStatement(this, sql); }

  first<T>(sql: string, values: unknown[]): T | null {
    if (sql.includes("FROM linode_accounts") && sql.includes("WHERE id = ?")) {
      return (this.accounts.find((account) => account.id === Number(values[0])) as T | undefined) ?? null;
    }
    if (sql.includes("FROM linode_accounts") && sql.includes("WHERE alias = ?")) {
      return (this.accounts.find((account) => account.alias === values[0] && account.status === "active") as T | undefined) ?? null;
    }
    if (sql.includes("FROM linode_accounts") && sql.includes("WHERE token_fingerprint = ?")) {
      return (this.accounts.find((account) => account.token_fingerprint === values[0] && account.status === "active") as T | undefined) ?? null;
    }
    if (sql.includes("FROM groups") && sql.includes("WHERE name = ?")) {
      return (this.groups.find((group) => group.name === values[0] && group.deleted_at === null) as T | undefined) ?? null;
    }
    if (sql.includes("FROM groups") && sql.includes("WHERE is_default = 1")) {
      return (this.groups.find((group) => group.is_default === 1 && group.deleted_at === null) as T | undefined) ?? null;
    }
    if (sql.includes("FROM groups") && sql.includes("WHERE id = ?")) {
      return (this.groups.find((group) => group.id === Number(values[0]) && group.deleted_at === null) as T | undefined) ?? null;
    }
    if (sql.includes("SELECT COUNT(*) AS count FROM linode_accounts WHERE group_id = ?")) {
      return ({ count: 0 } as T);
    }
    if (sql.includes("FROM bot_sessions")) {
      return (this.botSessions.find((session) => session.telegram_user_id === values[0]) as T | undefined) ?? null;
    }
    if (sql.includes("FROM settings")) {
      const value = this.settings.get(String(values[0]));
      return value === undefined ? null : ({ value_json: value } as T);
    }
    return null;
  }

  all<T>(sql: string, _values: unknown[] = []): T[] {
    if (sql.includes("FROM groups")) {
      return this.groups.map((group) => ({ ...group, account_count: this.accounts.filter((account) => Number(account.group_id ?? 1) === group.id && (account.status ?? "active") === "active").length })) as T[];
    }
    if (sql.includes("FROM linode_accounts")) {
      return this.accounts.filter((account) => (account.status ?? "active") === "active") as T[];
    }
    return [];
  }

  run(sql: string, values: unknown[]) {
    if (sql.includes("INTO linode_accounts")) {
      const now = new Date().toISOString();
      const account: AccountRecord = {
        id: this.nextAccountId++,
        alias: values[0] as string,
        encrypted_token: values[1] as string,
        token_fingerprint: values[2] as string,
        token_status: values[3] as string,
        group_id: Number(values[4] ?? 1),
        last_seen_login_id: values[5] as string | null,
        last_login_check_at: values[6] as string | null,
        security_baseline_at: values[7] as string | null,
        status: "active",
        created_at: now,
        updated_at: now,
        deleted_at: null
      };
      this.accounts.push(account);
      return { last_row_id: account.id };
    }
    if (sql.includes("UPDATE linode_accounts") && sql.includes("encrypted_token")) {
      const account = this.accounts.find((item) => item.id === Number(values[6]));
      if (account) {
        account.encrypted_token = values[0] as string;
        account.token_fingerprint = values[1] as string;
        account.token_status = values[2] as string;
        account.last_seen_login_id = values[3] as string | null;
        account.last_login_check_at = values[4] as string | null;
        account.security_baseline_at = values[5] as string | null;
        account.updated_at = new Date().toISOString();
      }
      return {};
    }
    if (sql.includes("UPDATE linode_accounts") && sql.includes("SET alias =")) {
      const account = this.accounts.find((item) => item.id === Number(values[1]));
      if (account) {
        account.alias = values[0] as string;
        account.updated_at = new Date().toISOString();
      }
      return {};
    }
    if (sql.includes("UPDATE linode_accounts") && sql.includes("token_status")) {
      const account = this.accounts.find((item) => item.id === Number(values[1]));
      if (account) account.token_status = values[0] as string;
      return {};
    }
    if (sql.includes("UPDATE linode_accounts") && sql.includes("status = 'deleted'")) {
      const account = this.accounts.find((item) => item.id === Number(values[0]));
      if (account) {
        account.status = "deleted";
        account.deleted_at = new Date().toISOString();
      }
      return {};
    }
    if (sql.includes("UPDATE linode_accounts SET group_id")) {
      const account = this.accounts.find((item) => item.id === Number(values[1]));
      if (account) account.group_id = Number(values[0]);
      return {};
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
    if (sql.includes("INTO groups")) {
      const group = { id: this.groups.length + 1, name: values[0] as string, is_default: Number(values[1] ?? 0), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null };
      this.groups.push(group);
      return { last_row_id: group.id };
    }
    if (sql.includes("INTO bot_sessions")) {
      this.botSessions = this.botSessions.filter((session) => session.telegram_user_id !== values[0]);
      this.botSessions.push({ telegram_user_id: values[0], chat_id: values[1], state: values[2], data_json: values[3], expires_at: values[4] });
      return {};
    }
    if (sql.includes("INTO settings")) {
      this.settings.set(String(values[0]), String(values[1]));
      return {};
    }
    if (sql.includes("DELETE FROM bot_sessions")) {
      this.botSessions = this.botSessions.filter((session) => session.telegram_user_id !== values[0]);
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
    headers: {
      "content-type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": "telegram-secret"
    },
    body: JSON.stringify(update)
  });
}

function messageUpdate(text: string, messageId = 10) {
  return {
    update_id: messageId,
    message: {
      message_id: messageId,
      chat: { id: 123456789, type: "private" },
      from: { id: 123456789, is_bot: false, first_name: "Admin" },
      text
    }
  };
}

function callbackUpdate(data: string) {
  return {
    update_id: 20,
    callback_query: {
      id: "cb_1",
      from: { id: 123456789 },
      message: { message_id: 11, chat: { id: 123456789 } },
      data
    }
  };
}

describe("Phase 5 Linode account and token management", () => {
  it("encrypts tokens with AES-GCM using independent IVs and can decrypt them", async () => {
    const first = await encryptLinodeToken("linode-token-secret", "encryption-key");
    const second = await encryptLinodeToken("linode-token-secret", "encryption-key");

    expect(first).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    expect(second).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    expect(first).not.toBe(second);
    expect(first).not.toContain("linode-token-secret");
    await expect(decryptLinodeToken(first, "encryption-key")).resolves.toBe("linode-token-secret");
  });

  it("creates SHA-256 token fingerprints without leaking plaintext", async () => {
    const fingerprint = await createTokenFingerprint("linode-token-secret");

    expect(fingerprint).toMatch(/^fp_[a-f0-9]{12}$/);
    expect(fingerprint).not.toContain("linode-token-secret");
  });

  it("adds, lists, tests, and soft deletes accounts via authenticated HTTP API without returning tokens", async () => {
    const db = new FakeD1Database();
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ username: "admin" }), { status: 200 }));
    try {
      const createResponse = await worker.fetch(apiRequest("/api/v1/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ alias: "default", token: "valid-linode-token" })
      }), env as never);
      const createBody = await createResponse.json() as { ok: boolean; data: { account: { id: number; alias: string; token_fingerprint: string; token_status: string; encrypted_token?: string; token?: string } } };

      expect(createResponse.status).toBe(200);
      expect(createBody.ok).toBe(true);
      expect(createBody.data.account).toMatchObject({ id: 1, alias: "default", token_status: "valid" });
      expect(createBody.data.account.token_fingerprint).toMatch(/^fp_[a-f0-9]{12}$/);
      expect(createBody.data.account.encrypted_token).toBeUndefined();
      expect(createBody.data.account.token).toBeUndefined();
      expect(db.accounts[0].encrypted_token).toMatch(/^v1:/);
      expect(db.accounts[0].encrypted_token).not.toContain("valid-linode-token");
      expect(db.accounts[0].group_id).toBe(1);

      const listResponse = await worker.fetch(apiRequest("/api/v1/accounts"), env as never);
      const listBody = await listResponse.json() as { ok: boolean; data: { accounts: Array<Record<string, unknown>> } };
      const rawList = JSON.stringify(listBody);
      expect(listResponse.status).toBe(200);
      expect(listBody.data.accounts).toHaveLength(1);
      expect(rawList).not.toContain("valid-linode-token");
      expect(rawList).not.toContain("encrypted_token");

      const detailResponse = await worker.fetch(apiRequest("/api/v1/accounts/1"), env as never);
      const detailBody = await detailResponse.json() as { ok: boolean; data: { account: Record<string, unknown> } };
      const rawDetail = JSON.stringify(detailBody);
      expect(detailResponse.status).toBe(200);
      expect(detailBody.data.account).toMatchObject({ id: 1, alias: "default", token_status: "valid", group_id: 1 });
      expect(rawDetail).not.toContain("valid-linode-token");
      expect(rawDetail).not.toContain("encrypted_token");

      db.settings.set("windows_stackscript_id:1", JSON.stringify(2022));
      const updateTokenResponse = await worker.fetch(apiRequest("/api/v1/accounts/1/token", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "new-valid-linode-token" })
      }), env as never);
      const updateTokenBody = await updateTokenResponse.json() as { ok: boolean; data: { account: { id: number; token_status: string; token_fingerprint: string; encrypted_token?: string; token?: string } } };
      const rawUpdateToken = JSON.stringify(updateTokenBody);
      expect(updateTokenResponse.status).toBe(200);
      expect(updateTokenBody.data.account).toMatchObject({ id: 1, token_status: "valid" });
      expect(updateTokenBody.data.account.token_fingerprint).toMatch(/^fp_[a-f0-9]{12}$/);
      expect(rawUpdateToken).not.toContain("new-valid-linode-token");
      expect(rawUpdateToken).not.toContain("encrypted_token");
      expect(db.accounts[0].encrypted_token).not.toContain("new-valid-linode-token");
      expect(db.settings.get("windows_stackscript_id:1")).toBe("null");
      expect(db.auditLogs.find((log) => log.action === "account.token.update")?.metadata_json).toContain("windows_stackscript_reset");

      const testResponse = await worker.fetch(apiRequest("/api/v1/accounts/1/test", { method: "POST" }), env as never);
      const testBody = await testResponse.json() as { ok: boolean; data: { account: { id: number; token_status: string } } };
      expect(testResponse.status).toBe(200);
      expect(testBody.data.account).toMatchObject({ id: 1, token_status: "valid" });

      const deleteResponse = await worker.fetch(apiRequest("/api/v1/accounts/1", { method: "DELETE" }), env as never);
      const deleteBody = await deleteResponse.json() as { ok: boolean; data: { deleted: boolean } };
      expect(deleteResponse.status).toBe(200);
      expect(deleteBody.data.deleted).toBe(true);
      expect(db.accounts[0].status).toBe("deleted");
      expect(db.auditLogs.map((log) => log.action)).toEqual(expect.arrayContaining(["account.create", "account.token.update", "account.test", "account.delete"]));
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("creates accounts into a selected group through the HTTP API and lists them", async () => {
    const db = new FakeD1Database();
    db.groups.push({ id: 2, name: "西班牙", is_default: 0, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", deleted_at: null });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ username: "admin" }), { status: 200 }));
    try {
      const createResponse = await worker.fetch(apiRequest("/api/v1/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ alias: "spain", token: "valid-linode-token", group_id: 2 })
      }), env as never);
      const createBody = await createResponse.json() as { ok: boolean; data: { account: Record<string, unknown> } };
      expect(createResponse.status).toBe(200);
      expect(createBody.data.account).toMatchObject({ alias: "spain", group_id: 2, group_name: "西班牙" });
      expect(db.accounts[0].group_id).toBe(2);

      const listResponse = await worker.fetch(apiRequest("/api/v1/accounts"), env as never);
      const listBody = await listResponse.json() as { ok: boolean; data: { accounts: Array<Record<string, unknown>> } };
      expect(listBody.data.accounts).toEqual(expect.arrayContaining([
        expect.objectContaining({ alias: "spain", group_id: 2, group_name: "西班牙" })
      ]));
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("renames accounts through the HTTP API and blocks duplicate aliases", async () => {
    const db = new FakeD1Database();
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ username: "admin" }), { status: 200 }));
    try {
      await worker.fetch(apiRequest("/api/v1/accounts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ alias: "alpha", token: "valid-linode-token" }) }), env as never);
      await worker.fetch(apiRequest("/api/v1/accounts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ alias: "beta", token: "valid-linode-token-2" }) }), env as never);
      const renameResponse = await worker.fetch(apiRequest("/api/v1/accounts/1/name", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ alias: "主号" }) }), env as never);
      const renameBody = await renameResponse.json() as { ok: boolean; data: { account: Record<string, unknown> } };
      expect(renameResponse.status).toBe(200);
      expect(renameBody.data.account).toMatchObject({ alias: "主号" });
      expect(db.accounts[0].alias).toBe("主号");

      const duplicate = await worker.fetch(apiRequest("/api/v1/accounts/1/name", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ alias: " beta " }) }), env as never);
      const duplicateBody = await duplicate.json() as { ok: boolean; error: { code: string; message: string } };
      expect(duplicate.status).toBe(400);
      expect(duplicateBody.error.code).toBe("VALIDATION_ERROR");
      expect(duplicateBody.error.message).toContain("账号昵称已存在");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("returns unified errors for missing auth, duplicate alias, and invalid Linode token", async () => {
    const db = new FakeD1Database();
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ username: "admin" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errors: [{ reason: "Invalid Token" }] }), { status: 401 }));
    try {
      const unauthorized = await worker.fetch(new Request("https://example.com/api/v1/accounts"), env as never);
      const unauthorizedBody = await unauthorized.json() as { ok: boolean; error: { code: string } };
      expect(unauthorized.status).toBe(401);
      expect(unauthorizedBody.error.code).toBe("UNAUTHORIZED");

      await worker.fetch(apiRequest("/api/v1/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ alias: "default", token: "valid-linode-token" })
      }), env as never);
      const duplicate = await worker.fetch(apiRequest("/api/v1/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ alias: "default", token: "another-token" })
      }), env as never);
      const duplicateBody = await duplicate.json() as { ok: boolean; error: { code: string } };
      expect(duplicate.status).toBe(400);
      expect(duplicateBody.error.code).toBe("VALIDATION_ERROR");

      const invalid = await worker.fetch(apiRequest("/api/v1/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ alias: "backup", token: "bad-token" })
      }), env as never);
      const invalidBody = await invalid.json() as { ok: boolean; error: { code: string } };
      expect(invalid.status).toBe(401);
      expect(invalidBody.error.code).toBe("TOKEN_INVALID");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("renders Telegram accounts menu and account list", async () => {
    const db = new FakeD1Database();
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    db.accounts.push({ id: 1, alias: "default", encrypted_token: "v1:encrypted", token_fingerprint: "fp_123456789abc", token_status: "valid", status: "active", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", deleted_at: null });
    db.accounts.push({ id: 2, alias: "legacy", group_id: 1, encrypted_token: "v1:legacy", token_fingerprint: "fp_abcdef123456", token_status: "valid", status: null as unknown as string, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", deleted_at: null });

    const response = await worker.fetch(telegramRequest(callbackUpdate("menu:accounts")), env as never);
    const body = await response.json() as { data: { telegram: { method: string; payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };

    expect(response.status).toBe(200);
    expect(body.data.telegram.method).toBe("editMessageText");
    expect(body.data.telegram.payload.text).toContain("账号管理");
    expect(body.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "📋 查看账号列表", callback_data: "accounts:list" },
      { text: "➕ 添加账号", callback_data: "accounts:add" },
      { text: "📁 分组管理", callback_data: "menu:groups" }
    ]));

    const listResponse = await worker.fetch(telegramRequest(callbackUpdate("accounts:list")), env as never);
    const listBody = await listResponse.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(listBody.data.telegram.payload.text).toContain("账号列表");
    expect(listBody.data.telegram.payload.text).toContain("#1 default");
    expect(listBody.data.telegram.payload.text).toContain("#2 legacy");
    expect(listBody.data.telegram.payload.text).toContain("分组：未分组");
    expect(listBody.data.telegram.payload.text).toContain("Token：可用");
    expect(listBody.data.telegram.payload.text).not.toContain("fp_123456789abc");
    expect(listBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toContainEqual({ text: "👤 default", callback_data: "accounts:detail:1" });
    expect(JSON.stringify(listBody)).not.toContain("v1:encrypted");
  });

  it("supports Telegram account detail, token test, move group, and delete confirmation", async () => {
    const db = new FakeD1Database();
    db.groups.push({ id: 2, name: "西班牙", is_default: 0, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", deleted_at: null });
    db.accounts.push({ id: 1, alias: "default", group_id: 1, encrypted_token: await encryptLinodeToken("valid-linode-token", "encryption-key"), token_fingerprint: "fp_123456789abc", token_status: "valid", status: "active", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", deleted_at: null });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ username: "admin" }), { status: 200 }));
    try {
      const detail = await worker.fetch(telegramRequest(callbackUpdate("accounts:detail:1")), env as never);
      const detailBody = await detail.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      expect(detailBody.data.telegram.payload.text).toContain("账号详情");
      expect(detailBody.data.telegram.payload.text).toContain("Token：可用");
      expect(detailBody.data.telegram.payload.text).toContain("常用操作：查看服务器、改名、更新 Token、移动分组。");
      expect(detailBody.data.telegram.payload.text).not.toContain("fp_123456789abc");
      expect(detailBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
        { text: "🖥 查看该账号服务器", callback_data: "instances:list:account:1" },
        { text: "✏️ 修改账号名", callback_data: "accounts:rename:1" },
        { text: "🔍 测试 Token", callback_data: "accounts:test:1" },
        { text: "🔑 更新 Token", callback_data: "accounts:update_token:1" },
        { text: "📁 移动分组", callback_data: "accounts:move_group:1" },
        { text: "🚨 从 Bot 删除账号", callback_data: "accounts:delete_confirm:1" }
      ]));
      expect(JSON.stringify(detailBody)).not.toContain("valid-linode-token");
      expect(JSON.stringify(detailBody)).not.toContain("encrypted_token");

      const tested = await worker.fetch(telegramRequest(callbackUpdate("accounts:test:1")), env as never);
      const testedBody = await tested.json() as { data: { telegram: { payload: { text: string } } } };
      expect(testedBody.data.telegram.payload.text).toContain("Token 测试完成");
      expect(testedBody.data.telegram.payload.text).toContain("Token 状态：可用");

      const moveMenu = await worker.fetch(telegramRequest(callbackUpdate("accounts:move_group:1")), env as never);
      const moveMenuBody = await moveMenu.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      expect(moveMenuBody.data.telegram.payload.text).toContain("移动账号分组");
      expect(moveMenuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toContainEqual({ text: "西班牙", callback_data: "accounts:move_group_to:1:2" });

      const moved = await worker.fetch(telegramRequest(callbackUpdate("accounts:move_group_to:1:2")), env as never);
      const movedBody = await moved.json() as { data: { telegram: { payload: { text: string } } } };
      expect(movedBody.data.telegram.payload.text).toContain("账号分组已更新");
      expect(movedBody.data.telegram.payload.text).toContain("分组：西班牙");
      expect(db.accounts[0].group_id).toBe(2);

      const confirm = await worker.fetch(telegramRequest(callbackUpdate("accounts:delete_confirm:1")), env as never);
      const confirmBody = await confirm.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      expect(confirmBody.data.telegram.payload.text).toContain("确认从 Bot 删除账号");
      expect(confirmBody.data.telegram.payload.text).toContain("不会删除 Linode 服务器");
      expect(confirmBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toContainEqual({ text: "🚨 确认从 Bot 删除账号", callback_data: "accounts:delete:1" });

      const deleted = await worker.fetch(telegramRequest(callbackUpdate("accounts:delete:1")), env as never);
      const deletedBody = await deleted.json() as { data: { telegram: { payload: { text: string } } } };
      expect(deletedBody.data.telegram.payload.text).toContain("账号已删除");
      expect(db.accounts[0].status).toBe("deleted");
      expect(db.auditLogs.map((log) => log.action)).toEqual(expect.arrayContaining(["account.test", "group.account.move", "account.delete"]));
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("updates account token through Telegram without echoing the new token", async () => {
    const db = new FakeD1Database();
    db.accounts.push({ id: 1, alias: "default", group_id: 1, encrypted_token: await encryptLinodeToken("old-valid-linode-token", "encryption-key"), token_fingerprint: "fp_oldoldold12", token_status: "invalid", status: "active", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", deleted_at: null });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ username: "admin" }), { status: 200 }));
    try {
      const start = await worker.fetch(telegramRequest(callbackUpdate("accounts:update_token:1")), env as never);
      const startBody = await start.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      expect(startBody.data.telegram.payload.text).toContain("更新账号 Token");
      expect(startBody.data.telegram.payload.text).toContain("请发送新的 Linode API Token");
      expect(startBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
        { text: "取消更新", callback_data: "accounts:update_token:cancel:1" },
        { text: "返回账号详情", callback_data: "accounts:detail:1" }
      ]));

      const updated = await worker.fetch(telegramRequest(messageUpdate("new-valid-linode-token", 41)), env as never);
      const updatedBody = await updated.json() as { data: { telegram: Array<{ method: string; payload: { text?: string; message_id?: number } }> } };
      const rawTelegram = JSON.stringify(updatedBody);
      expect(updatedBody.data.telegram).toEqual(expect.arrayContaining([
        expect.objectContaining({ method: "deleteMessage", payload: expect.objectContaining({ message_id: 41 }) }),
        expect.objectContaining({ method: "sendMessage", payload: expect.objectContaining({ text: expect.stringContaining("Token 已更新") }) })
      ]));
      expect(rawTelegram).not.toContain("new-valid-linode-token");
      expect(rawTelegram).not.toContain("encrypted_token");
      expect(db.accounts[0].token_status).toBe("valid");
      expect(db.accounts[0].token_fingerprint).toMatch(/^fp_[a-f0-9]{12}$/);
      expect(db.accounts[0].encrypted_token).not.toContain("new-valid-linode-token");
      expect(db.auditLogs.map((log) => log.action)).toContain("account.token.update");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("runs Telegram add account flow without echoing token and attempts to delete token message", async () => {
    const db = new FakeD1Database();
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ username: "admin" }), { status: 200 }));
    try {
      const startResponse = await worker.fetch(telegramRequest(callbackUpdate("accounts:add")), env as never);
      const startBody = await startResponse.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      expect(startBody.data.telegram.payload.text).toContain("请输入账号昵称");
      expect(startBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
        { text: "取消添加", callback_data: "accounts:add:cancel" },
        { text: "返回账号管理", callback_data: "menu:accounts" }
      ]));

      const aliasResponse = await worker.fetch(telegramRequest(messageUpdate("default", 31)), env as never);
      const aliasBody = await aliasResponse.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      expect(aliasBody.data.telegram.payload.text).toContain("分组：未分组");
      expect(aliasBody.data.telegram.payload.text).toContain("请发送 Linode API Token");
      expect(aliasBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
        { text: "重新输入昵称", callback_data: "accounts:add:back_alias" },
        { text: "取消添加", callback_data: "accounts:add:cancel" },
        { text: "返回账号管理", callback_data: "menu:accounts" }
      ]));

      const tokenResponse = await worker.fetch(telegramRequest(messageUpdate("valid-linode-token", 32)), env as never);
      const tokenBody = await tokenResponse.json() as { data: { telegram: Array<{ method: string; payload: { text?: string; message_id?: number } }> } };
      const rawTelegram = JSON.stringify(tokenBody);
      expect(Array.isArray(tokenBody.data.telegram)).toBe(true);
      expect(tokenBody.data.telegram).toEqual(expect.arrayContaining([
        expect.objectContaining({ method: "deleteMessage", payload: expect.objectContaining({ message_id: 32 }) }),
        expect.objectContaining({ method: "sendMessage", payload: expect.objectContaining({
          text: expect.stringContaining("账号添加成功"),
          reply_markup: expect.objectContaining({ inline_keyboard: expect.any(Array) })
        }) })
      ]));
      expect(rawTelegram).not.toContain("valid-linode-token");
      expect(db.accounts).toHaveLength(1);
      expect(db.accounts[0].encrypted_token).not.toContain("valid-linode-token");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("rejects duplicate Linode tokens while keeping the two-step Telegram add flow", async () => {
    const db = new FakeD1Database();
    const token = "same-valid-linode-token";
    db.accounts.push({
      id: 1,
      alias: "西班牙1",
      group_id: 1,
      encrypted_token: await encryptLinodeToken(token, "encryption-key"),
      token_fingerprint: await createTokenFingerprint(token),
      token_status: "valid",
      status: "active",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      deleted_at: null
    });
    db.nextAccountId = 2;
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ username: "admin" }), { status: 200 }));
    try {
      await worker.fetch(telegramRequest(callbackUpdate("accounts:add")), env as never);
      const aliasResponse = await worker.fetch(telegramRequest(messageUpdate("日本备用", 41)), env as never);
      const aliasBody = await aliasResponse.json() as { data: { telegram: { payload: { text: string } } } };
      expect(aliasBody.data.telegram.payload.text).toContain("请发送 Linode API Token");

      const duplicateResponse = await worker.fetch(telegramRequest(messageUpdate(token, 42)), env as never);
      const duplicateBody = await duplicateResponse.json() as { data: { telegram: Array<{ method: string; payload: { text?: string; message_id?: number } }> } };
      const messages = duplicateBody.data.telegram.map((item) => item.payload.text ?? "").join("\n");
      expect(duplicateBody.data.telegram).toEqual(expect.arrayContaining([
        expect.objectContaining({ method: "deleteMessage", payload: expect.objectContaining({ message_id: 42 }) })
      ]));
      expect(messages).toContain("添加账号");
      expect(messages).toContain("这个 Token 已经添加过： #1 西班牙1");
      expect(db.accounts).toHaveLength(1);
    } finally {
      fetchMock.mockRestore();
    }
  });
});
