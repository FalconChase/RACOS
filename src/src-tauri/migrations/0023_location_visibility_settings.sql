-- Which island groups' provinces show up in pickers/reference lists (Rate
-- Matrix, booking destination, owner address, HQ province) — a device-level
-- display preference (app_settings), not tenant data. All on by default; the
-- UI (Settings > Locations) refuses to let the last one be switched off,
-- since hiding every island group would leave every picker empty. That
-- "at least one" rule is enforced in the app, not here — SQLite's ADD COLUMN
-- can't express a check across multiple columns added one at a time.
alter table app_settings add column show_luzon integer not null default 1 check (show_luzon in (0, 1));
alter table app_settings add column show_visayas integer not null default 1 check (show_visayas in (0, 1));
alter table app_settings add column show_mindanao integer not null default 1 check (show_mindanao in (0, 1));
