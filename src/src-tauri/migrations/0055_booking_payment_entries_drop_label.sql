-- Drops booking_payment_entries.label (added 0054) — redundant with `note`
-- once the grid-style Payment step UI shipped (no separate "please specify"
-- field needed; note carries that detail for type='other' too). tauri-
-- plugin-sql bundles a modern SQLite (3.35+), so a direct DROP COLUMN is
-- supported without the recreate-and-copy dance CHECK-constraint changes
-- elsewhere in this project need.
alter table booking_payment_entries drop column label;
