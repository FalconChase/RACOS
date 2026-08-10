-- ROP011 follow-up — "Convert to location" for map-recorded coordinates.
-- A friendly display label (reverse-geocoded via Nominatim, client-side),
-- deliberately NOT an attempt to match into the provinces/municipalities
-- PSGC tables — different naming conventions, real fuzzy-matching problem,
-- out of scope for now.
--
-- This is a 1:1 cache keyed by the entry it resolves, not another
-- append-only log — gps_location_entries itself stays immutable (nothing
-- is ever written back onto it), but a label can be re-resolved/overwritten
-- since it's just a display convenience, not an audit record.

create table public.gps_location_labels (
  entry_id          uuid primary key references public.gps_location_entries(id) on delete cascade,
  business_id       uuid not null references public.businesses(id) on delete cascade,
  formatted_address text not null,
  raw_response      jsonb,
  resolved_at       timestamptz not null default now()
);

create index idx_gps_location_labels_business_id on public.gps_location_labels (business_id);

alter table public.gps_location_labels enable row level security;

create policy "gps_location_labels_staff_all" on public.gps_location_labels
  for all
  using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

create policy "gps_location_labels_owner_select" on public.gps_location_labels
  for select
  using (
    business_id = public.current_owner_business_id()
    and entry_id in (
      select id from public.gps_location_entries
      where vehicle_id in (select id from public.vehicles where owner_id = public.current_owner_id())
    )
  );
