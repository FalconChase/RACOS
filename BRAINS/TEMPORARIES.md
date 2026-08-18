# TEMPORARIES.md
# Live working memory for RACOS. Per-project (O006). 100-line cap. Managed by UPDATER.md.
---
## ACTIVE
| ID | PRIORITY | ITEM | BLOCKED BY |
|----|----------|------|------------|
| —  | —        | No active items | — |

## BLOCKED
| ID | PRIORITY | ITEM | BLOCKED BY |
|----|----------|------|------------|
| —  | —        | None | — |

## NEXT
| ID | PRIORITY | ITEM | BLOCKED BY |
|----|----------|------|------------|
| ROT021 | HIGH | Cold-start inbound sync — on first sign-in with no local cache (e.g. new/replacement device), pull that business's existing data down from Supabase into local SQLite | — |
| ROT046 | MED | Printable rental agreement — print action on an existing booking (Bookings/Settlements, reprint anytime, not tied to Checkout); auto-fills renter+vehicle info, dates/duration, payment terms, destination/purpose; physical signature lines only (no digital capture); clause/legal language to be supplied by Falcon, layout+data-binding is the build | — |

## DONE
| ID | PRIORITY | ITEM | SESSION |
|----|----------|------|---------|
| ROT001 | HIGH | Tauri 2 + React + TS + Tailwind scaffold | SES001 |
| ROT002 | HIGH | Supabase project creation + RLS schema on business_id | SES002 |
| ROT003 | MED  | SQLite local cache schema + outbox table              | SES003 |
| ROT004 | HIGH | Local-first desktop UI (Vehicles/Customers/Bookings/Home/Checkout/Settings), dark theme, pickers | SES004 |
| ROT005 | MED  | Rate Matrix pricing — tiers + custom per-city rates wired through booking + checkout | SES005 |
| ROT006 | MED  | Global PSGC municipalities table; HQ relocated to Settings; dangling cities-FK fix | SES006 |
| ROT008 | MED  | Rate Matrix panel on booking form; pricing finalized on exact hours (no half-day billing) | SES007 |
| ROT009 | HIGH | Owners + Registry tab, action_logs/Action History, Fleet registration simplified | SES007 |
| ROT010 | HIGH | Booking lifecycle overhaul — timing-derived status, vehicle status auto-sync, overdue/departure-due guards | SES007 |
| ROT011 | HIGH | Settlements module — Records/Remittances, single-shared-bucket breakdown billing (PDF-verified), print, business name, R/O summary toggle | SES008 |
| ROT012 | MED  | Booking safety guards — pre-save duration confirmation, editable actual-return time w/ history, Fleet Status read-only | SES008 |
| ROT013 | MED  | Tools tab + Car Activity — per-vehicle month timeline, overlap detection, viewport-fit grid, self-clamping tooltip | SES008 |
| ROT014 | HIGH | Tools > Logs tab (owner/vehicle filters, sort modes, print) + lifecycle audit trail — action_logs widened, cancellation requires reason + departure snapshot, auto-mark-departed setting | SES009 |
| ROT015 | HIGH | GPS pipeline (Stage 0+1 proven) — Traccar replacing DAGPS, vehicle_locations + gps_device_id on Supabase, gps-ingest Edge Function, full local pipeline tested with real GPS data | SES010 |
| ROT016 | MED  | Map tab + Fleet remodel + Registry > Vehicles subtab + car-detail popup w/ Fill/Fit image | SES011 |
| ROT017 | MED  | Remittances Recorded-split mode + Remittance period filter/boundary banner + calendar highlighting + toolbar fix | SES011 |
| ROT018 | MED  | Settlements payment correction (additive-only, capped at expected, logged) | SES011 |
| ROT019 | MED  | Settings > Locations island-group toggle + top-destination quick-pick chips | SES011 |
| ROT007 | HIGH | Real Supabase Auth wired: sign in/up, business+profile provisioning, offline session fallback, legacy dev-data reassignment | SES012 |
| ROT022-023 | — | Home identity header + Settings contact field; UI cleanup (search bar/titles removed, sync badge to sidebar); Account sign-out; owner login-code system (Supabase owners table, generate-code action) | SES013 |
| —  | HIGH | ROT020 code-login Edge Function (`owner-login`, custom HS256 JWT session model, ROD020) — deployed, verify_jwt off, JWT_SECRET set, verified end to end against a real owner code (Invoke-RestMethod, real signed JWT returned) | SES014 |
| —  | MED  | ROT020 portal scaffold (/RACOS/portal, Next.js + TS + Tailwind, login/dashboard skeleton) — verified end to end by Falcon (real login code → dashboard, owner name from JWT); RC011 (Turbopack/lightningcss on Windows) hit and fixed, dev/build scripts pinned to `--webpack` | SES014 |
| ROT024 | HIGH | Outbound sync worker (ROP009, promoted from PLANS.md) — outbox drain to Supabase, idempotent upserts, connectivity-aware sync_state tracking; Cloud vehicles/bookings widened (seats/owner_id/chassis/engine_number; destination_label/purpose/payment fields/actual timestamps); owner JWT-claim RLS added | SES015 |
| ROT020 | HIGH | Owners' Portal real data screens — Vehicle status, Activity log, Financials, reading owner-scoped Supabase data (owner RLS) via createOwnerClient | SES015 |
| ROT025 | MED  | Factory reset AND Reset test data both removed (bulk-wiping a business's own history undermines transparency, even local-only/logged); action_logs widened for 'system'/'reset' (migration 0028) so the remaining bulk tool, Clear stale test data (cross-business rows only), is always logged (ROD021) | SES015 |
| ROT026-030 | HIGH | ROP011 — odometer_readings/gps_location_entries/mileage_entries (append-only via RLS omission, variance tracking); Tools > Entries (Odometer Log/GPS Log/Reports) desktop; Owners' Portal Entries tab (first write access); Record through MAP trail recorder; Convert to location (Nominatim, gps_location_labels cache); Map tab per-vehicle logged-history trail + MiniMapModal | SES016 |
| ROT031-032 | MED  | Data model round (customer address, bookings.payment_status, fuel_level_entries + settings.fuelUnit, booking_legs + destination_note, vehicles.notes/color/description); Registry Vehicles polish (Description/Color/Fuel dropdown, Owner locked on edit row, optional fields mirrored to intake) | SES017 |
| ROT033-036 | HIGH | New rental rebuilt into a 5-step Cancel-only popup wizard (bordered-table structure, inline fuel/odometer logging, bidirectional customer Contact/Address edits, reached-step review nav); RC013-016 fixed (portal-based dropdown popups, scroll-close self-catch, ArrivalDialog implicit-submit + ghost-click guards); Home "Record booking" auto-opens the wizard (Walk-in check-out removed); vehicles.fuel_max_level caps fuel entries, Registry-edit-only, default 6 | SES017 |
| ROT037-043 | HIGH | Customers > Outstanding tab (unsettled overtime + receivables, shared settle logic w/ Settlements via overtimeSettlement.ts, confirm-before-record dialogs on Mark as paid/Settle overtime); partial vs. final overtime settlement (overtime_waived_at write-off, typed "WRITE OFF" confirm, WaiveOvertimeButton); booking Payment amount now required (never blank); Map Destination history layer (destination_geocodes cache, Nominatim forward-geocode, aggregated per-place pins); Analytics tab (per-vehicle revenue/utilization/overtime/top-destinations/mileage/odometer, hand-rolled MiniChart SVGs); Booking vs GPS Log corroboration (soft text-match by vehicle+window, Map compare layer + Analytics flagged list); GPS trail distance/speed (haversine + moving-time excluding logged parking duration); HQ as origin datum (geocoded from HQ province/city, permanent Map pin, displacement+Tier shown in Map popups + Analytics) | SES018 |
| ROT044-045 | MED  | GPS Log sheet — digitized paper-form view (Tools > GPS Log > Log sheet, lib/gpsLogSheet.ts point-to-adjacent-point distance/speed) + matching Analytics chart section, no new schema; Logs nav consolidation — new top-level Logs tab merging Settlements > Records + Tools > Logs, Outstanding relocated from Customers into Settlements, ArrivalDialog overtime field copy clarified (no schema/logic change) | SES019 |
| ROT047 | HIGH | Agreement execution date (`bookings.agreement_executed_at`, migration 0050 local + Cloud) — New rental Summary step field (DateTimePicker, date+time), blank defaults to same date+time as Out (not real "today"), guarded to never be after Out's date (createBooking + updateAgreementExecutedAt, time-of-day exempt), editable/correctable via `updateAgreementExecutedAt()` (audit-logged) + row-level "Edit agreement date" action/dialog (DateTimePicker, same guard), outbound sync widened, Owners' Portal Activity log shows a "Booked on" column + "Advance" badge on pending bookings booked ahead of their start date | SES020 |
| ROT048 | MED | Multi-entry customer contacts (`customer_contacts` table, migration 0051 local + Cloud, cascades on customer delete) — additive alongside the existing single phone/email fields, every add/edit/remove logged, synced to Cloud (staff-only). Customers screen: "Edit address"+"Contacts" consolidated into one "Edit info" row action (address + CustomerContactsPanel together, `hideHeader` mode). New rental Profile step: collapsible "See more contact information" under Contact no. (`showMoreContacts`, default collapsed) — live CustomerContactsPanel for an existing selected customer (bidirectional, writes immediately), DraftContactsEditor staging list for a not-yet-created walk-in (persisted via createCustomerContact right after createCustomer in saveBooking) | SES020 |
| ROT049 | MED | Hybrid destination/address search (`HybridLocationSearch.tsx`) — single search box added *alongside* (not replacing) every existing province-then-city picker pair: New rental's primary Destination, each extra leg's own destination, New rental Profile's Address, Customers' add-customer Address, and `CustomerAddressEditRow`. Typed tokens in either order ("city province" or "province city"), full PSGC list (same island-group-visibility filter as the dropdowns it sits next to), substring match ranked above a typo-tolerant character-subsequence fallback. Picking a result sets both province+city dropdowns at once | SES020 |
| ROT050 | MED | App-wide DateTimePicker (`DateTimePicker.tsx`, migration 0052 `app_settings.time_step_minutes` + 0053 default flip) — replaces every DatePicker+TimePicker pair (New rental Out/Due back + leg Due back, ArrivalDialog custom time, EditBookingTimesDialog actual return, and Agreement executed on both the Summary step + EditAgreementDateDialog) with one continuous auto-advancing popup: calendar → circular hour dial → circular minute dial → closes. 12h dial + AM/PM toggle or 24h two-ring dial per `settings.timeFormat`; minute-dial spacing per `timeStepMinutes` setting (Settings > General, default 5). Remittances period filter (genuinely date-only) and the separate native `datetime-local` log-entry screens left untouched | SES020 |
| ROT051 | MED | Supplementary booking payment breakdown (`booking_payment_entries`, migration 0054 local+Cloud, staff-only sync, `lib/repo/bookingPaymentEntries.ts`) — type (Fee/Advance payment/Other) + optional amount + optional note per row, purely informational, never read by `payment_amount`/`expected_payment`/`additional_payment` or any Settlements/Remittances/Outstanding computation. First built list-style (New rental wizard toggle + existing-booking row-action dialog); after Falcon's Excel-mockup follow-up, the New rental wizard's Payment step was rebuilt as `PaymentBreakdownGrid.tsx` — one table: Payment row is a pure redisplay of the existing required amount/AR fields (same validation, no new data path), Fee/Others are fixed always-shown rows, "+" adds extra rows with their own type dropdown, Total is an on-screen-only sum. The entries' original `label` field (redundant with `note`) was dropped via migration 0055 (Local+Cloud). The existing-booking row-action dialog (`BookingPaymentEntriesDialog.tsx`/`Panel.tsx`) stays list-style for now — Falcon's call whether to rebuild it into the grid too, after seeing this version | SES020 |

---
# Lines: 60 / 100 — Budget remaining: 40
