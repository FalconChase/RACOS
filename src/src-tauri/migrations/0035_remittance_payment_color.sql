-- Text color for the actual-payment figure on Settlements > Remittances
-- (the bold number in the Payment column — "expected: X" underneath it
-- always stays muted, unaffected). Settings > Settlements lets staff pick
-- any color; blue is just the shipped default, not a hardcoded rule.
alter table app_settings add column remittance_payment_color text not null default '#3b82f6';
