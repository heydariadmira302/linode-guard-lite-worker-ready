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
  group_id: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
type GroupRecord = { id: number; name: string; is_default: number; created_at: string; updated_at: string; deleted_at: string | null };

class FakePreparedStatement {
  constructor(private db: FakeD1Database, private sql: string) {}
  private values: unknown[] = [];
  bind(...values: unknown[]) { this.values = values; return this; }
  first<T = unknown>() { return Promise.resolve(this.db.first<T>(this.sql, this.values)); }
  all<T = unknown>() { return Promise.resolve({ results: this.db.all<T>(this.sql), success: true, meta: {} }); }
  run() { return Promise.resolve(this.db.run(this.sql, this.values)); }
}

class FakeD1Database {
  accounts: AccountRecord[] = [];
  groups: GroupRecord[] = [{ id: 1, name: "未分组", is_default: 1, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", deleted_at: null }];
  settings = new Map<string, string>();
  botSessions: Record<string, unknown>[] = [];

  prepare(sql: string) { return new FakePreparedStatement(this, sql); }

  first<T>(sql: string, values: unknown[]): T | null {
    if (sql.includes("FROM bot_sessions")) {
      return (this.botSessions.find((session) => session.telegram_user_id === String(values[0])) as T | undefined) ?? null;
    }
    if (sql.includes("FROM settings")) {
      const value = this.settings.get(String(values[0]));
      return value ? ({ value_json: value } as T) : null;
    }
    if (sql.includes("FROM linode_accounts") && sql.includes("WHERE id = ?")) {
      return (this.accounts.find((account) => account.id === Number(values[0])) as T | undefined) ?? null;
    }
    if (sql.includes("FROM groups") && sql.includes("WHERE id = ?")) {
      return (this.groups.find((group) => group.id === Number(values[0]) && group.deleted_at === null) as T | undefined) ?? null;
    }
    if (sql.includes("FROM groups") && sql.includes("WHERE is_default = 1")) {
      return (this.groups.find((group) => group.is_default === 1 && group.deleted_at === null) as T | undefined) ?? null;
    }
    return null;
  }

  run(sql: string, values: unknown[]) {
    if (sql.includes("INTO bot_sessions")) {
      this.botSessions = this.botSessions.filter((session) => session.telegram_user_id !== String(values[0]));
      this.botSessions.push({ id: this.botSessions.length + 1, telegram_user_id: String(values[0]), chat_id: String(values[1]), state: String(values[2]), data_json: values[3] as string | null, expires_at: String(values[4]) });
    }
    if (sql.includes("DELETE FROM bot_sessions")) this.botSessions = this.botSessions.filter((session) => session.telegram_user_id !== String(values[0]));
    if (sql.includes("INTO settings")) this.settings.set(String(values[0]), String(values[1]));
    return { success: true, changes: 1, meta: {} };
  }

  all<T>(sql: string): T[] {
    if (sql.includes("FROM linode_accounts")) {
      return this.accounts.filter((account) => account.status === "active") as T[];
    }
    if (sql.includes("FROM groups")) {
      return this.groups.filter((group) => group.deleted_at === null).map((group) => ({ ...group, account_count: this.accounts.filter((account) => Number(account.group_id ?? 1) === group.id && account.status === "active").length })) as T[];
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
    group_id: 1,
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


  it("creates a Linux instance through API-first service and exposes Telegram create flow", async () => {
    const db = new FakeD1Database();
    await addAccount(db, { id: 1, alias: "default", token: "token-default" });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const calls: string[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)} ${new Headers(init?.headers).get("authorization")}`);
      if (String(input).endsWith("/regions")) return new Response(JSON.stringify({ data: [{ id: "jp-osa", label: "Osaka, JP", country: "jp", site_type: "core" }], page: 1, pages: 1 }), { status: 200 });
      if (String(input).endsWith("/linode/types")) return new Response(JSON.stringify({ data: [{ id: "g6-nanode-1", label: "Nanode 1GB", vcpus: 1, memory: 1024, transfer: 1000, price: { monthly: 5 } }], page: 1, pages: 1 }), { status: 200 });
      if (String(input).endsWith("/images")) return new Response(JSON.stringify({ data: [{ id: "linode/ubuntu24.04", label: "Ubuntu 24.04 LTS", deprecated: false }], page: 1, pages: 1 }), { status: 200 });
      if (String(input).endsWith("/networking/firewalls")) return new Response(JSON.stringify({ data: [], page: 1, pages: 1 }), { status: 200 });
      if (String(input).endsWith("/linode/instances") && init?.method === "POST") {
        const payload = JSON.parse(String(init.body));
        expect(payload).toMatchObject({ region: "jp-osa", type: "g6-nanode-1", image: "linode/ubuntu24.04", backups_enabled: false, tags: ["linode-guard-lite"] });
        expect(payload.root_pass).toEqual(expect.any(String));
        return new Response(JSON.stringify({ id: 909, label: payload.label, status: "provisioning", region: payload.region, type: payload.type, image: payload.image, ipv4: [] }), { status: 200 });
      }
      throw new Error(`unexpected fetch ${String(input)}`);
    });
    try {
      const optionsResponse = await worker.fetch(apiRequest("/api/v1/accounts/1/instances/create-options"), env as never);
      expect(optionsResponse.status).toBe(200);
      expect(JSON.stringify(await optionsResponse.json())).not.toContain("token-default");

      const createResponse = await worker.fetch(apiRequest("/api/v1/accounts/1/instances", { method: "POST", body: JSON.stringify({ region: "jp-osa", type: "g6-nanode-1", image: "linode/ubuntu24.04" }) }), env as never);
      const createBody = await createResponse.json() as { ok: boolean; data: { instance: { id: number; status: string }; root_password: string } };
      if (createResponse.status !== 200) console.log(await createResponse.clone().text());
      expect(createResponse.status).toBe(200);
      expect(createBody.data.instance).toMatchObject({ id: 909, status: "provisioning" });
      expect(createBody.data.root_password.length).toBeGreaterThanOrEqual(20);
      expect(calls).toContain("POST https://api.linode.com/v4/linode/instances Bearer token-default");

      const menuResponse = await worker.fetch(telegramRequest(callbackUpdate("menu:instances")), env as never);
      const menuBody = await menuResponse.json() as { data: { telegram: { payload: { reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      expect(menuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toContainEqual({ text: "➕ 创建 Linux 服务器", callback_data: "instances:create" });

      const flowResponse = await worker.fetch(telegramRequest(callbackUpdate("instances:create")), env as never);
      const flowBody = await flowResponse.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      expect(flowBody.data.telegram.payload.text).toContain("创建服务器");
      expect(flowBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toContainEqual({ text: "👤 #1 default", callback_data: "instances:create:account:1" });
    } finally {
      fetchMock.mockRestore();
    }
  });


  it("creates Windows Server through API-first StackScript route", async () => {
    const db = new FakeD1Database();
    await addAccount(db, { id: 1, alias: "default", token: "token-default" });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/linode/stackscripts") && init?.method === "POST") {
        const payload = JSON.parse(String(init.body));
        expect(payload).toMatchObject({ label: "Linode Guard Lite Windows Server", images: ["linode/ubuntu22.04"], is_public: false });
        expect(payload.script).toContain("WINDOWS_PASSWORD");
        return new Response(JSON.stringify({ id: 2022, label: payload.label }), { status: 200 });
      }
      if (url.endsWith("/regions")) return new Response(JSON.stringify({ data: [{ id: "jp-osa", label: "Osaka", site_type: "core" }], page: 1, pages: 1 }), { status: 200 });
      if (url.endsWith("/linode/types")) return new Response(JSON.stringify({ data: [{ id: "g6-dedicated-2", label: "Dedicated 4GB", memory: 4096, disk: 81920, vcpus: 2, transfer: 4000, price: { monthly: 36 } }], page: 1, pages: 1 }), { status: 200 });
      if (url.endsWith("/networking/firewalls")) return new Response(JSON.stringify({ data: [], page: 1, pages: 1 }), { status: 200 });
      if (url.endsWith("/linode/instances") && init?.method === "POST") {
        const payload = JSON.parse(String(init.body));
        expect(payload).toMatchObject({ region: "jp-osa", type: "g6-dedicated-2", image: "linode/ubuntu22.04", stackscript_id: 2022 });
        expect(payload.stackscript_data.TOKEN).toBe("token-default");
        expect(payload.stackscript_data.WINDOWS_PASSWORD).toEqual(expect.any(String));
        expect(payload.stackscript_data.INSTALL_WINDOWS_VERSION).toBe("2k22");
        return new Response(JSON.stringify({ id: 92022, label: payload.label, status: "provisioning", region: payload.region, type: payload.type, image: payload.image, ipv4: ["192.0.2.9"], tags: payload.tags }), { status: 200 });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    try {
      const scriptResponse = await worker.fetch(apiRequest("/api/v1/accounts/1/windows/stackscript", { method: "POST" }), env as never);
      expect(scriptResponse.status).toBe(200);
      const optionsResponse = await worker.fetch(apiRequest("/api/v1/accounts/1/windows/create-options"), env as never);
      expect(optionsResponse.status).toBe(200);
      const createResponse = await worker.fetch(apiRequest("/api/v1/accounts/1/windows/instances", { method: "POST", body: JSON.stringify({ region: "jp-osa", type: "g6-dedicated-2" }) }), env as never);
      const body = await createResponse.json() as { data: { instance: { id: number }; administrator_password: string; temp_root_password: string } };
      expect(createResponse.status).toBe(200);
      expect(body.data.instance.id).toBe(92022);
      expect(body.data.administrator_password).not.toContain("123@@@");
      expect(body.data.temp_root_password).not.toContain("LeitboGi0ro");
      expect([...db.settings.keys()].some((key) => key.startsWith("windows_instance:"))).toBe(false);
      const menuResponse = await worker.fetch(telegramRequest(callbackUpdate("menu:instances")), env as never);
      const menuBody = await menuResponse.json() as { data: { telegram: { payload: { reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      expect(menuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toContainEqual({ text: "🪟 创建 Windows 服务器", callback_data: "windows:create" });

      const startFlow = await worker.fetch(telegramRequest(callbackUpdate("windows:create:account:1")), env as never);
      expect(startFlow.status).toBe(200);
      await worker.fetch(telegramRequest(callbackUpdate("instances:create:region:1:jp-osa")), env as never);
      const typeFlow = await worker.fetch(telegramRequest(callbackUpdate("instances:create:type:1:g6-dedicated-2")), env as never);
      const typeBody = await typeFlow.json() as { data?: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } }; error?: unknown };
      expect(typeBody.data!.telegram.payload.text).toContain("步骤 3/3：选择防火墙");
      expect(typeBody.data!.telegram.payload.text).not.toContain("选择系统");
      const confirmFlow = await worker.fetch(telegramRequest(callbackUpdate("instances:create:firewall:1:none")), env as never);
      const confirmBody = await confirmFlow.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      expect(confirmBody.data.telegram.payload.text).toContain("StackScript 会把新建 Ubuntu 机器转换为 Windows");
      expect(confirmBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toContainEqual({ text: "✅ 确认创建 Windows", callback_data: "windows:create:confirm:1", style: "success" });
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
      expect(menuBody.data.telegram.payload.text).toContain("🖥 服务器管理");
      expect(menuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
        { text: "🖥 查看全部服务器", callback_data: "instances:list:all" },
        { text: "🔎 筛选", callback_data: "instances:filter" },
        { text: "⚡ 批量操作", callback_data: "menu:batch" }
      ]));

      const groupsResponse = await worker.fetch(telegramRequest(callbackUpdate("instances:groups")), env as never);
      const groupsBody = await groupsResponse.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      expect(groupsBody.data.telegram.payload.text).toContain("选择分组查看服务器");
      expect(groupsBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toContainEqual({ text: "📁 未分组", callback_data: "instances:list:group:1" });

      const groupListResponse = await worker.fetch(telegramRequest(callbackUpdate("instances:list:group:1")), env as never);
      const groupListBody = await groupListResponse.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
      const groupKeyboard = groupListBody.data.telegram.payload.reply_markup.inline_keyboard.flat();
      const raw = JSON.stringify(groupListBody);
      expect(groupListBody.data.telegram.payload.text).toContain("按分组查看服务器");
      expect(groupListBody.data.telegram.payload.text).toContain("分组：未分组");
      expect(groupListBody.data.telegram.payload.text).toContain("default-web");
      expect(groupListBody.data.telegram.payload.text).toContain("IPv4：203.0.113.10");
      expect(groupKeyboard).toEqual(expect.arrayContaining([{ text: "详情 #101", callback_data: "instances:detail:1:101:group_1" }]));
      expect(raw).not.toContain("✅ 开机");
      expect(raw).not.toContain("⚠️ 关机");
      expect(raw).not.toContain("🔄 重启");
      expect(raw).not.toContain("删除");
    } finally {
      fetchMock.mockRestore();
    }
  });
});
