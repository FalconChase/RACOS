-- ROT020 prep — owners table on Supabase, minimal partial mirror (ROD019) of
-- the local owners table: just what the Owners' Portal login/identity needs.
-- login_code is the permanent login credential (ROD018) — unique, generated
-- client-side with a retry-on-collision loop against this constraint, not a
-- separate uniqueness-check step. No auth.users row is created for owners;
-- portal login goes through a dedicated Edge Function (service role),
-- entirely separate from staff/business Supabase Auth.

create table public.owners (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  full_name   text not null,
  login_code  text unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_owners_business_id on public.owners (business_id);

alter table public.owners enable row level security;

create policy "owners_all" on public.owners
  for all
  using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

create trigger set_updated_at before update on public.owners
  for each row execute function public.set_updated_at();
