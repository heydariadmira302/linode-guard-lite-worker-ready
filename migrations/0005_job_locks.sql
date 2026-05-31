-- Add cooperative locks for Cloudflare Cron Job Runner.
-- Safe to run once. Do not run if jobs.locked_until / jobs.locked_by /
-- jobs.lock_started_at already exist because SQLite/D1 ADD COLUMN is not idempotent.

ALTER TABLE jobs ADD COLUMN locked_until TEXT;
ALTER TABLE jobs ADD COLUMN locked_by TEXT;
ALTER TABLE jobs ADD COLUMN lock_started_at TEXT;
CREATE INDEX IF NOT EXISTS idx_jobs_locked_until ON jobs(locked_until);
