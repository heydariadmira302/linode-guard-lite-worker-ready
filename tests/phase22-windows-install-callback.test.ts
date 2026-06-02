import { describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { hashInstallCallbackToken, WindowsInstallMonitorService } from "../src/services/windows-install-monitor-service";

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
  all<T = unknown>() { return Promise.resolve(this.db.all<T>(this.sql, this.values)); }
  run() { return Promise.resolve(this.db.run(this.sql, this.values)); }
}

class FakeD1Database {
  windowsInstalls: Record<string, any>[] = [];
  prepare(sql: string) { return new FakePreparedStatement(this, sql); }
  all<T>(sql: string, _values: unknown[]) {
    if (sql.includes("status = 'ready'") && sql.includes("rdp_ready_at IS NULL")) return { results: this.windowsInstalls.filter((row) => row.status === "ready" && row.ip_address && !row.rdp_ready_at) as T[], success: true, meta: {} };
    return { results: [] as T[], success: true, meta: {} };
  }
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
    if (sql.includes("UPDATE windows_installs SET rdp_ready_at")) {
      const row = this.windowsInstalls.find((item) => Number(item.id) === Number(values[2]));
      if (!row) return null;
      row.rdp_ready_at = String(values[0]);
      row.updated_at = String(values[1]);
      row.last_rdp_check_error = null;
      return row as T;
    }
    return null;
  }
  run(sql: string, values: unknown[]) {
    if (sql.includes("UPDATE windows_installs SET notified_at")) {
      const row = this.windowsInstalls.find((item) => Number(item.id) === Number(values[2]));
      if (row) row.notified_at = String(values[0]);
    }
    if (sql.includes("UPDATE windows_installs SET rdp_notified_at")) {
      const row = this.windowsInstalls.find((item) => Number(item.id) === Number(values[2]));
      if (row) row.rdp_notified_at = String(values[0]);
    }
    if (sql.includes("UPDATE windows_installs SET rdp_check_attempts")) {
      const row = this.windowsInstalls.find((item) => Number(item.id) === Number(values[2]));
      if (row) { row.rdp_check_attempts = Number(row.rdp_check_attempts ?? 0) + 1; row.last_rdp_check_error = values[0]; }
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
      expect(String(fetchMock.mock.calls[0][1]?.body)).toContain("Windows 已进入系统");
      expect(String(fetchMock.mock.calls[0][1]?.body)).toContain("开始检测 RDP");
      expect(String(fetchMock.mock.calls[0][1]?.body)).not.toContain("Windows 已可远程登录");
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
      expect(String(fetchMock.mock.calls[0][1]?.body)).toContain("Windows 已进入系统");
    } finally {
      fetchMock.mockRestore();
    }
  });


  it("sends final RDP ready notification only after TCP 3389 is reachable", async () => {
    const db = new FakeD1Database();
    db.windowsInstalls.push({ id: 3, account_id: 1, instance_id: 98494238, instance_label: "test2025", ip_address: "172.104.117.244", status: "ready", callback_token_hash: "hash", telegram_chat_id: "123456789", telegram_user_id: "123456789", notified_at: "2026-06-02T07:55:52.316Z", callback_received_at: "2026-06-02T07:55:52.316Z", rdp_ready_at: null, rdp_notified_at: null, rdp_check_attempts: 0, last_rdp_check_error: null, created_at: "2026-06-02T07:06:03.062Z", updated_at: "2026-06-02T07:55:52.316Z", metadata_json: JSON.stringify({ windows_username: "test" }) });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true, result: { message_id: 102 } }), { status: 200 }));
    try {
      const service = new WindowsInstallMonitorService(env as never, undefined, async () => ({ ok: true }));
      const result = await service.checkRdpReadiness(new Date("2026-06-02T07:56:30.000Z"));
      expect(result).toEqual({ checked: 1, ready: 1, notified: 1 });
      expect(db.windowsInstalls[0].rdp_ready_at).toBeTruthy();
      expect(db.windowsInstalls[0].rdp_notified_at).toBeTruthy();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = String(fetchMock.mock.calls[0][1]?.body);
      expect(body).toContain("Windows 已可远程登录");
      expect(body).toContain("172.104.117.244:3389");
      expect(body).toContain("用户名：test");
      expect(body).toContain("耗时");
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
