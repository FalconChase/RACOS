-- Cities/municipalities — admin-managed, NOT an exhaustive geographic seed
-- (unlike provinces). Staff register the specific ones relevant to their
-- business: their own HQ province's breakdown for Tier 1 detail, plus any
-- frequently-visited destinations elsewhere that need a custom rate.
create table cities (
  id text primary key,
  business_id text not null,
  province_id text not null references provinces(id),
  name text not null,
  created_at text not null,
  updated_at text not null
);

create index idx_cities_business_id on cities (business_id);
create index idx_cities_province_id on cities (province_id);

-- HQ can now optionally go down to city/municipality level for display
-- precision. Tier computation still runs off hq_province_id — cities don't
-- change the province/region tier math, just how specifically HQ is shown.
alter table business_profile add column hq_city_id text references cities(id);

-- Custom rate overrides: a specific city's rate takes precedence over the
-- standard tier-based rate_matrix whenever that exact city is selected as a
-- booking's destination. Built for frequently-visited destinations that
-- warrant their own negotiated rate rather than their tier's standard one.
create table custom_rates (
  id text primary key,
  business_id text not null,
  city_id text not null references cities(id),
  seating_band_id text not null references seating_bands(id),
  rate text not null,
  created_at text not null,
  updated_at text not null
);

create index idx_custom_rates_business_id on custom_rates (business_id);
create index idx_custom_rates_city_id on custom_rates (city_id);
create unique index idx_custom_rates_city_band on custom_rates (city_id, seating_band_id);

-- Bookings: destination can now optionally go down to city level, plus an
-- optional free-form purpose (no pricing/logic tied to it — display only).
alter table bookings add column destination_city_id text references cities(id);
alter table bookings add column purpose text;

-- Whether the Destination search additionally surfaces cities within the HQ's
-- own province (Tier 1). Cities with a custom rate defined always show in the
-- Destination search regardless of this toggle — otherwise there'd be no way
-- to actually pick them.
alter table app_settings add column show_tier1_cities integer not null default 0
  check (show_tier1_cities in (0, 1));
