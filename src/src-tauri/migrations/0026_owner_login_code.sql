-- ROT020 prep — permanent login code an owner types into the Owners' Portal
-- (ROD018). Nullable: existing owners have none until staff explicitly click
-- "Generate login code" (Registry > Owners) — never auto-assigned silently,
-- since generating one requires a live round-trip to Supabase (this is the
-- action that also creates/upserts the owner's row there, not a separate
-- sync step). Uniqueness itself is enforced by Supabase's own unique
-- constraint, not locally — this column is just a read-only mirror of
-- whatever code Supabase confirmed.
alter table owners add column login_code text;
