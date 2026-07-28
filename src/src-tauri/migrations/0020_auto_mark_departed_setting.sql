-- Toggles whether a "pending" booking gets automatically confirmed as
-- departed (same as markBookingDeparted's "same as scheduled ETD" option)
-- once its scheduled start_date passes, instead of waiting for staff to
-- click Mark departed themselves. On by default — the departure due badge
-- already assumed this was expected; this just closes the loop
-- automatically unless staff turn it off. See AutoDepartureRunner.
alter table app_settings add column auto_mark_departed integer not null default 1 check (auto_mark_departed in (0, 1));
