-- Optional free-text notes on a vehicle — e.g. known quirks, maintenance
-- reminders, anything staff want on file beyond the structured fields.
-- Local-only, same spirit as fuel/fuel_capacity/transmission/car_image (see
-- migration 0021_vehicle_local_details.sql) — no Supabase counterpart.
alter table vehicles add column notes text;
