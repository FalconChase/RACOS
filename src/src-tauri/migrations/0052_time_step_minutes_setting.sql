-- Minute-increment granularity for the app-wide DateTimePicker's minute dial
-- (Settings > General) — same "device-local, not-synced" pattern as
-- fuel_unit (0041): a per-device UX preference, not business data, so this
-- column is never read or written by the outbound sync worker. 15 minutes
-- by default, matching the picker's previous hardcoded interval.
alter table app_settings add column time_step_minutes integer not null default 15
  check (time_step_minutes in (1, 5, 10, 15, 20, 30));
