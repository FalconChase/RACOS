-- Backfills fuel_max_level to 6 (bars) for any vehicle that doesn't have
-- one set yet — covers both vehicles registered before migration 0046 and
-- any created since without an explicit value. Going forward, new vehicles
-- get 6 automatically at creation time (see createVehicle in
-- lib/repo/vehicles.ts) rather than being asked for it at intake; it's only
-- ever adjusted afterward from the Registry Vehicles edit row.
update vehicles set fuel_max_level = 6 where fuel_max_level is null;
