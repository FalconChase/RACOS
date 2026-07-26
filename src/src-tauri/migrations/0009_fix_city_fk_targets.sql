-- Migration 0008 dropped the `cities` table, but three columns still had
-- `references cities(id)` baked into their declared schema:
-- business_profile.hq_city_id, custom_rates.city_id, bookings.destination_city_id.
--
-- Earlier migrations were dry-run tested with Python's sqlite3 module, which
-- leaves `PRAGMA foreign_keys` OFF by default, so a dangling FK target never
-- surfaced as an error there. The actual app runs on tauri-plugin-sql (sqlx),
-- which enables foreign key enforcement — so any write to these columns now
-- fails hard with "no such table: main.cities". This migration recreates the
-- three affected tables (SQLite has no ALTER TABLE for changing a column's
-- REFERENCES target) so those FKs point at `municipalities(id)` instead,
-- carrying over all existing data and indexes unchanged.

-- business_profile ------------------------------------------------------
create table business_profile_new (
  business_id text primary key,
  hq_province_id text references provinces(id),
  updated_at text not null,
  hq_city_id text references municipalities(id)
);
insert into business_profile_new (business_id, hq_province_id, updated_at, hq_city_id)
  select business_id, hq_province_id, updated_at, hq_city_id from business_profile;
drop table business_profile;
alter table business_profile_new rename to business_profile;

-- custom_rates ------------------------------------------------------------
create table custom_rates_new (
  id text primary key,
  business_id text not null,
  city_id text not null references municipalities(id),
  seating_band_id text not null references seating_bands(id),
  rate text not null,
  created_at text not null,
  updated_at text not null
);
insert into custom_rates_new (id, business_id, city_id, seating_band_id, rate, created_at, updated_at)
  select id, business_id, city_id, seating_band_id, rate, created_at, updated_at from custom_rates;
drop table custom_rates;
alter table custom_rates_new rename to custom_rates;

create index idx_custom_rates_business_id on custom_rates (business_id);
create index idx_custom_rates_city_id on custom_rates (city_id);
create unique index idx_custom_rates_city_band on custom_rates (city_id, seating_band_id);

-- bookings ------------------------------------------------------------------
create table bookings_new (
  id                          text primary key,
  business_id                 text not null references businesses(id),
  vehicle_id                  text not null references vehicles(id),
  customer_id                 text not null references customers(id),
  start_date                  text not null,
  end_date                    text not null,
  status                      text not null default 'pending',
  payment_amount              text,
  created_by                  text references profiles(id),
  pending_availability_check  integer not null default 0,
  created_at                  text not null,
  updated_at                  text not null,
  expected_payment            text,
  destination_province_id     text references provinces(id),
  destination_city_id         text references municipalities(id),
  purpose                     text
);
insert into bookings_new (
  id, business_id, vehicle_id, customer_id, start_date, end_date, status,
  payment_amount, created_by, pending_availability_check, created_at, updated_at,
  expected_payment, destination_province_id, destination_city_id, purpose
)
  select
    id, business_id, vehicle_id, customer_id, start_date, end_date, status,
    payment_amount, created_by, pending_availability_check, created_at, updated_at,
    expected_payment, destination_province_id, destination_city_id, purpose
  from bookings;
drop table bookings;
alter table bookings_new rename to bookings;

create index idx_bookings_business_id on bookings (business_id);
create index idx_bookings_vehicle_id on bookings (vehicle_id);
create index idx_bookings_customer_id on bookings (customer_id);
