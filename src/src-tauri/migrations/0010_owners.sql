-- Vehicle owners/investors — a business registers the people who actually
-- own the vehicles in its fleet. From this migration forward, the app layer
-- requires every vehicle to be tied to one (see NewVehicleInput.owner_id in
-- lib/repo/vehicles.ts) — same "required by the form, nullable at the DB
-- level" pattern already used for bookings.destination_province_id, so
-- existing pre-migration vehicle rows aren't broken by a hard NOT NULL.
create table owners (
  id             text primary key,
  business_id    text not null references businesses(id),
  full_name      text not null,
  contact_number text,
  created_at     text not null,
  updated_at     text not null
);

create index idx_owners_business_id on owners (business_id);

alter table vehicles add column owner_id text references owners(id);

create index idx_vehicles_owner_id on vehicles (owner_id);

-- outbox.entity_table has a CHECK constraint listing every valid cache table
-- by name (see 0002_outbox_and_sync_state.sql); SQLite can't ALTER a CHECK
-- constraint in place, so the table is recreated with 'owners' added to the
-- allowed list, carrying over all existing rows unchanged (same technique
-- 0009_fix_city_fk_targets.sql used for its table rebuilds).
create table outbox_new (
  id           integer primary key autoincrement,
  entity_table text not null check (entity_table in ('vehicles', 'customers', 'bookings', 'payments', 'owners')),
  entity_id    text not null,
  operation    text not null check (operation in ('insert', 'update', 'delete')),
  payload      text,
  status       text not null default 'pending' check (status in ('pending', 'syncing', 'synced', 'failed')),
  retry_count  integer not null default 0,
  last_error   text,
  created_at   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  synced_at    text
);

insert into outbox_new (
  id, entity_table, entity_id, operation, payload, status, retry_count, last_error, created_at, synced_at
)
  select id, entity_table, entity_id, operation, payload, status, retry_count, last_error, created_at, synced_at
  from outbox;

drop table outbox;
alter table outbox_new rename to outbox;

create index idx_outbox_status on outbox (status);
create index idx_outbox_entity  on outbox (entity_table, entity_id);
