-- Local-only vehicle detail fields for the Fleet car-detail popup. No server/
-- Supabase counterpart on purpose (especially car_image, which would be a poor
-- fit for a synced text column) — these stay device-local, same spirit as
-- app_settings. A future outbound sync worker (ROP009) must not attempt to
-- push these columns.
alter table vehicles add column fuel text;
alter table vehicles add column fuel_capacity text;
alter table vehicles add column transmission text;
-- Base64 data URL, embedded directly in the row rather than a file-path
-- reference, so it travels with the local racos.db file rather than
-- dangling if the app or image moves to a different machine.
alter table vehicles add column car_image text;
