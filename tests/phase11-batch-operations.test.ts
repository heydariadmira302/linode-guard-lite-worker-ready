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
  group_id?: number | null;
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
  groups = [{ id: 1, name: "未分组", is_default: 1, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", deleted_at: null }];
  auditLogs: AuditRecord[] = [];
  settings = new Map<string, string>([["app_settings", JSON.stringify({ boot_safety_mode: "all_offline" })]]);
  botManagedInstances: Array<{ account_id: number; instance_id: number; label: string | null; last_action: string; last_action_at: string }> = [];
  prepare(sql: string) { return new FakePreparedStatement(this, sql); }
  first<T>(sql: string, values: unknown[]): T | null {
    if (sql.includes("FROM linode_accounts") && sql.includes("WHERE id = ?")) {
      return (this.accounts.find((account) => account.id === Number(values[0])) as T | undefined) ?? null;
    }
    if (sql.includes("FROM groups") && sql.includes("WHERE id = ?")) return (this.groups.find((group) => group.id === Number(values[0]) && group.deleted_at === null) as T | undefined) ?? null;
    if (sql.includes("FROM groups") && sql.includes("WHERE is_default = 1")) return (this.groups.find((group) => group.is_default === 1 && group.deleted_at === null) as T | undefined) ?? null;
    if (sql.includes("FROM settings")) {
      const value = this.settings.get(String(values[0]));
      return value ? ({ value_json: value } as T) : null;
    }
    if (sql.includes("FROM bot_managed_instances") && sql.includes("account_id = ?") && sql.includes("instance_id = ?")) {
      const row = this.botManagedInstances.find((item) => item.account_id === Number(values[0]) && item.instance_id === Number(values[1]));
      return (row as T | undefined) ?? null;
    }
    return null;
  }
  all<T>(sql: string, _values: unknown[] = []): T[] {
    if (sql.includes("FROM linode_accounts")) return this.accounts.filter((account) => account.status === "active") as T[];
    if (sql.includes("FROM groups")) return this.groups.filter((group) => group.deleted_at === null).map((group) => ({ ...group, account_count: this.accounts.filter((account) => Number(account.group_id ?? 1) === group.id && account.status === "active").length })) as T[];
    if (sql.includes("FROM bot_managed_instances")) return this.botManagedInstances.filter((item) => item.last_action === "shutdown") as T[];
    return [];
  }
  run(sql: string, values: unknown[]) {
    if (sql.includes("INTO bot_managed_instances")) {
      const existing = this.botManagedInstances.find((item) => item.account_id === Number(values[0]) && item.instance_id === Number(values[1]));
      if (existing) {
        existing.label = values[2] as string | null;
        existing.last_action = String(values[3]);
        existing.last_action_at = new Date().toISOString();
      } else {
        this.botManagedInstances.push({ account_id: Number(values[0]), instance_id: Number(values[1]), label: values[2] as string | null, last_action: String(values[3]), last_action_at: new Date().toISOString() });
      }
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

async function addAccount(db: FakeD1Database, input: { id: number; alias: string; token: string; status?: string; group_id?: number | null }) {
  db.accounts.push({
    id: input.id,
    alias: input.alias,
    encrypted_token: await encryptLinodeToken(input.token, "encryption-key"),
    token_fingerprint: `fp_${String(input.id).padStart(12, "0")}`,
    token_status: "valid",
    status: input.status ?? "active",
    group_id: input.group_id ?? 1,
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


  it("skips protected instances during batch shutdown and delete", async () => {
    const db = new FakeD1Database();
    db.settings.set("app_settings", JSON.stringify({ boot_safety_mode: "all_offline", protected_instances: [{ instance_id: 201 }, { label: "vm-302" }] }));
    await addAccount(db, { id: 1, alias: "default", token: "token-default" });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const calls: string[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)}`);
      if (String(input).endsWith("/linode/instances")) return new Response(JSON.stringify(instanceList(201, 202, 302)), { status: 200 });
      return new Response(null, { status: 200 });
    });
    try {
      const response = await worker.fetch(apiRequest("/api/v1/accounts/1/instances/batch/delete", { method: "POST" }), env as never);
      const body = await response.json() as { data: { total: number; success: number; failed: number; result: string; items: Array<{ instance_id: number; result: string; message?: string }> } };

      expect(response.status).toBe(200);
      expect(body.data).toMatchObject({ total: 3, success: 1, failed: 0, result: "success" });
      expect(body.data.items).toEqual([
        expect.objectContaining({ instance_id: 201, result: "skipped", message: "已被保护规则跳过" }),
        expect.objectContaining({ instance_id: 202, result: "success" }),
        expect.objectContaining({ instance_id: 302, result: "skipped", message: "已被保护规则跳过" })
      ]);
      expect(calls).toContain("DELETE https://api.linode.com/v4/linode/instances/202");
      expect(calls).not.toContain("DELETE https://api.linode.com/v4/linode/instances/201");
      expect(calls).not.toContain("DELETE https://api.linode.com/v4/linode/instances/302");
      expect(db.auditLogs).toEqual(expect.arrayContaining([
        expect.objectContaining({ action: "batch.delete", target_id: "201", result: "skipped" }),
        expect.objectContaining({ action: "batch.delete", target_id: "202", result: "success" }),
        expect.objectContaining({ action: "batch.delete", target_id: "302", result: "skipped" })
      ]));
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("runs group-scoped batch through API and Telegram via BatchService", async () => {
    const db = new FakeD1Database();
    db.groups.push({ id: 2, name: "西班牙", is_default: 0, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", deleted_at: null });
    await addAccount(db, { id: 1, alias: "西班牙1", token: "token-spain-1", group_id: 2 });
    await addAccount(db, { id: 2, alias: "默认1", token: "token-default", group_id: 1 });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const calls: string[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)} ${new Headers(init?.headers).get("authorization")}`);
      if (String(input).endsWith("/linode/instances")) return new Response(JSON.stringify(instanceList(301)), { status: 200 });
      return new Response(null, { status: 200 });
    });
    try {
      const apiResponse = await worker.fetch(apiRequest("/api/v1/groups/2/instances/batch/boot", { method: "POST" }), env as never);
      const apiBody = await apiResponse.json() as { data: { action: string; scope: string; total: number; success: number; failed: number } };
      expect(apiResponse.status).toBe(200);
      expect(apiBody.data).toMatchObject({ action: "boot", scope: "group", total: 1, success: 1, failed: 0 });
      expect(calls).toEqual(expect.arrayContaining([
        "POST https://api.linode.com/v4/linode/instances/301/boot Bearer token-spain-1"
      ]));
      expect(calls.join("\n")).not.toContain("token-default");

      const detail = await worker.fetch(telegramRequest(callbackUpdate("groups:detail:2")), env as never);
      const detailBody = await detail.json() as { data: { telegram: { payload: { reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      expect(detailBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
        { text: "本组批量开机", callback_data: "batch:group:boot:2" },
        { text: "本组批量删除", callback_data: "batch:group:delete:2" }
      ]));

      const confirm = await worker.fetch(telegramRequest(callbackUpdate("batch:group:delete:2")), env as never);
      const confirmBody = await confirm.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      expect(confirmBody.data.telegram.payload.text).toContain("范围：分组 西班牙");
      expect(confirmBody.data.telegram.payload.text).toContain("批量删除服务器不可恢复");
      expect(confirmBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
        { text: "⚠️ 我知道风险，继续", callback_data: "batch:group:arm_delete:2" },
        { text: "❌ 取消", callback_data: "groups:detail:2" }
      ]));

      const run = await worker.fetch(telegramRequest(callbackUpdate("batch:group:run:shutdown:2")), env as never);
      const runBody = await run.json() as { data: { telegram: { payload: { text: string } } } };
      expect(runBody.data.telegram.payload.text).toContain("批量关机结果");
      expect(runBody.data.telegram.payload.text).toContain("范围：分组");
      expect(JSON.stringify(runBody)).not.toContain("token-spain-1");
      expect(JSON.stringify(runBody)).not.toContain("encrypted_token");
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
        { text: "👤 单账号批量操作", callback_data: "batch:scope:account" },
        { text: "📁 分组批量操作", callback_data: "batch:scope:group" },
        { text: "🌐 全部账号批量操作", callback_data: "batch:scope:all" },
        { text: "🚨 批量删除", callback_data: "batch:delete_menu" },
        { text: "↩️ 返回服务器管理", callback_data: "menu:instances" }
      ]));

      const scopeMenu = await worker.fetch(telegramRequest(callbackUpdate("batch:scope:account")), env as never);
      const scopeMenuBody = await scopeMenu.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      expect(scopeMenuBody.data.telegram.payload.text).toContain("范围：单账号");
      expect(scopeMenuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
        { text: "✅ 批量开机", callback_data: "batch:accounts:boot" },
        { text: "⚠️ 批量关机", callback_data: "batch:accounts:shutdown" }
      ]));

      const deleteMenu = await worker.fetch(telegramRequest(callbackUpdate("batch:delete_menu")), env as never);
      const deleteMenuBody = await deleteMenu.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      expect(deleteMenuBody.data.telegram.payload.text).toContain("批量删除");
      expect(deleteMenuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
        { text: "🚨 删除全部账号服务器", callback_data: "batch:all:delete" }
      ]));

      const accountsResponse = await worker.fetch(telegramRequest(callbackUpdate("batch:accounts:shutdown")), env as never);
      const accountsBody = await accountsResponse.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      expect(accountsBody.data.telegram.payload.text).toContain("请选择要操作的账号");
      expect(accountsBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
        { text: "#1 default", callback_data: "batch:account:shutdown:1" }
      ]));

      const groupsResponse = await worker.fetch(telegramRequest(callbackUpdate("batch:groups:shutdown")), env as never);
      const groupsBody = await groupsResponse.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      expect(groupsBody.data.telegram.payload.text).toContain("⚡ 分组批量操作");
      expect(groupsBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
        { text: "未分组（1 个账号）", callback_data: "batch:group:shutdown:1" }
      ]));

      const confirmResponse = await worker.fetch(telegramRequest(callbackUpdate("batch:account:shutdown:1")), env as never);
      const confirmBody = await confirmResponse.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      expect(confirmBody.data.telegram.payload.text).toContain("批量操作确认");
      expect(confirmBody.data.telegram.payload.text).toContain("动作：关机");
      expect(confirmBody.data.telegram.payload.text).toContain("范围：单账号 #1");
      expect(confirmBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
        { text: "✅ 确认执行", callback_data: "batch:account:run:shutdown:1" },
        { text: "❌ 取消", callback_data: "batch:accounts:shutdown" }
      ]));

      const allDeleteConfirm = await worker.fetch(telegramRequest(callbackUpdate("batch:all:delete")), env as never);
      const allDeleteConfirmBody = await allDeleteConfirm.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      expect(allDeleteConfirmBody.data.telegram.payload.text).toContain("高危操作");
      expect(allDeleteConfirmBody.data.telegram.payload.text).toContain("批量删除服务器不可恢复");
      expect(allDeleteConfirmBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
        { text: "⚠️ 我知道风险，继续", callback_data: "batch:all:arm_delete" },
        { text: "❌ 取消", callback_data: "menu:batch" }
      ]));

      const allDeleteArmed = await worker.fetch(telegramRequest(callbackUpdate("batch:all:arm_delete")), env as never);
      const allDeleteArmedBody = await allDeleteArmed.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      expect(allDeleteArmedBody.data.telegram.payload.text).toContain("最后二次确认");
      expect(allDeleteArmedBody.data.telegram.payload.text).toContain("请直接发送：DELETE");

      const runResponse = await worker.fetch(telegramRequest(callbackUpdate("batch:account:run:shutdown:1")), env as never);
      const runBody = await runResponse.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      const raw = JSON.stringify(runBody);
      expect(runBody.data.telegram.payload.text).toContain("批量关机结果");
      expect(runBody.data.telegram.payload.text).toContain("动作：关机");
      expect(runBody.data.telegram.payload.text).toContain("执行结果：");
      expect(runBody.data.telegram.payload.text).toContain("总数：2");
      expect(runBody.data.telegram.payload.text).toContain("成功：1");
      expect(runBody.data.telegram.payload.text).toContain("失败：1");
      expect(runBody.data.telegram.payload.text).toContain("跳过保护：0");
      expect(runBody.data.telegram.payload.text).toContain("#102 vm-102：Linode API 请求失败，请稍后重试或检查 Token 权限");
      expect(runBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([{ text: "📄 查看审计日志", callback_data: "menu:audit_logs" }]));
      expect(raw).not.toContain("token-default");
      expect(raw).not.toContain("encrypted_token");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("uses bot-managed-only boot safety by default and only boots instances previously shut down by the bot", async () => {
    const db = new FakeD1Database();
    db.settings.set("app_settings", JSON.stringify({ boot_safety_mode: "bot_managed_only" }));
    await addAccount(db, { id: 1, alias: "default", token: "token-default" });
    db.botManagedInstances.push({ account_id: 1, instance_id: 101, label: "vm-101", last_action: "shutdown", last_action_at: "2026-01-01T00:00:00.000Z" });
    db.botManagedInstances.push({ account_id: 1, instance_id: 102, label: "vm-102", last_action: "boot", last_action_at: "2026-01-01T00:00:00.000Z" });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const calls: string[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)}`);
      if (String(input).endsWith("/linode/instances")) return new Response(JSON.stringify(instanceList(101, 102, 103)), { status: 200 });
      return new Response(null, { status: 200 });
    });
    try {
      const response = await worker.fetch(apiRequest("/api/v1/accounts/1/instances/batch/boot", { method: "POST" }), env as never);
      const body = await response.json() as { data: { total: number; success: number; items: Array<{ instance_id: number }> } };
      expect(response.status).toBe(200);
      expect(body.data.total).toBe(1);
      expect(body.data.success).toBe(1);
      expect(body.data.items.map((item) => item.instance_id)).toEqual([101]);
      expect(calls).toEqual(expect.arrayContaining(["POST https://api.linode.com/v4/linode/instances/101/boot"]));
      expect(calls.join("\n")).not.toContain("/102/boot");
      expect(calls.join("\n")).not.toContain("/103/boot");
      expect(db.botManagedInstances.find((item) => item.instance_id === 101)?.last_action).toBe("boot");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("documents batch APIs and Telegram flow with confirmations, protected instance, and no token leakage", async () => {
    const apiDoc = await import("node:fs/promises").then((fs) => fs.readFile("docs/api.md", "utf8"));
    const telegramDoc = await import("node:fs/promises").then((fs) => fs.readFile("docs/telegram.md", "utf8"));

    expect(apiDoc).toContain("POST /api/v1/accounts/:account_id/instances/batch/boot");
    expect(apiDoc).toContain("POST /api/v1/instances/batch/delete");
    expect(apiDoc).toContain("result\": \"partial_failed\"");
    expect(apiDoc).toContain("不会返回 token 明文或 encrypted_token");
    expect(telegramDoc).toContain("callback: menu:batch");
    expect(telegramDoc).toContain("batch:account:delete:<account_id>");
    expect(telegramDoc).toContain("二次确认");
    expect(telegramDoc).toContain("Protected instance 已接入");
    expect(apiDoc).toContain("result=skipped");
    expect(telegramDoc).not.toContain("Web UI");
  });
});
