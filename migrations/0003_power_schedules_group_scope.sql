-- Upgrade migration for databases that already have groups/account group_id but
-- were initialized before group-scoped power schedules existed.
-- Safe to run once. Do not run if power_schedules.group_id already exists.

ALTER TABLE power_schedules ADD COLUMN group_id INTEGER REFERENCES groups(id);
