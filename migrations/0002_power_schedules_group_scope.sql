ALTER TABLE power_schedules ADD COLUMN group_id INTEGER REFERENCES groups(id);
