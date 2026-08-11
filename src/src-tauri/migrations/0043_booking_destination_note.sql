-- Optional free-text note on a booking's primary destination — e.g. a
-- specific pickup point, gate code, or contact at the destination. Purely
-- informational, same spirit as purpose; never drives pricing or any other
-- logic. Each extra leg (see booking_legs) has its own independent note
-- column already — this is the primary destination's equivalent.
alter table bookings add column destination_note text;
