-- Locks in the per-hour rate resolved (custom rate / Rate Matrix cell /
-- vehicle daily_rate fallback — see lib/pricing.ts resolveRate) at the exact
-- moment a booking is recorded, same value already used to compute
-- expected_payment but never persisted on its own until now. For a backdated
-- recording, this is still "whatever rate resolves right now" — there's no
-- separate historical rate-versioning concept, just today's Rate Matrix at
-- save time. Feeds Settlements > Records so a booking's RATE stays accurate
-- even if the Rate Matrix is edited later. Nullable: rows created before this
-- migration have no stored value and fall back to a live recompute in the UI.
alter table bookings add column resolved_rate text;
