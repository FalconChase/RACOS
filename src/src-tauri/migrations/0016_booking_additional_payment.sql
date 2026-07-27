-- What staff collected specifically for overtime, kept separate from the
-- original payment_amount (the base rental payment). Set only via "Mark
-- returned" when the confirmed arrival time lands after the booking's
-- scheduled due-back (end_date) — never touched by a normal on-time/early
-- return. Nullable: most bookings never have overtime at all.
alter table bookings add column additional_payment text;
