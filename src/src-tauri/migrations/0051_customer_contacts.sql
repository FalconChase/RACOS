-- Multiple contact details per customer (phone/email/other), additive
-- alongside the existing single phone/email fields on customers — those
-- stay exactly as they are (primary contact), this is a supplementary list.
-- type='other' expects `label` as the free-text "please specify"
-- description; label is optional for phone/email (e.g. "Work", "Emergency").
-- Freely add/edit/delete — not append-only like the ROP011 logs — every
-- change is logged to action_logs the same way other customer edits are
-- (see lib/repo/customerContacts.ts). Cascades on customer delete so
-- deleteCustomer() (which has no cleanup step of its own) never hits a
-- dangling-FK failure.
create table customer_contacts (
  id          text primary key,
  business_id text not null references businesses(id),
  customer_id text not null references customers(id) on delete cascade,
  type        text not null check (type in ('phone', 'email', 'other')),
  label       text,
  value       text not null,
  created_at  text not null,
  updated_at  text not null
);

create index idx_customer_contacts_business_id  on customer_contacts (business_id);
create index idx_customer_contacts_customer_id  on customer_contacts (customer_id);

-- outbox.entity_table CHECK widened again (same recreate-and-copy technique
-- as 0010/0028/0029/0030/0032/0040/0042).
create table outbox_new (
  id           integer primary key autoincrement,
  entity_table text not null check (entity_table in ('vehicles', 'customers', 'bookings', 'payments', 'owners', 'odometer_readings', 'gps_location_entries', 'mileage_entries', 'gps_location_labels', 'fuel_level_entries', 'booking_legs', 'customer_contacts')),
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
