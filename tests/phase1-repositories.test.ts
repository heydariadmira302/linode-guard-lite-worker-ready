import { describe, expect, it } from "vitest";
import { REQUIRED_TABLES } from "../src/storage/db";
import { SettingsRepository } from "../src/storage/settings-repository";
import { JobsRepository } from "../src/storage/jobs-repository";
import { AuditRepository } from "../src/storage/audit-repository";

class FakePreparedStatement {
  constructor(private db: FakeD1Database, private sql: string) {}
  private values: unknown[] = [];
  bind(...values: unknown[]) { this.values = values; return this; }
  first<T = unknown>() { return Promise.resolve(this.db.first<T>(this.sql, this.values)); }
  all<T = unknown>() { return Promise.resolve({ results: this.db.all<T>(this.sql), success: true, meta: {} }); }
  run() { this.db.run(this.sql, this.values); return Promise.resolve({ success: true, meta: {} }); }
}
class FakeD1Database {
  settings = new Map<string, string>();
  auditLogs: Record<string, unknown>[] = [];
  jobs: Record<string, unknown>[] = [];
  prepare(sql: string) { return new FakePreparedStatement(this, sql); }
  first<T>(sql: string, values: unknown[]): T | null {
    if (sql.includes("FROM settings")) {
      const value = this.settings.get(values[0] as string);
      return value ? ({ key: values[0], value_json: value } as T) : null;
    }
    return null;
  }
  all<T>(sql: string): T[] {
    if (sql.includes("FROM jobs")) return this.jobs as T[];
    return [];
  }
  run(sql: string, values: unknown[]) {
    if (sql.includes("INTO settings")) this.settings.set(values[0] as string, values[1] as string);
    if (sql.includes("INTO audit_logs")) this.auditLogs.push({ request_id: values[0], actor: values[1], source: values[2], action: values[3] });
    if (sql.includes("INTO jobs")) this.jobs.push({ name: values[0], type: values[1], enabled: values[2] });
  }
}

describe("Phase 1 schema and repositories", () => {
  it("declares every MVP D1 table for diagnostics", () => {
    expect(REQUIRED_TABLES).toEqual(expect.arrayContaining([
      "settings", "linode_accounts", "login_events", "security_events", "audit_logs",
      "admin_presence", "admin_presence_policies", "admin_presence_policy_runs",
      "power_schedules", "schedule_runs", "jobs", "job_runs", "bot_sessions", "telegram_messages"
    ]));
  });

  it("supports settings, jobs, and audit repository basics", async () => {
    const db = new FakeD1Database() as unknown as D1Database;
    await new SettingsRepository(db).set("security_settings", { enabled: true });
    await new JobsRepository(db).createDefaultJob("login_monitor", "system");
    await new AuditRepository(db).create({ request_id: "req_1", actor: "api:default", source: "api", action: "test", target_type: "system", risk_level: "low", result: "success" });

    await expect(new SettingsRepository(db).get("security_settings")).resolves.toEqual({ enabled: true });
    await expect(new JobsRepository(db).list()).resolves.toEqual([{ name: "login_monitor", type: "system", enabled: 1 }]);
    expect((db as unknown as FakeD1Database).auditLogs).toHaveLength(1);
  });
});
