-- Actual return/arrival tracking — distinct from end_date (the ETA staff
-- entered). Nullable: null means the vehicle hasn't been marked back yet, so
-- the booking is still "active" and the vehicle still "rented", even past its
-- due-back time (susceptible to being extended). Once set, the booking moves
-- to 'completed' and the vehicle back to 'available'.
alter table bookings add column actual_return_at text;
