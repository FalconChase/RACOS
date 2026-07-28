-- Widen action_logs.action to cover the rest of a booking's lifecycle —
-- cancelBooking(), markBookingReturned(), and markBookingDeparted() now each
-- log their own event ('cancelled', 'completed', 'departed' respectively),
-- alongside the existing 'created'/'updated' used by owner/vehicle records
-- and updateBookingTimes(). Tools > Logs reads these to show each booking's
-- full action timeline. SQLite can't ALTER a CHECK constraint in place, so
-- (same as 0017) the table is recreated with the widened constraint and its
-- existing rows copied over.
create table action_logs_new (
  id           text primary key,
  business_id  text not null references businesses(id),
  entity_type  text not null check (entity_type in ('owner', 'vehicle', 'booking')),
  entity_id    text not null,
  entity_label text not null,
  action       text not null check (action in ('created', 'updated', 'completed', 'cancelled', 'departed')),
  changes      text, -- JSON array of {field, label, old, new}; null for 'created' entries
  performed_by text,
  created_at   text not null
);

insert into action_logs_new (id, business_id, entity_type, entity_id, entity_label, action, changes, performed_by, created_at)
  select id, business_id, entity_type, entity_id, entity_label, action, changes, performed_by, created_at from action_logs;

drop table action_logs;
alter table action_logs_new rename to action_logs;

create index idx_action_logs_business_id on action_logs (business_id);
create index idx_action_logs_entity      on action_logs (entity_type, entity_id);
