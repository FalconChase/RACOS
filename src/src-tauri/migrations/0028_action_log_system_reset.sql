-- Widen action_logs for admin-level bulk actions (Settings > Developer
-- tools): entity_type gains 'system' (the action isn't about one specific
-- owner/vehicle/booking row, it's a business-wide operation), action gains
-- 'reset' (Reset test data / Clear stale test data). Philosophy going
-- forward: these tools may still wipe LOCAL rows, but every admin action —
-- including bulk ones — gets logged, never silently. SQLite can't ALTER a
-- CHECK constraint in place, so (same as 0017/0019) the table is recreated
-- with the widened constraints and existing rows copied over.
create table action_logs_new (
  id           text primary key,
  business_id  text not null references businesses(id),
  entity_type  text not null check (entity_type in ('owner', 'vehicle', 'booking', 'system')),
  entity_id    text not null,
  entity_label text not null,
  action       text not null check (action in ('created', 'updated', 'completed', 'cancelled', 'departed', 'reset')),
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
