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
    if (sql.includes("FROM linode_accounts")) return this.accounts.filter((account) => account.status === "active") as T[];
    return [];
  }
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

async function addAccount(db: FakeD1Database, input: { id: number; alias: string; token: string }) {
  db.accounts.push({
    id: input.id,
    alias: input.alias,
    encrypted_token: await encryptLinodeToken(input.token, "encryption-key"),
    token_fingerprint: `fp_${String(input.id).padStart(12, "0")}`,
    token_status: "valid",
    status: "active",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null
  });
}

describe("Phase 7A read-only instance experience and docs", () => {
  it("renders richer Telegram instance detail fields while keeping the flow read-only", async () => {
    const db = new FakeD1Database();
    await addAccount(db, { id: 1, alias: "default", token: "token-default" });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      id: 101,
      label: "web-1",
      status: "running",
      region: "jp-osa",
      type: "g6-standard-1",
      ipv4: ["203.0.113.10", "203.0.113.11"],
      ipv6: "2001:db8::1/128",
      image: "linode/ubuntu24.04",
      created: "2026-01-01T00:00:00",
      updated: "2026-01-02T00:00:00",
      tags: ["prod", "web"],
      specs: { vcpus: 1, memory: 2048, disk: 51200, transfer: 2000 }
    }), { status: 200 }));
    try {
      const response = await worker.fetch(telegramRequest(callbackUpdate("instances:detail:1:101")), env as never);
      const body = await response.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      const raw = JSON.stringify(body);

      expect(response.status).toBe(200);
      expect(body.data.telegram.payload.text).toContain("服务器详情");
      expect(body.data.telegram.payload.text).toContain("分组：未分组");
      expect(body.data.telegram.payload.text).toContain("更新时间：2026-01-02T00:00:00");
      expect(body.data.telegram.payload.text).toContain("标签：prod, web");
      expect(body.data.telegram.payload.text).toContain("CPU：1 vCPU");
      expect(body.data.telegram.payload.text).toContain("内存：2048 MB");
      expect(body.data.telegram.payload.text).toContain("磁盘：51200 MB");
      expect(body.data.telegram.payload.text).toContain("流量：2000 GB");
      expect(body.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
        { text: "返回账号服务器", callback_data: "instances:list:account:1" },
        { text: "返回分组服务器", callback_data: "instances:list:group:1" },
        { text: "返回服务器管理", callback_data: "menu:instances" }
      ]));
      expect(raw).not.toContain("batch");
      expect(raw).not.toContain("批量");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("maps Telegram instance callback errors to friendly read-only messages", async () => {
    const db = new FakeD1Database();
    await addAccount(db, { id: 1, alias: "default", token: "token-default" });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ errors: [{ reason: "invalid" }] }), { status: 401 }));
    try {
      const response = await worker.fetch(telegramRequest(callbackUpdate("instances:list:account:1")), env as never);
      const body = await response.json() as { ok: boolean; data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      const keyboard = body.data.telegram.payload.reply_markup.inline_keyboard.flat();

      expect(response.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.telegram.payload.text).toContain("Linode Token 无效，请检查后重新添加。");
      expect(body.data.telegram.payload.text).toContain("操作失败");
      expect(keyboard).toEqual(expect.arrayContaining([{ text: "❤️ 打卡", callback_data: "admin_presence:checkin" }]));
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("documents Phase 6 read-only API and Telegram flow for Phase 7A", async () => {
    const apiDoc = await import("node:fs/promises").then((fs) => fs.readFile("docs/api.md", "utf8"));
    const telegramDoc = await import("node:fs/promises").then((fs) => fs.readFile("docs/telegram.md", "utf8"));

    expect(apiDoc).toContain("GET /api/v1/instances");
    expect(apiDoc).toContain("GET /api/v1/accounts/:account_id/instances");
    expect(apiDoc).toContain("GET /api/v1/accounts/:account_id/instances/:instance_id");
    expect(apiDoc).toContain("Authorization: Bearer <API_AUTH_TOKEN>");
    expect(apiDoc).toContain("不会返回 token 明文或 encrypted_token");
    expect(apiDoc).not.toContain("POST /api/v1/accounts/:account_id/instances/:instance_id/boot");

    expect(telegramDoc).toContain("服务器管理");
    expect(telegramDoc).toContain("查看全部服务器");
    expect(telegramDoc).toContain("选择账号");
    expect(telegramDoc).toContain("实例详情");
    expect(telegramDoc).toContain("只读");
    expect(telegramDoc).toContain("批量操作");
    expect(telegramDoc).toContain("batch:account:delete:<account_id>");
    expect(telegramDoc).toContain("安全事件");
    expect(telegramDoc).toContain("security:check");
    expect(telegramDoc).toContain("定时任务");
    expect(telegramDoc).toContain("schedules:list");
    expect(telegramDoc).not.toContain("多管理员入口");
  });
});
