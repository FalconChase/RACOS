-- Widen action_logs.entity_type to also allow 'booking' — Rentals now has a
-- staff-facing time-edit action (fixing a fat-fingered actual departure/
-- return, or scheduled Out/Due-back, after the fact), logged here the same
-- way owner/vehicle edits already are. SQLite can't ALTER a CHECK constraint
-- in place, so the table is recreated with the widened constraint and its
-- existing rows copied over.
create table action_logs_new (
  id           text primary key,
  business_id  text not null references businesses(id),
  entity_type  text not null check (entity_type in ('owner', 'vehicle', 'booking')),
  entity_id    text not null,
  entity_label text not null,
  action       text not null check (action in ('created', 'updated')),
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
