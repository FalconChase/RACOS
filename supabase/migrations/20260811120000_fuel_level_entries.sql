-- RACOS — ROP011 follow-up: fuel level log, same append-only/two-timestamp
-- shape and same staff+owner write model as odometer_readings (see
-- 20260810210000_odometer_gps_manual_entries.sql). unit is snapshotted per
-- row rather than read live off app_settings.fuel_unit, so a later change to
-- the business's default never misreads an old entry.

create table public.fuel_level_entries (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses(id) on delete cascade,
  vehicle_id        uuid not null references public.vehicles(id) on delete cascade,
  level             numeric not null check (level >= 0),
  unit              text not null check (unit in ('bars', 'liters')),
  reading_at        timestamptz not null,
  recorded_at       timestamptz not null default now(),
  recorded_by_role  text not null check (recorded_by_role in ('staff', 'owner')),
  recorded_by_id    uuid not null,
  recorded_by_label text not null,
  note              text,
  check (reading_at <= recorded_at)
);

create index idx_fuel_level_entries_business_id on public.fuel_level_entries (business_id);
create index idx_fuel_level_entries_vehicle_id  on public.fuel_level_entries (vehicle_id);

-- RLS — select + insert only, both roles, same as odometer_readings/
-- gps_location_entries. No update/delete policy for anyone: that omission
-- is what makes a saved entry immutable, not an app-layer guard.
alter table public.fuel_level_entries enable row level security;

create policy "fuel_level_entries_staff_select" on public.fuel_level_entries
  for select
  using (business_id = public.current_business_id());

create policy "fuel_level_entries_staff_insert" on public.fuel_level_entries
  for insert
  with check (
    business_id = public.current_business_id()
    and recorded_by_role = 'staff'
    and recorded_by_id = (select auth.uid())
  );

create policy "fuel_level_entries_owner_select" on public.fuel_level_entries
  for select
  using (
    business_id = public.current_owner_business_id()
    and vehicle_id in (select id from public.vehicles where owner_id = public.current_owner_id())
  );

create policy "fuel_level_entries_owner_insert" on public.fuel_level_entries
  for insert
  with check (
    business_id = public.current_owner_business_id()
    and recorded_by_role = 'owner'
    and recorded_by_id = public.current_owner_id()
    and vehicle_id in (select id from public.vehicles where owner_id = public.current_owner_id())
  );
