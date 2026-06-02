export interface WindowsInstallRecord {
  id: number;
  account_id: number;
  instance_id: number | null;
  instance_label: string | null;
  ip_address: string | null;
  status: "installing" | "ready" | "failed";
  callback_token_hash: string;
  telegram_chat_id: string | null;
  telegram_user_id: string | null;
  notified_at: string | null;
  callback_received_at: string | null;
  created_at: string;
  updated_at: string;
  metadata_json: string | null;
}

export class WindowsInstallRepository {
  constructor(private readonly db: D1Database) {}

  async create(input: {
    accountId: number;
    instanceLabel: string;
    ipAddress?: string | null;
    callbackTokenHash: string;
    telegramChatId?: string | null;
    telegramUserId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<WindowsInstallRecord> {
    const now = new Date().toISOString();
    const result = await this.db.prepare(`INSERT INTO windows_installs (account_id, instance_label, ip_address, status, callback_token_hash, telegram_chat_id, telegram_user_id, created_at, updated_at, metadata_json) VALUES (?, ?, ?, 'installing', ?, ?, ?, ?, ?, ?) RETURNING *`)
      .bind(input.accountId, input.instanceLabel, input.ipAddress ?? null, input.callbackTokenHash, input.telegramChatId ?? null, input.telegramUserId ?? null, now, now, input.metadata ? JSON.stringify(input.metadata) : null)
      .first<WindowsInstallRecord>();
    if (!result) throw new Error("Failed to create Windows install record");
    return result;
  }

  async attachInstance(id: number, instanceId: number, ipAddress?: string | null, metadata?: Record<string, unknown>): Promise<void> {
    await this.db.prepare(`UPDATE windows_installs SET instance_id = ?, ip_address = COALESCE(?, ip_address), metadata_json = COALESCE(?, metadata_json), updated_at = ? WHERE id = ?`)
      .bind(instanceId, ipAddress ?? null, metadata ? JSON.stringify(metadata) : null, new Date().toISOString(), id)
      .run();
  }

  async findPendingByTokenHash(tokenHash: string): Promise<WindowsInstallRecord | null> {
    return await this.db.prepare(`SELECT * FROM windows_installs WHERE callback_token_hash = ? AND status IN ('installing', 'failed') AND callback_received_at IS NULL LIMIT 1`).bind(tokenHash).first<WindowsInstallRecord>();
  }

  async findInstallingByTokenHash(tokenHash: string): Promise<WindowsInstallRecord | null> {
    return await this.findPendingByTokenHash(tokenHash);
  }

  async markReady(id: number, input: { ipAddress?: string | null; metadata?: Record<string, unknown> }): Promise<WindowsInstallRecord | null> {
    const now = new Date().toISOString();
    return await this.db.prepare(`UPDATE windows_installs SET status = 'ready', ip_address = COALESCE(?, ip_address), callback_received_at = ?, updated_at = ?, metadata_json = COALESCE(?, metadata_json) WHERE id = ? RETURNING *`)
      .bind(input.ipAddress ?? null, now, now, input.metadata ? JSON.stringify(input.metadata) : null, id)
      .first<WindowsInstallRecord>();
  }

  async listByAccount(accountId: number, limit = 20): Promise<WindowsInstallRecord[]> {
    const result = await this.db.prepare(`SELECT * FROM windows_installs WHERE account_id = ? ORDER BY id DESC LIMIT ?`).bind(accountId, limit).all<WindowsInstallRecord>();
    return result.results ?? [];
  }

  async findStaleInstalling(olderThanIso: string, limit = 20): Promise<WindowsInstallRecord[]> {
    const result = await this.db.prepare(`SELECT * FROM windows_installs WHERE status = 'installing' AND created_at <= ? ORDER BY created_at ASC LIMIT ?`).bind(olderThanIso, limit).all<WindowsInstallRecord>();
    return result.results ?? [];
  }

  async markFailed(id: number, metadata?: Record<string, unknown>): Promise<void> {
    await this.db.prepare(`UPDATE windows_installs SET status = 'failed', updated_at = ?, metadata_json = COALESCE(?, metadata_json) WHERE id = ?`).bind(new Date().toISOString(), metadata ? JSON.stringify(metadata) : null, id).run();
  }

  async markNotified(id: number): Promise<void> {
    await this.db.prepare(`UPDATE windows_installs SET notified_at = ?, updated_at = ? WHERE id = ?`).bind(new Date().toISOString(), new Date().toISOString(), id).run();
  }
}
