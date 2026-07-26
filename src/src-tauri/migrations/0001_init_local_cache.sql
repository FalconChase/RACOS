-- RACOS — ROT003: local SQLite cache. Mirrors the Supabase schema from ROT002
-- (businesses/profiles/vehicles/customers/bookings/payments) with SQLite-appropriate
-- types: TEXT for uuid/timestamp columns, TEXT for money (exact decimal string —
-- avoids REAL float-rounding on currency; parsed to Decimal in app code).
--
-- No RLS here: the desktop app only ever holds the signed-in device's own tenant
-- data, fetched through the Supabase client which already enforces business_id
-- scoping server-side. business_id is still carried on every row for parity with
-- the server schema and so sync code never has to special-case the shape.

create table businesses (
  id            text primary key,
  name          text not null,
  owner_id      text not null,
  plan          text not null default 'trial',
  trial_ends_at text,
  created_at    text not null,
  updated_at    text not null
);

create table profiles (
  id          text primary key,
  business_id text not null references businesses(id),
  role        text not null default 'staff',
  full_name   text,
  created_at  text not null,
  updated_at  text not null
);

create table vehicles (
  id           text primary key,
  business_id  text not null references businesses(id),
  plate_number text not null,
  make         text,
  model        text,
  year         integer,
  status       text not null default 'available',
  daily_rate   text,
  created_at   text not null,
  updated_at   text not null
);

create table customers (
  id             text primary key,
  business_id    text not null references businesses(id),
  full_name      text not null,
  email          text,
  phone          text,
  license_number text,
  created_at     text not null,
  updated_at     text not null
);

-- pending_availability_check: ROD003 — bookings created while offline skip the
-- live availability check and land as a hold. Set to 1 at local creation when
-- offline; cleared to 0 once the sync worker runs the live check against Supabase.
-- Local-only column — has no counterpart on the server bookings table.
create table bookings (
  id                          text primary key,
  business_id                 text not null references businesses(id),
  vehicle_id                  text not null references vehicles(id),
  customer_id                 text not null references customers(id),
  start_date                  text not null,
  end_date                    text not null,
  status                      text not null default 'pending',
  total_price                 text,
  created_by                  text references profiles(id),
  pending_availability_check  integer not null default 0,
  created_at                  text not null,
  updated_at                  text not null
);

create table payments (
  id          text primary key,
  business_id text not null references businesses(id),
  booking_id  text not null references bookings(id),
  amount      text not null,
  method      text,
  status      text not null default 'pending',
  paid_at     text,
  created_at  text not null
);

create index idx_profiles_business_id  on profiles (business_id);
create index idx_vehicles_business_id  on vehicles (business_id);
create index idx_customers_business_id on customers (business_id);
create index idx_bookings_business_id  on bookings (business_id);
create index idx_bookings_vehicle_id   on bookings (vehicle_id);
create index idx_bookings_customer_id  on bookings (customer_id);
create index idx_payments_business_id  on payments (business_id);
create index idx_payments_booking_id   on payments (booking_id);
