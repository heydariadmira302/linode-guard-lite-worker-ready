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
  nextPolicyId = 1;
  prepare(sql: string) { return new FakePreparedStatement(this, sql); }

  first<T>(sql: string, values: unknown[] = []): T | null {
    if (sql.includes("FROM admin_presence")) return this.presence as T | null;
    if (sql.includes("FROM admin_presence_policies") && sql.includes("WHERE id = ?")) {
      return (this.policies.find((policy) => policy.id === Number(values[0]) && policy.deleted_at === null) as T | undefined) ?? null;
    }
    if (sql.includes("COUNT") && sql.includes("FROM admin_presence_policies") && sql.includes("enabled = 1")) {
      return { count: this.policies.filter((policy) => policy.deleted_at === null && policy.enabled === 1).length } as T;
    }
    return null;
  }

  all<T>(sql: string, values: unknown[] = []): T[] {
    if (sql.includes("FROM admin_presence_policies")) {
      const limit = Number(values[values.length - 2]);
      const offset = Number(values[values.length - 1]);
      return this.policies.filter((policy) => policy.deleted_at === null).sort((a, b) => b.id - a.id).slice(offset, offset + limit) as T[];
    }
    return [];
  }

  run(sql: string, values: unknown[]) {
    const now = new Date().toISOString();
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

  it("creates, lists, enables, disables, and deletes all-scope admin presence policies with action validation and risk-level audit logs", async () => {
    const db = new FakeD1Database();
    const env = { ...baseEnv, DB: db as unknown as D1Database };

    const invalidScope = await worker.fetch(apiRequest("/api/v1/admin-presence/policies", { method: "POST", body: JSON.stringify({ name: "bad scope", scope: "account", action: "notify" }) }), env as never);
    expect(invalidScope.status).toBe(400);
    expect(await invalidScope.text()).toContain("VALIDATION_ERROR");

    const invalidAction = await worker.fetch(apiRequest("/api/v1/admin-presence/policies", { method: "POST", body: JSON.stringify({ name: "bad action", scope: "all", action: "archive" }) }), env as never);
    expect(invalidAction.status).toBe(400);
    expect(await invalidAction.text()).toContain("VALIDATION_ERROR");

    const createNotify = await worker.fetch(apiRequest("/api/v1/admin-presence/policies", { method: "POST", body: JSON.stringify({ name: "notify after 7 days", scope: "all", action: "notify", enabled: true }) }), env as never);
    const notifyBody = await createNotify.json() as { data: { policy: AdminPresencePolicyRecord & { action: string; rules: { action: string } } }; error?: { code: string; message: string } };
    expect(createNotify.status, JSON.stringify(notifyBody)).toBe(200);
    expect(notifyBody.data.policy).toMatchObject({ id: 1, name: "notify after 7 days", enabled: 1, scope: "all", action: "notify" });

    const createDelete = await worker.fetch(apiRequest("/api/v1/admin-presence/policies", { method: "POST", body: JSON.stringify({ name: "delete stale servers", scope: "all", action: "delete_all_instances" }) }), env as never);
    expect(createDelete.status).toBe(200);

    const listResponse = await worker.fetch(apiRequest("/api/v1/admin-presence/policies?limit=10&offset=0"), env as never);
    const listBody = await listResponse.json() as { data: { policies: Array<AdminPresencePolicyRecord & { action: string }>; limit: number; offset: number } };
    const raw = JSON.stringify(listBody);
    expect(listResponse.status).toBe(200);
    expect(listBody.data.limit).toBe(10);
    expect(listBody.data.offset).toBe(0);
    expect(listBody.data.policies.map((policy) => policy.action)).toEqual(expect.arrayContaining(["notify", "delete_all_instances"]));

    const disable = await worker.fetch(apiRequest("/api/v1/admin-presence/policies/1/disable", { method: "POST" }), env as never);
    expect(disable.status).toBe(200);
    expect(db.policies[0].enabled).toBe(0);

    const enable = await worker.fetch(apiRequest("/api/v1/admin-presence/policies/1/enable", { method: "POST" }), env as never);
    expect(enable.status).toBe(200);
    expect(db.policies[0].enabled).toBe(1);

    const remove = await worker.fetch(apiRequest("/api/v1/admin-presence/policies/1", { method: "DELETE" }), env as never);
    expect(remove.status).toBe(200);
    expect(db.policies[0].deleted_at).toEqual(expect.any(String));

    expect(db.auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "admin_presence.policy.create", target_type: "admin_presence_policy", target_id: "1", risk_level: "medium", result: "success" }),
      expect.objectContaining({ action: "admin_presence.policy.create", target_type: "admin_presence_policy", target_id: "2", risk_level: "critical", result: "success" }),
      expect.objectContaining({ action: "admin_presence.policy.disable", target_type: "admin_presence_policy", target_id: "1", risk_level: "medium", result: "success" }),
      expect.objectContaining({ action: "admin_presence.policy.enable", target_type: "admin_presence_policy", target_id: "1", risk_level: "medium", result: "success" }),
      expect.objectContaining({ action: "admin_presence.policy.delete", target_type: "admin_presence_policy", target_id: "1", risk_level: "medium", result: "success" })
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
    expect(menuBody.data.telegram.payload.text).toContain("管理员保活确认");
    expect(menuBody.data.telegram.payload.text).toContain("最近确认时间：2026-01-01T00:00:00.000Z");
    expect(menuBody.data.telegram.payload.text).toContain("current_cycle_id：presence_cycle_old");
    expect(menuBody.data.telegram.payload.text).toContain("启用策略组数量：1");
    expect(menuKeyboard).toEqual(expect.arrayContaining([
      { text: "手动确认", callback_data: "admin_presence:checkin" },
      { text: "查看策略组", callback_data: "admin_presence:policies" }
    ]));

    const policiesResponse = await worker.fetch(telegramRequest(callbackUpdate("admin_presence:policies")), env as never);
    const policiesBody = await policiesResponse.json() as { data: { telegram: { payload: { text: string } } } };
    expect(policiesBody.data.telegram.payload.text).toContain("保活确认策略组");
    expect(policiesBody.data.telegram.payload.text).toContain("notify after 7 days");
    expect(policiesBody.data.telegram.payload.text).toContain("notify");

    const checkinResponse = await worker.fetch(telegramRequest(callbackUpdate("admin_presence:checkin")), env as never);
    const checkinBody = await checkinResponse.json() as { data: { telegram: { payload: { text: string } } } };
    const raw = JSON.stringify(checkinBody);
    expect(checkinBody.data.telegram.payload.text).toContain("保活确认已更新");
    expect(checkinBody.data.telegram.payload.text).toContain("最近确认时间：");
    expect(checkinBody.data.telegram.payload.text).toContain("current_cycle_id：presence_cycle_");
    expect(db.auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "admin_presence.checkin", actor: "telegram:123456789", source: "telegram", result: "success" })
    ]));
    expect(raw).not.toContain("encrypted_token");
  });

  it("documents admin presence APIs and Telegram flow while excluding Cron, Job Runner, Web UI, multi-admin, OAuth, and complex scopes", async () => {
    const apiDoc = await import("node:fs/promises").then((fs) => fs.readFile("docs/api.md", "utf8"));
    const telegramDoc = await import("node:fs/promises").then((fs) => fs.readFile("docs/telegram.md", "utf8"));

    expect(apiDoc).toContain("GET /api/v1/admin-presence/status");
    expect(apiDoc).toContain("POST /api/v1/admin-presence/checkin");
    expect(apiDoc).toContain("GET /api/v1/admin-presence/policies");
    expect(apiDoc).toContain("DELETE /api/v1/admin-presence/policies/:policy_id");
    expect(apiDoc).toContain("scope = all");
    expect(apiDoc).toContain("notify");
    expect(apiDoc).toContain("shutdown_all_instances");
    expect(apiDoc).toContain("delete_all_instances");
    expect(apiDoc).toContain("不会返回 token 明文或 encrypted_token");
    expect(telegramDoc).toContain("callback: menu:admin_presence");
    expect(telegramDoc).toContain("admin_presence:checkin");
    expect(telegramDoc).toContain("admin_presence:policies");
    expect(telegramDoc).toContain("Cloudflare Cron 会通过 Job Runner 执行到期策略");
    expect(telegramDoc).toContain("会真正调用批量操作路径");
    expect(telegramDoc).toContain("不实现复杂作用范围");
    expect(telegramDoc).not.toContain("打卡存活");
  });
});
