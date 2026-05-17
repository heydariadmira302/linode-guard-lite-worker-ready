export type GroupRecord = {
  id: number;
  name: string;
  is_default: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type GroupWithCountsRecord = GroupRecord & {
  account_count: number;
};

export class GroupsRepository {
  constructor(private readonly db: D1Database) {}

  async ensureDefaultGroup(): Promise<GroupRecord> {
    await this.db.prepare(`INSERT OR IGNORE INTO groups (id, name, is_default) VALUES (1, '未分组', 1)`).run();
    return this.getDefaultGroup();
  }

  async getDefaultGroup(): Promise<GroupRecord> {
    const row = await this.db.prepare(`SELECT id, name, is_default, created_at, updated_at, deleted_at
      FROM groups
      WHERE is_default = 1 AND deleted_at IS NULL
      ORDER BY id ASC
      LIMIT 1`).first<GroupRecord>();
    if (row) return row;
    await this.db.prepare(`INSERT OR IGNORE INTO groups (id, name, is_default) VALUES (1, '未分组', 1)`).run();
    return await this.db.prepare(`SELECT id, name, is_default, created_at, updated_at, deleted_at
      FROM groups
      WHERE id = 1
      LIMIT 1`).first<GroupRecord>() as GroupRecord;
  }

  async create(name: string): Promise<GroupRecord> {
    const result = await this.db.prepare(`INSERT INTO groups (name, is_default) VALUES (?, 0)`).bind(name).run();
    return this.getById(Number(result.meta.last_row_id));
  }

  async getById(id: number): Promise<GroupRecord> {
    const row = await this.db.prepare(`SELECT id, name, is_default, created_at, updated_at, deleted_at
      FROM groups
      WHERE id = ? AND deleted_at IS NULL`).bind(id).first<GroupRecord>();
    if (!row) {
      const fallback = (await this.list()).find((group) => group.id === id);
      if (fallback) return fallback;
      throw new Error("GROUP_NOT_FOUND");
    }
    return row;
  }

  async getByName(name: string): Promise<GroupRecord | null> {
    return await this.db.prepare(`SELECT id, name, is_default, created_at, updated_at, deleted_at
      FROM groups
      WHERE name = ? AND deleted_at IS NULL
      LIMIT 1`).bind(name).first<GroupRecord>();
  }

  async list(): Promise<GroupWithCountsRecord[]> {
    await this.ensureDefaultGroup();
    const result = await this.db.prepare(`SELECT g.id, g.name, g.is_default, g.created_at, g.updated_at, g.deleted_at,
        COUNT(a.id) AS account_count
      FROM groups g
      LEFT JOIN linode_accounts a ON a.group_id = g.id AND a.status = 'active'
      WHERE g.deleted_at IS NULL
      GROUP BY g.id
      ORDER BY g.is_default DESC, g.id ASC`).all<GroupWithCountsRecord>();
    return result.results ?? [];
  }

  async rename(id: number, name: string): Promise<GroupRecord> {
    await this.db.prepare(`UPDATE groups SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL AND is_default = 0`).bind(name, id).run();
    return this.getById(id);
  }

  async softDelete(id: number): Promise<GroupRecord> {
    const before = await this.getById(id);
    await this.db.prepare(`UPDATE groups SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL AND is_default = 0`).bind(id).run();
    return before;
  }

  async countActiveAccounts(id: number): Promise<number> {
    const row = await this.db.prepare(`SELECT COUNT(*) AS count FROM linode_accounts WHERE group_id = ? AND status = 'active'`).bind(id).first<{ count: number }>();
    return Number(row?.count ?? 0);
  }

  async moveAccount(accountId: number, groupId: number): Promise<void> {
    await this.db.prepare(`UPDATE linode_accounts SET group_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'active'`).bind(groupId, accountId).run();
  }
}
