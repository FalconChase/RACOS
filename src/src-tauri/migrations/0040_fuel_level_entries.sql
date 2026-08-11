-- Fuel level log — same append-only/two-timestamp shape as odometer_readings
-- (ROP011, migration 0029/0030): reading_at (claimed observation time) vs
-- recorded_at (system time), no update/delete path anywhere in this schema,
-- a reading locks the instant it's saved. unit is snapshotted per entry
-- (not read live off Settings at display time) so a later change to the
-- business's fuel_unit setting can never make an old entry misread.
create table fuel_level_entries (
  id                 text primary key,
  business_id        text not null references businesses(id),
  vehicle_id         text not null references vehicles(id),
  level              real not null,
  unit               text not null check (unit in ('bars', 'liters')),
  reading_at         text not null,
  recorded_at        text not null,
  recorded_by_role   text not null check (recorded_by_role in ('staff', 'owner')),
  recorded_by_id     text not null,
  recorded_by_label  text not null,
  note               text
);

create index idx_fuel_level_entries_business_id on fuel_level_entries (business_id);
create index idx_fuel_level_entries_vehicle_id  on fuel_level_entries (vehicle_id);

-- outbox.entity_table CHECK widened again (same recreate-and-copy technique
-- as 0010/0028/0029/0030/0032).
create table outbox_new (
  id           integer primary key autoincrement,
  entity_table text not null check (entity_table in ('vehicles', 'customers', 'bookings', 'payments', 'owners', 'odometer_readings', 'gps_location_entries', 'mileage_entries', 'gps_location_labels', 'fuel_level_entries')),
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
