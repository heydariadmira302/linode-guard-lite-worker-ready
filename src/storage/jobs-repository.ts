export type JobLockResult = "acquired" | "locked";

export class JobsRepository {
  constructor(private readonly db: D1Database) {}

  async createDefaultJob(name: string, type: string, enabled = true): Promise<void> {
    await this.db.prepare(`INSERT INTO jobs (name, type, enabled) VALUES (?, ?, ?)
      ON CONFLICT(name) DO NOTHING`).bind(name, type, enabled ? 1 : 0).run();
  }

  async getByName(name: string): Promise<Record<string, unknown> | null> {
    return await this.db.prepare(`SELECT j.name, j.type, j.enabled, j.last_run_at, j.next_run_at, j.locked_until, j.locked_by, j.lock_started_at,
      (SELECT r.status FROM job_runs r WHERE r.job_name = j.name ORDER BY r.started_at DESC, r.id DESC LIMIT 1) AS last_status,
      (SELECT r.summary FROM job_runs r WHERE r.job_name = j.name ORDER BY r.started_at DESC, r.id DESC LIMIT 1) AS summary
      FROM jobs j WHERE j.name = ?`).bind(name).first<Record<string, unknown>>();
  }

  async list(): Promise<Array<Record<string, unknown>>> {
    const result = await this.db.prepare(`SELECT j.name, j.type, j.enabled, j.last_run_at, j.next_run_at, j.locked_until, j.locked_by, j.lock_started_at,
      (SELECT r.status FROM job_runs r WHERE r.job_name = j.name ORDER BY r.started_at DESC, r.id DESC LIMIT 1) AS last_status,
      (SELECT r.summary FROM job_runs r WHERE r.job_name = j.name ORDER BY r.started_at DESC, r.id DESC LIMIT 1) AS summary
      FROM jobs j ORDER BY j.name`).all<Record<string, unknown>>();
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
