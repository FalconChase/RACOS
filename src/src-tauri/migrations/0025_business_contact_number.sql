-- Optional business-level contact number, editable from Settings > Business.
-- Distinct from owners.contact_number (0010_owners.sql), which is a vehicle
-- owner's own contact — this is the business's own, shown on the Home header
-- and anywhere else the business identifies itself (e.g. printed statements).
alter table business_profile add column contact_number text;
