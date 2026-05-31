-- Track instances whose offline state was created by Linode Guard Lite.
-- This enables BOOT_MODE=bot_managed_only style safety for batch/scheduled boot.

CREATE TABLE IF NOT EXISTS bot_managed_instances (
  account_id INTEGER NOT NULL,
  instance_id INTEGER NOT NULL,
  label TEXT,
  last_action TEXT NOT NULL,
  last_action_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_actor TEXT,
  last_source TEXT,
  last_request_id TEXT,
  metadata_json TEXT,
  PRIMARY KEY(account_id, instance_id),
  FOREIGN KEY(account_id) REFERENCES linode_accounts(id)
);
CREATE INDEX IF NOT EXISTS idx_bot_managed_instances_action ON bot_managed_instances(last_action);
CREATE INDEX IF NOT EXISTS idx_bot_managed_instances_action_at ON bot_managed_instances(last_action_at);
