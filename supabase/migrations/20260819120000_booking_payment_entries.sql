-- RACOS — booking_payment_entries (see
-- src-tauri/migrations/0054_booking_payment_entries.sql for the full
-- rationale). Standard tenant-scoped staff table, same shape as
-- bookings_all — no owner-facing policy; purely a staff reference, never
-- read by any billing computation.

create table public.booking_payment_entries (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  type        text not null check (type in ('fee', 'advance_payment', 'other')),
  label       text,
  amount      text,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_booking_payment_entries_business_id on public.booking_payment_entries (business_id);
create index idx_booking_payment_entries_booking_id  on public.booking_payment_entries (booking_id);

alter table public.booking_payment_entries enable row level security;

create policy "booking_payment_entries_all" on public.booking_payment_entries
  for all
  using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());
