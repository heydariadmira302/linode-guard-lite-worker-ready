export const REQUIRED_TABLES = [
  "settings",
  "groups",
  "linode_accounts",
  "login_events",
  "security_events",
  "audit_logs",
  "admin_presence",
  "admin_presence_policies",
  "admin_presence_policy_runs",
  "power_schedules",
  "schedule_runs",
  "jobs",
  "job_runs",
  "bot_managed_instances",
  "bot_sessions",
  "telegram_messages"
] as const;

export type RequiredTable = typeof REQUIRED_TABLES[number];

export async function listMissingTables(db: D1Database): Promise<string[]> {
  const missing: string[] = [];
  for (const table of REQUIRED_TABLES) {
    const row = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").bind(table).first<{ name: string }>();
    if (!row) missing.push(table);
  }
  return missing;
}
