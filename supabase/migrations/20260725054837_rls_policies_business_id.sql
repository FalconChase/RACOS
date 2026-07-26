-- RACOS — ROT002: RLS policies scoped by business_id (ROD001: tenant isolation via Supabase RLS)
-- Note: businesses_select/insert/update, profiles_select/insert/update were later replaced
-- by migration 20260725054949_optimize_rls_initplan.sql (auth.uid() wrapped in `select`).

alter table public.businesses enable row level security;
alter table public.profiles   enable row level security;
alter table public.vehicles   enable row level security;
alter table public.customers  enable row level security;
alter table public.bookings   enable row level security;
alter table public.payments   enable row level security;

-- ---------------------------------------------------------------------------
-- vehicles / customers / bookings / payments — standard tenant policy.
-- Every row must belong to the caller's business, on read and on write.
-- ---------------------------------------------------------------------------

create policy "vehicles_all" on public.vehicles
  for all
  using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

create policy "customers_all" on public.customers
  for all
  using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

create policy "bookings_all" on public.bookings
  for all
  using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

create policy "payments_all" on public.payments
  for all
  using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

-- businesses — no profile exists yet at signup time, so scope by owner_id, not
-- current_business_id(). Staff of the business can read it via current_business_id().
create policy "businesses_select" on public.businesses
  for select
  using (owner_id = auth.uid() or id = public.current_business_id());

create policy "businesses_insert" on public.businesses
  for insert
  with check (owner_id = auth.uid());

create policy "businesses_update" on public.businesses
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- no delete policy — deprovisioning a tenant is an admin/support operation, not client-facing.

-- profiles — a user can always see/edit their own row, and can see colleagues
-- within the same business. Insert is self-only (onboarding creates own profile).
create policy "profiles_select" on public.profiles
  for select
  using (id = auth.uid() or business_id = public.current_business_id());

create policy "profiles_insert" on public.profiles
  for insert
  with check (id = auth.uid());

create policy "profiles_update" on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());
