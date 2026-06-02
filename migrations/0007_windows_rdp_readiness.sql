-- Track when Windows RDP actually becomes reachable.
ALTER TABLE windows_installs ADD COLUMN rdp_ready_at TEXT;
ALTER TABLE windows_installs ADD COLUMN rdp_notified_at TEXT;
ALTER TABLE windows_installs ADD COLUMN rdp_check_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE windows_installs ADD COLUMN last_rdp_check_error TEXT;

CREATE INDEX IF NOT EXISTS idx_windows_installs_rdp_ready ON windows_installs(status, rdp_ready_at, rdp_notified_at);
