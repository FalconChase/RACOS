-- Splits the old single "total_price" into two distinct concepts:
--   payment_amount    — manually entered by staff: what was actually collected.
--   expected_payment  — system-computed (nights x daily_rate at booking time),
--                        stored for the future Owners' portal reconciliation.
--                        Hidden from the UI by default; only ever surfaced via
--                        the Settings > Rental "Display expected payment
--                        computation" toggle, and NEVER on the Home dashboard,
--                        regardless of that toggle's state (enforced in the UI
--                        layer, not the database).
alter table bookings rename column total_price to payment_amount;
alter table bookings add column expected_payment text;

-- Rental-specific device preferences, alongside the existing date/time ones.
alter table app_settings add column duration_display text not null default 'nights'
  check (duration_display in ('nights', 'hours', 'halfDays', 'daysNights'));
alter table app_settings add column show_expected_payment integer not null default 0
  check (show_expected_payment in (0, 1));
