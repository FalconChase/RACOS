-- RACOS — ROT007: local cache of the last-resolved Supabase session, so the
-- app can boot straight into the signed-in business's data when launched
-- offline (no network round-trip needed to re-resolve business_id/profile_id
-- every startup — only needed once, right after an online sign-in).
-- Single row, device-level — not synced to Supabase, not tenant data itself.
create table session_cache (
  id          integer primary key check (id = 1),
  business_id text,
  profile_id  text,
  email       text,
  updated_at  text
);

insert into session_cache (id) values (1);
