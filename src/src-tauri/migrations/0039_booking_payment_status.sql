-- Lets a booking be recorded before the customer has actually paid (rare —
-- a known/trusted customer case) instead of forcing "amount collected" to
-- always mean money already in hand. 'paid' is the default so every
-- existing booking (and every booking staff doesn't touch this for) keeps
-- today's behavior unchanged. paid_at is null until a 'receivable' booking
-- is explicitly marked paid later (see markBookingPaid) — created_at alone
-- already captures when the booking itself was logged, paid_at captures the
-- separate moment money actually came in.
alter table bookings add column payment_status text not null default 'paid' check (payment_status in ('paid', 'receivable'));
alter table bookings add column paid_at text;
