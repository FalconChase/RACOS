-- RACOS — ROT003: outbox-pattern sync queue (ROD002) + sync threshold tracking (ROD004).

-- Every local mutation made against a cache table (vehicles/customers/bookings/payments)
-- while offline — or even online, so the sync worker has one uniform path — is appended
-- here. entity_id is client-generated (uuid, created locally before the row ever reaches
-- Supabase) so local foreign keys resolve immediately without waiting on a round trip.
create table outbox (
  id           integer primary key autoincrement,
  entity_table text not null check (entity_table in ('vehicles', 'customers', 'bookings', 'payments')),
  entity_id    text not null,
  operation    text not null check (operation in ('insert', 'update', 'delete')),
  payload      text, -- JSON snapshot of the row at mutation time; null payload only valid for delete
  status       text not null default 'pending' check (status in ('pending', 'syncing', 'synced', 'failed')),
  retry_count  integer not null default 0,
  last_error   text,
  created_at   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  synced_at    text
);

create index idx_outbox_status on outbox (status);
create index idx_outbox_entity  on outbox (entity_table, entity_id);

-- Singleton-per-business row. offline_since is null while connectivity is confirmed;
-- set the moment a sync attempt fails due to connectivity and cleared on next success.
-- App logic evaluates ROD004 (free tier: 5 days offline OR 50 unsynced records, whichever
-- first) from offline_since + `select count(*) from outbox where status in ('pending','failed')`.
create table sync_state (
  business_id    text primary key references businesses(id),
  last_synced_at text,
  offline_since  text,
  created_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
