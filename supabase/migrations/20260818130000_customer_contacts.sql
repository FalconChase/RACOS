-- RACOS — customer_contacts (see src-tauri/migrations/0051_customer_contacts.sql
-- for the full rationale). Standard tenant-scoped staff table, same shape as
-- customers_all — no owner-facing policy, same precedent as customers itself
-- (Owners' Portal never reads customer/renter identity, ROP009 migration).

create table public.customer_contacts (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  type        text not null check (type in ('phone', 'email', 'other')),
  label       text,
  value       text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_customer_contacts_business_id on public.customer_contacts (business_id);
create index idx_customer_contacts_customer_id on public.customer_contacts (customer_id);

alter table public.customer_contacts enable row level security;

create policy "customer_contacts_all" on public.customer_contacts
  for all
  using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());
