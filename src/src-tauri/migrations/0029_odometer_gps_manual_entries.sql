-- ROP011 — local mirror of the Supabase odometer_readings/gps_manual_entries
-- tables (see supabase/migrations/20260810210000_odometer_gps_manual_entries.sql
-- for the full rationale). Staff entries are created here first, then queued
-- through the outbox like every other synced table; the app layer never
-- exposes an update/delete for either table — a reading is permanent the
-- moment it's saved (no correction path, per ROP011's design).

create table odometer_readings (
  id                 text primary key,
  business_id        text not null references businesses(id),
  vehicle_id         text not null references vehicles(id),
  reading_km         integer not null,
  reading_at         text not null,
  recorded_at        text not null,
  recorded_by_role   text not null check (recorded_by_role in ('staff', 'owner')),
  recorded_by_id     text not null,
  recorded_by_label  text not null,
  note               text
);

create index idx_odometer_readings_business_id on odometer_readings (business_id);
create index idx_odometer_readings_vehicle_id  on odometer_readings (vehicle_id);

create table gps_manual_entries (
  id                 text primary key,
  business_id        text not null references businesses(id),
  vehicle_id         text not null references vehicles(id),
  location_text      text,
  mileage_km         integer,
  duration_minutes   integer,
  reading_at         text not null,
  recorded_at        text not null,
  recorded_by_role   text not null check (recorded_by_role in ('staff', 'owner')),
  recorded_by_id     text not null,
  recorded_by_label  text not null,
  note               text
);

create index idx_gps_manual_entries_business_id on gps_manual_entries (business_id);
create index idx_gps_manual_entries_vehicle_id  on gps_manual_entries (vehicle_id);

-- outbox.entity_table CHECK constraint widened (SQLite can't ALTER a CHECK
-- in place — same recreate-and-copy technique as 0010/0028).
create table outbox_new (
  id           integer primary key autoincrement,
  entity_table text not null check (entity_table in ('vehicles', 'customers', 'bookings', 'payments', 'owners', 'odometer_readings', 'gps_manual_entries')),
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
