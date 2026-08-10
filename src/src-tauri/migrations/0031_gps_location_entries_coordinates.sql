-- ROP011 follow-up — "Record through MAP" trail recorder. Mirrors
-- supabase/migrations/20260810240000_gps_location_entries_coordinates.sql.
-- SQLite has no real CHECK-across-columns enforcement worth relying on
-- here (it can express it, but the app layer already guarantees the pair
-- is set together — see repo/gpsLocationEntries.ts), so this is a plain
-- column add, no constraint.

alter table gps_location_entries add column latitude real;
alter table gps_location_entries add column longitude real;
