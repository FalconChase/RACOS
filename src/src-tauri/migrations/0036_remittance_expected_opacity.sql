-- Opacity (0-100) applied to Remittances' reference/comparison text — the
-- "expected: X" line, its note, and the R[..]/O[..] summary indicator row.
-- These render at the theme's normal text color (--text-primary: near-black
-- on the printed page, near-white on screen) with this opacity layered on
-- top, rather than a fixed grey — 50% by default reads as a mid-grey either
-- way without hardcoding a color that has to be kept in sync per theme.
alter table app_settings add column remittance_expected_opacity integer not null default 50 check (remittance_expected_opacity between 0 and 100);
