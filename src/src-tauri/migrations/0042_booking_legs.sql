-- Multi-destination bookings — optional extra stops beyond a booking's own
-- primary destination (bookings.destination_province_id/city_id, unchanged).
-- Each leg is continuous with the one before it (leg N's start_at is always
-- the previous leg's end_at, or the booking's own end_date for the first
-- extra leg) — enforced by the booking form at creation time, not a DB
-- constraint. Legs are only ever created alongside the booking itself
-- (createBooking) — no add/edit/remove path for an already-saved booking in
-- this first pass. resolved_rate mirrors bookings.resolved_rate: the rate
-- this specific leg's own destination resolved to at creation time, locked
-- in so it stays accurate even if the Rate Matrix changes later.
create table booking_legs (
  id                       text primary key,
  business_id              text not null references businesses(id),
  booking_id               text not null references bookings(id),
  sequence                 integer not null,
  destination_province_id  text references provinces(id),
  destination_city_id      text references municipalities(id),
  note                     text,
  start_at                 text not null,
  end_at                   text not null,
  resolved_rate            text,
  created_at               text not null
);

create index idx_booking_legs_business_id on booking_legs (business_id);
create index idx_booking_legs_booking_id  on booking_legs (booking_id);

-- outbox.entity_table CHECK widened again (same recreate-and-copy technique
-- as 0010/0028/0029/0030/0032/0040).
create table outbox_new (
  id           integer primary key autoincrement,
  entity_table text not null check (entity_table in ('vehicles', 'customers', 'bookings', 'payments', 'owners', 'odometer_readings', 'gps_location_entries', 'mileage_entries', 'gps_location_labels', 'fuel_level_entries', 'booking_legs')),
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
