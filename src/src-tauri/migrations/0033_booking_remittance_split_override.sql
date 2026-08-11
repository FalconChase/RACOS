-- Per-booking override for which Remittances breakdown math applies once
-- Split is set to "Hybrid" (see RemittancesReport.tsx) — lets staff pick
-- Bucket (clean rate per block, whole variance absorbed on the last one) or
-- Recorded (real payment split proportionally by hours) case by case, and
-- have that choice remembered on reprint rather than re-decided every time
-- the report is opened. Null means unset — Hybrid falls back to Bucket by
-- default for that booking. Has no effect at all outside Hybrid mode; the
-- top-level Bucket/Recorded tabs still apply uniformly regardless of this
-- column.
alter table bookings add column remittance_split_override text check (remittance_split_override in ('bucket', 'recorded'));
