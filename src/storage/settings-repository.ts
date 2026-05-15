export class SettingsRepository {
  constructor(private readonly db: D1Database) {}

  async get<T = unknown>(key: string): Promise<T | null> {
    const row = await this.db.prepare("SELECT key, value_json FROM settings WHERE key = ?").bind(key).first<{ value_json: string }>();
    return row ? JSON.parse(row.value_json) as T : null;
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.db.prepare(`INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP`).bind(key, JSON.stringify(value)).run();
  }

  async createIfMissing(key: string, value: unknown): Promise<void> {
    await this.db.prepare(`INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO NOTHING`).bind(key, JSON.stringify(value)).run();
  }
}
