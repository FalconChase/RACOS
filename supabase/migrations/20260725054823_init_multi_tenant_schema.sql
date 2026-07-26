-- RACOS — ROT002: dedicated Supabase project schema + RLS on business_id
-- Multi-tenant vehicle rental/leasing SaaS. Tenant isolation via RLS scoped by business_id (ROD001).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- TABLES
-- ---------------------------------------------------------------------------

-- Tenant root. One row per rental business signed up to RACOS.
create table public.businesses (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  owner_id      uuid not null references auth.users(id) on delete cascade,
  plan          text not null default 'trial' check (plan in ('trial', 'free', 'paid')),
  trial_ends_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Extends auth.users. One row per staff/owner user, linked to exactly one business.
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  role        text not null default 'staff' check (role in ('owner', 'manager', 'staff')),
  full_name   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.vehicles (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  plate_number text not null,
  make        text,
  model       text,
  year        int,
  status      text not null default 'available' check (status in ('available', 'rented', 'maintenance', 'retired')),
  daily_rate  numeric(10, 2),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.customers (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  full_name      text not null,
  email          text,
  phone          text,
  license_number text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.bookings (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  vehicle_id  uuid not null references public.vehicles(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  start_date  timestamptz not null,
  end_date    timestamptz not null,
  status      text not null default 'pending' check (status in ('pending', 'confirmed', 'active', 'completed', 'cancelled')),
  total_price numeric(10, 2),
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_date > start_date)
);

create table public.payments (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  amount      numeric(10, 2) not null,
  method      text,
  status      text not null default 'pending' check (status in ('pending', 'paid', 'refunded', 'failed')),
  paid_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- INDEXES — every tenant-scoped table gets a business_id index (RLS filters on it constantly)
-- ---------------------------------------------------------------------------

create index idx_profiles_business_id  on public.profiles (business_id);
create index idx_vehicles_business_id  on public.vehicles (business_id);
create index idx_customers_business_id on public.customers (business_id);
create index idx_bookings_business_id  on public.bookings (business_id);
create index idx_bookings_vehicle_id   on public.bookings (vehicle_id);
create index idx_bookings_customer_id  on public.bookings (customer_id);
create index idx_payments_business_id  on public.payments (business_id);
create index idx_payments_booking_id   on public.payments (booking_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.businesses
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.vehicles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.customers
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- current_business_id() — resolves the caller's business_id from their profile row.
-- security definer + fixed search_path so it can read profiles regardless of the
-- caller's own RLS grants (avoids recursive-policy issues on the profiles table).
-- ---------------------------------------------------------------------------

create or replace function public.current_business_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select business_id from public.profiles where id = auth.uid();
$$;
