-- Registry: unified owner + vehicle registration.
--
-- Owner address — required by the new Registry form going forward, nullable
-- at the DB level for existing owner rows (same pattern as
-- bookings.destination_province_id / vehicles.owner_id). Structured as
-- province + municipality (reusing the existing shared geo reference
-- tables) plus a free-text line for street-level detail.
alter table owners add column address_province_id text references provinces(id);
alter table owners add column address_municipality_id text references municipalities(id);
alter table owners add column address_line text;

-- Vehicle detail fields the Registry form collects optionally at intake and
-- allows editing later — chassis/engine identifiers and GPS tracker info.
alter table vehicles add column chassis_number text;
alter table vehicles add column engine_number text;
alter table vehicles add column gps_device_id text;
alter table vehicles add column gps_provider text;
alter table vehicles add column gps_notes text;

-- Action history — every edit to an owner or vehicle record is logged here
-- for transparency (per-field old/new values), surfaced read-only in
-- Settings. entity_label is a snapshot (plate number / owner name) taken at
-- log time so history still reads sensibly even if the record is later
-- deleted. Local-only for now — not pushed through the outbox/sync engine.
create table action_logs (
  id           text primary key,
  business_id  text not null references businesses(id),
  entity_type  text not null check (entity_type in ('owner', 'vehicle')),
  entity_id    text not null,
  entity_label text not null,
  action       text not null check (action in ('created', 'updated')),
  changes      text, -- JSON array of {field, label, old, new}; null for 'created' entries
  performed_by text,
  created_at   text not null
);

create index idx_action_logs_business_id on action_logs (business_id);
create index idx_action_logs_entity      on action_logs (entity_type, entity_id);
