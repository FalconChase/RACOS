-- RACOS — ROP009/ROT021 prep: widen Cloud vehicles/bookings (ROD019 partial
-- mirror) so the outbound sync worker has real columns to push into, and add
-- Owners' Portal read-only RLS (owner JWT claims, ROD020) so owner sessions
-- can read their own vehicles/bookings straight through PostgREST.
--
-- Cloud stays a deliberately narrower mirror than Local (ROD019) — car_image/
-- fuel/transmission/etc. remain local-only. destination is pushed as a single
-- denormalized text label (destination_label), not a province/city FK pair,
-- because the provinces/municipalities reference tables are local-only
-- (global PSGC data, never synced) — the sync worker resolves the label from
-- the local geo tables before pushing.

-- ---------------------------------------------------------------------------
-- vehicles — widen
-- ---------------------------------------------------------------------------

alter table public.vehicles
  add column seats          int,
  add column owner_id       uuid references public.owners(id) on delete set null,
  add column chassis_number text,
  add column engine_number  text;

create index idx_vehicles_owner_id on public.vehicles (owner_id);

-- ---------------------------------------------------------------------------
-- bookings — widen
-- ---------------------------------------------------------------------------
-- New money fields follow the project-wide text convention (exact decimal
-- string, no float rounding — see SCHEMA_LIBRARY.md header) even though the
-- original total_price stayed numeric(10,2) — that column is frozen/dormant
-- (see SCHEMA_LIBRARY.md "Dormant tables"), untouched here.

alter table public.bookings
  add column destination_label  text,
  add column purpose            text,
  add column payment_amount     text,
  add column expected_payment   text,
  add column resolved_rate      text,
  add column additional_payment text,
  add column actual_return_at   timestamptz,
  add column actual_departure_at timestamptz;

-- ---------------------------------------------------------------------------
-- Owner JWT claim helpers — mirrors current_business_id() but reads the
-- custom owner_id/business_id claims minted by owner-login (ROD020) instead
-- of resolving through the profiles table (which has no row for an owner —
-- owners never get a real auth.users/profiles row, ROD018).
-- ---------------------------------------------------------------------------

create or replace function public.current_owner_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'owner_id', '')::uuid;
$$;

create or replace function public.current_owner_business_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'business_id', '')::uuid;
$$;

revoke execute on function public.current_owner_id() from public;
revoke execute on function public.current_owner_id() from anon;
grant execute on function public.current_owner_id() to authenticated;

revoke execute on function public.current_owner_business_id() from public;
revoke execute on function public.current_owner_business_id() from anon;
grant execute on function public.current_owner_business_id() to authenticated;

-- ---------------------------------------------------------------------------
-- Owner-scoped read-only RLS. Additive alongside the existing staff
-- "..._all" policies — Postgres RLS OR-combines multiple permissive policies
-- for the same command, so a staff session (current_business_id() resolves,
-- current_owner_id() is null) and an owner session (the reverse) each match
-- only their own policy; neither can see the other's data through this path.
--
-- No policy is added for customers — the Owners' Portal activity screens
-- show vehicle/dates/status only, never renter identity (privacy default,
-- not yet a formal RACOS.md decision — revisit if a real need shows up).
-- ---------------------------------------------------------------------------

create policy "owner_read_own_vehicles" on public.vehicles
  for select
  using (
    owner_id is not null
    and owner_id = public.current_owner_id()
    and business_id = public.current_owner_business_id()
  );

create policy "owner_read_own_bookings" on public.bookings
  for select
  using (
    business_id = public.current_owner_business_id()
    and vehicle_id in (
      select id from public.vehicles
      where owner_id = public.current_owner_id()
    )
  );

-- Owners can already read their own owners row indirectly (the JWT itself
-- carries full_name from login time) — no additional owners policy needed
-- beyond the existing "owners_all" staff policy.
