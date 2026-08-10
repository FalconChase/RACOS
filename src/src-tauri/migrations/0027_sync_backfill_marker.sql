-- RACOS — ROT024 follow-up: one-time backfill marker. The outbox only ever
-- gained entries going forward from ROT003 — rows created/last-touched
-- before the sync worker (ROT024, SES015) existed have no outbox history at
-- all, so the worker would otherwise never know to push them. backfilled_at
-- lets the sync worker queue every pre-existing local row exactly once per
-- business, then never again (idempotent — re-running would just re-queue
-- already-synced rows as harmless no-op upserts, but there's no reason to).
alter table sync_state add column backfilled_at text;
