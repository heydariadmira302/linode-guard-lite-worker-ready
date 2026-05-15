export interface LoginEventInput {
  account_id: number;
  linode_login_id: string;
  username?: string | null;
  ip?: string | null;
  datetime: string;
  status?: string | null;
  raw_json?: string | null;
}

export interface LoginEventRecord extends LoginEventInput {
  id: number;
  created_at: string;
}

export interface SecurityEventInput {
  account_id?: number | null;
  type: string;
  severity: string;
  status?: string;
  login_event_id?: number | null;
  linode_login_id?: string | null;
  username?: string | null;
  ip?: string | null;
  occurred_at: string;
  metadata_json?: string | null;
}

export interface SecurityEventRecord {
  id: number;
  account_id: number | null;
  type: string;
  severity: string;
  status: string;
  login_event_id: number | null;
  linode_login_id: string | null;
  username: string | null;
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  occurred_at: string;
  created_at: string;
  updated_at: string;
}

export interface SecurityEventListParams {
  limit?: number;
  offset?: number;
  status?: string | null;
  type?: string | null;
  account_id?: number | null;
}

export class SecurityEventsRepository {
  constructor(private readonly db: D1Database) {}

  async createLoginEventIfNew(input: LoginEventInput): Promise<{ event: LoginEventRecord; created: boolean }> {
    const existing = await this.findLoginEvent(input.account_id, input.linode_login_id);
    if (existing) return { event: existing, created: false };
    const result = await this.db.prepare(`INSERT INTO login_events
      (account_id, linode_login_id, username, ip, datetime, status, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(input.account_id, input.linode_login_id, input.username ?? null, input.ip ?? null, input.datetime, input.status ?? null, input.raw_json ?? null)
      .run();
    const id = Number(result.meta.last_row_id);
    const event = await this.findLoginEvent(input.account_id, input.linode_login_id);
    return { event: event ?? { id, ...input, username: input.username ?? null, ip: input.ip ?? null, status: input.status ?? null, raw_json: input.raw_json ?? null, created_at: new Date().toISOString() }, created: true };
  }

  async findLoginEvent(accountId: number, linodeLoginId: string): Promise<LoginEventRecord | null> {
    return await this.db.prepare(`SELECT id, account_id, linode_login_id, username, ip, datetime, status, raw_json, created_at
      FROM login_events
      WHERE account_id = ? AND linode_login_id = ?
      LIMIT 1`)
      .bind(accountId, linodeLoginId)
      .first<LoginEventRecord>();
  }

  async createSecurityEvent(input: SecurityEventInput): Promise<SecurityEventRecord> {
    const result = await this.db.prepare(`INSERT INTO security_events
      (account_id, type, severity, status, login_event_id, linode_login_id, username, ip, occurred_at, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(input.account_id ?? null, input.type, input.severity, input.status ?? "open", input.login_event_id ?? null, input.linode_login_id ?? null, input.username ?? null, input.ip ?? null, input.occurred_at, input.metadata_json ?? null)
      .run();
    const id = Number(result.meta.last_row_id);
    return await this.getSecurityEventById(id) ?? {
      id,
      account_id: input.account_id ?? null,
      type: input.type,
      severity: input.severity,
      status: input.status ?? "open",
      login_event_id: input.login_event_id ?? null,
      linode_login_id: input.linode_login_id ?? null,
      username: input.username ?? null,
      ip: input.ip ?? null,
      country: null,
      region: null,
      city: null,
      occurred_at: input.occurred_at,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  async getSecurityEventById(id: number): Promise<SecurityEventRecord | null> {
    return await this.db.prepare(`SELECT id, account_id, type, severity, status, login_event_id, linode_login_id, username, ip, country, region, city, occurred_at, created_at, updated_at
      FROM security_events
      WHERE id = ?
      LIMIT 1`).bind(id).first<SecurityEventRecord>();
  }

  async listSecurityEvents(params: SecurityEventListParams = {}): Promise<SecurityEventRecord[]> {
    const limit = normalizeLimit(params.limit);
    const offset = normalizeOffset(params.offset);
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (params.status) { conditions.push("status = ?"); values.push(params.status); }
    if (params.type) { conditions.push("type = ?"); values.push(params.type); }
    if (params.account_id !== undefined && params.account_id !== null) { conditions.push("account_id = ?"); values.push(params.account_id); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await this.db.prepare(`SELECT id, account_id, type, severity, status, login_event_id, linode_login_id, username, ip, country, region, city, occurred_at, created_at, updated_at
      FROM security_events
      ${where}
      ORDER BY occurred_at DESC, id DESC
      LIMIT ? OFFSET ?`)
      .bind(...values, limit, offset)
      .all<SecurityEventRecord>();
    return result.results ?? [];
  }

  async countOpenSecurityEvents(): Promise<number> {
    const result = await this.db.prepare("SELECT COUNT(*) AS count FROM security_events WHERE status = ?")
      .bind("open")
      .first<{ count: number }>();
    return Number(result?.count ?? 0);
  }

  async updateSecurityEventStatus(id: number, status: string): Promise<SecurityEventRecord | null> {
    await this.db.prepare("UPDATE security_events SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(status, id).run();
    return await this.getSecurityEventById(id);
  }

  async cleanupSecurityEventsBefore(cutoffIso: string): Promise<number> {
    const result = await this.db.prepare("DELETE FROM security_events WHERE created_at < ?").bind(cutoffIso).run();
    return Number(result.meta.changes ?? 0);
  }

  async cleanupLoginEventsBefore(cutoffIso: string): Promise<number> {
    const result = await this.db.prepare("DELETE FROM login_events WHERE created_at < ?").bind(cutoffIso).run();
    return Number(result.meta.changes ?? 0);
  }
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return 20;
  return Math.min(100, Math.max(1, Math.trunc(limit ?? 20)));
}

function normalizeOffset(offset: number | undefined): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.max(0, Math.trunc(offset ?? 0));
}
