import { describe, expect, it, vi } from "vitest";
import worker from "../src/index";

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

type GroupRecord = { id: number; name: string; is_default: number; created_at: string; updated_at: string; deleted_at: string | null };
type AccountRecord = { id: number; alias: string; group_id: number; token_status: string; status: string; encrypted_token?: string; token_fingerprint?: string; security_baseline_at?: string | null; last_seen_login_id?: string | null; last_login_check_at?: string | null; created_at?: string; updated_at?: string; deleted_at?: string | null };

class FakePreparedStatement {
  constructor(private db: FakeD1Database, private sql: string) {}
  private values: unknown[] = [];
  bind(...values: unknown[]) { this.values = values; return this; }
  first<T = unknown>() { return Promise.resolve(this.db.first<T>(this.sql, this.values)); }
  all<T = unknown>() { return Promise.resolve({ results: this.db.all<T>(this.sql), success: true, meta: {} }); }
  run() { const meta = this.db.run(this.sql, this.values); return Promise.resolve({ success: true, meta }); }
}

class FakeD1Database {
  groups: GroupRecord[] = [{ id: 1, name: "未分组", is_default: 1, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", deleted_at: null }];
  accounts: AccountRecord[] = [{ id: 1, alias: "西班牙1", group_id: 2, token_status: "valid", status: "active" }];
  botSessions: Record<string, unknown>[] = [];
  prepare(sql: string) { return new FakePreparedStatement(this, sql); }
  first<T>(sql: string, values: unknown[]): T | null {
    if (sql.includes("FROM groups") && sql.includes("WHERE is_default = 1")) return (this.groups.find((group) => group.is_default === 1 && group.deleted_at === null) as T | undefined) ?? null;
    if (sql.includes("FROM groups") && sql.includes("WHERE id = ?")) return (this.groups.find((group) => group.id === Number(values[0]) && group.deleted_at === null) as T | undefined) ?? null;
    if (sql.includes("FROM groups") && sql.includes("WHERE name = ?") && sql.includes("deleted_at IS NOT NULL")) return (this.groups.filter((group) => group.name === values[0] && group.deleted_at !== null).sort((a, b) => b.id - a.id)[0] as T | undefined) ?? null;
    if (sql.includes("FROM groups") && sql.includes("WHERE name = ?")) return (this.groups.find((group) => group.name === values[0] && group.deleted_at === null) as T | undefined) ?? null;
    if (sql.includes("FROM linode_accounts") && sql.includes("WHERE alias = ?")) return (this.accounts.find((account) => account.alias === values[0] && account.status === "active") as T | undefined) ?? null;
    if (sql.includes("FROM linode_accounts") && sql.includes("WHERE id = ?")) return (this.accounts.find((account) => account.id === Number(values[0]) && account.status === "active") as T | undefined) ?? null;
    if (sql.includes("FROM bot_sessions")) return (this.botSessions.find((session) => session.telegram_user_id === values[0]) as T | undefined) ?? null;
    if (sql.includes("SELECT COUNT(*) AS count FROM linode_accounts")) return ({ count: this.accounts.filter((account) => account.group_id === Number(values[0]) && account.status === "active").length } as T);
    return null;
  }
  all<T>(sql: string): T[] {
    if (sql.includes("FROM groups")) return this.groups.filter((group) => group.deleted_at === null).map((group) => ({ ...group, account_count: this.accounts.filter((account) => account.group_id === group.id && account.status === "active").length })) as T[];
    if (sql.includes("FROM linode_accounts")) return this.accounts.filter((account) => account.status === "active") as T[];
    return [];
  }
  run(sql: string, values: unknown[]) {
    if (sql.includes("INSERT OR IGNORE INTO groups")) return {};
    if (sql.includes("INSERT INTO groups")) {
      const now = new Date().toISOString();
      const group: GroupRecord = { id: this.groups.length + 1, name: values[0] as string, is_default: Number(values[1] ?? 0), created_at: now, updated_at: now, deleted_at: null };
      this.groups.push(group);
      return { last_row_id: group.id };
    }
    if (sql.includes("UPDATE groups") && sql.includes("deleted_at = CURRENT_TIMESTAMP")) {
      const group = this.groups.find((item) => item.id === Number(values[0]));
      if (group) group.deleted_at = new Date().toISOString();
      return {};
    }
    if (sql.includes("UPDATE groups") && sql.includes("deleted_at = NULL")) {
      const group = this.groups.find((item) => item.id === Number(values[0]));
      if (group) group.deleted_at = null;
      return {};
    }
    if (sql.includes("UPDATE groups") && sql.includes("name = ?")) {
      const group = this.groups.find((item) => item.id === Number(values[1]));
      if (group) group.name = values[0] as string;
      return {};
    }
    if (sql.includes("INSERT INTO linode_accounts")) {
      const now = new Date().toISOString();
      const account: AccountRecord = {
        id: this.accounts.length + 1,
        alias: values[0] as string,
        encrypted_token: values[1] as string,
        token_fingerprint: values[2] as string,
        token_status: values[3] as string,
        group_id: Number(values[4] ?? 1),
        security_baseline_at: values[5] as string | null,
        last_seen_login_id: values[6] as string | null,
        last_login_check_at: values[7] as string | null,
        status: "active",
        created_at: now,
        updated_at: now,
        deleted_at: null
      };
      this.accounts.push(account);
      return { last_row_id: account.id };
    }
    if (sql.includes("UPDATE linode_accounts SET group_id")) {
      const account = this.accounts.find((item) => item.id === Number(values[1]));
      if (account) account.group_id = Number(values[0]);
      return {};
    }
    if (sql.includes("INTO bot_sessions")) {
      this.botSessions = this.botSessions.filter((session) => session.telegram_user_id !== values[0]);
      this.botSessions.push({ telegram_user_id: values[0], chat_id: values[1], state: values[2], data_json: values[3], expires_at: values[4] });
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
    headers: { "content-type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "telegram-secret" },
    body: JSON.stringify(update)
  });
}

function messageUpdate(text: string, messageId = 10) {
  return { update_id: messageId, message: { message_id: messageId, chat: { id: 123456789, type: "private" }, from: { id: 123456789, is_bot: false, first_name: "Admin" }, text } };
}

function callbackUpdate(data: string) {
  return { update_id: 20, callback_query: { id: "cb_1", from: { id: 123456789 }, message: { message_id: 11, chat: { id: 123456789 } }, data } };
}

describe("Phase 19 groups", () => {
  it("supports group CRUD and account move through API/service layer", async () => {
    const db = new FakeD1Database();
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    const create = await worker.fetch(apiRequest("/api/v1/groups", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "西班牙" }) }), env as never);
    expect(create.status).toBe(200);
    expect(db.groups.map((group) => group.name)).toContain("西班牙");

    const rename = await worker.fetch(apiRequest("/api/v1/groups/2", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "西班牙主力" }) }), env as never);
    expect(rename.status).toBe(200);
    expect(db.groups[1].name).toBe("西班牙主力");

    const move = await worker.fetch(apiRequest("/api/v1/groups/1/accounts/1", { method: "POST" }), env as never);
    expect(move.status).toBe(200);
    expect(db.accounts[0].group_id).toBe(1);

    const del = await worker.fetch(apiRequest("/api/v1/groups/2", { method: "DELETE" }), env as never);
    expect(del.status).toBe(200);
    expect(db.groups[1].deleted_at).toBeTruthy();

    const recreate = await worker.fetch(apiRequest("/api/v1/groups", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "西班牙主力" }) }), env as never);
    const recreateBody = await recreate.json() as { data: { group: { id: number; name: string; deleted_at: string | null } } };
    expect(recreate.status).toBe(200);
    expect(recreateBody.data.group).toMatchObject({ id: 2, name: "西班牙主力", deleted_at: null });
    expect(db.groups.filter((group) => group.name === "西班牙主力")).toHaveLength(1);
  });

  it("supports Telegram group list, create, rename, delete, and account list flows", async () => {
    const db = new FakeD1Database();
    db.groups.push({ id: 2, name: "西班牙", is_default: 0, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", deleted_at: null });
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    const menu = await worker.fetch(telegramRequest(messageUpdate("📁 分组")), env as never);
    const menuBody = await menu.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(menuBody.data.telegram.payload.text).toContain("未分组");
    expect(menuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([{ text: "新建分组", callback_data: "groups:create" }, { text: "⚡ 批量操作", callback_data: "menu:batch" }]));

    await worker.fetch(telegramRequest(callbackUpdate("groups:create")), env as never);
    const created = await worker.fetch(telegramRequest(messageUpdate("日本备用", 31)), env as never);
    const createdBody = await created.json() as { data: { telegram: { payload: { text: string } } } };
    expect(createdBody.data.telegram.payload.text).toContain("分组已创建");
    expect(db.groups.map((group) => group.name)).toContain("日本备用");

    const detail = await worker.fetch(telegramRequest(callbackUpdate("groups:detail:2")), env as never);
    const detailBody = await detail.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(detailBody.data.telegram.payload.text).toContain("分组详情");
    expect(detailBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "查看本组账号", callback_data: "groups:accounts:2" },
      { text: "查看本组服务器", callback_data: "groups:instances:2" },
      { text: "添加账号到本组", callback_data: "accounts:add:to_group:2" },
      { text: "重命名", callback_data: "groups:rename:2" },
      { text: "删除分组", callback_data: "groups:delete_confirm:2" },
      { text: "本组批量开机", callback_data: "batch:group:boot:2" },
      { text: "本组批量删除", callback_data: "batch:group:delete:2" }
    ]));

    const accounts = await worker.fetch(telegramRequest(callbackUpdate("groups:accounts:2")), env as never);
    const accountsBody = await accounts.json() as { data: { telegram: { payload: { text: string } } } };
    expect(accountsBody.data.telegram.payload.text).toContain("西班牙1");

    const emptyInstances = await worker.fetch(telegramRequest(callbackUpdate("groups:instances:3")), env as never);
    const emptyInstancesBody = await emptyInstances.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(emptyInstancesBody.data.telegram.payload.text).toContain("暂无服务器");
    expect(emptyInstancesBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([{ text: "返回分组详情", callback_data: "groups:detail:3" }, { text: "本组批量删除", callback_data: "batch:group:delete:3" }]));

    await worker.fetch(telegramRequest(callbackUpdate("groups:rename:2")), env as never);
    const renamed = await worker.fetch(telegramRequest(messageUpdate("西班牙主力", 32)), env as never);
    const renamedBody = await renamed.json() as { data: { telegram: { payload: { text: string } } } };
    expect(renamedBody.data.telegram.payload.text).toContain("分组已重命名");
    expect(db.groups[1].name).toBe("西班牙主力");

    db.accounts[0].group_id = 1;
    const deleted = await worker.fetch(telegramRequest(callbackUpdate("groups:delete:2")), env as never);
    const deletedBody = await deleted.json() as { data: { telegram: { payload: { text: string } } } };
    expect(deletedBody.data.telegram.payload.text).toContain("分组已删除");
    expect(db.groups[1].deleted_at).toBeTruthy();
  });

  it("adds regular accounts to the default group without asking for a group", async () => {
    const db = new FakeD1Database();
    db.accounts = [];
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    await worker.fetch(telegramRequest(callbackUpdate("accounts:add")), env as never);
    const alias = await worker.fetch(telegramRequest(messageUpdate("洛杉矶主号", 41)), env as never);
    const body = await alias.json() as { data: { telegram: { payload: { text: string } } } };
    expect(body.data.telegram.payload.text).toContain("分组：未分组");
    expect(body.data.telegram.payload.text).toContain("请发送 Linode API Token");
    expect(db.groups.map((group) => group.name)).toEqual(["未分组"]);
  });

  it("starts account add flow from a group and saves the account into that group", async () => {
    const db = new FakeD1Database();
    db.groups.push({ id: 2, name: "西班牙", is_default: 0, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", deleted_at: null });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).endsWith("/account")) return new Response(JSON.stringify({ email: "admin@example.com" }), { status: 200 });
      if (String(input).endsWith("/linode/instances")) return new Response(JSON.stringify({ data: [] }), { status: 200 });
      if (String(input).endsWith("/account/logins")) return new Response(JSON.stringify({ data: [] }), { status: 200 });
      return new Response(null, { status: 404 });
    });
    try {
      const start = await worker.fetch(telegramRequest(callbackUpdate("accounts:add:to_group:2")), env as never);
      const startBody = await start.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      expect(startBody.data.telegram.payload.text).toContain("加入当前分组");
      expect(startBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
        { text: "取消添加", callback_data: "accounts:add:cancel" },
        { text: "返回分组详情", callback_data: "groups:detail:2" }
      ]));

      const alias = await worker.fetch(telegramRequest(messageUpdate("西班牙2", 51)), env as never);
      const aliasBody = await alias.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      expect(aliasBody.data.telegram.payload.text).toContain("分组：西班牙");
      expect(aliasBody.data.telegram.payload.text).toContain("请发送 Linode API Token");
      expect(aliasBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
        { text: "重新输入昵称", callback_data: "accounts:add:back_alias:2" },
        { text: "取消添加", callback_data: "accounts:add:cancel" },
        { text: "返回分组详情", callback_data: "groups:detail:2" }
      ]));

      const added = await worker.fetch(telegramRequest(messageUpdate("valid-linode-token", 52)), env as never);
      const addedBody = await added.json() as { data: { telegram: Array<{ payload: { reply_markup?: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } }> } };
      const successMessage = addedBody.data.telegram.find((item) => item.payload.reply_markup)?.payload;
      expect(successMessage?.reply_markup?.inline_keyboard.flat()).toEqual(expect.arrayContaining([
        { text: "继续添加到本组", callback_data: "accounts:add:to_group:2" },
        { text: "返回分组详情", callback_data: "groups:detail:2" }
      ]));
      expect(db.accounts.at(-1)).toMatchObject({ alias: "西班牙2", group_id: 2 });
    } finally {
      fetchMock.mockRestore();
    }
  });
});
