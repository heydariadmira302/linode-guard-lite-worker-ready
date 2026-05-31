import { describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { computeNextRunAt } from "../src/services/schedule-service";
import { encryptLinodeToken } from "../src/crypto/token-crypto";

const baseEnv = { API_AUTH_TOKEN: "secret-api-token", TELEGRAM_WEBHOOK_SECRET: "telegram-secret", SUPER_ADMIN_TELEGRAM_ID: "123456789", TELEGRAM_BOT_TOKEN: "bot-token", LINODE_TOKEN_ENCRYPTION_KEY: "encryption-key", APP_TIMEZONE: "Asia/Shanghai", BATCH_CONCURRENCY: "5", OPERATION_LOG_RETENTION_DAYS: "1", LOGIN_EVENT_RETENTION_DAYS: "1" };

type Account = { id: number; alias: string; encrypted_token: string; token_fingerprint: string; token_status: string; status: string; created_at: string; updated_at: string; deleted_at: string | null; last_seen_login_id: string | null; last_login_check_at: string | null };
type Presence = { id: number; last_checkin_at: string | null; last_checkin_actor: string | null; current_cycle_id: string | null; created_at: string; updated_at: string };
type Policy = { id: number; name: string; enabled: number; scope: string; rules_json: string; created_at: string; updated_at: string; deleted_at: string | null };
type Audit = { action: string; target_type: string; target_id: string | null; risk_level: string; result: string; error_code: string | null; metadata_json: string | null; request_id: string; actor: string; source: string };

class FakePreparedStatement {
  constructor(private db: FakeD1Database, private sql: string) {}
  private values: unknown[] = [];
  bind(...values: unknown[]) { this.values = values; return this; }
  first<T = unknown>() { return Promise.resolve(this.db.first<T>(this.sql, this.values)); }
  all<T = unknown>() { return Promise.resolve({ results: this.db.all<T>(this.sql), success: true, meta: {} }); }
  run() { return Promise.resolve({ success: true, meta: this.db.run(this.sql, this.values) }); }
}

class FakeD1Database {
  accounts: Account[] = [];
  presence: Presence | null = null;
  policies: Policy[] = [];
  presenceRuns: Array<{ policy_id: number; rule_id: string; cycle_id: string; action: string; status: string }> = [];
  jobRuns: unknown[] = [];
  auditLogs: Audit[] = [];
  prepare(sql: string) { return new FakePreparedStatement(this, sql); }
  first<T>(sql: string, values: unknown[] = []): T | null {
    if (sql.includes("FROM admin_presence_policy_runs")) {
      const [policyId, ruleId, cycleId] = values;
      return (this.presenceRuns.find((run) => run.policy_id === Number(policyId) && run.rule_id === String(ruleId) && run.cycle_id === String(cycleId)) as T | undefined) ?? null;
    }
    if (sql.includes("FROM admin_presence")) return this.presence as T | null;
    if (sql.includes("FROM linode_accounts") && sql.includes("WHERE id = ?")) return (this.accounts.find((account) => account.id === Number(values[0])) as T | undefined) ?? null;
    return null;
  }
  all<T>(sql: string): T[] {
    if (sql.includes("FROM linode_accounts")) return this.accounts.filter((account) => account.status === "active") as T[];
    if (sql.includes("FROM admin_presence_policies")) return this.policies.filter((policy) => policy.deleted_at === null).sort((a, b) => b.id - a.id) as T[];
    if (sql.includes("FROM jobs")) return [{ name: "checkin_monitor", type: "system", enabled: 1, last_run_at: null, last_status: null, summary: null }] as T[];
    return [];
  }
  run(sql: string, values: unknown[]) {
    if (sql.includes("INTO admin_presence_policy_runs")) {
      const [policy_id, rule_id, cycle_id, action, status] = values;
      if (this.presenceRuns.some((run) => run.policy_id === Number(policy_id) && run.rule_id === String(rule_id) && run.cycle_id === String(cycle_id))) throw new Error("UNIQUE constraint failed: admin_presence_policy_runs.policy_id, admin_presence_policy_runs.rule_id, admin_presence_policy_runs.cycle_id");
      this.presenceRuns.push({ policy_id: Number(policy_id), rule_id: String(rule_id), cycle_id: String(cycle_id), action: String(action), status: String(status) });
      return { changes: 1 };
    }
    if (sql.includes("INTO job_runs")) { this.jobRuns.push({ values }); return { changes: 1 }; }
    if (sql.includes("UPDATE jobs")) return { changes: 1 };
    if (sql.includes("INTO audit_logs")) { this.auditLogs.push({ request_id: values[0] as string, actor: values[1] as string, source: values[2] as string, action: values[3] as string, target_type: values[4] as string, target_id: values[5] as string | null, risk_level: values[6] as string, result: values[7] as string, error_code: values[8] as string | null, metadata_json: values[9] as string | null }); return { changes: 1 }; }
    return { changes: 0 };
  }
}

async function addAccount(db: FakeD1Database) {
  db.accounts.push({ id: 1, alias: "default", encrypted_token: await encryptLinodeToken("token-default", "encryption-key"), token_fingerprint: "fp_1", token_status: "valid", status: "active", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", deleted_at: null, last_seen_login_id: null, last_login_check_at: null });
}

describe("Phase 17 release blocker fixes", () => {
  it("computes next_run_at from the actual 5-field cron expression", () => {
    expect(computeNextRunAt("*/5 * * * *", new Date("2026-01-01T00:10:00.000Z"))).toBe("2026-01-01T00:15:00.000Z");
    expect(computeNextRunAt("0 22 * * *", new Date("2026-01-01T00:10:00.000Z"))).toBe("2026-01-01T22:00:00.000Z");
    expect(computeNextRunAt("0 22 * * *", new Date("2026-01-01T22:00:00.000Z"))).toBe("2026-01-02T22:00:00.000Z");
    expect(computeNextRunAt("0 22 * * *", new Date("2026-01-01T00:10:00.000Z"), "Asia/Shanghai")).toBe("2026-01-01T14:00:00.000Z");
    expect(computeNextRunAt("30 9 * * *", new Date("2026-01-01T00:10:00.000Z"), "Asia/Shanghai")).toBe("2026-01-01T01:30:00.000Z");
  });

  it("does not trigger the same admin presence policy rule twice in one cycle", async () => {
    const db = new FakeD1Database();
    await addAccount(db);
    db.presence = { id: 1, last_checkin_at: "2026-01-01T00:00:00.000Z", last_checkin_actor: "api:default", current_cycle_id: "cycle_1", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" };
    db.policies.push({ id: 1, name: "delete stale", enabled: 1, scope: "all", rules_json: JSON.stringify({ rules: [{ rule_id: "delete_1m", after_minutes: 1, action: "delete_all_instances" }] }), created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", deleted_at: null });
    const env = { ...baseEnv, DB: db as unknown as D1Database };
    const linodeCalls: string[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).includes("api.linode.com")) {
        linodeCalls.push(`${init?.method ?? "GET"} ${String(input)}`);
        if (String(input).endsWith("/linode/instances")) return new Response(JSON.stringify({ data: [{ id: 101, label: "vm-101", status: "running", region: "jp-osa", type: "g6-standard-1" }] }), { status: 200 });
      }
      return new Response(null, { status: 200 });
    });

    try {
      const controller = { scheduledTime: Date.parse("2026-01-01T00:10:00.000Z"), cron: "*/5 * * * *", noRetry() {} } as ScheduledController;
      const ctx = { waitUntil(promise: Promise<unknown>) { return promise; }, passThroughOnException() {} } as unknown as ExecutionContext;
      await worker.scheduled(controller, env as never, ctx);
      await worker.scheduled(controller, env as never, ctx);

      expect(db.presenceRuns).toHaveLength(1);
      expect(linodeCalls.filter((call) => call.includes("DELETE https://api.linode.com/v4/linode/instances/101"))).toHaveLength(1);
      expect(db.auditLogs.filter((log) => log.action === "admin_presence.policy.delete_all_instances")).toHaveLength(1);
      expect(JSON.stringify(db.jobRuns)).not.toContain("failed");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("release config/docs do not mislead about Cron, D1, admin presence execution, or out-of-scope instance targeting", async () => {
    const fs = await import("node:fs/promises");
    const wrangler = await fs.readFile("wrangler.toml.example", "utf8");
    const api = await fs.readFile("docs/api.md", "utf8");
    const telegram = await fs.readFile("docs/telegram.md", "utf8");

    expect(wrangler).toContain("[triggers]");
    expect(wrangler).toContain("* * * * *");
    expect(wrangler).toContain("[[d1_databases]]");
    expect(wrangler).toContain("binding = \"DB\"");

    expect(api).toContain("checkin_monitor");
    expect(api).toContain("会真正调用批量操作路径");
    expect(api).not.toContain("不实现 Cron 自动执行");
    expect(api).not.toContain("不实现 Job Runner 真正执行");
    expect(api).not.toContain("Phase E 不会真正批量关机或删除实例");
    expect(api).not.toContain("instance_ids");

    expect(telegram).toContain("保活确认");
    expect(telegram).not.toContain("打卡存活");
    expect(telegram).not.toContain("不实现 Cron 自动执行");
    expect(telegram).not.toContain("不实现 Job Runner 真正执行");
    expect(telegram).not.toContain("指定单台服务器");
  });
});
