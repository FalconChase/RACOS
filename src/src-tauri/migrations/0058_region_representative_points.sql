-- ROT052 Phase 2 — caches the resolved "representative point" for a
-- region-level destination pick (see lib/repo/regionRepresentativePoints.ts):
-- the farthest province within a region from HQ, plus that province's
-- capital municipality if flagged (migration 0057). Resolved lazily (only
-- when Map/Analytics actually need to draw something for a region-picked
-- booking, never at booking-save time) and cached forever per region — a
-- province's location doesn't change, so this never needs re-resolving
-- unless HQ itself moves (see hq_location_key below).
--
-- Unlike destination_geocodes (deliberately local-only, ROD026), this
-- table's small finished ANSWER is synced to Cloud — the actual heavy
-- lifting (the province-by-province Nominatim geocoding + distance
-- comparison) still happens entirely on-device via the existing
-- destination_geocodes cache/pipeline; only the final resolved result
-- travels through the outbox, same upsertable-cache precedent as
-- gps_location_labels. That way a second device never has to redo the
-- Nominatim work another device already did for the same region.
--
-- region_name is the natural key (one representative point per region per
-- business) — a fresh resolve overwrites in place rather than creating a
-- second row. hq_location_key snapshots which HQ this was computed against
-- (buildLocationKey(hq_province_id, hq_city_id), same format
-- destination_geocodes already uses) — a mismatch against the business's
-- *current* HQ means the cached row is stale (HQ moved since), and the next
-- read lazily re-resolves rather than needing any active invalidation hook
-- wired into Settings.
create table region_representative_points (
  business_id       text not null references businesses(id),
  region_name       text not null,
  hq_location_key   text not null,
  province_id       text not null references provinces(id),
  municipality_id   text references municipalities(id),
  display_name      text not null,
  latitude          real not null,
  longitude         real not null,
  resolved_at       text not null,
  primary key (business_id, region_name)
);

create index idx_region_representative_points_business_id on region_representative_points (business_id);

-- outbox.entity_table CHECK widened again (same recreate-and-copy technique
-- as prior migrations).
create table outbox_new (
  id           integer primary key autoincrement,
  entity_table text not null check (entity_table in ('vehicles', 'customers', 'bookings', 'payments', 'owners', 'odometer_readings', 'gps_location_entries', 'mileage_entries', 'gps_location_labels', 'fuel_level_entries', 'booking_legs', 'customer_contacts', 'booking_payment_entries', 'region_representative_points')),
  entity_id    text not null,
  operation    text not null check (operation in ('insert', 'update', 'delete')),
  payload      text,
  status       text not null default 'pending' check (status in ('pending', 'syncing', 'synced', 'failed')),
  retry_count  integer not null default 0,
  last_error   text,
  created_at   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  synced_at    text
);

insert into outbox_new (id, entity_table, entity_id, operation, payload, status, retry_count, last_error, created_at, synced_at)
  select id, entity_table, entity_id, operation, payload, status, retry_count, last_error, created_at, synced_at from outbox;

drop table outbox;
alter table outbox_new rename to outbox;

create index idx_outbox_status on outbox (status);
create index idx_outbox_entity  on outbox (entity_table, entity_id);
