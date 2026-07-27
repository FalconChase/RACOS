-- Toggles the compact R[..]/O[..] summary block on Settlements > Remittances
-- (screen only — the print output always includes it regardless of this
-- setting, see RemittancesReport.tsx). Off by default: it's a
-- staff/audit detail, not something an owner-facing screen needs cluttered
-- with by default.
alter table app_settings add column show_remittance_summary integer not null default 0 check (show_remittance_summary in (0, 1));
