export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_groups_default ON groups(is_default);

CREATE TABLE IF NOT EXISTS linode_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alias TEXT NOT NULL UNIQUE,
  group_id INTEGER NOT NULL DEFAULT 1,
  encrypted_token TEXT NOT NULL,
  token_fingerprint TEXT NOT NULL,
  token_status TEXT NOT NULL DEFAULT 'unknown',
  status TEXT NOT NULL DEFAULT 'active',
  last_seen_login_id TEXT,
  last_login_check_at TEXT,
  security_baseline_at TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY(group_id) REFERENCES groups(id)
);
CREATE INDEX IF NOT EXISTS idx_linode_accounts_status ON linode_accounts(status);
CREATE INDEX IF NOT EXISTS idx_linode_accounts_group_id ON linode_accounts(group_id);

CREATE TABLE IF NOT EXISTS login_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  linode_login_id TEXT NOT NULL,
  username TEXT,
  ip TEXT,
  datetime TEXT NOT NULL,
  status TEXT,
  raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(account_id) REFERENCES linode_accounts(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_login_events_account_linode_id ON login_events(account_id, linode_login_id);
CREATE INDEX IF NOT EXISTS idx_login_events_datetime ON login_events(datetime);
CREATE INDEX IF NOT EXISTS idx_login_events_created_at ON login_events(created_at);

CREATE TABLE IF NOT EXISTS security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER,
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  login_event_id INTEGER,
  linode_login_id TEXT,
  username TEXT,
  ip TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  occurred_at TEXT NOT NULL,
  confirmed_at TEXT,
  confirmed_by TEXT,
  confirmation_result TEXT,
  message_sent_at TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(account_id) REFERENCES linode_accounts(id),
  FOREIGN KEY(login_event_id) REFERENCES login_events(id)
);
CREATE INDEX IF NOT EXISTS idx_security_events_status ON security_events(status);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(type);
CREATE INDEX IF NOT EXISTS idx_security_events_account ON security_events(account_id);
CREATE INDEX IF NOT EXISTS idx_security_events_occurred_at ON security_events(occurred_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  source TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  risk_level TEXT NOT NULL,
  result TEXT NOT NULL,
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_risk_level ON audit_logs(risk_level);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS admin_presence (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_checkin_at TEXT,
  last_checkin_actor TEXT,
  current_cycle_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_presence_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  scope TEXT NOT NULL DEFAULT 'all',
  rules_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_admin_presence_policies_enabled ON admin_presence_policies(enabled);

CREATE TABLE IF NOT EXISTS admin_presence_policy_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  policy_id INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  cycle_id TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  triggered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  summary TEXT,
  error_code TEXT,
  metadata_json TEXT,
  FOREIGN KEY(policy_id) REFERENCES admin_presence_policies(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_presence_policy_runs_unique_cycle_rule ON admin_presence_policy_runs(policy_id, rule_id, cycle_id);
CREATE INDEX IF NOT EXISTS idx_presence_policy_runs_triggered_at ON admin_presence_policy_runs(triggered_at);

CREATE TABLE IF NOT EXISTS power_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  action TEXT NOT NULL,
  scope TEXT NOT NULL,
  account_id INTEGER,
  group_id INTEGER,
  instance_id INTEGER,
  cron_expr TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  last_run_at TEXT,
  next_run_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY(account_id) REFERENCES linode_accounts(id),
  FOREIGN KEY(group_id) REFERENCES groups(id)
);
CREATE INDEX IF NOT EXISTS idx_power_schedules_enabled ON power_schedules(enabled);
CREATE INDEX IF NOT EXISTS idx_power_schedules_next_run_at ON power_schedules(next_run_at);

CREATE TABLE IF NOT EXISTS schedule_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  scope TEXT NOT NULL,
  instance_id INTEGER,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  summary TEXT,
  error_code TEXT,
  metadata_json TEXT,
  FOREIGN KEY(schedule_id) REFERENCES power_schedules(id)
);
CREATE INDEX IF NOT EXISTS idx_schedule_runs_schedule_id ON schedule_runs(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_runs_started_at ON schedule_runs(started_at);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  cron_expr TEXT,
  last_run_at TEXT,
  next_run_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  config_json TEXT,
  locked_until TEXT,
  locked_by TEXT,
  lock_started_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_enabled ON jobs(enabled);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
CREATE INDEX IF NOT EXISTS idx_jobs_locked_until ON jobs(locked_until);

CREATE TABLE IF NOT EXISTS job_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER,
  job_name TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  duration_ms INTEGER,
  summary TEXT,
  error_code TEXT,
  error_message TEXT,
  metadata_json TEXT,
  FOREIGN KEY(job_id) REFERENCES jobs(id)
);
CREATE INDEX IF NOT EXISTS idx_job_runs_job_name ON job_runs(job_name);
CREATE INDEX IF NOT EXISTS idx_job_runs_started_at ON job_runs(started_at);
CREATE INDEX IF NOT EXISTS idx_job_runs_status ON job_runs(status);

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

CREATE TABLE IF NOT EXISTS bot_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  state TEXT NOT NULL,
  data_json TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bot_sessions_user ON bot_sessions(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_bot_sessions_expires_at ON bot_sessions(expires_at);

CREATE TABLE IF NOT EXISTS telegram_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  delete_status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_telegram_messages_delete_status ON telegram_messages(delete_status);
CREATE INDEX IF NOT EXISTS idx_telegram_messages_created_at ON telegram_messages(created_at);

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

`;
