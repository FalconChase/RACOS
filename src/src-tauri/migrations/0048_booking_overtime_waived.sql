-- Lets staff close out a booking's overtime as "final settled" even when
-- only a partial amount was actually collected — the write-off half of
-- partial/final overtime settlement (see waiveOvertimeBalance). Null (the
-- default) means the overtime, if any, is still expected to reach the full
-- rate-formula amount; once set, Outstanding/Settlements treat the overtime
-- as fully settled regardless of the gap between additional_payment and the
-- expected figure. Local-only, like payment_status/paid_at before it — not
-- part of the Cloud mirror's narrower bookings shape (see lib/repo/sync.ts).
alter table bookings add column overtime_waived_at text;
