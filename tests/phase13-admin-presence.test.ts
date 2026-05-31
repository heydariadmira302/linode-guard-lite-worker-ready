import { describe, expect, it } from "vitest";
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

type AdminPresenceRecord = {
  id: number;
  last_checkin_at: string | null;
  last_checkin_actor: string | null;
  current_cycle_id: string | null;
  created_at: string;
  updated_at: string;
};

type AdminPresencePolicyRecord = {
  id: number;
  name: string;
  enabled: number;
  scope: string;
  rules_json: string;
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

type AccountRecord = { id: number; alias: string; status: string; group_id: number | null };
type GroupRecord = { id: number; name: string; is_default: number; created_at: string; updated_at: string; deleted_at: string | null; account_count?: number };
type TelegramMessageRecord = { id: number; chat_id: string; message_id: string; purpose: string; delete_status: string; attempts: number; last_error_code: string | null; created_at: string; deleted_at: string | null; metadata_json: string | null };

class FakePreparedStatement {
  constructor(private db: FakeD1Database, private sql: string) {}
  private values: unknown[] = [];
  bind(...values: unknown[]) { this.values = values; return this; }
  first<T = unknown>() { return Promise.resolve(this.db.first<T>(this.sql, this.values)); }
  all<T = unknown>() { return Promise.resolve({ results: this.db.all<T>(this.sql, this.values), success: true, meta: {} }); }
  run() { const meta = this.db.run(this.sql, this.values); return Promise.resolve({ success: true, meta }); }
}

class FakeD1Database {
  presence: AdminPresenceRecord | null = null;
  policies: AdminPresencePolicyRecord[] = [];
  auditLogs: AuditRecord[] = [];
  botSessions: Array<{ telegram_user_id: string; chat_id: string; state: string; data_json: string | null; expires_at: string }> = [];
  telegramMessages: TelegramMessageRecord[] = [];
  accounts: AccountRecord[] = [{ id: 1, alias: "default", status: "active", group_id: 1 }];
  groups: GroupRecord[] = [{ id: 1, name: "未分组", is_default: 1, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", deleted_at: null }];
  nextPolicyId = 1;
  nextTelegramMessageId = 1;
  prepare(sql: string) { return new FakePreparedStatement(this, sql); }

  first<T>(sql: string, values: unknown[] = []): T | null {
    if (sql.includes("FROM admin_presence_policies") && sql.includes("WHERE id = ?")) {
      return (this.policies.find((policy) => policy.id === Number(values[0]) && policy.deleted_at === null) as T | undefined) ?? null;
    }
    if (sql.includes("FROM admin_presence")) return this.presence as T | null;
    if (sql.includes("FROM bot_sessions")) {
      return (this.botSessions.find((session) => session.telegram_user_id === String(values[0])) as T | undefined) ?? null;
    }
    if (sql.includes("FROM telegram_messages") && sql.includes("SELECT id")) {
      return (this.telegramMessages.find((message) => message.chat_id === String(values[0]) && message.message_id === String(values[1]) && message.purpose === String(values[2])) as T | undefined) ?? null;
    }
    if (sql.includes("COUNT") && sql.includes("FROM admin_presence_policies") && sql.includes("enabled = 1")) {
      return { count: this.policies.filter((policy) => policy.deleted_at === null && policy.enabled === 1).length } as T;
    }
    if (sql.includes("FROM linode_accounts") && sql.includes("WHERE id = ?")) {
      const account = this.accounts.find((item) => item.id === Number(values[0]));
      return account ? ({ ...account, encrypted_token: "encrypted", token_fingerprint: "fp", token_status: "valid", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", deleted_at: null } as T) : null;
    }
    if (sql.includes("FROM groups") && sql.includes("WHERE id = ?")) {
      return (this.groups.find((group) => group.id === Number(values[0]) && group.deleted_at === null) as T | undefined) ?? null;
    }
    if (sql.includes("FROM groups") && sql.includes("WHERE is_default = 1")) {
      return (this.groups.find((group) => group.is_default === 1 && group.deleted_at === null) as T | undefined) ?? null;
    }
    return null;
  }

  all<T>(sql: string, values: unknown[] = []): T[] {
    if (sql.includes("FROM admin_presence_policies")) {
      const limit = Number(values[values.length - 2]);
      const offset = Number(values[values.length - 1]);
      return this.policies.filter((policy) => policy.deleted_at === null).sort((a, b) => b.id - a.id).slice(offset, offset + limit) as T[];
    }
    if (sql.includes("FROM linode_accounts")) {
      return this.accounts.filter((account) => account.status === "active").map((account) => ({ ...account, encrypted_token: "encrypted", token_fingerprint: "fp", token_status: "valid", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", deleted_at: null })) as T[];
    }
    if (sql.includes("FROM groups")) {
      return this.groups.filter((group) => group.deleted_at === null).map((group) => ({ ...group, account_count: this.accounts.filter((account) => account.status === "active" && Number(account.group_id ?? 1) === group.id).length })) as T[];
    }
    if (sql.includes("FROM telegram_messages")) {
      return this.telegramMessages.filter((message) => message.purpose === String(values[0]) && message.delete_status === "pending" && message.attempts < 3).slice(0, Number(values[1] ?? 100)) as T[];
    }
    return [];
  }

  run(sql: string, values: unknown[]) {
    const now = new Date().toISOString();
    if (sql.includes("INTO bot_sessions")) {
      this.botSessions = this.botSessions.filter((session) => session.telegram_user_id !== String(values[0]));
      this.botSessions.push({ telegram_user_id: String(values[0]), chat_id: String(values[1]), state: String(values[2]), data_json: values[3] as string | null, expires_at: String(values[4]) });
      return { changes: 1 };
    }
    if (sql.includes("DELETE FROM bot_sessions")) {
      this.botSessions = this.botSessions.filter((session) => session.telegram_user_id !== String(values[0]));
      return { changes: 1 };
    }
    if (sql.includes("INTO telegram_messages")) {
      this.telegramMessages.push({ id: this.nextTelegramMessageId++, chat_id: String(values[0]), message_id: String(values[1]), purpose: String(values[2]), delete_status: "pending", attempts: 0, last_error_code: null, created_at: now, deleted_at: null, metadata_json: values[3] as string | null });
      return { changes: 1 };
    }
    if (sql.includes("UPDATE telegram_messages") && sql.includes("WHERE chat_id = ?")) {
      const matches = this.telegramMessages.filter((item) => item.chat_id === String(values[0]) && item.message_id === String(values[1]) && item.purpose === String(values[2]) && item.delete_status === "pending");
      for (const message of matches) {
        message.delete_status = "deleted";
        message.deleted_at = now;
        message.attempts += 1;
      }
      return { changes: matches.length };
    }
    if (sql.includes("UPDATE telegram_messages SET delete_status = 'deleted'")) {
      const message = this.telegramMessages.find((item) => item.id === Number(values[0]));
      if (message) {
        message.delete_status = "deleted";
        message.deleted_at = now;
        message.attempts += 1;
      }
      return { changes: message ? 1 : 0 };
    }
    if (sql.includes("UPDATE telegram_messages SET attempts")) {
      const message = this.telegramMessages.find((item) => item.id === Number(values[1]));
      if (message) {
        message.attempts += 1;
        message.last_error_code = String(values[0]);
      }
      return { changes: message ? 1 : 0 };
    }
    if (sql.includes("INSERT OR IGNORE INTO groups")) {
      if (!this.groups.some((group) => group.id === 1)) this.groups.push({ id: 1, name: "未分组", is_default: 1, created_at: now, updated_at: now, deleted_at: null });
      return { changes: 1 };
    }
    if (sql.includes("INSERT OR IGNORE INTO admin_presence")) {
      if (!this.presence) this.presence = { id: 1, last_checkin_at: null, last_checkin_actor: null, current_cycle_id: null, created_at: now, updated_at: now };
      return { changes: 1 };
    }
    if (sql.includes("UPDATE admin_presence") && sql.includes("last_checkin_at")) {
      if (!this.presence) this.presence = { id: 1, last_checkin_at: null, last_checkin_actor: null, current_cycle_id: null, created_at: now, updated_at: now };
      this.presence.last_checkin_at = String(values[0]);
      this.presence.last_checkin_actor = String(values[1]);
      this.presence.current_cycle_id = String(values[2]);
      this.presence.updated_at = now;
      return { changes: 1 };
    }
    if (sql.includes("INTO admin_presence_policies")) {
      const policy: AdminPresencePolicyRecord = {
        id: this.nextPolicyId++,
        name: String(values[0]),
        enabled: Number(values[1]),
        scope: String(values[2]),
        rules_json: String(values[3]),
        created_at: now,
        updated_at: now,
        deleted_at: null
      };
      this.policies.push(policy);
      return { last_row_id: policy.id, changes: 1 };
    }
    if (sql.includes("UPDATE admin_presence_policies") && sql.includes("SET name = ?")) {
      const policy = this.policies.find((item) => item.id === Number(values[4]) && item.deleted_at === null);
      if (policy) {
        policy.name = String(values[0]);
        policy.enabled = Number(values[1]);
        policy.scope = String(values[2]);
        policy.rules_json = String(values[3]);
        policy.updated_at = now;
      }
      return { changes: policy ? 1 : 0 };
    }
    if (sql.includes("UPDATE admin_presence_policies") && sql.includes("enabled = 1")) {
      const policy = this.policies.find((item) => item.id === Number(values[0]) && item.deleted_at === null);
      if (policy) { policy.enabled = 1; policy.updated_at = now; }
      return { changes: policy ? 1 : 0 };
    }
    if (sql.includes("UPDATE admin_presence_policies") && sql.includes("enabled = 0")) {
      const policy = this.policies.find((item) => item.id === Number(values[0]) && item.deleted_at === null);
      if (policy) { policy.enabled = 0; policy.updated_at = now; }
      return { changes: policy ? 1 : 0 };
    }
    if (sql.includes("UPDATE admin_presence_policies") && sql.includes("deleted_at")) {
      const policy = this.policies.find((item) => item.id === Number(values[0]) && item.deleted_at === null);
      if (policy) { policy.deleted_at = now; policy.updated_at = now; }
      return { changes: policy ? 1 : 0 };
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
      return { changes: 1 };
    }
    return { changes: 0 };
  }
}

function apiRequest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("Authorization")) headers.set("Authorization", "Bearer secret-api-token");
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return new Request(`https://example.com${path}`, { ...init, headers });
}

function telegramRequest(update: unknown) {
  return new Request("https://example.com/telegram/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "telegram-secret" },
    body: JSON.stringify(update)
  });
}

function callbackUpdate(data: string, messageId = 11) {
  return {
    update_id: 60,
    callback_query: {
      id: "cb_admin_presence",
      from: { id: 123456789 },
      message: { message_id: messageId, chat: { id: 123456789 } },
      data
    }
  };
}

function messageUpdate(text: string) {
  return { update_id: 61, message: { message_id: 12, chat: { id: 123456789, type: "private" }, from: { id: 123456789, is_bot: false, first_name: "Admin" }, text } };
}

function collectCallbackData(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const node = value as { callback_data?: unknown; inline_keyboard?: unknown };
  const current = typeof node.callback_data === "string" ? [node.callback_data] : [];
  const rows = Array.isArray(node.inline_keyboard) ? node.inline_keyboard.flatMap((row) => Array.isArray(row) ? row : []) : [];
  return [...current, ...rows.flatMap(collectCallbackData)];
}

describe("Phase 13 admin presence", () => {
  it("returns initialized admin presence status and supports manual checkin with new cycle id, audit log, and no token leakage", async () => {
    const db = new FakeD1Database();
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    const statusResponse = await worker.fetch(apiRequest("/api/v1/admin-presence/status"), env as never);
    const statusBody = await statusResponse.json() as { ok: boolean; data: { status: AdminPresenceRecord; enabled_policy_count: number } };
    expect(statusResponse.status).toBe(200);
    expect(statusBody.ok).toBe(true);
    expect(statusBody.data.status).toMatchObject({ id: 1, last_checkin_at: null, last_checkin_actor: null, current_cycle_id: null });
    expect(statusBody.data.enabled_policy_count).toBe(0);

    const checkinResponse = await worker.fetch(apiRequest("/api/v1/admin-presence/checkin", { method: "POST" }), env as never);
    const checkinBody = await checkinResponse.json() as { ok: boolean; data: { status: AdminPresenceRecord } };
    const raw = JSON.stringify(checkinBody);
    expect(checkinResponse.status).toBe(200);
    expect(checkinBody.ok).toBe(true);
    expect(checkinBody.data.status.last_checkin_at).toEqual(expect.any(String));
    expect(checkinBody.data.status.last_checkin_actor).toBe("api:default");
    expect(checkinBody.data.status.current_cycle_id).toMatch(/^presence_cycle_/);
    expect(db.presence?.current_cycle_id).toBe(checkinBody.data.status.current_cycle_id);
    expect(db.auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "admin_presence.checkin", target_type: "admin_presence", risk_level: "medium", result: "success" })
    ]));
    expect(raw).not.toContain("token");
    expect(raw).not.toContain("encrypted_token");
  });

  it("enables and disables admin presence policies from Telegram with Chinese copy", async () => {
    const db = new FakeD1Database();
    db.policies.push({ id: 1, name: "notify after 7 days", enabled: 1, scope: "all", rules_json: JSON.stringify({ action: "notify", token: "plain-token" }), created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", deleted_at: null });
    db.policies.push({ id: 2, name: "shutdown stale servers", enabled: 0, scope: "all", rules_json: JSON.stringify({ action: "shutdown_all_instances" }), created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", deleted_at: null });
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    const disable = await worker.fetch(telegramRequest(callbackUpdate("admin_presence:policy:disable:1")), env as never);
    const disableBody = await disable.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    const disableRaw = JSON.stringify(disableBody);
    expect(disableBody.data.telegram.payload.text).toContain("保活策略已停用");
    expect(disableBody.data.telegram.payload.text).toContain("最终动作：🔔 只通知");
    expect(disableBody.data.telegram.payload.text).toContain("范围：🌐 全部账号");
    expect(disableRaw).not.toContain("plain-token");
    expect(disableRaw).not.toContain("rules_json");
    expect(db.policies[0].enabled).toBe(0);

    const enable = await worker.fetch(telegramRequest(callbackUpdate("admin_presence:policy:enable:2")), env as never);
    const enableBody = await enable.json() as { data: { telegram: { payload: { text: string } } } };
    expect(enableBody.data.telegram.payload.text).toContain("保活策略已启用");
    expect(enableBody.data.telegram.payload.text).toContain("最终动作：⚠️ 关闭全部服务器");
    expect(db.policies[1].enabled).toBe(1);

    expect(db.auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "admin_presence.policy.disable", target_id: "1", source: "telegram" }),
      expect.objectContaining({ action: "admin_presence.policy.enable", target_id: "2", source: "telegram" })
    ]));
  });

  it("creates, lists, enables, disables, and deletes all-scope admin presence policies with action validation and risk-level audit logs", async () => {
    const db = new FakeD1Database();
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    const invalidScope = await worker.fetch(apiRequest("/api/v1/admin-presence/policies", { method: "POST", body: JSON.stringify({ name: "bad scope", scope: "account", action: "notify" }) }), env as never);
    expect(invalidScope.status).toBe(400);
    expect(await invalidScope.text()).toContain("VALIDATION_ERROR");

    const invalidAction = await worker.fetch(apiRequest("/api/v1/admin-presence/policies", { method: "POST", body: JSON.stringify({ name: "bad action", scope: "all", action: "archive" }) }), env as never);
    expect(invalidAction.status).toBe(400);
    expect(await invalidAction.text()).toContain("VALIDATION_ERROR");

    const invalidTime = await worker.fetch(apiRequest("/api/v1/admin-presence/policies", { method: "POST", body: JSON.stringify({ name: "bad time", scope: "all", action: "shutdown_all_instances", remind_after_minutes: 1440, final_after_minutes: 720 }) }), env as never);
    expect(invalidTime.status).toBe(400);
    expect(await invalidTime.text()).toContain("VALIDATION_ERROR");

    const createNotify = await worker.fetch(apiRequest("/api/v1/admin-presence/policies", { method: "POST", body: JSON.stringify({ name: "notify after 7 days", scope: "all", action: "notify", enabled: true, remind_after_minutes: 720, final_after_minutes: 1440 }) }), env as never);
    const notifyBody = await createNotify.json() as { data: { policy: AdminPresencePolicyRecord & { action: string; remind_after_minutes: number; final_after_minutes: number; rules: Array<{ action: string; after_minutes: number }> } }; error?: { code: string; message: string } };
    expect(createNotify.status, JSON.stringify(notifyBody)).toBe(200);
    expect(notifyBody.data.policy).toMatchObject({ id: 1, name: "notify after 7 days", enabled: 1, scope: "all", action: "notify", remind_after_minutes: 720, final_after_minutes: 720 });
    expect(notifyBody.data.policy.rules).toEqual([{ rule_id: "notify", after_minutes: 720, action: "notify" }]);

    const createDelete = await worker.fetch(apiRequest("/api/v1/admin-presence/policies", { method: "POST", body: JSON.stringify({ name: "delete stale servers", scope: "all", action: "delete_all_instances", remind_after_minutes: 720, final_after_minutes: 1440 }) }), env as never);
    const deleteBody = await createDelete.json() as { data: { policy: { rules: Array<{ action: string; after_minutes: number }>; final_after_minutes: number } } };
    expect(createDelete.status).toBe(200);
    expect(deleteBody.data.policy.rules).toEqual([
      { rule_id: "notify", after_minutes: 720, action: "notify" },
      { rule_id: "delete_all_instances", after_minutes: 1440, action: "delete_all_instances" }
    ]);

    const listResponse = await worker.fetch(apiRequest("/api/v1/admin-presence/policies?limit=10&offset=0"), env as never);
    const listBody = await listResponse.json() as { data: { policies: Array<AdminPresencePolicyRecord & { action: string }>; limit: number; offset: number } };
    const raw = JSON.stringify(listBody);
    expect(listResponse.status).toBe(200);
    expect(listBody.data.limit).toBe(10);
    expect(listBody.data.offset).toBe(0);
    expect(listBody.data.policies.map((policy) => policy.action)).toEqual(expect.arrayContaining(["notify", "delete_all_instances"]));

    const detailResponse = await worker.fetch(apiRequest("/api/v1/admin-presence/policies/2"), env as never);
    const detailBody = await detailResponse.json() as { data: { policy: { id: number; action: string; rules_json?: unknown } } };
    expect(detailResponse.status).toBe(200);
    expect(detailBody.data.policy).toMatchObject({ id: 2, action: "delete_all_instances" });
    expect(detailBody.data.policy.rules_json).toBeUndefined();

    const disable = await worker.fetch(apiRequest("/api/v1/admin-presence/policies/1/disable", { method: "POST" }), env as never);
    expect(disable.status).toBe(200);
    expect(db.policies[0].enabled).toBe(0);

    const enable = await worker.fetch(apiRequest("/api/v1/admin-presence/policies/1/enable", { method: "POST" }), env as never);
    expect(enable.status).toBe(200);
    expect(db.policies[0].enabled).toBe(1);

    const remove = await worker.fetch(apiRequest("/api/v1/admin-presence/policies/1", { method: "DELETE" }), env as never);
    expect(remove.status).toBe(200);
    expect(db.policies[0].deleted_at).toEqual(expect.any(String));

    const update = await worker.fetch(apiRequest("/api/v1/admin-presence/policies/2", { method: "PATCH", body: JSON.stringify({ name: "delete stale group", scope: "group", group_id: 1, remind_after_minutes: 1440, final_after_minutes: 4320 }) }), env as never);
    const updateBody = await update.json() as { data: { policy: { name: string; scope: string; remind_after_minutes: number; final_after_minutes: number; rules_json?: unknown } } };
    expect(update.status).toBe(200);
    expect(updateBody.data.policy).toMatchObject({ name: "delete stale group", scope: "group:1", remind_after_minutes: 1440, final_after_minutes: 4320 });
    expect(updateBody.data.policy.rules_json).toBeUndefined();

    expect(db.auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "admin_presence.policy.create", target_type: "admin_presence_policy", target_id: "1", risk_level: "medium", result: "success" }),
      expect.objectContaining({ action: "admin_presence.policy.create", target_type: "admin_presence_policy", target_id: "2", risk_level: "critical", result: "success" }),
      expect.objectContaining({ action: "admin_presence.policy.disable", target_type: "admin_presence_policy", target_id: "1", risk_level: "medium", result: "success" }),
      expect.objectContaining({ action: "admin_presence.policy.enable", target_type: "admin_presence_policy", target_id: "1", risk_level: "medium", result: "success" }),
      expect.objectContaining({ action: "admin_presence.policy.delete", target_type: "admin_presence_policy", target_id: "1", risk_level: "medium", result: "success" }),
      expect.objectContaining({ action: "admin_presence.policy.update", target_type: "admin_presence_policy", target_id: "2", risk_level: "critical", result: "success" })
    ]));
    expect(raw).not.toContain("encrypted_token");
    expect(raw).not.toContain("plain-token");
  });

  it("exposes Telegram admin presence menu, manual checkin, and policy list callbacks through Service Layer", async () => {
    const db = new FakeD1Database();
    db.presence = { id: 1, last_checkin_at: "2026-01-01T00:00:00.000Z", last_checkin_actor: "api:default", current_cycle_id: "presence_cycle_old", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" };
    db.policies.push({ id: 1, name: "notify after 7 days", enabled: 1, scope: "all", rules_json: JSON.stringify({ action: "notify" }), created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", deleted_at: null });
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    const menuResponse = await worker.fetch(telegramRequest(callbackUpdate("menu:admin_presence")), env as never);
    const menuBody = await menuResponse.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    const menuKeyboard = menuBody.data.telegram.payload.reply_markup.inline_keyboard.flat();
    expect(menuResponse.status).toBe(200);
    expect(menuBody.data.telegram.payload.text).toContain("❤️ 保活风控");
    expect(menuBody.data.telegram.payload.text).toContain("最近打卡：2026-01-01T00:00:00.000Z");
    expect(menuBody.data.telegram.payload.text).not.toContain("current_cycle_id");
    expect(menuBody.data.telegram.payload.text).toContain("状态：✅ 开启");
    expect(menuKeyboard).toEqual(expect.arrayContaining([
      { text: "✅ 立即打卡", callback_data: "admin_presence:checkin" },
      { text: "⏰ 设置提醒时间", callback_data: "admin_presence:global:warn" },
      { text: "⏳ 设置最终时间", callback_data: "admin_presence:global:final" },
      { text: "🛡 设置最终动作", callback_data: "admin_presence:global:action" },
      { text: "🎯 设置范围", callback_data: "admin_presence:global:scope" }
    ]));

    const policiesResponse = await worker.fetch(telegramRequest(callbackUpdate("admin_presence:policies")), env as never);
    const policiesBody = await policiesResponse.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(policiesBody.data.telegram.payload.text).toContain("🛡 保活策略设置");
    expect(policiesBody.data.telegram.payload.text).toContain("notify after 7 days");
    expect(policiesBody.data.telegram.payload.text).toContain("最终动作：🔔 只通知");
    expect(policiesBody.data.telegram.payload.text).toContain("范围：🌐 全部账号");
    expect(policiesBody.data.telegram.payload.text).not.toContain("action：notify");
    expect(policiesBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "📋 #1 详情/修改", callback_data: "admin_presence:policy:detail:1" },
      { text: "⏸ #1 停用", callback_data: "admin_presence:policy:disable:1" },
      { text: "🗑 #1 删除", callback_data: "admin_presence:policy:delete_confirm:1" }
    ]));

    const detailResponse = await worker.fetch(telegramRequest(callbackUpdate("admin_presence:policy:detail:1")), env as never);
    const detailBody = await detailResponse.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(detailBody.data.telegram.payload.text).toContain("保活策略详情");
    expect(detailBody.data.telegram.payload.text).toContain("创建时间：");
    expect(detailBody.data.telegram.payload.text).toContain("更新时间：");
    expect(detailBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "⏸ 停用", callback_data: "admin_presence:policy:disable:1" },
      { text: "✏️ 修改策略", callback_data: "admin_presence:policy:edit:1" },
      { text: "🗑 删除", callback_data: "admin_presence:policy:delete_confirm:1" }
    ]));

    const editResponse = await worker.fetch(telegramRequest(callbackUpdate("admin_presence:policy:edit:1")), env as never);
    const editBody = await editResponse.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(editBody.data.telegram.payload.text).toContain("修改保活策略");
    expect(editBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "修改名称", callback_data: "admin_presence:policy:edit_name:1" },
      { text: "修改最终动作", callback_data: "admin_presence:policy:edit_action:1" },
      { text: "修改作用范围", callback_data: "admin_presence:policy:edit_scope:1" },
      { text: "修改提醒时间", callback_data: "admin_presence:policy:edit_remind:1" }
    ]));

    const editName = await worker.fetch(telegramRequest(callbackUpdate("admin_presence:policy:edit_name:1")), env as never);
    const editNameBody = await editName.json() as { data: { telegram: { payload: { text: string } } } };
    expect(editNameBody.data.telegram.payload.text).toContain("请输入新的策略名称");
    expect(db.botSessions.at(-1)?.state).toBe("editing_admin_presence_policy_name");

    const renamed = await worker.fetch(telegramRequest(messageUpdate("新的保活名称")), env as never);
    const renamedBody = await renamed.json() as { data: { telegram: { payload: { text: string } } } };
    expect(renamedBody.data.telegram.payload.text).toContain("保活策略已更新");
    expect(renamedBody.data.telegram.payload.text).toContain("新的保活名称");
    expect(db.policies[0].name).toBe("新的保活名称");

    const editAction = await worker.fetch(telegramRequest(callbackUpdate("ap:ea:1:s")), env as never);
    const editActionBody = await editAction.json() as { data: { telegram: { payload: { text: string } } } };
    expect(editActionBody.data.telegram.payload.text).toContain("保活策略已更新");
    expect(editActionBody.data.telegram.payload.text).toContain("最终动作：⚠️ 关闭全部服务器");
    expect(JSON.parse(db.policies[0].rules_json).rules).toEqual([
      { rule_id: "notify", after_minutes: 720, action: "notify" },
      { rule_id: "shutdown_all_instances", after_minutes: 1440, action: "shutdown_all_instances" }
    ]);

    const editScope = await worker.fetch(telegramRequest(callbackUpdate("ap:es:1:g")), env as never);
    const editScopeBody = await editScope.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(editScopeBody.data.telegram.payload.text).toContain("范围：分组");
    expect(editScopeBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([{ text: "未分组", callback_data: "ap:eg:1:1" }]));

    const editGroup = await worker.fetch(telegramRequest(callbackUpdate("ap:eg:1:1")), env as never);
    const editGroupBody = await editGroup.json() as { data: { telegram: { payload: { text: string } } } };
    expect(editGroupBody.data.telegram.payload.text).toContain("范围：📁 分组 #1");
    expect(db.policies[0].scope).toBe("group:1");

    const editRemind = await worker.fetch(telegramRequest(callbackUpdate("ap:et:1:r:720")), env as never);
    const editRemindBody = await editRemind.json() as { data: { telegram: { payload: { text: string } } } };
    expect(editRemindBody.data.telegram.payload.text).toContain("提醒时间：12 小时后");

    const editFinal = await worker.fetch(telegramRequest(callbackUpdate("ap:et:1:f:1440")), env as never);
    const editFinalBody = await editFinal.json() as { data: { telegram: { payload: { text: string } } } };
    expect(editFinalBody.data.telegram.payload.text).toContain("最终动作时间：1 天后");
    expect(db.auditLogs).toEqual(expect.arrayContaining([expect.objectContaining({ action: "admin_presence.policy.update", source: "telegram", target_id: "1" })]));

    db.telegramMessages.push(
      { id: 101, chat_id: "123456789", message_id: "501", purpose: "admin_presence_reminder", delete_status: "pending", attempts: 0, last_error_code: null, created_at: "2026-01-01T10:00:00.000Z", deleted_at: null, metadata_json: null },
      { id: 102, chat_id: "123456789", message_id: "502", purpose: "admin_presence_reminder", delete_status: "pending", attempts: 0, last_error_code: null, created_at: "2026-01-01T11:00:00.000Z", deleted_at: null, metadata_json: null },
      { id: 103, chat_id: "123456789", message_id: "501", purpose: "auto_delete", delete_status: "pending", attempts: 0, last_error_code: null, created_at: "2026-01-01T10:00:00.000Z", deleted_at: null, metadata_json: null },
      { id: 104, chat_id: "123456789", message_id: "502", purpose: "auto_delete", delete_status: "pending", attempts: 0, last_error_code: null, created_at: "2026-01-01T11:00:00.000Z", deleted_at: null, metadata_json: null }
    );

    const checkinResponse = await worker.fetch(telegramRequest(callbackUpdate("admin_presence:checkin", 501)), env as never);
    const checkinBody = await checkinResponse.json() as { data: { telegram: { payload: { text: string; reply_markup?: unknown } } } };
    const raw = JSON.stringify(checkinBody);
    expect(checkinBody.data.telegram.payload.text).toContain("✅ 已打卡，保活周期已刷新");
    expect(checkinBody.data.telegram.payload.text).toContain("本轮提醒：已清理 2 条");
    expect(checkinBody.data.telegram.payload.text).toContain("最近打卡：");
    expect(checkinBody.data.telegram.payload.text).not.toContain("current_cycle_id");
    expect(checkinBody.data.telegram.payload.reply_markup).toMatchObject({ inline_keyboard: expect.any(Array) });
    expect(JSON.stringify(checkinBody.data.telegram.payload.reply_markup)).toContain("查看保活状态");
    expect(db.auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "admin_presence.checkin", actor: "telegram:123456789", source: "telegram", result: "success" })
    ]));
    expect(db.telegramMessages.find((message) => message.id === 101)).toMatchObject({ delete_status: "deleted", attempts: 1 });
    expect(db.telegramMessages.find((message) => message.id === 102)).toMatchObject({ delete_status: "deleted", attempts: 1 });
    expect(db.telegramMessages.find((message) => message.id === 103)).toMatchObject({ delete_status: "deleted", attempts: 1 });
    expect(db.telegramMessages.find((message) => message.id === 104)).toMatchObject({ delete_status: "deleted", attempts: 1 });
    expect(db.telegramMessages.filter((message) => message.purpose === "auto_delete" && message.message_id === "501")).toHaveLength(1);
    expect(raw).not.toContain("encrypted_token");
  });



  it("creates admin presence policies from Telegram with reminder and final-time selection, while delete-all only shows a warning", async () => {
    const db = new FakeD1Database();
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    const createMenu = await worker.fetch(telegramRequest(callbackUpdate("admin_presence:policy:create")), env as never);
    const createMenuBody = await createMenu.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(createMenuBody.data.telegram.payload.text).toContain("保活策略是两段式");
    expect(createMenuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "12 小时后提醒", callback_data: "ap:cr:p:a:720" },
      { text: "18 小时后提醒", callback_data: "ap:cr:p:a:1080" }
    ]));
    expect(createMenuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toContainEqual({ text: "自定义提醒时间", callback_data: "ap:cth:r:p:a" });
    expect(collectCallbackData(createMenuBody.data.telegram.payload.reply_markup).every((value) => Buffer.byteLength(value) <= 64)).toBe(true);

    const customHour = await worker.fetch(telegramRequest(callbackUpdate("ap:cth:r:p:a")), env as never);
    const customHourBody = await customHour.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(customHourBody.data.telegram.payload.text).toContain("请选择小时");
    expect(customHourBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toContainEqual({ text: "0 小时", callback_data: "ap:ctm:r:p:a:0" });
    const customMinute = await worker.fetch(telegramRequest(callbackUpdate("ap:ctm:r:p:a:0")), env as never);
    const customMinuteBody = await customMinute.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(customMinuteBody.data.telegram.payload.text).toContain("请选择分钟");
    expect(customMinuteBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).not.toContainEqual({ text: "00", callback_data: "ap:ct:r:p:a:0:0" });
    expect(customMinuteBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toContainEqual({ text: "35", callback_data: "ap:ct:r:p:a:0:35" });
    expect(customMinuteBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toContainEqual({ text: "返回选小时", callback_data: "ap:cth:r:p:a" });
    const customActionPicker = await worker.fetch(telegramRequest(callbackUpdate("ap:ct:r:p:a:0:35")), env as never);
    const customActionPickerBody = await customActionPicker.json() as { data: { telegram: { payload: { text: string } } } };
    expect(customActionPickerBody.data.telegram.payload.text).toContain("第一段通知：35 分钟后");

    const actionPicker = await worker.fetch(telegramRequest(callbackUpdate("ap:cr:p:a:720")), env as never);
    const actionPickerBody = await actionPicker.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(actionPickerBody.data.telegram.payload.text).toContain("第一段通知：12 小时后");
    expect(actionPickerBody.data.telegram.payload.text).toContain("请选择第二段最终动作");
    expect(actionPickerBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "只通知", callback_data: "ap:ca:720:n" },
      { text: "关闭全部服务器", callback_data: "ap:ca:720:s" },
      { text: "删除全部服务器", callback_data: "ap:ca:720:d" }
    ]));
    expect(collectCallbackData(actionPickerBody.data.telegram.payload.reply_markup).every((value) => Buffer.byteLength(value) <= 64)).toBe(true);

    const remindAction = await worker.fetch(telegramRequest(callbackUpdate("ap:ca:720:n")), env as never);
    const remindActionBody = await remindAction.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(remindActionBody.data.telegram.payload.text).toContain("请输入策略名称");
    expect(remindActionBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toContainEqual({ text: "取消创建", callback_data: "admin_presence:policies" });
    expect(db.botSessions.at(-1)?.state).toBe("creating_admin_presence_policy_name");

    const notifyName = await worker.fetch(telegramRequest(messageUpdate("7天未打卡提醒")), env as never);
    const notifyNameBody = await notifyName.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(notifyNameBody.data.telegram.payload.text).toContain("保活策略已创建");
    expect(notifyNameBody.data.telegram.payload.text).toContain("范围：🌐 全部账号");
    expect(notifyNameBody.data.telegram.payload.text).toContain("提醒时间：12 小时后");
    expect(notifyNameBody.data.telegram.payload.text).toContain("最终动作：无");
    expect(notifyNameBody.data.telegram.payload.text).toContain("最终动作：🔔 只通知");
    expect(db.policies[0]).toMatchObject({ name: "7天未打卡提醒", enabled: 1, scope: "all" });
    expect(JSON.parse(db.policies[0].rules_json)).toMatchObject({ rules: [{ action: "notify", after_minutes: 720 }] });

    const deleteAction = await worker.fetch(telegramRequest(callbackUpdate("ap:ca:720:d")), env as never);
    const deleteActionBody = await deleteAction.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(deleteActionBody.data.telegram.payload.text).toContain("高危保活策略提醒");
    expect(deleteActionBody.data.telegram.payload.text).toContain("请选择作用范围");
    expect(deleteActionBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([{ text: "全部账号", callback_data: "ap:cs:720:d:a" }]));
    expect(collectCallbackData(deleteActionBody.data.telegram.payload.reply_markup).every((value) => Buffer.byteLength(value) <= 64)).toBe(true);
    expect(db.botSessions.at(-1)?.state).toBe("creating_admin_presence_policy_scope");

    const deleteScope = await worker.fetch(telegramRequest(callbackUpdate("ap:cs:720:d:a")), env as never);
    const deleteScopeBody = await deleteScope.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(deleteScopeBody.data.telegram.payload.text).toContain("请选择第二段最终动作时间");
    expect(deleteScopeBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toContainEqual({ text: "24 小时后", callback_data: "ap:cf:d:a:720:1440" });
    expect(deleteScopeBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toContainEqual({ text: "自定义最终动作时间", callback_data: "ap:cth:f:d:a:720" });

    const finalHour = await worker.fetch(telegramRequest(callbackUpdate("ap:cth:f:d:a:720")), env as never);
    const finalHourBody = await finalHour.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(finalHourBody.data.telegram.payload.text).toContain("范围：0-24 小时");
    expect(finalHourBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toContainEqual({ text: "24 小时", callback_data: "ap:ctm:f:d:a:720:24" });
    const finalMinute = await worker.fetch(telegramRequest(callbackUpdate("ap:ctm:f:d:a:720:12")), env as never);
    const finalMinuteBody = await finalMinute.json() as { data: { telegram: { payload: { reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(finalMinuteBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).not.toContainEqual({ text: "00", callback_data: "ap:ct:f:d:a:720:12:0" });
    expect(finalMinuteBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toContainEqual({ text: "05", callback_data: "ap:ct:f:d:a:720:12:5" });
    expect(finalMinuteBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toContainEqual({ text: "返回选小时", callback_data: "ap:cth:f:d:a:720" });
    const final24Minute = await worker.fetch(telegramRequest(callbackUpdate("ap:ctm:f:d:a:720:24")), env as never);
    const final24MinuteBody = await final24Minute.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(final24MinuteBody.data.telegram.payload.text).toContain("分钟固定为 00");
    expect(final24MinuteBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toContainEqual({ text: "00", callback_data: "ap:ct:f:d:a:720:24:0" });
    expect(final24MinuteBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).not.toContainEqual({ text: "05", callback_data: "ap:ct:f:d:a:720:24:5" });
    const customFinal = await worker.fetch(telegramRequest(callbackUpdate("ap:ct:f:d:a:720:12:5")), env as never);
    const customFinalBody = await customFinal.json() as { data: { telegram: { payload: { text: string } } } };
    expect(customFinalBody.data.telegram.payload.text).toContain("最终动作时间：12 小时5 分钟后");

    const deleteFinal = await worker.fetch(telegramRequest(callbackUpdate("ap:cf:d:a:720:1440")), env as never);
    const deleteFinalBody = await deleteFinal.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(deleteFinalBody.data.telegram.payload.text).toContain("是否在最终动作前开启每小时打卡提醒");
    expect(deleteFinalBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "不重复提醒", callback_data: "ap:ch:d:a:720:1440:0" },
      { text: "最终前 6 小时", callback_data: "ap:ch:d:a:720:1440:360" }
    ]));
    expect(collectCallbackData(deleteFinalBody.data.telegram.payload.reply_markup).every((value) => Buffer.byteLength(value) <= 64)).toBe(true);

    const hourlyReminder = await worker.fetch(telegramRequest(callbackUpdate("ap:ch:d:a:720:1440:360")), env as never);
    const hourlyReminderBody = await hourlyReminder.json() as { data: { telegram: { payload: { text: string } } } };
    expect(hourlyReminderBody.data.telegram.payload.text).toContain("请输入策略名称");
    expect(hourlyReminderBody.data.telegram.payload.text).toContain("最终动作前每小时提醒");

    const deleteName = await worker.fetch(telegramRequest(messageUpdate("24小时未打卡删机")), env as never);
    const deleteNameBody = await deleteName.json() as { data: { telegram: { payload: { text: string } } } };
    expect(deleteNameBody.data.telegram.payload.text).toContain("保活策略已创建");
    expect(deleteNameBody.data.telegram.payload.text).toContain("范围：🌐 全部账号");
    expect(deleteNameBody.data.telegram.payload.text).toContain("提醒时间：12 小时后");
    expect(deleteNameBody.data.telegram.payload.text).toContain("最终动作时间：1 天后");
    expect(deleteNameBody.data.telegram.payload.text).toContain("最终动作前每小时提醒：提前 6 小时");
    expect(deleteNameBody.data.telegram.payload.text).toContain("最终动作：🚨 删除全部服务器");
    const deleteRules = JSON.parse(db.policies[1].rules_json).rules as Array<{ action: string; after_minutes: number }>;
    expect(deleteRules).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "notify", after_minutes: 720 }),
      expect.objectContaining({ action: "notify", after_minutes: 1080 }),
      expect.objectContaining({ action: "notify", after_minutes: 1140 }),
      expect.objectContaining({ action: "notify", after_minutes: 1200 }),
      expect.objectContaining({ action: "notify", after_minutes: 1260 }),
      expect.objectContaining({ action: "notify", after_minutes: 1320 }),
      expect.objectContaining({ action: "notify", after_minutes: 1380 }),
      expect.objectContaining({ action: "delete_all_instances", after_minutes: 1440 })
    ]));
    expect(db.auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "admin_presence.policy.create", target_id: "1", risk_level: "medium", source: "telegram" }),
      expect.objectContaining({ action: "admin_presence.policy.create", target_id: "2", risk_level: "critical", source: "telegram" })
    ]));
    expect(JSON.stringify(deleteNameBody)).not.toContain("rules_json");
  });

  it("documents admin presence APIs and Telegram flow while excluding Web UI, multi-admin, OAuth, and single-instance/tag scopes", async () => {
    const apiDoc = await import("node:fs/promises").then((fs) => fs.readFile("docs/api.md", "utf8"));
    const telegramDoc = await import("node:fs/promises").then((fs) => fs.readFile("docs/telegram.md", "utf8"));

    expect(apiDoc).toContain("GET /api/v1/admin-presence/status");
    expect(apiDoc).toContain("POST /api/v1/admin-presence/checkin");
    expect(apiDoc).toContain("GET /api/v1/admin-presence/policies");
    expect(apiDoc).toContain("GET /api/v1/admin-presence/policies/:policy_id");
    expect(apiDoc).toContain("DELETE /api/v1/admin-presence/policies/:policy_id");
    expect(apiDoc).toContain("scope=all");
    expect(apiDoc).toContain("scope=account");
    expect(apiDoc).toContain("scope=group");
    expect(apiDoc).toContain("notify");
    expect(apiDoc).toContain("shutdown_all_instances");
    expect(apiDoc).toContain("delete_all_instances");
    expect(apiDoc).toContain("不会返回 token 明文或 encrypted_token");
    expect(telegramDoc).toContain("callback: menu:admin_presence");
    expect(telegramDoc).toContain("admin_presence:checkin");
    expect(telegramDoc).toContain("admin_presence:policies");
    expect(telegramDoc).toContain("admin_presence:policy:enable");
    expect(telegramDoc).toContain("admin_presence:policy:disable");
    expect(telegramDoc).toContain("admin_presence:policy:create_action:delete_all_instances");
    expect(telegramDoc).toContain("不会要求第二次文本确认");
    expect(telegramDoc).toContain("Cloudflare Cron 会通过 Job Runner 执行到期策略");
    expect(telegramDoc).toContain("按策略范围调用批量操作路径");
    expect(telegramDoc).toContain("account:<account_id>");
    expect(telegramDoc).toContain("group:<group_id>");
    expect(telegramDoc).toContain("不支持单台实例范围");
    expect(telegramDoc).not.toContain("打卡存活");
  });
});
