export interface LinodeAccountRecord {
  id: number;
  alias: string;
  encrypted_token: string;
  token_fingerprint: string;
  token_status: string;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  last_seen_login_id?: string | null;
  last_login_check_at?: string | null;
}

export interface CreateAccountInput {
  alias: string;
  encrypted_token: string;
  token_fingerprint: string;
  token_status: string;
}

export class AccountsRepository {
  constructor(private readonly db: D1Database) {}

  async create(input: CreateAccountInput): Promise<LinodeAccountRecord> {
    const result = await this.db.prepare(
      `INSERT INTO linode_accounts (alias, encrypted_token, token_fingerprint, token_status)
       VALUES (?, ?, ?, ?)`
    ).bind(input.alias, input.encrypted_token, input.token_fingerprint, input.token_status).run();
    const id = Number(result.meta.last_row_id);
    const account = await this.getById(id);
    if (!account) throw new Error("Failed to load created account");
    return account;
  }

  async listActive(): Promise<LinodeAccountRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT id, alias, encrypted_token, token_fingerprint, token_status, status, last_seen_login_id, last_login_check_at, created_at, updated_at, deleted_at
       FROM linode_accounts
       WHERE status = 'active'
       ORDER BY id ASC`
    ).all<LinodeAccountRecord>();
    return results;
  }

  async getById(id: number): Promise<LinodeAccountRecord | null> {
    return await this.db.prepare(
      `SELECT id, alias, encrypted_token, token_fingerprint, token_status, status, last_seen_login_id, last_login_check_at, created_at, updated_at, deleted_at
       FROM linode_accounts
       WHERE id = ?`
    ).bind(id).first<LinodeAccountRecord>();
  }

  async getByAlias(alias: string): Promise<LinodeAccountRecord | null> {
    return await this.db.prepare(
      `SELECT id, alias, encrypted_token, token_fingerprint, token_status, status, last_seen_login_id, last_login_check_at, created_at, updated_at, deleted_at
       FROM linode_accounts
       WHERE alias = ? AND status = 'active'
       LIMIT 1`
    ).bind(alias).first<LinodeAccountRecord>();
  }

  async updateTokenStatus(id: number, tokenStatus: string): Promise<void> {
    await this.db.prepare(
      `UPDATE linode_accounts
       SET token_status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'active'`
    ).bind(tokenStatus, id).run();
  }

  async softDelete(id: number): Promise<void> {
    await this.db.prepare(
      `UPDATE linode_accounts
       SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'active'`
    ).bind(id).run();
  }

  async updateLoginCursor(id: number, lastSeenLoginId: string | null, checkedAt: string): Promise<void> {
    await this.db.prepare(
      `UPDATE linode_accounts
       SET last_seen_login_id = ?, last_login_check_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'active'`
    ).bind(lastSeenLoginId, checkedAt, id).run();
  }
}
