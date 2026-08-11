-- Caps unrealistic fuel level entries (e.g. "65 bars" on an 8-bar gauge) —
-- an optional per-vehicle ceiling, same local-only spirit as the other
-- vehicle detail fields (see migration 0021_vehicle_local_details.sql).
-- Numeric, unit-agnostic: read against whatever settings.fuelUnit currently
-- is (bars or liters) at entry time, same as the level itself.
alter table vehicles add column fuel_max_level real;
