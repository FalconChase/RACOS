-- RACOS — ROP011: second, software-side tamper-defense layer (distinct from
-- ROP010's hardware angle). GPS alone (Traccar) is a single, spoofable
-- signal for catching unreported extensions/bookings — this adds two
-- corroborating, append-only log types:
--
-- odometer_readings — a physical, harder-to-fake second signal. Either a
-- staff member or the vehicle's owner can log one, independently of each
-- other; comparison happens later (Reports, deferred), not at write time.
-- No correction path exists anywhere in this schema — a reading locks the
-- instant it's saved. reading_at (claimed observation time) and recorded_at
-- (system time) are both kept so the gap between them ("logged 3d late") is
-- itself visible signal, not discarded. reading_at <= recorded_at is
-- enforced at the DB level, not just the UI — an entry can never claim a
-- time that hasn't happened yet.
--
-- gps_manual_entries — the manual GPS tool. Automatic Traccar ingestion
-- (daily mileage, location history) doesn't exist yet, so for now this
-- table also holds hand-copied Traccar figures alongside self-reported
-- location pins — location_text and mileage_km are both optional, but at
-- least one must be present. Same reading_at/recorded_at/lock rules as
-- odometer_readings.
--
-- Both sides get the same tool (owner in the Owners' Portal, staff in the
-- admin app's Tools > Entries) — staff's copy is optional/can be left
-- unused (their booking records already serve as their half of the
-- comparison), but isn't removed: an owner's entries are compared against
-- the staff's own entries when those exist, falling back to the booking
-- records themselves when they don't.
--
-- This is also the Owners' Portal's first write access (ROD005 was
-- read-only-everywhere) — scoped to just these two tables via the
-- owner_insert_* policies below; every other table keeps owner sessions
-- select-only.

-- ---------------------------------------------------------------------------
-- odometer_readings
-- ---------------------------------------------------------------------------

create table public.odometer_readings (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses(id) on delete cascade,
  vehicle_id       uuid not null references public.vehicles(id) on delete cascade,
  reading_km       integer not null check (reading_km >= 0),
  reading_at       timestamptz not null,
  recorded_at      timestamptz not null default now(),
  recorded_by_role text not null check (recorded_by_role in ('staff', 'owner')),
  recorded_by_id   uuid not null,
  recorded_by_label text not null,
  note             text,
  check (reading_at <= recorded_at)
);

create index idx_odometer_readings_business_id on public.odometer_readings (business_id);
create index idx_odometer_readings_vehicle_id  on public.odometer_readings (vehicle_id);

-- ---------------------------------------------------------------------------
-- gps_manual_entries
-- ---------------------------------------------------------------------------

create table public.gps_manual_entries (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses(id) on delete cascade,
  vehicle_id        uuid not null references public.vehicles(id) on delete cascade,
  location_text     text,
  mileage_km        integer check (mileage_km is null or mileage_km >= 0),
  duration_minutes  integer check (duration_minutes is null or duration_minutes >= 0),
  reading_at        timestamptz not null,
  recorded_at       timestamptz not null default now(),
  recorded_by_role  text not null check (recorded_by_role in ('staff', 'owner')),
  recorded_by_id    uuid not null,
  recorded_by_label text not null,
  note              text,
  check (reading_at <= recorded_at),
  check (location_text is not null or mileage_km is not null)
);

create index idx_gps_manual_entries_business_id on public.gps_manual_entries (business_id);
create index idx_gps_manual_entries_vehicle_id  on public.gps_manual_entries (vehicle_id);

-- ---------------------------------------------------------------------------
-- RLS — select + insert only, for both roles. No update/delete policy is
-- defined for anyone on either table, on either role — that omission (not
-- an app-layer guard) is what actually makes a saved entry immutable:
-- RLS defaults to deny, so Postgres itself has no path to modify a row here
-- once inserted, service-role bulk tools aside.
-- ---------------------------------------------------------------------------

alter table public.odometer_readings  enable row level security;
alter table public.gps_manual_entries enable row level security;

create policy "odometer_readings_staff_select" on public.odometer_readings
  for select
  using (business_id = public.current_business_id());

create policy "odometer_readings_staff_insert" on public.odometer_readings
  for insert
  with check (
    business_id = public.current_business_id()
    and recorded_by_role = 'staff'
    and recorded_by_id = (select auth.uid())
  );

create policy "odometer_readings_owner_select" on public.odometer_readings
  for select
  using (
    business_id = public.current_owner_business_id()
    and vehicle_id in (select id from public.vehicles where owner_id = public.current_owner_id())
  );

create policy "odometer_readings_owner_insert" on public.odometer_readings
  for insert
  with check (
    business_id = public.current_owner_business_id()
    and recorded_by_role = 'owner'
    and recorded_by_id = public.current_owner_id()
    and vehicle_id in (select id from public.vehicles where owner_id = public.current_owner_id())
  );

create policy "gps_manual_entries_staff_select" on public.gps_manual_entries
  for select
  using (business_id = public.current_business_id());

create policy "gps_manual_entries_staff_insert" on public.gps_manual_entries
  for insert
  with check (
    business_id = public.current_business_id()
    and recorded_by_role = 'staff'
    and recorded_by_id = (select auth.uid())
  );

create policy "gps_manual_entries_owner_select" on public.gps_manual_entries
  for select
  using (
    business_id = public.current_owner_business_id()
    and vehicle_id in (select id from public.vehicles where owner_id = public.current_owner_id())
  );

create policy "gps_manual_entries_owner_insert" on public.gps_manual_entries
  for insert
  with check (
    business_id = public.current_owner_business_id()
    and recorded_by_role = 'owner'
    and recorded_by_id = public.current_owner_id()
    and vehicle_id in (select id from public.vehicles where owner_id = public.current_owner_id())
  );
