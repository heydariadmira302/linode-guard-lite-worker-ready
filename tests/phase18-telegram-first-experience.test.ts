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
  groups = [{ id: 1, name: "未分组", is_default: 1, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", deleted_at: null }];
  botSessions: Record<string, unknown>[] = [];
  settings = new Map<string, string>();
  nextAccountId = 1;

  prepare(sql: string) { return new FakePreparedStatement(this, sql); }

  first<T>(sql: string, values: unknown[]): T | null {
    if (sql.includes("FROM linode_accounts") && sql.includes("WHERE id = ?")) {
      return (this.accounts.find((account) => account.id === Number(values[0])) as T | undefined) ?? null;
    }
    if (sql.includes("FROM linode_accounts") && sql.includes("WHERE alias = ?")) {
      return (this.accounts.find((account) => account.alias === values[0] && account.status === "active") as T | undefined) ?? null;
    }
    if (sql.includes("FROM groups") && sql.includes("WHERE is_default = 1")) {
      return (this.groups.find((group) => group.is_default === 1 && group.deleted_at === null) as T | undefined) ?? null;
    }
    if (sql.includes("FROM groups") && sql.includes("WHERE id = ?")) {
      return (this.groups.find((group) => group.id === Number(values[0]) && group.deleted_at === null) as T | undefined) ?? null;
    }
    if (sql.includes("FROM groups") && sql.includes("WHERE name = ?")) {
      return (this.groups.find((group) => group.name === values[0] && group.deleted_at === null) as T | undefined) ?? null;
    }
    if (sql.includes("FROM bot_sessions")) {
      return (this.botSessions.find((session) => session.telegram_user_id === values[0]) as T | undefined) ?? null;
    }
    if (sql.includes("FROM settings")) {
      const value = this.settings.get(values[0] as string);
      return value ? ({ key: values[0], value_json: value } as T) : null;
    }
    return null;
  }

  all<T>(sql: string): T[] {
    if (sql.includes("FROM groups")) return this.groups.map((group) => ({ ...group, account_count: this.accounts.filter((account) => Number(account.group_id ?? 1) === group.id && account.status === "active").length })) as T[];
    if (sql.includes("FROM linode_accounts")) return this.accounts.filter((account) => account.status === "active") as T[];
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
    if (sql.includes("DELETE FROM bot_sessions")) {
      this.botSessions = this.botSessions.filter((session) => session.telegram_user_id !== values[0]);
      return {};
    }
    if (sql.includes("INTO settings")) {
      this.settings.set(values[0] as string, values[1] as string);
      return {};
    }
    return {};
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

describe("Phase 18 Telegram-first experience", () => {
  it("keeps the fixed Reply Keyboard focused and moves secondary features into More", async () => {
    const db = new FakeD1Database();
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    const start = await worker.fetch(telegramRequest(messageUpdate("🏠 主菜单")), env as never);
    const startBody = await start.json() as { data: { telegram: Array<{ payload: { text: string; reply_markup: { keyboard?: Array<Array<{ text: string }>>; inline_keyboard?: Array<Array<{ text: string; callback_data: string }>> } } }> } };
    expect(startBody.data.telegram[0].payload.text).toContain("主导航");
    expect(startBody.data.telegram[0].payload.reply_markup.keyboard).toEqual([
      [{ text: "🏠 主控菜单" }, { text: "🖥 云机管理" }],
      [{ text: "📅 定时计划" }, { text: "❤️ 打卡保活" }],
      [{ text: "📊 状态总览" }, { text: "🪪 我的ID" }],
      [{ text: "📋 更多功能" }]
    ]);
    expect(startBody.data.telegram[1].payload.text).toContain("常用功能在聊天框下方");
    expect(startBody.data.telegram[1].payload.reply_markup.inline_keyboard?.flat()).toEqual(expect.arrayContaining([
      { text: "👤 账号管理", callback_data: "menu:accounts" },
      { text: "📁 分组管理", callback_data: "menu:groups" },
      { text: "🛡 安全事件", callback_data: "menu:security" },
      { text: "⚡ 批量操作", callback_data: "menu:batch" },
      { text: "📄 审计日志", callback_data: "menu:audit_logs" },
      { text: "🔒 隐私清理", callback_data: "menu:privacy" }
    ]));

    const more = await worker.fetch(telegramRequest(messageUpdate("📋 更多功能")), env as never);
    const moreBody = await more.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(moreBody.data.telegram.payload.text).toContain("更多功能");
    expect(moreBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "⚡ 批量", callback_data: "menu:batch" },
      { text: "📁 分组", callback_data: "menu:groups" },
      { text: "📄 审计", callback_data: "menu:audit_logs" },
      { text: "🔒 隐私", callback_data: "menu:privacy" },
      { text: "⚙️ 设置", callback_data: "menu:settings" }
    ]));

    const servers = await worker.fetch(telegramRequest(messageUpdate("🖥 服务器")), env as never);
    const serversBody = await servers.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(serversBody.data.telegram.payload.text).toContain("🖥 服务器列表");
    expect(serversBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "🔎 筛选", callback_data: "instances:filter" },
      { text: "↩️ 返回服务器管理", callback_data: "menu:instances" }
    ]));

    const checkin = await worker.fetch(telegramRequest(messageUpdate("❤️ 打卡")), env as never);
    const checkinBody = await checkin.json() as { data: { telegram: { payload: { reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(checkinBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "❤️ 查看保活", callback_data: "menu:admin_presence" },
      { text: "⚙️ 高级设置", callback_data: "admin_presence:policies" },
      { text: "🏠 返回主菜单", callback_data: "menu:main" }
    ]));
  });

  it("opens privacy cleanup from More/Settings and configures one-minute deletion", async () => {
    const db = new FakeD1Database();
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    const privacy = await worker.fetch(telegramRequest(callbackUpdate("menu:privacy")), env as never);
    const privacyBody = await privacy.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(privacyBody.data.telegram.payload.text).toContain("隐私清理");
    expect(privacyBody.data.telegram.payload.text).toContain("当前策略：关闭");
    expect(privacyBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "1分钟", callback_data: "privacy:auto_delete:1" },
      { text: "🧹 立即清理一次", callback_data: "privacy:cleanup_now" }
    ]));

    const enabled = await worker.fetch(telegramRequest(callbackUpdate("privacy:auto_delete:1")), env as never);
    const enabledBody = await enabled.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(enabledBody.data.telegram.payload.text).toContain("当前策略：1 分钟后自动删除");
    expect(enabledBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "✅ 1分钟", callback_data: "privacy:auto_delete:1" }
    ]));
    expect(JSON.parse(db.settings.get("app_settings") ?? "{}")).toMatchObject({ telegram_auto_delete_minutes: 1 });

    const settings = await worker.fetch(telegramRequest(messageUpdate("⚙️ 设置", 44)), env as never);
    const settingsBody = await settings.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(settingsBody.data.telegram.payload.text).toContain("发布版只保留必要开关");
    expect(settingsBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "🔒 隐私清理", callback_data: "menu:privacy" }
    ]));

    const cleanup = await worker.fetch(telegramRequest(callbackUpdate("privacy:cleanup_now")), env as never);
    const cleanupBody = await cleanup.json() as { data: { telegram: { payload: { text: string } } } };
    expect(cleanupBody.data.telegram.payload.text).toContain("隐私清理完成");
  });

  it("adds Chinese account aliases, validates token through account/instances/logins, and stores security baseline", async () => {
    const db = new FakeD1Database();
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const calls: string[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      calls.push(String(input));
      if (String(input).endsWith("/account")) return new Response(JSON.stringify({ email: "admin@example.com" }), { status: 200 });
      if (String(input).endsWith("/linode/instances")) return new Response(JSON.stringify({ data: [{ id: 101, label: "web-1" }, { id: 102, label: "web-2" }] }), { status: 200 });
      if (String(input).endsWith("/account/logins")) return new Response(JSON.stringify({ data: [{ id: "login-newest", datetime: "2026-05-15T09:00:00Z" }] }), { status: 200 });
      return new Response(null, { status: 404 });
    });
    try {
      await worker.fetch(telegramRequest(callbackUpdate("accounts:add")), env as never);
      const aliasResponse = await worker.fetch(telegramRequest(messageUpdate("西班牙1", 31)), env as never);
      const aliasBody = await aliasResponse.json() as { data: { telegram: { payload: { text: string } } } };
      expect(aliasBody.data.telegram.payload.text).toContain("分组：未分组");
      const tokenResponse = await worker.fetch(telegramRequest(messageUpdate("valid-linode-token", 32)), env as never);
      const tokenBody = await tokenResponse.json() as { data: { telegram: Array<{ method: string; payload: { text?: string } }> } };
      const raw = JSON.stringify(tokenBody);

      expect(db.accounts[0]).toMatchObject({ alias: "西班牙1", last_seen_login_id: "login-newest" });
      expect(db.accounts[0].group_id).toBe(1);
      expect(db.accounts[0].security_baseline_at).toBeTruthy();
      expect(raw).toContain("服务器数量：2");
      expect(raw).toContain("安全基线：已建立，历史登录不通知");
      expect(raw).not.toContain("valid-linode-token");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("shows IPv4 in server lists/details and provides status-aware Chinese actions", async () => {
    const db = new FakeD1Database();
    await addAccount(db, { id: 1, alias: "西班牙1", token: "token-default" });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).endsWith("/linode/instances/101")) {
        return new Response(JSON.stringify({ id: 101, label: "web-1", status: "offline", region: "es-mad", type: "g6-standard-1", ipv4: ["203.0.113.10", "203.0.113.11"], ipv6: "2001:db8::1/128" }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [{ id: 101, label: "web-1", status: "running", region: "es-mad", type: "g6-standard-1", ipv4: ["203.0.113.10", "203.0.113.11"] }] }), { status: 200 });
    });
    try {
      const list = await worker.fetch(telegramRequest(callbackUpdate("instances:list:all")), env as never);
      const listBody = await list.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<Record<string, unknown>>> } } } } };
      expect(listBody.data.telegram.payload.text).toContain("IPv4：203.0.113.10");
      expect(listBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toContainEqual({ text: "🖥 web-1", callback_data: "instances:detail:1:101:all" });
      expect(listBody.data.telegram.payload.text).not.toContain("2001:db8");

      const detail = await worker.fetch(telegramRequest(callbackUpdate("instances:detail:1:101")), env as never);
      const detailBody = await detail.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<Record<string, unknown>>> } } } } };
      const keyboard = detailBody.data.telegram.payload.reply_markup.inline_keyboard.flat();
      expect(detailBody.data.telegram.payload.text).toContain("IP：`203.0.113.10`");
      expect(detailBody.data.telegram.payload.text).toContain("ID：`101`");
      expect(detailBody.data.telegram.payload.text).not.toContain("配置：");
      expect(detailBody.data.telegram.payload.text).not.toContain("系统：");
      expect(detailBody.data.telegram.payload.text).not.toContain("IPv6");
      expect(keyboard).toEqual(expect.arrayContaining([
        { text: "✅ 开机", callback_data: "instances:boot:1:101:account_1", style: "success" },
        { text: "🚨 危险操作", callback_data: "instances:danger:1:101:account_1", style: "danger" },
        { text: "⬅️ 返回列表", callback_data: "instances:list:account:1" }
      ]));
      expect(JSON.stringify(keyboard)).not.toContain("copy_text");
      expect(keyboard).not.toContainEqual({ text: "删除这台服务器", callback_data: "i:cd:1:101" });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("opens the groups menu from the reply keyboard and lists the default group", async () => {
    const db = new FakeD1Database();
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const response = await worker.fetch(telegramRequest(messageUpdate("📁 分组")), env as never);
    const body = await response.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };

    expect(response.status).toBe(200);
    expect(body.data.telegram.payload.text).toContain("分组");
    expect(body.data.telegram.payload.text).toContain("未分组");
    expect(body.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "查看分组列表", callback_data: "groups:list" },
      { text: "新建分组", callback_data: "groups:create" }
    ]));
  });

  it("opens secondary main menu entries from Chinese text", async () => {
    const db = new FakeD1Database();
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    const schedules = await worker.fetch(telegramRequest(messageUpdate("📅 定时计划", 41)), env as never);
    const schedulesBody = await schedules.json() as { data: { telegram: { payload: { text: string } } } };
    expect(schedulesBody.data.telegram.payload.text).toContain("📅 定时计划");
    expect(schedulesBody.data.telegram.payload.text).toContain("到点后 Bot 会自动执行");
    expect(schedulesBody.data.telegram.payload.text).not.toContain("/help");

    const security = await worker.fetch(telegramRequest(messageUpdate("🛡 安全", 42)), env as never);
    const securityBody = await security.json() as { data: { telegram: { payload: { text: string } } } };
    expect(securityBody.data.telegram.payload.text).toContain("🛡 安全事件");
    expect(securityBody.data.telegram.payload.text).toContain("当前没有未确认安全事件");

    const adminPresence = await worker.fetch(telegramRequest(messageUpdate("❤️ 保活打卡", 43)), env as never);
    const adminPresenceBody = await adminPresence.json() as { data: { telegram: { payload: { text: string } } } };
    expect(adminPresenceBody.data.telegram.payload.text).toContain("❤️ 打卡保活");
    expect(adminPresenceBody.data.telegram.payload.text).toContain("保活状态");

    const settings = await worker.fetch(telegramRequest(messageUpdate("⚙️ 设置", 44)), env as never);
    const settingsBody = await settings.json() as { data: { telegram: { payload: { text: string } } } };
    expect(settingsBody.data.telegram.payload.text).toContain("设置");
    expect(settingsBody.data.telegram.payload.text).toContain("Secrets");
  });
});
