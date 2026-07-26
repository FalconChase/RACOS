-- Actual departure tracking — mirrors actual_return_at (0012) but for the
-- other end of the rental. Null means the booking is still 'pending' and
-- hasn't been confirmed as departed yet, even once its scheduled Out/ETD time
-- has already passed (surfaced as a live "departure due" flag in the UI,
-- symmetric to the overdue-return one). Once set — either at createBooking
-- time when the rental had already begun by save time, or later via
-- markBookingDeparted's "Mark departed" action — status moves to 'active' and
-- the vehicle to 'rented'.
alter table bookings add column actual_departure_at text;
