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
  BATCH_CONCURRENCY: "2",
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
  all<T = unknown>() { return Promise.resolve({ results: this.db.all<T>(this.sql, this.values), success: true, meta: {} }); }
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
  all<T>(sql: string, _values: unknown[] = []): T[] {
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
    headers: { "content-type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "telegram-secret" },
    body: JSON.stringify(update)
  });
}

function callbackUpdate(data: string) {
  return {
    update_id: 40,
    callback_query: {
      id: "cb_batch",
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

function instanceList(...ids: number[]) {
  return { data: ids.map((id) => ({ id, label: `vm-${id}`, status: "running", region: "jp-osa", type: "g6-standard-1" })) };
}

describe("Phase 11 batch operations", () => {
  it("runs single-account batch boot with concurrency limit, continues after failure, returns full item results, and writes medium audit logs", async () => {
    const db = new FakeD1Database();
    await addAccount(db, { id: 1, alias: "default", token: "token-default" });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/linode/instances") && init?.method !== "POST") return new Response(JSON.stringify(instanceList(101, 102, 103)), { status: 200 });
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer token-default");
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      if (url.endsWith("/102/boot")) return new Response(JSON.stringify({ errors: [{ reason: "oops" }] }), { status: 500 });
      return new Response(null, { status: 200 });
    });
    try {
      const response = await worker.fetch(apiRequest("/api/v1/accounts/1/instances/batch/boot", { method: "POST" }), env as never);
      const body = await response.json() as { ok: boolean; data: { action: string; scope: string; total: number; success: number; failed: number; result: string; items: Array<{ account_id: number; account_alias: string; instance_id: number; label: string; result: string; error_code?: string }> } };
      const raw = JSON.stringify(body);

      expect(response.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data).toMatchObject({ action: "boot", scope: "account", total: 3, success: 2, failed: 1, result: "partial_failed" });
      expect(body.data.items).toEqual([
        expect.objectContaining({ account_id: 1, account_alias: "default", instance_id: 101, label: "vm-101", result: "success" }),
        expect.objectContaining({ account_id: 1, account_alias: "default", instance_id: 102, label: "vm-102", result: "failed", error_code: "LINODE_API_ERROR" }),
        expect.objectContaining({ account_id: 1, account_alias: "default", instance_id: 103, label: "vm-103", result: "success" })
      ]);
      expect(maxInFlight).toBeLessThanOrEqual(2);
      expect(db.auditLogs).toEqual(expect.arrayContaining([
        expect.objectContaining({ action: "batch.boot", target_type: "instance", target_id: "101", risk_level: "medium", result: "success" }),
        expect.objectContaining({ action: "batch.boot", target_type: "instance", target_id: "102", risk_level: "medium", result: "failed", error_code: "LINODE_API_ERROR" })
      ]));
      expect(raw).not.toContain("token-default");
      expect(raw).not.toContain("encrypted_token");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("runs all-account batch delete for every instance in scope and writes critical audit logs", async () => {
    const db = new FakeD1Database();
    await addAccount(db, { id: 1, alias: "default", token: "token-default" });
    await addAccount(db, { id: 2, alias: "backup", token: "token-backup" });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const calls: string[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)} ${new Headers(init?.headers).get("authorization")}`);
      if (String(input).endsWith("/linode/instances")) return new Response(JSON.stringify(instanceList(201, 202)), { status: 200 });
      if (String(input).endsWith("/202")) return new Response(JSON.stringify({ errors: [{ reason: "forbidden" }] }), { status: 403 });
      return new Response(null, { status: 200 });
    });
    try {
      const scopedResponse = await worker.fetch(apiRequest("/api/v1/instances/batch/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instance_ids: [201] })
      }), env as never);
      expect(scopedResponse.status).toBe(400);

      const response = await worker.fetch(apiRequest("/api/v1/instances/batch/delete", { method: "POST" }), env as never);
      const body = await response.json() as { data: { action: string; scope: string; total: number; success: number; failed: number; result: string; items: Array<{ account_id: number; instance_id: number; result: string; error_code?: string }> } };
      const raw = JSON.stringify(body);

      expect(response.status).toBe(200);
      expect(body.data).toMatchObject({ action: "delete", scope: "all", total: 4, success: 2, failed: 2, result: "partial_failed" });
      expect(body.data.items.map((item) => `${item.account_id}:${item.instance_id}:${item.result}:${item.error_code ?? ""}`)).toEqual([
        "1:201:success:",
        "1:202:failed:TOKEN_PERMISSION_ERROR",
        "2:201:success:",
        "2:202:failed:TOKEN_PERMISSION_ERROR"
      ]);
      expect(calls).toEqual(expect.arrayContaining([
        "DELETE https://api.linode.com/v4/linode/instances/201 Bearer token-default",
        "DELETE https://api.linode.com/v4/linode/instances/202 Bearer token-backup"
      ]));
      expect(db.auditLogs).toHaveLength(4);
      expect(db.auditLogs).toEqual(expect.arrayContaining([
        expect.objectContaining({ action: "batch.delete", risk_level: "critical", result: "success" }),
        expect.objectContaining({ action: "batch.delete", risk_level: "critical", result: "failed", error_code: "TOKEN_PERMISSION_ERROR" })
      ]));
      expect(raw).not.toContain("token-default");
      expect(raw).not.toContain("token-backup");
      expect(raw).not.toContain("encrypted_token");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("exposes Telegram batch menu, account/all entry callbacks, and renders summary through Service Layer", async () => {
    const db = new FakeD1Database();
    await addAccount(db, { id: 1, alias: "default", token: "token-default" });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).endsWith("/linode/instances")) return new Response(JSON.stringify(instanceList(101, 102)), { status: 200 });
      if (String(input).endsWith("/102/shutdown")) return new Response(JSON.stringify({ errors: [{ reason: "oops" }] }), { status: 500 });
      return new Response(null, { status: 200 });
    });
    try {
      const menuResponse = await worker.fetch(telegramRequest(callbackUpdate("menu:batch")), env as never);
      const menuBody = await menuResponse.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      const menuKeyboard = menuBody.data.telegram.payload.reply_markup.inline_keyboard.flat();
      expect(menuBody.data.telegram.payload.text).toContain("批量操作");
      expect(menuKeyboard).toEqual(expect.arrayContaining([
        { text: "单账号批量开机", callback_data: "batch:accounts:boot" },
        { text: "全部账号批量删除", callback_data: "batch:all:delete" }
      ]));

      const accountsResponse = await worker.fetch(telegramRequest(callbackUpdate("batch:accounts:shutdown")), env as never);
      const accountsBody = await accountsResponse.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      expect(accountsBody.data.telegram.payload.text).toContain("选择账号");
      expect(accountsBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
        { text: "#1 default", callback_data: "batch:account:shutdown:1" }
      ]));

      const runResponse = await worker.fetch(telegramRequest(callbackUpdate("batch:account:shutdown:1")), env as never);
      const runBody = await runResponse.json() as { data: { telegram: { payload: { text: string } } } };
      const raw = JSON.stringify(runBody);
      expect(runBody.data.telegram.payload.text).toContain("批量操作结果");
      expect(runBody.data.telegram.payload.text).toContain("动作：shutdown");
      expect(runBody.data.telegram.payload.text).toContain("总数：2");
      expect(runBody.data.telegram.payload.text).toContain("成功：1");
      expect(runBody.data.telegram.payload.text).toContain("失败：1");
      expect(runBody.data.telegram.payload.text).toContain("#102 vm-102：LINODE_API_ERROR");
      expect(raw).not.toContain("token-default");
      expect(raw).not.toContain("encrypted_token");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("documents batch APIs and Telegram flow without adding confirmations, protected instance, Web UI, or token leakage", async () => {
    const apiDoc = await import("node:fs/promises").then((fs) => fs.readFile("docs/api.md", "utf8"));
    const telegramDoc = await import("node:fs/promises").then((fs) => fs.readFile("docs/telegram.md", "utf8"));

    expect(apiDoc).toContain("POST /api/v1/accounts/:account_id/instances/batch/boot");
    expect(apiDoc).toContain("POST /api/v1/instances/batch/delete");
    expect(apiDoc).toContain("result\": \"partial_failed\"");
    expect(apiDoc).toContain("不会返回 token 明文或 encrypted_token");
    expect(telegramDoc).toContain("callback: menu:batch");
    expect(telegramDoc).toContain("batch:account:delete:<account_id>");
    expect(telegramDoc).toContain("不做二次确认");
    expect(telegramDoc).toContain("不实现 protected instance");
    expect(telegramDoc).not.toContain("Web UI");
  });
});
