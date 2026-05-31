export interface BotSessionRecord {
  id?: number;
  telegram_user_id: string;
  chat_id: string;
  state: string;
  data_json?: string | null;
  expires_at: string;
  created_at?: string;
  updated_at?: string;
}

export interface UpsertBotSessionInput {
  telegram_user_id: string;
  chat_id: string;
  state: string;
  data?: unknown;
  expires_at: string;
}

export class BotSessionsRepository {
  constructor(private readonly db: D1Database) {}

  async upsert(input: UpsertBotSessionInput): Promise<void> {
    await this.db.prepare(
      `INSERT INTO bot_sessions (telegram_user_id, chat_id, state, data_json, expires_at, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    ).bind(
      input.telegram_user_id,
      input.chat_id,
      input.state,
      input.data === undefined ? null : JSON.stringify(input.data),
      input.expires_at
    ).run();
  }

  async getByUserId(telegramUserId: string): Promise<BotSessionRecord | null> {
    return await this.db.prepare(
      `SELECT id, telegram_user_id, chat_id, state, data_json, expires_at, created_at, updated_at
       FROM bot_sessions
       WHERE telegram_user_id = ?
       ORDER BY id DESC
       LIMIT 1`
    ).bind(telegramUserId).first<BotSessionRecord>();
  }

  async clearByUserId(telegramUserId: string): Promise<void> {
    await this.db.prepare("DELETE FROM bot_sessions WHERE telegram_user_id = ?").bind(telegramUserId).run();
  }

  async cleanupExpired(nowIso: string): Promise<number> {
    const result = await this.db.prepare("DELETE FROM bot_sessions WHERE expires_at < ?").bind(nowIso).run();
    return Number(result.meta.changes ?? 0);
  }
}
