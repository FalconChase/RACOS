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

---
# Lines: 52 / 100 — Budget remaining: 48
