-- Add single-instance scoped power schedules.
-- Safe to run once. Do not run if power_schedules.instance_id already exists.

ALTER TABLE power_schedules ADD COLUMN instance_id INTEGER;
ALTER TABLE schedule_runs ADD COLUMN instance_id INTEGER;
