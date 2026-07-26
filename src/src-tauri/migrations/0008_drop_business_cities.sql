-- Replace the business-scoped, free-text `cities` table (introduced in 0006)
-- with the global, PSGC-sourced `municipalities` table (0007). Rationale:
-- requiring staff to manually register each city/municipality before it could
-- be selected was needless friction now that a real, structured reference
-- list exists -- any municipality is selectable immediately, everywhere.
--
-- Existing city references become stale: there is no reliable automatic
-- mapping from a free-text city name to a real municipality row, so
-- dependent columns are reset to null rather than guessed. This only affects
-- pre-release/dev data.
--
-- Note: hq_city_id (business_profile), destination_city_id (bookings), and
-- city_id (custom_rates) keep their column names but now store
-- municipalities.id values instead of cities.id values. SQLite does not
-- enforce foreign keys in this project (verified separately), so the
-- declared `references cities(id)` on these columns is inert rather than
-- functionally broken once `cities` is dropped below.
delete from custom_rates;
update business_profile set hq_city_id = null;
update bookings set destination_city_id = null;
drop table cities;

-- Tier 1 is simply "same province as HQ" -- the toggle that broke a Tier-1
-- province into a per-city breakdown added complexity without enough value.
alter table app_settings drop column show_tier1_cities;
