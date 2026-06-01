
CREATE TABLE IF NOT EXISTS windows_installs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  instance_id INTEGER,
  instance_label TEXT,
  ip_address TEXT,
  status TEXT NOT NULL DEFAULT 'installing',
  callback_token_hash TEXT NOT NULL UNIQUE,
  telegram_chat_id TEXT,
  telegram_user_id TEXT,
  notified_at TEXT,
  callback_received_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT,
  FOREIGN KEY(account_id) REFERENCES linode_accounts(id)
);
CREATE INDEX IF NOT EXISTS idx_windows_installs_status ON windows_installs(status);
CREATE INDEX IF NOT EXISTS idx_windows_installs_instance ON windows_installs(account_id, instance_id);
CREATE INDEX IF NOT EXISTS idx_windows_installs_token_hash ON windows_installs(callback_token_hash);

INSERT OR IGNORE INTO jobs (name, type, enabled, interval_seconds, next_run_at, description) VALUES ('windows_install_timeout', 'windows_install_monitor', 1, 300, CURRENT_TIMESTAMP, 'Windows 安装完成回调超时兜底提醒');
