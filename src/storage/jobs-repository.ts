export type JobLockResult = "acquired" | "locked";

export class JobsRepository {
  constructor(private readonly db: D1Database) {}

  async createDefaultJob(name: string, type: string, enabled = true): Promise<void> {
    await this.db.prepare(`INSERT INTO jobs (name, type, enabled) VALUES (?, ?, ?)
      ON CONFLICT(name) DO NOTHING`).bind(name, type, enabled ? 1 : 0).run();
  }

  async getByName(name: string): Promise<Record<string, unknown> | null> {
    return await this.db.prepare("SELECT name, type, enabled, last_run_at, next_run_at, locked_until, locked_by, lock_started_at, NULL AS last_status, NULL AS summary FROM jobs WHERE name = ?").bind(name).first<Record<string, unknown>>();
  }

  async list(): Promise<Array<Record<string, unknown>>> {
    const result = await this.db.prepare("SELECT name, type, enabled, last_run_at, next_run_at, locked_until, locked_by, lock_started_at, NULL AS last_status, NULL AS summary FROM jobs ORDER BY name").all<Record<string, unknown>>();
    return [...(result.results ?? [])];
  }

  async tryAcquireLock(name: string, lockOwner: string, nowIso: string, lockedUntilIso: string): Promise<JobLockResult> {
    const result = await this.db.prepare(`UPDATE jobs
      SET locked_until = ?, locked_by = ?, lock_started_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE name = ?
        AND enabled = 1
        AND (locked_until IS NULL OR locked_until <= ?)`).bind(lockedUntilIso, lockOwner, nowIso, name, nowIso).run();
    return Number(result.meta.changes ?? 0) > 0 ? "acquired" : "locked";
  }

  async releaseLock(name: string, lockOwner: string): Promise<void> {
    await this.db.prepare(`UPDATE jobs
      SET locked_until = NULL, locked_by = NULL, lock_started_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE name = ? AND locked_by = ?`).bind(name, lockOwner).run();
  }
}
