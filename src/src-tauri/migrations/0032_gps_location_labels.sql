-- ROP011 follow-up — local mirror of gps_location_labels (see
-- supabase/migrations/20260810250000_gps_location_labels.sql). Upsertable
-- cache, not append-only — entry_id is the primary key so a re-resolve
-- overwrites in place, both locally and on push.

create table gps_location_labels (
  entry_id          text primary key references gps_location_entries(id),
  business_id       text not null references businesses(id),
  formatted_address text not null,
  raw_response      text,
  resolved_at       text not null
);

create index idx_gps_location_labels_business_id on gps_location_labels (business_id);

-- outbox.entity_table CHECK widened again (same recreate-and-copy technique
-- as prior migrations).
create table outbox_new (
  id           integer primary key autoincrement,
  entity_table text not null check (entity_table in ('vehicles', 'customers', 'bookings', 'payments', 'owners', 'odometer_readings', 'gps_location_entries', 'mileage_entries', 'gps_location_labels')),
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
