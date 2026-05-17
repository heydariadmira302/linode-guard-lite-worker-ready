-- Legacy upgrade migration for databases initialized before account groups existed.
-- Safe to run once on old D1 databases. Do not run on databases that already
-- have linode_accounts.group_id or power_schedules.group_id because SQLite D1
-- does not support IF NOT EXISTS for ADD COLUMN.

CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_groups_default ON groups(is_default);

INSERT INTO groups (id, name, is_default)
SELECT 1, '未分组', 1
WHERE NOT EXISTS (SELECT 1 FROM groups WHERE id = 1);

UPDATE groups
SET name = '未分组', is_default = 1, deleted_at = NULL, updated_at = CURRENT_TIMESTAMP
WHERE id = 1;

ALTER TABLE linode_accounts ADD COLUMN group_id INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_linode_accounts_group_id ON linode_accounts(group_id);
