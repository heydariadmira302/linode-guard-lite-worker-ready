export class JobsRepository {
  constructor(private readonly db: D1Database) {}

  async createDefaultJob(name: string, type: string, enabled = true): Promise<void> {
    await this.db.prepare(`INSERT INTO jobs (name, type, enabled) VALUES (?, ?, ?)
      ON CONFLICT(name) DO NOTHING`).bind(name, type, enabled ? 1 : 0).run();
  }

  async getByName(name: string): Promise<Record<string, unknown> | null> {
    return await this.db.prepare("SELECT name, type, enabled, last_run_at, NULL AS last_status, NULL AS summary FROM jobs WHERE name = ?").bind(name).first<Record<string, unknown>>();
  }

  async list(): Promise<Array<Record<string, unknown>>> {
    const result = await this.db.prepare("SELECT name, type, enabled, last_run_at, NULL AS last_status, NULL AS summary FROM jobs ORDER BY name").all<Record<string, unknown>>();
    return [...(result.results ?? [])];
  }
}
