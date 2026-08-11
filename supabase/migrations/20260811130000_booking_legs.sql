-- RACOS — multi-destination bookings. See src-tauri/migrations/0042_booking_legs.sql
-- for the full rationale (continuous chaining, creation-time-only, per-leg
-- resolved_rate). Same RLS shape as bookings itself — business-scoped staff
-- access; no owner policy since the Owners' Portal doesn't read bookings
-- directly today.

create table public.booking_legs (
  id                       uuid primary key default gen_random_uuid(),
  business_id              uuid not null references public.businesses(id) on delete cascade,
  booking_id               uuid not null references public.bookings(id) on delete cascade,
  sequence                 integer not null,
  destination_province_id  uuid references public.provinces(id),
  destination_city_id      uuid references public.municipalities(id),
  note                     text,
  start_at                 timestamptz not null,
  end_at                   timestamptz not null,
  resolved_rate            text,
  created_at               timestamptz not null default now(),
  check (end_at > start_at)
);

create index idx_booking_legs_business_id on public.booking_legs (business_id);
create index idx_booking_legs_booking_id  on public.booking_legs (booking_id);

alter table public.booking_legs enable row level security;

create policy "booking_legs_staff_select" on public.booking_legs
  for select
  using (business_id = public.current_business_id());

create policy "booking_legs_staff_insert" on public.booking_legs
  for insert
  with check (business_id = public.current_business_id());
