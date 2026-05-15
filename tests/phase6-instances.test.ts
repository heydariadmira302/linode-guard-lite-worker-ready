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
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

class FakePreparedStatement {
  constructor(private db: FakeD1Database, private sql: string) {}
  private values: unknown[] = [];
  bind(...values: unknown[]) { this.values = values; return this; }
  first<T = unknown>() { return Promise.resolve(this.db.first<T>(this.sql, this.values)); }
  all<T = unknown>() { return Promise.resolve({ results: this.db.all<T>(this.sql), success: true, meta: {} }); }
  run() { return Promise.resolve({ success: true, meta: {} }); }
}

class FakeD1Database {
  accounts: AccountRecord[] = [];

  prepare(sql: string) { return new FakePreparedStatement(this, sql); }

  first<T>(sql: string, values: unknown[]): T | null {
    if (sql.includes("FROM linode_accounts") && sql.includes("WHERE id = ?")) {
      return (this.accounts.find((account) => account.id === Number(values[0])) as T | undefined) ?? null;
    }
    return null;
  }

  all<T>(sql: string): T[] {
    if (sql.includes("FROM linode_accounts")) {
      return this.accounts.filter((account) => account.status === "active") as T[];
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
    update_id: 20,
    callback_query: {
      id: "cb_1",
      from: { id: 123456789 },
      message: { message_id: 11, chat: { id: 123456789 } },
      data
    }
  };
}

async function addAccount(db: FakeD1Database, input: { id: number; alias: string; token: string; status?: string }) {
  db.accounts.push({
    id: input.id,
    alias: input.alias,
    encrypted_token: await encryptLinodeToken(input.token, "encryption-key"),
    token_fingerprint: `fp_${String(input.id).padStart(12, "0")}`,
    token_status: "valid",
    status: input.status ?? "active",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: input.status === "deleted" ? "2026-01-02T00:00:00.000Z" : null
  });
}

function linodeInstances(labelPrefix: string) {
  return {
    data: [
      { id: 101, label: `${labelPrefix}-web`, status: "running", region: "jp-osa", type: "g6-standard-1", ipv4: ["203.0.113.10"] }
    ],
    page: 1,
    pages: 1,
    results: 1
  };
}

describe("Phase 6 Linode instance read-only management", () => {
  it("lists instances across all active accounts via authenticated HTTP API without leaking tokens", async () => {
    const db = new FakeD1Database();
    await addAccount(db, { id: 1, alias: "default", token: "token-default" });
    await addAccount(db, { id: 2, alias: "backup", token: "token-backup" });
    await addAccount(db, { id: 3, alias: "deleted", token: "token-deleted", status: "deleted" });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      expect(String(input)).toBe("https://api.linode.com/v4/linode/instances");
      const auth = new Headers(init?.headers).get("authorization");
      if (auth === "Bearer token-default") return new Response(JSON.stringify(linodeInstances("default")), { status: 200 });
      if (auth === "Bearer token-backup") return new Response(JSON.stringify(linodeInstances("backup")), { status: 200 });
      throw new Error(`unexpected token ${auth}`);
    });
    try {
      const response = await worker.fetch(apiRequest("/api/v1/instances"), env as never);
      const body = await response.json() as { ok: boolean; data: { accounts: Array<{ account: { id: number; alias: string; encrypted_token?: string; token?: string }; instances: Array<{ id: number; label: string }> }> } };
      const raw = JSON.stringify(body);

      expect(response.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.accounts).toHaveLength(2);
      expect(body.data.accounts.map((item) => item.account.alias)).toEqual(["default", "backup"]);
      expect(body.data.accounts[0].instances[0]).toMatchObject({ id: 101, label: "default-web" });
      expect(raw).not.toContain("token-default");
      expect(raw).not.toContain("token-backup");
      expect(raw).not.toContain("encrypted_token");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("lists and reads instance detail for one account", async () => {
    const db = new FakeD1Database();
    await addAccount(db, { id: 1, alias: "default", token: "token-default" });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).endsWith("/linode/instances/101")) {
        return new Response(JSON.stringify({ id: 101, label: "default-web", status: "running", region: "jp-osa", type: "g6-standard-1", ipv4: ["203.0.113.10"], created: "2026-01-01T00:00:00" }), { status: 200 });
      }
      return new Response(JSON.stringify(linodeInstances("default")), { status: 200 });
    });
    try {
      const listResponse = await worker.fetch(apiRequest("/api/v1/accounts/1/instances"), env as never);
      const listBody = await listResponse.json() as { ok: boolean; data: { account: { id: number; alias: string; encrypted_token?: string }; instances: Array<{ id: number; label: string }> } };
      expect(listResponse.status).toBe(200);
      expect(listBody.data.account).toMatchObject({ id: 1, alias: "default" });
      expect(listBody.data.account.encrypted_token).toBeUndefined();
      expect(listBody.data.instances).toHaveLength(1);

      const detailResponse = await worker.fetch(apiRequest("/api/v1/accounts/1/instances/101"), env as never);
      const detailBody = await detailResponse.json() as { ok: boolean; data: { account: { id: number; alias: string }; instance: { id: number; label: string; ipv4: string[] } } };
      expect(detailResponse.status).toBe(200);
      expect(detailBody.data.account).toMatchObject({ id: 1, alias: "default" });
      expect(detailBody.data.instance).toMatchObject({ id: 101, label: "default-web", ipv4: ["203.0.113.10"] });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("returns unified errors for missing auth, missing account, invalid token, permission errors, and Linode API errors", async () => {
    const db = new FakeD1Database();
    await addAccount(db, { id: 1, alias: "default", token: "token-default" });
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    const unauthorized = await worker.fetch(new Request("https://example.com/api/v1/instances"), env as never);
    const unauthorizedBody = await unauthorized.json() as { error: { code: string } };
    expect(unauthorized.status).toBe(401);
    expect(unauthorizedBody.error.code).toBe("UNAUTHORIZED");

    const missing = await worker.fetch(apiRequest("/api/v1/accounts/999/instances"), env as never);
    const missingBody = await missing.json() as { error: { code: string } };
    expect(missing.status).toBe(404);
    expect(missingBody.error.code).toBe("ACCOUNT_NOT_FOUND");

    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ errors: [{ reason: "invalid" }] }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errors: [{ reason: "forbidden" }] }), { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errors: [{ reason: "oops" }] }), { status: 500 }));
    try {
      const invalid = await worker.fetch(apiRequest("/api/v1/accounts/1/instances"), env as never);
      expect(invalid.status).toBe(401);
      expect(((await invalid.json()) as { error: { code: string } }).error.code).toBe("TOKEN_INVALID");

      const permission = await worker.fetch(apiRequest("/api/v1/accounts/1/instances"), env as never);
      expect(permission.status).toBe(403);
      expect(((await permission.json()) as { error: { code: string } }).error.code).toBe("TOKEN_PERMISSION_ERROR");

      const apiError = await worker.fetch(apiRequest("/api/v1/accounts/1/instances"), env as never);
      expect(apiError.status).toBe(502);
      expect(((await apiError.json()) as { error: { code: string } }).error.code).toBe("LINODE_API_ERROR");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("renders Telegram read-only server management flow without write-operation buttons", async () => {
    const db = new FakeD1Database();
    await addAccount(db, { id: 1, alias: "default", token: "token-default" });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(linodeInstances("default")), { status: 200 }));
    try {
      const menuResponse = await worker.fetch(telegramRequest(callbackUpdate("menu:instances")), env as never);
      const menuBody = await menuResponse.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      expect(menuResponse.status).toBe(200);
      expect(menuBody.data.telegram.payload.text).toContain("服务器管理");
      expect(menuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
        { text: "查看全部服务器", callback_data: "instances:list:all" },
        { text: "选择账号", callback_data: "instances:accounts" }
      ]));

      const listResponse = await worker.fetch(telegramRequest(callbackUpdate("instances:list:all")), env as never);
      const listBody = await listResponse.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      const keyboard = listBody.data.telegram.payload.reply_markup.inline_keyboard.flat();
      const raw = JSON.stringify(listBody);
      expect(listBody.data.telegram.payload.text).toContain("服务器列表");
      expect(listBody.data.telegram.payload.text).toContain("default-web");
      expect(keyboard).toEqual(expect.arrayContaining([{ text: "详情 #101", callback_data: "instances:detail:1:101" }]));
      expect(raw).not.toContain("开机");
      expect(raw).not.toContain("关机");
      expect(raw).not.toContain("重启");
      expect(raw).not.toContain("删除");
    } finally {
      fetchMock.mockRestore();
    }
  });
});
