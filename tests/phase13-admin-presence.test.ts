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
  accounts: AccountRecord[] = [{ id: 1, alias: "default", status: "active", group_id: 1 }];
  groups: GroupRecord[] = [{ id: 1, name: "未分组", is_default: 1, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", deleted_at: null }];
  nextPolicyId = 1;
  prepare(sql: string) { return new FakePreparedStatement(this, sql); }

  first<T>(sql: string, values: unknown[] = []): T | null {
    if (sql.includes("FROM admin_presence_policies") && sql.includes("WHERE id = ?")) {
      return (this.policies.find((policy) => policy.id === Number(values[0]) && policy.deleted_at === null) as T | undefined) ?? null;
    }
    if (sql.includes("FROM admin_presence")) return this.presence as T | null;
    if (sql.includes("FROM bot_sessions")) {
      return (this.botSessions.find((session) => session.telegram_user_id === String(values[0])) as T | undefined) ?? null;
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

function callbackUpdate(data: string) {
  return {
    update_id: 60,
    callback_query: {
      id: "cb_admin_presence",
      from: { id: 123456789 },
      message: { message_id: 11, chat: { id: 123456789 } },
      data
    }
  };
}

function messageUpdate(text: string) {
  return { update_id: 61, message: { message_id: 12, chat: { id: 123456789, type: "private" }, from: { id: 123456789, is_bot: false, first_name: "Admin" }, text } };
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
    expect(disableBody.data.telegram.payload.text).toContain("最终动作：只通知");
    expect(disableBody.data.telegram.payload.text).toContain("范围：全部账号");
    expect(disableRaw).not.toContain("plain-token");
    expect(disableRaw).not.toContain("rules_json");
    expect(db.policies[0].enabled).toBe(0);

    const enable = await worker.fetch(telegramRequest(callbackUpdate("admin_presence:policy:enable:2")), env as never);
    const enableBody = await enable.json() as { data: { telegram: { payload: { text: string } } } };
    expect(enableBody.data.telegram.payload.text).toContain("保活策略已启用");
    expect(enableBody.data.telegram.payload.text).toContain("最终动作：关闭全部服务器");
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
    expect(menuBody.data.telegram.payload.text).toContain("❤️ 保活打卡");
    expect(menuBody.data.telegram.payload.text).toContain("最近确认时间：2026-01-01T00:00:00.000Z");
    expect(menuBody.data.telegram.payload.text).not.toContain("current_cycle_id");
    expect(menuBody.data.telegram.payload.text).toContain("启用策略组数量：1");
    expect(menuKeyboard).toEqual(expect.arrayContaining([
      { text: "❤️ 打卡", callback_data: "admin_presence:checkin" },
      { text: "查看策略组", callback_data: "admin_presence:policies" }
    ]));

    const policiesResponse = await worker.fetch(telegramRequest(callbackUpdate("admin_presence:policies")), env as never);
    const policiesBody = await policiesResponse.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(policiesBody.data.telegram.payload.text).toContain("保活策略组");
    expect(policiesBody.data.telegram.payload.text).toContain("notify after 7 days");
    expect(policiesBody.data.telegram.payload.text).toContain("最终动作：只通知");
    expect(policiesBody.data.telegram.payload.text).toContain("范围：全部账号");
    expect(policiesBody.data.telegram.payload.text).not.toContain("action：notify");
    expect(policiesBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "#1 详情", callback_data: "admin_presence:policy:detail:1" },
      { text: "#1 停用", callback_data: "admin_presence:policy:disable:1" },
      { text: "#1 删除", callback_data: "admin_presence:policy:delete_confirm:1" }
    ]));

    const detailResponse = await worker.fetch(telegramRequest(callbackUpdate("admin_presence:policy:detail:1")), env as never);
    const detailBody = await detailResponse.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(detailBody.data.telegram.payload.text).toContain("保活策略详情");
    expect(detailBody.data.telegram.payload.text).toContain("创建时间：");
    expect(detailBody.data.telegram.payload.text).toContain("更新时间：");
    expect(detailBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "停用", callback_data: "admin_presence:policy:disable:1" },
      { text: "编辑", callback_data: "admin_presence:policy:edit:1" },
      { text: "删除", callback_data: "admin_presence:policy:delete_confirm:1" }
    ]));

    const editResponse = await worker.fetch(telegramRequest(callbackUpdate("admin_presence:policy:edit:1")), env as never);
    const editBody = await editResponse.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(editBody.data.telegram.payload.text).toContain("编辑保活策略");
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

    const editAction = await worker.fetch(telegramRequest(callbackUpdate("admin_presence:policy:edit_action_to:1:shutdown_all_instances")), env as never);
    const editActionBody = await editAction.json() as { data: { telegram: { payload: { text: string } } } };
    expect(editActionBody.data.telegram.payload.text).toContain("保活策略已更新");
    expect(editActionBody.data.telegram.payload.text).toContain("最终动作：关闭全部服务器");
    expect(JSON.parse(db.policies[0].rules_json).rules).toEqual([
      { rule_id: "notify", after_minutes: 720, action: "notify" },
      { rule_id: "shutdown_all_instances", after_minutes: 1440, action: "shutdown_all_instances" }
    ]);

    const editScope = await worker.fetch(telegramRequest(callbackUpdate("admin_presence:policy:edit_scope_to:1:group")), env as never);
    const editScopeBody = await editScope.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(editScopeBody.data.telegram.payload.text).toContain("范围：分组");
    expect(editScopeBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([{ text: "未分组", callback_data: "admin_presence:policy:edit_group_to:1:1" }]));

    const editGroup = await worker.fetch(telegramRequest(callbackUpdate("admin_presence:policy:edit_group_to:1:1")), env as never);
    const editGroupBody = await editGroup.json() as { data: { telegram: { payload: { text: string } } } };
    expect(editGroupBody.data.telegram.payload.text).toContain("范围：分组 #1");
    expect(db.policies[0].scope).toBe("group:1");

    const editRemind = await worker.fetch(telegramRequest(callbackUpdate("admin_presence:policy:edit_remind_to:1:720")), env as never);
    const editRemindBody = await editRemind.json() as { data: { telegram: { payload: { text: string } } } };
    expect(editRemindBody.data.telegram.payload.text).toContain("提醒时间：12 小时后");

    const editFinal = await worker.fetch(telegramRequest(callbackUpdate("admin_presence:policy:edit_final_to:1:1440")), env as never);
    const editFinalBody = await editFinal.json() as { data: { telegram: { payload: { text: string } } } };
    expect(editFinalBody.data.telegram.payload.text).toContain("最终动作时间：1 天后");
    expect(db.auditLogs).toEqual(expect.arrayContaining([expect.objectContaining({ action: "admin_presence.policy.update", source: "telegram", target_id: "1" })]));

    const checkinResponse = await worker.fetch(telegramRequest(callbackUpdate("admin_presence:checkin")), env as never);
    const checkinBody = await checkinResponse.json() as { data: { telegram: { payload: { text: string; reply_markup?: unknown } } } };
    const raw = JSON.stringify(checkinBody);
    expect(checkinBody.data.telegram.payload.text).toContain("✅ 打卡成功");
    expect(checkinBody.data.telegram.payload.text).toContain("最近确认时间：");
    expect(checkinBody.data.telegram.payload.text).not.toContain("current_cycle_id");
    expect(checkinBody.data.telegram.payload.reply_markup).toBeUndefined();
    expect(db.auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "admin_presence.checkin", actor: "telegram:123456789", source: "telegram", result: "success" })
    ]));
    expect(raw).not.toContain("encrypted_token");
  });



  it("creates admin presence policies from Telegram with reminder and final-time selection, while delete-all only shows a warning", async () => {
    const db = new FakeD1Database();
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    const createMenu = await worker.fetch(telegramRequest(callbackUpdate("admin_presence:policy:create")), env as never);
    const createMenuBody = await createMenu.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(createMenuBody.data.telegram.payload.text).toContain("新增保活策略");
    expect(createMenuBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "只通知", callback_data: "admin_presence:policy:create_action:notify" },
      { text: "关闭全部服务器", callback_data: "admin_presence:policy:create_action:shutdown_all_instances" },
      { text: "删除全部服务器", callback_data: "admin_presence:policy:create_action:delete_all_instances" }
    ]));

    const notifyAction = await worker.fetch(telegramRequest(callbackUpdate("admin_presence:policy:create_action:notify")), env as never);
    const notifyActionBody = await notifyAction.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(notifyActionBody.data.telegram.payload.text).toContain("请选择作用范围");
    expect(notifyActionBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "全部账号", callback_data: "admin_presence:policy:create_scope:notify:all" },
      { text: "选择账号", callback_data: "admin_presence:policy:create_scope:notify:account" },
      { text: "选择分组", callback_data: "admin_presence:policy:create_scope:notify:group" }
    ]));

    const notifyScope = await worker.fetch(telegramRequest(callbackUpdate("admin_presence:policy:create_scope:notify:all")), env as never);
    const notifyScopeBody = await notifyScope.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(notifyScopeBody.data.telegram.payload.text).toContain("请选择提醒时间");
    expect(notifyScopeBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([{ text: "12 小时后提醒", callback_data: "admin_presence:policy:create_remind:notify:all:720" }]));

    const remindAction = await worker.fetch(telegramRequest(callbackUpdate("admin_presence:policy:create_remind:notify:all:720")), env as never);
    const remindActionBody = await remindAction.json() as { data: { telegram: { payload: { text: string } } } };
    expect(remindActionBody.data.telegram.payload.text).toContain("请输入策略名称");
    expect(db.botSessions.at(-1)?.state).toBe("creating_admin_presence_policy_name");

    const notifyName = await worker.fetch(telegramRequest(messageUpdate("7天未打卡提醒")), env as never);
    const notifyNameBody = await notifyName.json() as { data: { telegram: { payload: { text: string } } } };
    expect(notifyNameBody.data.telegram.payload.text).toContain("保活策略已创建");
    expect(notifyNameBody.data.telegram.payload.text).toContain("范围：全部账号");
    expect(notifyNameBody.data.telegram.payload.text).toContain("提醒时间：12 小时后");
    expect(notifyNameBody.data.telegram.payload.text).toContain("最终动作：无");
    expect(notifyNameBody.data.telegram.payload.text).toContain("最终动作：只通知");
    expect(db.policies[0]).toMatchObject({ name: "7天未打卡提醒", enabled: 1, scope: "all" });
    expect(JSON.parse(db.policies[0].rules_json)).toMatchObject({ rules: [{ action: "notify", after_minutes: 720 }] });

    const deleteAction = await worker.fetch(telegramRequest(callbackUpdate("admin_presence:policy:create_action:delete_all_instances")), env as never);
    const deleteActionBody = await deleteAction.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(deleteActionBody.data.telegram.payload.text).toContain("高危保活策略提醒");
    expect(deleteActionBody.data.telegram.payload.text).toContain("请选择作用范围");
    expect(deleteActionBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([{ text: "全部账号", callback_data: "admin_presence:policy:create_scope:delete_all_instances:all" }]));
    expect(db.botSessions.at(-1)?.state).toBe("creating_admin_presence_policy_scope");

    const deleteScope = await worker.fetch(telegramRequest(callbackUpdate("admin_presence:policy:create_scope:delete_all_instances:all")), env as never);
    const deleteScopeBody = await deleteScope.json() as { data: { telegram: { payload: { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } } } };
    expect(deleteScopeBody.data.telegram.payload.text).toContain("请选择提醒时间");
    expect(deleteScopeBody.data.telegram.payload.reply_markup.inline_keyboard.flat()).toEqual(expect.arrayContaining([{ text: "12 小时后提醒", callback_data: "admin_presence:policy:create_remind:delete_all_instances:all:720" }]));

    const deleteRemind = await worker.fetch(telegramRequest(callbackUpdate("admin_presence:policy:create_remind:delete_all_instances:all:720")), env as never);
    const deleteRemindBody = await deleteRemind.json() as { data: { telegram: { payload: { text: string } } } };
    expect(deleteRemindBody.data.telegram.payload.text).toContain("请选择最终动作时间");

    const deleteFinal = await worker.fetch(telegramRequest(callbackUpdate("admin_presence:policy:create_final:delete_all_instances:all:720:1440")), env as never);
    const deleteFinalBody = await deleteFinal.json() as { data: { telegram: { payload: { text: string } } } };
    expect(deleteFinalBody.data.telegram.payload.text).toContain("请输入策略名称");

    const deleteName = await worker.fetch(telegramRequest(messageUpdate("24小时未打卡删机")), env as never);
    const deleteNameBody = await deleteName.json() as { data: { telegram: { payload: { text: string } } } };
    expect(deleteNameBody.data.telegram.payload.text).toContain("保活策略已创建");
    expect(deleteNameBody.data.telegram.payload.text).toContain("范围：全部账号");
    expect(deleteNameBody.data.telegram.payload.text).toContain("提醒时间：12 小时后");
    expect(deleteNameBody.data.telegram.payload.text).toContain("最终动作时间：1 天后");
    expect(deleteNameBody.data.telegram.payload.text).toContain("最终动作：删除全部服务器");
    expect(JSON.parse(db.policies[1].rules_json)).toMatchObject({
      rules: [
        { action: "notify", after_minutes: 720 },
        { action: "delete_all_instances", after_minutes: 1440 }
      ]
    });
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
