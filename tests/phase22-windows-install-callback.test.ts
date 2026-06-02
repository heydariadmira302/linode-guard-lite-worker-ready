import { describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { hashInstallCallbackToken } from "../src/services/windows-install-monitor-service";

const baseEnv = {
  API_AUTH_TOKEN: "secret-api-token",
  TELEGRAM_WEBHOOK_SECRET: "telegram-secret",
  SUPER_ADMIN_TELEGRAM_ID: "123456789",
  TELEGRAM_BOT_TOKEN: "123456:realish-token",
  LINODE_TOKEN_ENCRYPTION_KEY: "encryption-key",
  APP_TIMEZONE: "Asia/Shanghai",
  BATCH_CONCURRENCY: "5",
  OPERATION_LOG_RETENTION_DAYS: "1",
  LOGIN_EVENT_RETENTION_DAYS: "1"
};

class FakePreparedStatement {
  constructor(private db: FakeD1Database, private sql: string) {}
  private values: unknown[] = [];
  bind(...values: unknown[]) { this.values = values; return this; }
  first<T = unknown>() { return Promise.resolve(this.db.first<T>(this.sql, this.values)); }
  all<T = unknown>() { return Promise.resolve({ results: [], success: true, meta: {} }); }
  run() { return Promise.resolve(this.db.run(this.sql, this.values)); }
}

class FakeD1Database {
  windowsInstalls: Record<string, any>[] = [];
  prepare(sql: string) { return new FakePreparedStatement(this, sql); }
  first<T>(sql: string, values: unknown[]): T | null {
    if (sql.includes("FROM windows_installs")) return (this.windowsInstalls.find((row) => row.callback_token_hash === String(values[0]) && (row.status === "installing" || row.status === "failed") && !row.callback_received_at) as T | undefined) ?? null;
    if (sql.includes("UPDATE windows_installs SET status = 'ready'")) {
      const row = this.windowsInstalls.find((item) => Number(item.id) === Number(values[4]));
      if (!row) return null;
      row.status = "ready";
      row.ip_address = values[0] ?? row.ip_address;
      row.callback_received_at = String(values[1]);
      row.updated_at = String(values[2]);
      row.metadata_json = values[3] ?? row.metadata_json;
      return row as T;
    }
    return null;
  }
  run(sql: string, values: unknown[]) {
    if (sql.includes("UPDATE windows_installs SET notified_at")) {
      const row = this.windowsInstalls.find((item) => Number(item.id) === Number(values[2]));
      if (row) row.notified_at = String(values[0]);
    }
    return { success: true, changes: 1, meta: {} };
  }
}

function apiRequest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("Authorization")) headers.set("Authorization", "Bearer secret-api-token");
  return new Request(`https://example.com${path}`, { ...init, headers });
}

describe("Windows install callback notification", () => {
  it("accepts one-time callback token and sends Telegram ready notification", async () => {
    const db = new FakeD1Database();
    const token = "install-callback-token-1234567890";
    db.windowsInstalls.push({ id: 1, account_id: 1, instance_id: 9001, instance_label: "win2025-cn", ip_address: null, status: "installing", callback_token_hash: await hashInstallCallbackToken(token), telegram_chat_id: "123456789", telegram_user_id: "123456789", notified_at: null, callback_received_at: null, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", metadata_json: null });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true, result: { message_id: 100 } }), { status: 200 }));
    try {
      const response = await worker.fetch(new Request("https://example.com/api/v1/windows/install-callback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, ip_address: "203.0.113.25", status: "ready" }) }), env as never);
      const body = await response.json() as { data: { status: string; notified: boolean } };
      expect(response.status).toBe(200);
      expect(body.data.status).toBe("ready");
      expect(body.data.notified).toBe(true);
      expect(db.windowsInstalls[0].notified_at).toBeTruthy();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0][0])).toContain("/sendMessage");
      expect(String(fetchMock.mock.calls[0][1]?.body)).toContain("Windows 安装完成");
      expect(String(fetchMock.mock.calls[0][1]?.body)).not.toContain(token);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("accepts late callback after timeout notification marked the install failed", async () => {
    const db = new FakeD1Database();
    const token = "late-install-callback-token-1234567890";
    db.windowsInstalls.push({ id: 2, account_id: 1, instance_id: 98494238, instance_label: "test2025", ip_address: "172.104.117.244", status: "failed", callback_token_hash: await hashInstallCallbackToken(token), telegram_chat_id: "123456789", telegram_user_id: "123456789", notified_at: "2026-06-02T07:55:52.316Z", callback_received_at: null, created_at: "2026-06-02T07:06:03.062Z", updated_at: "2026-06-02T07:55:52.316Z", metadata_json: JSON.stringify({ reason: "install_callback_timeout" }) });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true, result: { message_id: 101 } }), { status: 200 }));
    try {
      const response = await worker.fetch(new Request("https://example.com/api/v1/windows/install-callback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, ip_address: "172.104.117.244", status: "ready" }) }), env as never);
      const body = await response.json() as { data: { status: string; notified: boolean } };
      expect(response.status).toBe(200);
      expect(body.data.status).toBe("ready");
      expect(db.windowsInstalls[0].status).toBe("ready");
      expect(db.windowsInstalls[0].callback_received_at).toBeTruthy();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0][1]?.body)).toContain("Windows 安装完成");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("rejects reused or invalid callback token", async () => {
    const db = new FakeD1Database();
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const response = await worker.fetch(new Request("https://example.com/api/v1/windows/install-callback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "bad-token-value-that-is-long-enough" }) }), env as never);
    expect(response.status).toBe(401);
  });
});
