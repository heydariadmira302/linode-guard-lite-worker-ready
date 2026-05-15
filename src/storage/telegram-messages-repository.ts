export interface TelegramMessageRecord {
  id: number;
  chat_id: string;
  message_id: string;
  purpose: string;
  delete_status: string;
  attempts: number;
  last_error_code: string | null;
  created_at: string;
  deleted_at: string | null;
  metadata_json: string | null;
}

export class TelegramMessagesRepository {
  constructor(private readonly db: D1Database) {}

  async create(input: { chat_id: string; message_id: string; purpose: string; metadata?: unknown }): Promise<void> {
    await this.db.prepare(`INSERT INTO telegram_messages (chat_id, message_id, purpose, metadata_json)
      VALUES (?, ?, ?, ?)`).bind(input.chat_id, input.message_id, input.purpose, input.metadata === undefined ? null : JSON.stringify(input.metadata)).run();
  }

  async listPendingByPurpose(purpose: string): Promise<TelegramMessageRecord[]> {
    const result = await this.db.prepare(`SELECT id, chat_id, message_id, purpose, delete_status, attempts, last_error_code, created_at, deleted_at, metadata_json
      FROM telegram_messages
      WHERE purpose = ? AND delete_status = 'pending'
      ORDER BY id ASC`).bind(purpose).all<TelegramMessageRecord>();
    return result.results ?? [];
  }

  async getLatestPendingByPurpose(purpose: string): Promise<TelegramMessageRecord | null> {
    return await this.db.prepare(`SELECT id, chat_id, message_id, purpose, delete_status, attempts, last_error_code, created_at, deleted_at, metadata_json
      FROM telegram_messages
      WHERE purpose = ? AND delete_status = 'pending'
      ORDER BY created_at DESC, id DESC
      LIMIT 1`).bind(purpose).first<TelegramMessageRecord>();
  }

  async markDeleted(id: number): Promise<void> {
    await this.db.prepare("UPDATE telegram_messages SET delete_status = 'deleted', deleted_at = CURRENT_TIMESTAMP, attempts = attempts + 1 WHERE id = ?").bind(id).run();
  }

  async markDeleteFailed(id: number, errorCode: string): Promise<void> {
    await this.db.prepare("UPDATE telegram_messages SET attempts = attempts + 1, last_error_code = ? WHERE id = ?").bind(errorCode, id).run();
  }
}
