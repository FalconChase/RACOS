-- Home dashboard terminology — purely cosmetic, per-device display
-- preferences (same idea as date_format/time_format), never touching
-- underlying field names or stored data. Each term toggles independently so
-- staff can mix and match (e.g. adopt ETD/ETA but keep "Customer"). Only
-- read by HomeScreen.tsx — every other screen keeps saying
-- Vehicle/Customer/Start/End regardless of these.
alter table app_settings add column dash_label_unit integer not null default 0 check (dash_label_unit in (0, 1));
alter table app_settings add column dash_label_lessee integer not null default 0 check (dash_label_lessee in (0, 1));
alter table app_settings add column dash_label_etd integer not null default 0 check (dash_label_etd in (0, 1));
alter table app_settings add column dash_label_eta integer not null default 0 check (dash_label_eta in (0, 1));
