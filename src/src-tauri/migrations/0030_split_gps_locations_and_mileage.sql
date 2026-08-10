-- ROP011 follow-up — local mirror of the Cloud split (see
-- supabase/migrations/20260810230000_split_gps_locations_and_mileage.sql).
-- gps_manual_entries never shipped with real local data either, so this is
-- a clean drop-and-recreate, not a data migration.

drop table if exists gps_manual_entries;

create table gps_location_entries (
  id                 text primary key,
  business_id        text not null references businesses(id),
  vehicle_id         text not null references vehicles(id),
  location_text      text not null,
  duration_minutes   integer,
  reading_at         text not null,
  recorded_at        text not null,
  recorded_by_role   text not null check (recorded_by_role in ('staff', 'owner')),
  recorded_by_id     text not null,
  recorded_by_label  text not null,
  note               text
);

create index idx_gps_location_entries_business_id on gps_location_entries (business_id);
create index idx_gps_location_entries_vehicle_id  on gps_location_entries (vehicle_id);

create table mileage_entries (
  id                 text primary key,
  business_id        text not null references businesses(id),
  vehicle_id         text not null references vehicles(id),
  mileage_km         integer not null,
  period_start       text not null,
  period_end         text not null,
  recorded_at        text not null,
  recorded_by_role   text not null check (recorded_by_role in ('staff', 'owner')),
  recorded_by_id     text not null,
  recorded_by_label  text not null,
  note               text
);

create index idx_mileage_entries_business_id on mileage_entries (business_id);
create index idx_mileage_entries_vehicle_id  on mileage_entries (vehicle_id);

-- outbox.entity_table CHECK widened again (same recreate-and-copy technique
-- as 0010/0028/0029) — gps_manual_entries dropped from the allowed list,
-- gps_location_entries/mileage_entries added.
create table outbox_new (
  id           integer primary key autoincrement,
  entity_table text not null check (entity_table in ('vehicles', 'customers', 'bookings', 'payments', 'owners', 'odometer_readings', 'gps_location_entries', 'mileage_entries')),
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
  select id, entity_table, entity_id, operation, payload, status, retry_count, last_error, created_at, synced_at
  from outbox
  where entity_table != 'gps_manual_entries';

drop table outbox;
alter table outbox_new rename to outbox;

create index idx_outbox_status on outbox (status);
create index idx_outbox_entity  on outbox (entity_table, entity_id);
