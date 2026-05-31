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
  all<T = unknown>() { return Promise.resolve({ results: this.db.all<T>(this.sql), success: true, meta: {} }); }
  run() { const meta = this.db.run(this.sql, this.values); return Promise.resolve({ success: true, meta }); }
}

class FakeD1Database {
  accounts: AccountRecord[] = [];
  auditLogs: AuditRecord[] = [];
  prepare(sql: string) { return new FakePreparedStatement(this, sql); }
  first<T>(sql: string, values: unknown[]): T | null {
    if (sql.includes("FROM linode_accounts") && sql.includes("WHERE id = ?")) {
      return (this.accounts.find((account) => account.id === Number(values[0])) as T | undefined) ?? null;
    }
    return null;
  }
  all<T>(sql: string): T[] {
    if (sql.includes("FROM linode_accounts")) return this.accounts.filter((account) => account.status === "active") as T[];
    return [];
  }
  run(sql: string, values: unknown[]) {
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

describe("Phase 7C single instance shutdown", () => {
  it("shuts down one instance via authenticated HTTP API, calls Linode POST shutdown, and writes audit log", async () => {
    const db = new FakeD1Database();
    await addAccount(db, { id: 1, alias: "default", token: "token-default" });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      expect(String(input)).toBe("https://api.linode.com/v4/linode/instances/101/shutdown");
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer token-default");
      return new Response(null, { status: 200 });
    });
    try {
      const response = await worker.fetch(apiRequest("/api/v1/accounts/1/instances/101/shutdown", { method: "POST" }), env as never);
      const body = await response.json() as { ok: boolean; data: { action: string; account: { id: number; alias: string; encrypted_token?: string; token?: string }; instance_id: number; result: string } };
      const raw = JSON.stringify(body);

      expect(response.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data).toMatchObject({ action: "shutdown", instance_id: 101, result: "success" });
      expect(body.data.account).toMatchObject({ id: 1, alias: "default" });
      expect(raw).not.toContain("token-default");
      expect(raw).not.toContain("encrypted_token");
      expect(db.auditLogs).toEqual(expect.arrayContaining([
        expect.objectContaining({ action: "instance.shutdown", target_type: "instance", target_id: "101", risk_level: "medium", result: "success" })
      ]));
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("returns unified errors and failed audit log for shutdown failures", async () => {
    const db = new FakeD1Database();
    await addAccount(db, { id: 1, alias: "default", token: "token-default" });
    await addAccount(db, { id: 2, alias: "deleted", token: "token-deleted", status: "deleted" });
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    const unauthorized = await worker.fetch(new Request("https://example.com/api/v1/accounts/1/instances/101/shutdown", { method: "POST" }), env as never);
    expect(unauthorized.status).toBe(401);
    expect(((await unauthorized.json()) as { error: { code: string } }).error.code).toBe("UNAUTHORIZED");

    const missing = await worker.fetch(apiRequest("/api/v1/accounts/2/instances/101/shutdown", { method: "POST" }), env as never);
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { error: { code: string } }).error.code).toBe("ACCOUNT_NOT_FOUND");

    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ errors: [{ reason: "invalid" }] }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errors: [{ reason: "forbidden" }] }), { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errors: [{ reason: "oops" }] }), { status: 500 }));
    try {
      const invalid = await worker.fetch(apiRequest("/api/v1/accounts/1/instances/101/shutdown", { method: "POST" }), env as never);
      expect(invalid.status).toBe(401);
      expect(((await invalid.json()) as { error: { code: string } }).error.code).toBe("TOKEN_INVALID");

      const permission = await worker.fetch(apiRequest("/api/v1/accounts/1/instances/101/shutdown", { method: "POST" }), env as never);
      expect(permission.status).toBe(403);
      expect(((await permission.json()) as { error: { code: string } }).error.code).toBe("TOKEN_PERMISSION_ERROR");

      const apiError = await worker.fetch(apiRequest("/api/v1/accounts/1/instances/101/shutdown", { method: "POST" }), env as never);
      expect(apiError.status).toBe(502);
      expect(((await apiError.json()) as { error: { code: string } }).error.code).toBe("LINODE_API_ERROR");

      expect(db.auditLogs).toEqual(expect.arrayContaining([
        expect.objectContaining({ action: "instance.shutdown", result: "failed", error_code: "TOKEN_INVALID" }),
        expect.objectContaining({ action: "instance.shutdown", result: "failed", error_code: "TOKEN_PERMISSION_ERROR" }),
        expect.objectContaining({ action: "instance.shutdown", result: "failed", error_code: "LINODE_API_ERROR" })
      ]));
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("shows a minimal Telegram shutdown button on instance detail and can shut down one instance without adding other write operations", async () => {
    const db = new FakeD1Database();
    await addAccount(db, { id: 1, alias: "default", token: "token-default" });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).endsWith("/linode/instances/101/shutdown")) {
        expect(init?.method).toBe("POST");
        return new Response(null, { status: 200 });
      }
      return new Response(JSON.stringify({ id: 101, label: "web-1", status: "running", region: "jp-osa", type: "g6-standard-1" }), { status: 200 });
    });
    try {
      const detailResponse = await worker.fetch(telegramRequest(callbackUpdate("instances:detail:1:101")), env as never);
      const detailBody = await detailResponse.json() as { data: { telegram: { payload: { reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      const detailKeyboard = detailBody.data.telegram.payload.reply_markup.inline_keyboard.flat();
      const rawDetail = JSON.stringify(detailBody);
      expect(detailKeyboard).toEqual(expect.arrayContaining([{ text: "⚠️ 关机", callback_data: "instances:confirm_shutdown:1:101:account_1", style: "primary" }]));
      expect(detailKeyboard).not.toContainEqual({ text: "✅ 开机", callback_data: "instances:boot:1:101" });
      expect(rawDetail).not.toContain("menu:batch");
      expect(rawDetail).not.toContain("批量操作");

      const confirmResponse = await worker.fetch(telegramRequest(callbackUpdate("instances:confirm_shutdown:1:101:account_1")), env as never);
      const confirmBody = await confirmResponse.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      expect(confirmBody.data.telegram.payload.text).toContain("确认关机服务器");
      expect(confirmBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([{ text: "⚠️ 确认关机", callback_data: "instances:shutdown:1:101:account_1", style: "primary" }]));

      const shutdownResponse = await worker.fetch(telegramRequest(callbackUpdate("instances:shutdown:1:101:account_1")), env as never);
      const shutdownBody = await shutdownResponse.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      const rawShutdown = JSON.stringify(shutdownBody);
      expect(shutdownResponse.status).toBe(200);
      expect(shutdownBody.data.telegram.payload.text).toContain("结果：已成功提交");
      expect(shutdownBody.data.telegram.payload.text).toContain("Linode API 已接受请求");
      expect(shutdownBody.data.telegram.payload.text).toContain("#101");
      expect(rawShutdown).toContain("刷新服务器状态");
      expect(rawShutdown).not.toContain("批量");
    } finally {
      fetchMock.mockRestore();
    }
  });
});
