-- Agreement execution date — when the rental agreement was actually
-- executed/signed, distinct from created_at (when the record was entered
-- into the system, which can lag) and from start_date (the scheduled
-- pickup, which is often in the future for an advance booking). Lets staff
-- and the Owners' Portal tell an advance reservation apart from a same-day
-- walk-in. Staff-editable after creation — every correction is logged to
-- action_logs (see updateAgreementExecutedAt in lib/repo/bookings.ts), same
-- pattern as updateBookingTimes/correctBookingPayment.
alter table bookings add column agreement_executed_at text;

-- Best-guess backfill for existing rows: agreement execution wasn't tracked
-- before this column existed, so created_at (when the record was actually
-- entered) is the closest available proxy.
update bookings set agreement_executed_at = created_at where agreement_executed_at is null;
