-- RACOS — ROP011 follow-up: split gps_manual_entries into two tables with
-- genuinely different shapes. A location pin is a point-in-time observation
-- (reading_at/recorded_at, same lock rule as odometer_readings); a mileage
-- figure covers a period (period_start/period_end, daily by default but
-- rangeable per row) — forcing both into one optional-field row stopped
-- making sense once Mileage needed its own date range. gps_manual_entries
-- has zero rows in Cloud (confirmed before this migration), so this is a
-- clean drop-and-recreate, not a data migration.

drop table if exists public.gps_manual_entries;

-- ---------------------------------------------------------------------------
-- gps_location_entries — self-reported "vehicle was here at this time"
-- ---------------------------------------------------------------------------

create table public.gps_location_entries (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses(id) on delete cascade,
  vehicle_id        uuid not null references public.vehicles(id) on delete cascade,
  location_text     text not null,
  duration_minutes  integer check (duration_minutes is null or duration_minutes >= 0),
  reading_at        timestamptz not null,
  recorded_at       timestamptz not null default now(),
  recorded_by_role  text not null check (recorded_by_role in ('staff', 'owner')),
  recorded_by_id    uuid not null,
  recorded_by_label text not null,
  note              text,
  check (reading_at <= recorded_at)
);

create index idx_gps_location_entries_business_id on public.gps_location_entries (business_id);
create index idx_gps_location_entries_vehicle_id  on public.gps_location_entries (vehicle_id);

-- ---------------------------------------------------------------------------
-- mileage_entries — a mileage figure (hand-copied from Traccar for now, see
-- ROP011) covering a period. Daily by default (period_start = period_end) at
-- the form level, but the row itself allows any range. Assumes the
-- project's Postgres session runs UTC (Supabase default) for the
-- period_end <= recorded_at::date comparison, same as every other
-- timestamptz column here.
-- ---------------------------------------------------------------------------

create table public.mileage_entries (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses(id) on delete cascade,
  vehicle_id        uuid not null references public.vehicles(id) on delete cascade,
  mileage_km        integer not null check (mileage_km >= 0),
  period_start      date not null,
  period_end        date not null,
  recorded_at       timestamptz not null default now(),
  recorded_by_role  text not null check (recorded_by_role in ('staff', 'owner')),
  recorded_by_id    uuid not null,
  recorded_by_label text not null,
  note              text,
  check (period_end >= period_start),
  check (period_end <= (recorded_at)::date)
);

create index idx_mileage_entries_business_id on public.mileage_entries (business_id);
create index idx_mileage_entries_vehicle_id  on public.mileage_entries (vehicle_id);

-- ---------------------------------------------------------------------------
-- RLS — same shape as odometer_readings (select + insert only, staff and
-- owner, no update/delete anywhere — append-only by omission).
-- ---------------------------------------------------------------------------

alter table public.gps_location_entries enable row level security;
alter table public.mileage_entries      enable row level security;

create policy "gps_location_entries_staff_select" on public.gps_location_entries
  for select
  using (business_id = public.current_business_id());

create policy "gps_location_entries_staff_insert" on public.gps_location_entries
  for insert
  with check (
    business_id = public.current_business_id()
    and recorded_by_role = 'staff'
    and recorded_by_id = (select auth.uid())
  );

create policy "gps_location_entries_owner_select" on public.gps_location_entries
  for select
  using (
    business_id = public.current_owner_business_id()
    and vehicle_id in (select id from public.vehicles where owner_id = public.current_owner_id())
  );

create policy "gps_location_entries_owner_insert" on public.gps_location_entries
  for insert
  with check (
    business_id = public.current_owner_business_id()
    and recorded_by_role = 'owner'
    and recorded_by_id = public.current_owner_id()
    and vehicle_id in (select id from public.vehicles where owner_id = public.current_owner_id())
  );

create policy "mileage_entries_staff_select" on public.mileage_entries
  for select
  using (business_id = public.current_business_id());

create policy "mileage_entries_staff_insert" on public.mileage_entries
  for insert
  with check (
    business_id = public.current_business_id()
    and recorded_by_role = 'staff'
    and recorded_by_id = (select auth.uid())
  );

create policy "mileage_entries_owner_select" on public.mileage_entries
  for select
  using (
    business_id = public.current_owner_business_id()
    and vehicle_id in (select id from public.vehicles where owner_id = public.current_owner_id())
  );

create policy "mileage_entries_owner_insert" on public.mileage_entries
  for insert
  with check (
    business_id = public.current_owner_business_id()
    and recorded_by_role = 'owner'
    and recorded_by_id = public.current_owner_id()
    and vehicle_id in (select id from public.vehicles where owner_id = public.current_owner_id())
  );
