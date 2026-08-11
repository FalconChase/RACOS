-- Flips Settlements > Remittances' R[..]/O[..] paid-vs-expected summary line
-- to visible on screen by default. Migration 0018 shipped it off by default
-- as a staff/audit-only detail; now that Hybrid split (0033) needs it to
-- decide Bucket vs Recorded per booking, it belongs on by default rather
-- than behind a trip to Settings first. app_settings is a single local row
-- (id = 1) created back in migration 0003, not something a fresh insert
-- ever recreates, so existing installs need this explicit flip rather than
-- relying on a new column default.
update app_settings set show_remittance_summary = 1 where id = 1;
