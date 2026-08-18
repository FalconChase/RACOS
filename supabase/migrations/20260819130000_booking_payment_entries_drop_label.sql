-- Mirrors src-tauri/migrations/0055_booking_payment_entries_drop_label.sql
-- on Cloud — label was redundant with note.
alter table public.booking_payment_entries drop column label;
