-- RACOS — booking agreement execution date (see src-tauri/migrations/
-- 0050_booking_agreement_executed_at.sql for the full rationale). Cloud
-- mirror so the Owners' Portal can tell an advance booking apart from a
-- same-day one and give the owner advance notice. No RLS change needed —
-- the existing owner_read_own_bookings/staff policies already cover every
-- column on the row.

alter table public.bookings add column agreement_executed_at timestamptz;
