-- Perf advisor: wrap auth.uid() as (select auth.uid()) so Postgres evaluates it
-- once per statement instead of once per row.

drop policy "businesses_select" on public.businesses;
create policy "businesses_select" on public.businesses
  for select
  using (owner_id = (select auth.uid()) or id = public.current_business_id());

drop policy "businesses_insert" on public.businesses;
create policy "businesses_insert" on public.businesses
  for insert
  with check (owner_id = (select auth.uid()));

drop policy "businesses_update" on public.businesses;
create policy "businesses_update" on public.businesses
  for update
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select
  using (id = (select auth.uid()) or business_id = public.current_business_id());

drop policy "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles
  for insert
  with check (id = (select auth.uid()));

drop policy "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
