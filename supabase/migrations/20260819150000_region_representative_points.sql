-- ROT052 Phase 2 — Cloud mirror of src-tauri/migrations/0058_region_representative_points.sql.
-- The heavy lifting (per-province Nominatim geocoding + distance
-- comparison) stays entirely on the device that first resolves a given
-- region; only the small finished answer syncs here, so a second device
-- never has to redo that work for the same region. Staff-only — not
-- exposed to the Owners' Portal, same precedent as customer_contacts/
-- booking_payment_entries.
--
-- province_id/municipality_id are plain text (the local PSGC slug ids,
-- e.g. 'surigao-del-sur') with no FK — provinces/municipalities are
-- local-only global reference tables (seeded once per device via
-- migration), never mirrored to Cloud at all, same reason bookings only
-- ever sync a resolved destination_label instead of raw province/
-- municipality ids (see resolveDestinationLabel in lib/repo/sync.ts).
create table public.region_representative_points (
  business_id       uuid not null references public.businesses(id) on delete cascade,
  region_name       text not null,
  hq_location_key   text not null,
  province_id       text not null,
  municipality_id   text,
  display_name      text not null,
  latitude          double precision not null,
  longitude         double precision not null,
  resolved_at       timestamptz not null,
  primary key (business_id, region_name)
);

create index idx_region_representative_points_business_id on public.region_representative_points (business_id);

alter table public.region_representative_points enable row level security;

create policy "region_representative_points_staff_all" on public.region_representative_points
  for all
  using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());
