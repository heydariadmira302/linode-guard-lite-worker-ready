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

  async createIfMissing(input: { chat_id: string; message_id: string; purpose: string; metadata?: unknown }): Promise<void> {
    const existing = await this.db.prepare(`SELECT id FROM telegram_messages WHERE chat_id = ? AND message_id = ? AND purpose = ? LIMIT 1`)
      .bind(input.chat_id, input.message_id, input.purpose)
      .first<{ id: number }>();
    if (existing) return;
    await this.create(input);
  }

  async listPendingByPurpose(purpose: string, limit = 100): Promise<TelegramMessageRecord[]> {
    const result = await this.db.prepare(`SELECT id, chat_id, message_id, purpose, delete_status, attempts, last_error_code, created_at, deleted_at, metadata_json
      FROM telegram_messages
      WHERE purpose = ? AND delete_status = 'pending' AND attempts < 3
      ORDER BY id ASC
      LIMIT ?`).bind(purpose, limit).all<TelegramMessageRecord>();
    return result.results ?? [];
  }

  async getLatestPendingByPurpose(purpose: string): Promise<TelegramMessageRecord | null> {
    return await this.db.prepare(`SELECT id, chat_id, message_id, purpose, delete_status, attempts, last_error_code, created_at, deleted_at, metadata_json
      FROM telegram_messages
      WHERE purpose = ? AND delete_status = 'pending'
      ORDER BY created_at DESC, id DESC
      LIMIT 1`).bind(purpose).first<TelegramMessageRecord>();
  }

  async getPendingByMessagePurpose(input: { chat_id: string; message_id: string; purpose: string }): Promise<TelegramMessageRecord | null> {
    return await this.db.prepare(`SELECT id, chat_id, message_id, purpose, delete_status, attempts, last_error_code, created_at, deleted_at, metadata_json
      FROM telegram_messages
      WHERE chat_id = ? AND message_id = ? AND purpose = ? AND delete_status = 'pending' AND attempts < 3
      LIMIT 1`).bind(input.chat_id, input.message_id, input.purpose).first<TelegramMessageRecord>();
  }

  async markDeleted(id: number): Promise<void> {
    await this.db.prepare("UPDATE telegram_messages SET delete_status = 'deleted', deleted_at = CURRENT_TIMESTAMP, attempts = attempts + 1 WHERE id = ?").bind(id).run();
  }

  async markDeletedByMessagePurpose(input: { chat_id: string; message_id: string; purpose: string }): Promise<void> {
    await this.db.prepare(`UPDATE telegram_messages
      SET delete_status = 'deleted', deleted_at = CURRENT_TIMESTAMP, attempts = attempts + 1
      WHERE chat_id = ? AND message_id = ? AND purpose = ? AND delete_status = 'pending'`).bind(input.chat_id, input.message_id, input.purpose).run();
  }

  async markDeleteFailed(id: number, errorCode: string): Promise<void> {
    await this.db.prepare("UPDATE telegram_messages SET attempts = attempts + 1, last_error_code = ? WHERE id = ?").bind(errorCode, id).run();
  }

  async cleanupBefore(cutoffIso: string): Promise<number> {
    const result = await this.db.prepare(`DELETE FROM telegram_messages
      WHERE created_at < ?
        AND (delete_status = 'deleted' OR attempts >= 3 OR purpose IN ('auto_delete', 'admin_presence_reminder'))`).bind(cutoffIso).run();
    return Number(result.meta?.changes ?? 0);
  }
}
