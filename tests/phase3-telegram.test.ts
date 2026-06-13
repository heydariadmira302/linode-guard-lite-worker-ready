import { describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { BotSessionsRepository } from "../src/storage/bot-sessions-repository";
import { BotSessionService } from "../src/services/bot-session-service";
import { parseTelegramUpdate } from "../src/telegram/update-parser";

const env = {
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

class FakePreparedStatement {
  constructor(private db: FakeD1Database, private sql: string) {}
  private values: unknown[] = [];
  bind(...values: unknown[]) { this.values = values; return this; }
  first<T = unknown>() { return Promise.resolve(this.db.first<T>(this.sql, this.values)); }
  all<T = unknown>() { return Promise.resolve({ results: this.db.all<T>(this.sql, this.values), success: true, meta: {} }); }
  run() { this.db.run(this.sql, this.values); return Promise.resolve({ success: true, meta: {} }); }
}

class FakeD1Database {
  botSessions: Record<string, unknown>[] = [];
  settings = new Map<string, string>();
  prepare(sql: string) { return new FakePreparedStatement(this, sql); }
  first<T>(sql: string, values: unknown[]): T | null {
    if (sql.includes("FROM bot_sessions")) {
      return (this.botSessions.find((session) => session.telegram_user_id === values[0]) as T | undefined) ?? null;
    }
    if (sql.includes("FROM settings")) {
      const value = this.settings.get(values[0] as string);
      return value ? ({ key: values[0], value_json: value } as T) : null;
    }
    return null;
  }
  all<T>(_sql: string, _values: unknown[]): T[] { return []; }
  run(sql: string, values: unknown[]) {
    if (sql.includes("INTO bot_sessions")) {
      this.botSessions.push({ telegram_user_id: values[0], chat_id: values[1], state: values[2], data_json: values[3], expires_at: values[4] });
    }
    if (sql.includes("INTO settings")) {
      this.settings.set(values[0] as string, values[1] as string);
    }
    if (sql.includes("DELETE FROM bot_sessions")) {
      this.botSessions = this.botSessions.filter((session) => session.telegram_user_id !== values[0]);
    }
  }
}

function telegramRequest(update: unknown, secret = "telegram-secret") {
  return new Request("https://example.com/telegram/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": secret
    },
    body: JSON.stringify(update)
  });
}

function messageUpdate(text: string, fromId = 123456789) {
  return {
    update_id: 1,
    message: {
      message_id: 10,
      chat: { id: 123456789, type: "private" },
      from: { id: fromId, is_bot: false, first_name: "Admin", username: "example_user" },
      text
    }
  };
}

function callbackUpdate(data: string, fromId = 123456789) {
  return {
    update_id: 3,
    callback_query: {
      id: "cb_1",
      from: { id: fromId },
      message: { message_id: 11, chat: { id: 123456789 } },
      data
    }
  };
}

describe("Phase 3 Telegram webhook and menu", () => {
  it("rejects Telegram webhook requests with invalid secret using unified error", async () => {
    const response = await worker.fetch(telegramRequest(messageUpdate("/start"), "wrong-secret"), env as never);
    const body = await response.json() as { ok: boolean; error: { code: string; request_id: string } };

    expect(response.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("WEBHOOK_SECRET_INVALID");
    expect(body.error.request_id).toBe(response.headers.get("x-request-id"));
  });

  it("bootstrap binds the first Telegram user as Super Admin when no explicit id is configured", async () => {
    const fakeDb = new FakeD1Database();
    const testEnv = { ...env, DB: fakeDb as unknown as D1Database, SUPER_ADMIN_TELEGRAM_ID: undefined as unknown as string };
    const response = await worker.fetch(telegramRequest(messageUpdate("/start", 987654321)), testEnv as never);
    const body = await response.json() as { ok: boolean; data: { telegram: { method: string } } };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.telegram.method).toBe("sendMessage");
    expect(fakeDb.settings.get("super_admin")).toContain("987654321");
    expect(fakeDb.settings.get("super_admin")).toContain("chat_id");
    expect(fakeDb.botSessions.length).toBe(0);
  });

  it("rejects non Super Admin Telegram users after bootstrap is already set", async () => {
    const fakeDb = new FakeD1Database();
    fakeDb.settings.set("super_admin", JSON.stringify({ telegram_user_id: "123456789" }));
    const testEnv = { ...env, DB: fakeDb as unknown as D1Database, SUPER_ADMIN_TELEGRAM_ID: undefined as unknown as string };
    const response = await worker.fetch(telegramRequest(messageUpdate("/start", 987654321)), testEnv as never);
    const body = await response.json() as { ok: boolean; error: { code: string } };

    expect(response.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("allows any configured Super Admin from SUPER_ADMIN_TELEGRAM_IDS and disables first-message bootstrap", async () => {
    const fakeDb = new FakeD1Database();
    const testEnv = { ...env, DB: fakeDb as unknown as D1Database, SUPER_ADMIN_TELEGRAM_ID: undefined as unknown as string, SUPER_ADMIN_TELEGRAM_IDS: "123456789, 987654321\n555555555" };

    const allowedResponse = await worker.fetch(telegramRequest(messageUpdate("/start", 987654321)), testEnv as never);
    expect(allowedResponse.status).toBe(200);

    const deniedResponse = await worker.fetch(telegramRequest(messageUpdate("/start", 111111111)), testEnv as never);
    const deniedBody = await deniedResponse.json() as { ok: boolean; error: { code: string } };
    expect(deniedResponse.status).toBe(403);
    expect(deniedBody.error.code).toBe("FORBIDDEN");
    expect(fakeDb.settings.get("super_admin")).toBeUndefined();
  });

  it("allows any explicitly configured Super Admin from SUPER_ADMIN_TELEGRAM_IDS", async () => {
    const testEnv = { ...env, SUPER_ADMIN_TELEGRAM_ID: undefined as unknown as string, SUPER_ADMIN_TELEGRAM_IDS: "123456789, 987654321" };
    const response = await worker.fetch(telegramRequest(messageUpdate("/start", 987654321)), testEnv as never);
    const body = await response.json() as { ok: boolean; data: { telegram: { method: string } } };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.telegram.method).toBe("sendMessage");
  });

  it("rejects users outside SUPER_ADMIN_TELEGRAM_IDS and does not bootstrap them", async () => {
    const fakeDb = new FakeD1Database();
    const testEnv = { ...env, DB: fakeDb as unknown as D1Database, SUPER_ADMIN_TELEGRAM_ID: undefined as unknown as string, SUPER_ADMIN_TELEGRAM_IDS: "123456789, 987654321" };
    const response = await worker.fetch(telegramRequest(messageUpdate("/start", 555555555)), testEnv as never);
    const body = await response.json() as { ok: boolean; error: { code: string } };

    expect(response.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(fakeDb.settings.get("super_admin")).toBeUndefined();
  });

  it("allows Super Admins stored in D1 while keeping explicit env admins active", async () => {
    const fakeDb = new FakeD1Database();
    fakeDb.settings.set("super_admins_d1", JSON.stringify([{ telegram_user_id: "987654321", added_at: "2026-01-01T00:00:00.000Z", source: "telegram" }]));
    const testEnv = { ...env, DB: fakeDb as unknown as D1Database, SUPER_ADMIN_TELEGRAM_IDS: "123456789" };

    const d1Response = await worker.fetch(telegramRequest(messageUpdate("/start", 987654321)), testEnv as never);
    expect(d1Response.status).toBe(200);

    const envResponse = await worker.fetch(telegramRequest(messageUpdate("/start", 123456789)), testEnv as never);
    expect(envResponse.status).toBe(200);
  });

  it("manages D1 Super Admins from Telegram buttons without modifying env admins", async () => {
    const fakeDb = new FakeD1Database();
    const testEnv = { ...env, DB: fakeDb as unknown as D1Database, SUPER_ADMIN_TELEGRAM_IDS: "123456789" };

    const menuResponse = await worker.fetch(telegramRequest(callbackUpdate("menu:admins")), testEnv as never);
    const menuBody = await menuResponse.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(menuResponse.status).toBe(200);
    expect(menuBody.data.telegram.payload.text).toContain("管理员管理");
    expect(menuBody.data.telegram.payload.text).toContain("123456789");
    expect(menuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ callback_data: "admins:remove_confirm:123456789" })
    ]));

    await worker.fetch(telegramRequest(callbackUpdate("admins:add")), testEnv as never);
    const addResponse = await worker.fetch(telegramRequest(messageUpdate("987654321")), testEnv as never);
    const addBody = await addResponse.json() as { data: { telegram: { payload: { text: string } } } };
    expect(addResponse.status).toBe(200);
    expect(addBody.data.telegram.payload.text).toContain("987654321");
    const storedAdmins = JSON.parse(fakeDb.settings.get("super_admins_d1") ?? "[]") as Array<{ telegram_user_id: string }>;
    expect(storedAdmins.map((admin) => admin.telegram_user_id)).toEqual(["987654321"]);

    const removeResponse = await worker.fetch(telegramRequest(callbackUpdate("admins:remove:987654321")), testEnv as never);
    const removeBody = await removeResponse.json() as { data: { telegram: { payload: { text: string } } } };
    expect(removeResponse.status).toBe(200);
    expect(removeBody.data.telegram.payload.text).not.toContain("987654321");
    expect(fakeDb.settings.get("super_admins_d1")).not.toContain("987654321");
  });

  it("prevents D1 Super Admins from adding or deleting other admins", async () => {
    const fakeDb = new FakeD1Database();
    fakeDb.settings.set("super_admins_d1", JSON.stringify([{ telegram_user_id: "987654321", added_at: "2026-01-01T00:00:00.000Z", source: "telegram" }]));
    const testEnv = { ...env, DB: fakeDb as unknown as D1Database, SUPER_ADMIN_TELEGRAM_IDS: "123456789" };

    const menuResponse = await worker.fetch(telegramRequest({ update_id: 30, callback_query: { id: "cb_d1_menu", from: { id: 987654321 }, message: { message_id: 13, chat: { id: 987654321 } }, data: "admins:menu" } }), testEnv as never);
    const menuBody = await menuResponse.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(menuResponse.status).toBe(200);
    expect(menuBody.data.telegram.payload.text).toContain("只有 Cloudflare Secret");
    expect(menuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ callback_data: "admins:add" })
    ]));

    const addOpenResponse = await worker.fetch(telegramRequest({ update_id: 31, callback_query: { id: "cb_d1_add", from: { id: 987654321 }, message: { message_id: 14, chat: { id: 987654321 } }, data: "admins:add" } }), testEnv as never);
    const addOpenBody = await addOpenResponse.json() as { data: { telegram: { payload: { text: string } } } };
    expect(addOpenResponse.status).toBe(200);
    expect(addOpenBody.data.telegram.payload.text).toContain("只有 Cloudflare Secret");

    const before = fakeDb.settings.get("super_admins_d1");
    const addMessageResponse = await worker.fetch(telegramRequest(messageUpdate("555555555", 987654321)), testEnv as never);
    expect(addMessageResponse.status).toBe(200);
    expect(fakeDb.settings.get("super_admins_d1")).toBe(before);

    const removeResponse = await worker.fetch(telegramRequest({ update_id: 32, callback_query: { id: "cb_d1_remove", from: { id: 987654321 }, message: { message_id: 15, chat: { id: 987654321 } }, data: "admins:remove:987654321" } }), testEnv as never);
    const removeBody = await removeResponse.json() as { data: { telegram: { payload: { text: string } } } };
    expect(removeResponse.status).toBe(200);
    expect(removeBody.data.telegram.payload.text).toContain("只有 Cloudflare Secret");
    expect(fakeDb.settings.get("super_admins_d1")).toContain("987654321");
  });

  it("adds and removes D1 Super Admins from Telegram admin management", async () => {
    const fakeDb = new FakeD1Database();
    const testEnv = { ...env, DB: fakeDb as unknown as D1Database };

    const openResponse = await worker.fetch(telegramRequest({ update_id: 20, callback_query: { id: "cb_admin", from: { id: 123456789 }, message: { message_id: 11, chat: { id: 123456789 } }, data: "admins:add" } }), testEnv as never);
    expect(openResponse.status).toBe(200);

    const addResponse = await worker.fetch(telegramRequest(messageUpdate("987654321")), testEnv as never);
    const addBody = await addResponse.json() as { ok: boolean; data: { telegram: { payload: { text: string } } } };
    expect(addResponse.status).toBe(200);
    expect(addBody.data.telegram.payload.text).toContain("987654321");
    expect(fakeDb.settings.get("super_admins_d1")).toContain("987654321");

    const allowedResponse = await worker.fetch(telegramRequest(messageUpdate("/start", 987654321)), testEnv as never);
    expect(allowedResponse.status).toBe(200);

    const removeResponse = await worker.fetch(telegramRequest({ update_id: 21, callback_query: { id: "cb_admin_remove", from: { id: 123456789 }, message: { message_id: 12, chat: { id: 123456789 } }, data: "admins:remove:987654321" } }), testEnv as never);
    expect(removeResponse.status).toBe(200);
    expect(fakeDb.settings.get("super_admins_d1")).not.toContain("987654321");
  });

  it("parses message commands and callback queries", () => {
    expect(parseTelegramUpdate(messageUpdate("/help"))).toMatchObject({ kind: "message", command: "help", chatId: "123456789", fromId: "123456789" });
    expect(parseTelegramUpdate({
      update_id: 2,
      callback_query: {
        id: "cb_1",
        from: { id: 123456789 },
        message: { message_id: 11, chat: { id: 123456789 } },
        data: "menu:unknown"
      }
    })).toMatchObject({ kind: "callback_query", data: "menu:unknown", messageId: 11 });
  });

  it("handles /start with reply keyboard main entries and inline checkin", async () => {
    const response = await worker.fetch(telegramRequest(messageUpdate("/start")), env as never);
    const body = await response.json() as { ok: boolean; data: { telegram: { method: string; payload: { text: string; reply_markup: { keyboard?: Array<Array<{ text: string }>>; inline_keyboard?: Array<Array<{ text: string; callback_data: string }>> } } }; sent: unknown[] } };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.telegram.method).toBe("sendMessage");
    expect(body.data.telegram.payload.text).toContain("主导航已放到聊天框下方");
    expect(body.data.telegram.payload.reply_markup.keyboard).toEqual([
      [{ text: "🖥 服务器" }, { text: "⏰ 定时" }],
      [{ text: "👤 账号" }, { text: "❤️ 打卡" }],
      [{ text: "🏠 主菜单" }, { text: "📋 更多" }]
    ]);
    expect(body.data.telegram.payload.reply_markup.inline_keyboard).toBeUndefined();
    expect(body.data.sent).toEqual([
      expect.objectContaining({ ok: true, dry_run: true, method: "sendMessage" })
    ]);
  });

  it("sends Telegram webhook actions through Telegram API outside test dry-run tokens", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      calls.push({ url: String(input), body: String(init?.body ?? "") });
      return new Response(JSON.stringify({ ok: true, result: { message_id: 100 } }), { status: 200 });
    });
    try {
      const response = await worker.fetch(telegramRequest(messageUpdate("/start")), { ...env, TELEGRAM_BOT_TOKEN: "123456:realish-token" } as never);
      expect(response.status).toBe(200);
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://api.telegram.org/bot123456:realish-token/sendMessage");
      expect(calls[0].body).toContain("主导航");
      expect(calls[0].body).toContain("服务器");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("renders my id with full Telegram metadata and copy buttons", async () => {
    const response = await worker.fetch(telegramRequest(messageUpdate("🪪 我的ID")), env as never);
    const body = await response.json() as { ok: boolean; data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; copy_text?: { text: string } }>> } } } } };
    expect(body.data.telegram.payload.text).toContain("@example_user");
    expect(body.data.telegram.payload.text).toContain("ID：`123456789`");
    expect(body.data.telegram.payload.text).toContain("名：Admin");
    expect(body.data.telegram.payload.text).toContain("Chat ID：`123456789`");
    expect(body.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: "123456789", copy_text: { text: "123456789" } })
    ]));
  });

  it("handles /help and /setup wizard", async () => {
    const helpResponse = await worker.fetch(telegramRequest(messageUpdate("/help")), env as never);
    const helpBody = await helpResponse.json() as { ok: boolean; data: { telegram: { payload: { text: string } } } };
    expect(helpBody.data.telegram.payload.text).toContain("API-first");
    expect(helpBody.data.telegram.payload.text).toContain("/start 打开主菜单");

    const setupResponse = await worker.fetch(telegramRequest(messageUpdate("/setup")), env as never);
    const setupBody = await setupResponse.json() as { ok: boolean; data: { telegram: { payload: { text: string } } } };
    expect(setupBody.data.telegram.payload.text).toContain("Linode Guard Lite Setup Wizard");
  });


  it("keeps server creation sessions alive long enough to resume after interruptions", async () => {
    const fakeDb = new FakeD1Database();
    const testEnv = { ...env, DB: fakeDb as unknown as D1Database };
    const repository = new BotSessionsRepository(testEnv.DB);
    await new BotSessionService(repository).setCurrentSession({
      telegramUserId: "123456789",
      chatId: "123456789",
      state: "creating_windows_instance",
      data: { account_id: 1 }
    });

    const session = await repository.getByUserId("123456789");
    expect(session).not.toBeNull();
    const ttlMs = Date.parse(session!.expires_at) - Date.now();
    expect(ttlMs).toBeGreaterThan(100 * 60 * 1000);
  });

  it("clears bot session on /cancel", async () => {
    const fakeDb = new FakeD1Database();
    const testEnv = { ...env, DB: fakeDb as unknown as D1Database };
    await new BotSessionsRepository(testEnv.DB).upsert({ telegram_user_id: "123456789", chat_id: "123456789", state: "adding_account_alias", data: { alias: "default" }, expires_at: "2099-01-01T00:00:00.000Z" });

    const response = await worker.fetch(telegramRequest(messageUpdate("/cancel")), testEnv as never);
    const body = await response.json() as { ok: boolean; data: { telegram: { payload: { text: string } } } };

    expect(response.status).toBe(200);
    expect(body.data.telegram.payload.text).toBe("已取消当前操作。");
    await expect(new BotSessionsRepository(testEnv.DB).getByUserId("123456789")).resolves.toBeNull();
  });

  it("handles exposed main, settings, and diagnostics callbacks", async () => {
    const fakeDb = new FakeD1Database();
    const testEnv = { ...env, DB: fakeDb as unknown as D1Database };
    for (const data of ["menu:main", "menu:settings", "menu:diagnostics"]) {
      const response = await worker.fetch(telegramRequest({
        update_id: 3,
        callback_query: {
          id: "cb_1",
          from: { id: 123456789 },
          message: { message_id: 11, chat: { id: 123456789 } },
          data
        }
      }), testEnv as never);
      const body = await response.json() as { ok: boolean; data: { telegram: { method: string; payload: { text?: string } }; sent: Array<{ method: string }> } };

      expect(response.status).toBe(200);
      expect(body.data.sent[0].method).toBe("answerCallbackQuery");
      expect(body.data.sent[1].method).toBe("editMessageText");
      expect(body.data.telegram.method).toBe("editMessageText");
      expect(body.data.telegram.payload.text).not.toContain("暂不支持的菜单入口");
      if (data === "menu:diagnostics") {
        expect(body.data.telegram.payload.text).toContain("诊断中心");
        expect(body.data.telegram.payload.text).toContain("Boot safety");
      }
    }
  });

  it("routes unknown callback_query to a clear prompt", async () => {
    const response = await worker.fetch(telegramRequest({
      update_id: 3,
      callback_query: {
        id: "cb_1",
        from: { id: 123456789 },
        message: { message_id: 11, chat: { id: 123456789 } },
        data: "menu:unknown"
      }
    }), env as never);
    const body = await response.json() as { ok: boolean; data: { telegram: { method: string; payload: { text?: string } }; sent: Array<{ method: string }> } };

    expect(response.status).toBe(200);
    expect(body.data.sent[0].method).toBe("answerCallbackQuery");
    expect(body.data.sent[1].method).toBe("sendMessage");
    expect(body.data.telegram.method).toBe("sendMessage");
    expect(body.data.telegram.payload.text).toContain("这个按钮暂时不能继续");
  });
});
