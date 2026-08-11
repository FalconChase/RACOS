-- Structured customer address — same shape as Owner's (address_province_id +
-- address_municipality_id + free-text address_line), same shared geo
-- reference tables. Optional at intake (unlike Owner's, which is required),
-- editable later from Customers.
alter table customers add column address_province_id text references provinces(id);
alter table customers add column address_municipality_id text references municipalities(id);
alter table customers add column address_line text;
