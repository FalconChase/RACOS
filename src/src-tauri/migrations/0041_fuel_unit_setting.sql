-- Business-wide default for how fuel level is logged (Tools > Entries and
-- the Owners' Portal) — a fleet typically reads gauges the same way, so this
-- is one setting rather than a per-entry choice. Each fuel_level_entries row
-- still snapshots its own unit at save time (see 0040), so switching this
-- later never misreads old entries.
alter table app_settings add column fuel_unit text not null default 'bars' check (fuel_unit in ('bars', 'liters'));
