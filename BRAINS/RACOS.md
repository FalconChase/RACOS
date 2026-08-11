# RACOS.md
# Project sub-brain for RACOS. Tier 5. Loaded when RACOS is the active domain.
# Hard ceiling: 120 lines. Amendment threshold: 100 lines.
# v0.1 — GAP onboarding output. Initial plan — subject to change as the build proceeds.
---
## PROJECT
NAME        : RACOS
DESCRIPTION : Multi-tenant SaaS for vehicle rental/leasing businesses — Tauri desktop ops app + Supabase backend + read-only owners' web portal
ONBOARDED   : 2026-07-25

---
## STACK
- Desktop ops app: Tauri 2 + React + TypeScript + Tailwind
- Local cache: SQLite — outbox-pattern sync (PowerSync considered, not adopted)
- Owners' portal: Next.js + TypeScript + Tailwind — browser-based, any device
- Backend: Supabase — Postgres + Auth + Storage, single project
- Tenant isolation: Row Level Security scoped by business_id

---
## INFRA
| ITEM             | VALUE |
|------------------|-------|
| Supabase project | RACOS — ref nnsjqnxvpkercbbwvqjj, region ap-northeast-1, org FalconBit Org |
| Core tables      | businesses, profiles, vehicles, customers, bookings, payments, vehicle_locations (all RLS-enabled) |
| GPS pipeline     | Traccar (self-hosted, replaces DAGPS) → gps-ingest Edge Function → vehicle_locations; vehicles.gps_device_id is the match key |
| Migrations (server) | /RACOS/supabase/migrations/ |
| Local cache      | SQLite via tauri-plugin-sql; mirrors core tables + outbox + sync_state |
| Migrations (local) | /RACOS/src/src-tauri/migrations/ |
| Owners' Portal | /RACOS/portal — Next.js/TS/Tailwind, code-login via `owner-login` Edge Function, verified end to end (SES014); real data screens (Vehicle status/Activity log/Financials) shipped SES015; `next dev`/`build` pinned to `--webpack` (RC011) |
| Outbound sync | /RACOS/src/src/lib/repo/sync.ts — hourly auto-drain of `outbox` to Supabase (SyncRunner) + manual "Sync now" (Settings > Account); one-time per-business backfill (sync_state.backfilled_at) queues pre-ROT024 local rows; Cloud vehicles/bookings widened + owner-scoped read RLS same migration (SES015, ROP009) |

---
## PHASE
Phase 0 build. Desktop app has a full working screen set (Home, Fleet, Map, Registry, Customers, Bookings/Rentals, Checkout, Settings, Rate Matrix, Settlements, Tools) running against the local SQLite cache, with real Supabase Auth (ROT007) — no more dev placeholder tenant. Booking lifecycle and vehicle status auto-sync end to end; Settlements, Tools, and cancellation/payment-correction audit trails have shipped. GPS pipeline (Traccar) proven end to end but not yet wired into the desktop app's live-tracking read side. As of SES015, local→Cloud data actually flows: the outbound sync worker (ROT024/ROP009) drains the outbox continuously, and the Owners' Portal (ROT020) reads real owner-scoped data through it. SES016 shipped ROP011 (software tamper-defense layer): Tools > Entries (Odometer Log / GPS Log / Reports) on desktop, the Owners' Portal's first-ever write access, and the Map tab now plots a selected vehicle's logged GPS history as a trail (still no live pins). SES017 shipped a data-model round (customer address, booking payment_status, fuel_level_entries, booking_legs, vehicle notes/color/description/fuel_max_level) and rebuilt New rental end to end into a 5-step Cancel-only popup wizard (bidirectional customer edits, inline fuel/odometer logging, reached-step review navigation) driven entirely by Falcon's mockups/screenshots. Still open: cold-start inbound sync (ROT021), enforcing the ROD004 free-tier threshold — otherwise nothing queued, awaiting Falcon's next scoping pass.

---
## STATE

### ACTIVE
| ID | PRIORITY | ITEM             | BLOCKED BY |
|----|----------|------------------|------------|
| —  | —        | No active items  | —          |

### BLOCKED
| ID | PRIORITY | ITEM | BLOCKED BY |
|----|----------|------|------------|
| —  | —        | None | —          |

### NEXT
| ID | PRIORITY | ITEM             | BLOCKED BY |
|----|----------|------------------|------------|
| ROT021 | HIGH | Cold-start inbound sync — first sign-in with no local cache pulls that business's existing data down from Supabase | — |

### DONE
| ID | PRIORITY | ITEM        | SESSION |
|----|----------|-------------|---------|
| ROT001-006 | — | Phase 0 foundation: Tauri/React/TS/Tailwind scaffold, Supabase project + RLS schema, SQLite local cache + outbox, full local-first desktop UI (core screens/theme/pickers/settings), Rate Matrix tier pricing, PSGC municipalities + HQ relocation | SES001-006 |
| ROT007 | HIGH | Real Supabase Auth wired: sign in/up (email+password), business+profile provisioning, session persists across restarts, offline fallback via local session_cache, legacy DEV_BUSINESS_ID local test data auto-reassigned to the real business on first real login | SES012 |
| ROT008-010 | — | Rate Matrix panel (exact-hour billing, no half-day rounding); Owners + Registry (owners table, unified Vehicle & Owner Registry, action_logs, structured owner address); Booking lifecycle overhaul (timing-derived status, auto vehicle-status sync, live overdue/departure counters) | SES007 |
| ROT011-014 | — | Settlements (Records + Remittances, single-shared-bucket breakdown billing, print, R/O toggle); booking safety guards (duration confirmation, editable return time, read-only Fleet Status); Tools tab + Car Activity timeline (overlap detection); Tools > Logs + full lifecycle audit trail (cancellation reason + departure snapshot, auto-mark-departed) | SES008-009 |
| ROT015 | HIGH | GPS tracking pipeline (Stage 0+1 proven, Traccar replacing DAGPS): vehicle_locations table + vehicles.gps_device_id/gps_provider/gps_notes on Supabase, RLS via current_business_id(); gps-ingest Edge Function deployed; full local pipeline (Docker Traccar + Android phone) tested end-to-end with real GPS data | SES010 |
| ROT016-019 | MED | Map tab + Fleet remodel + Registry>Vehicles subtab + car-detail popup (Fill/Fit image); Remittances Recorded-split mode + period filter/boundary banner + calendar highlighting; Settlements payment correction (additive-only, capped, logged); Settings>Locations island-group toggle + top-destination quick-pick chips | SES011 |
| ROT022-023 | — | Home identity header (business name/HQ/email/contact) + Settings contact number field; global UI cleanup (search bar + per-tab titles removed, pending-sync badge moved into sidebar); Settings > Account sign-out; owner login-code system (Supabase owners table + RLS, generate-code action) — ROT020 prep, verified end to end | SES013 |
| ROT020 | HIGH | Owners' Portal complete: owner identity + login-code system, code-login Edge Function, portal scaffold (SES014), plus real data screens (Vehicle status, Activity log, Financials) reading owner-scoped Supabase data via RLS | SES014-015 |
| ROT024 | HIGH | Outbound sync worker (ROP009, promoted from PLANS.md) — hourly auto-drain of `outbox` to Supabase (silent, ROD002-aligned) + manual "Sync now" (Settings > Account, single-flight-guarded against the auto poller — never runs both at once), idempotent upserts, connectivity-aware (halts batch + sets `sync_state.offline_since` on network failure, clears on next success); one-time per-business backfill queues pre-ROT024 local rows that never had outbox history; Cloud `vehicles`/`bookings` widened to match (seats/owner_id/chassis/engine_number; destination_label/purpose/payment fields/actual timestamps); owner JWT-claim RLS (`current_owner_id()`/`current_owner_business_id()`) added for the Owners' Portal's read-only access | SES015 |
| ROT025 | MED | Factory reset AND Reset test data both removed — bulk-wiping a business's own real booking history (even local-only, even logged) undermines RACOS's transparency guarantees; sign-out + fresh signup covers the one legitimate use (pre-launch demo cleanup). `action_logs` widened (`entity_type` +'system', `action` +'reset', migration 0028) so the one bulk tool that remains, Clear stale test data (cross-business rows only, never this business's own data), is always logged — per ROD021 | SES015 |
| ROT026-030 | HIGH | ROP011 — odometer_readings + gps_location_entries + mileage_entries (append-only via RLS omission, ROD022, two-timestamp variance); Tools > Entries (Odometer Log / GPS Log [Locations+Mileage] / Reports cross-check+timeline) on desktop; Owners' Portal Entries tab (first write access); Record through MAP trail recorder + lat/lng columns; Convert to location (Nominatim, `gps_location_labels` cache, ROD024); Map tab plots a vehicle's logged history as a numbered trail w/ date filter; MiniMapModal for in-place coordinate peeks | SES016 |
| ROT031-032 | MED | Data model round: customers structured address, bookings.payment_status, fuel_level_entries (ROP011-style, settings.fuelUnit), booking_legs (multi-destination) + destination_note, vehicles.notes/color/description; Registry Vehicles polish (Description/Color fields, Fuel dropdown preserving custom values, Owner locked read-only on edit row but editable at intake, optional fields mirrored to intake) | SES017 |
| ROT033-036 | HIGH | New rental form rebuilt end to end into a popup wizard: inline optional fuel/odometer logging at booking-save; literal bordered-table structure matching Falcon's mockup (theme untouched); 5-step Profile/Vehicle/Destination/Payment/Summary wizard → true Cancel-only popup dialog w/ dirty-check discard confirm; bidirectional Profile Contact/Address edits write back to the Customer record; reached-step tabs become a click-to-review shortcut. RC013-016 fixed (portal-based DatePicker/SearchableSelect popups, scroll-close self-catch, ArrivalDialog implicit-submit + ghost-click guards). Home "Record booking" now auto-opens the wizard (Walk-in check-out removed, redundant); vehicles.fuel_max_level caps fuel entries app-wide, Registry-edit-only, defaults 6 bars | SES017 |

---
## DECISIONS
| ID     | STATUS | DECISION |
|--------|--------|----------|
| ROD001 | LOCKED | Multi-tenant SaaS; isolation via Supabase RLS on business_id |
| ROD002 | LOCKED | Desktop app offline-capable for basics; SQLite cache; outbox-pattern sync |
| ROD003 | LOCKED | Availability guarding — live check required at booking creation; holds pending if offline |
| ROD004 | LOCKED | Free tier sync threshold: 5 days offline OR 50 unsynced records, whichever first |
| ROD005 | LOCKED | Owners' portal — separate Next.js web app, read-only, any device |
| ROD006 | LOCKED | Self-serve signup via Supabase Auth; free trial precedes paid |
| ROD007 | LOCKED | Separate from RACM (concept-source only) and BOOQ (directory app; no deep integration needed) |
| ROD008 | LOCKED | HQ province/city is a one-time setup step (read-only by default) but not hard-locked — a "Change" link keeps it re-editable during this build phase to exercise tier logic |
| ROD009 | LOCKED | Pricing bills on exact elapsed hours x (daily rate / 24), rounded up to nearest 50 — no half-day/nightly rounding for billing; half-day count is display-only reference, never re-adopted as the billing basis |
| ROD010 | LOCKED | Booking status (pending/active/completed) is derived from timing + actual arrival/departure timestamps, never set directly by staff; vehicle rented/available status auto-syncs with it |
| ROD011 | LOCKED | Every vehicle must be tied to a registered Owner before it can be registered on Fleet; Owner + Vehicle share one unified Registry form |
| ROD012 | LOCKED | Remittances breakdown billing draws from one shared cash bucket per booking (not separate scheduled/overtime buckets) — a block bills at the full rate-based amount only when it's genuinely full-length and the bucket still covers it, otherwise it absorbs the remainder and later blocks get 0; verified against the user's reference spreadsheet |
| ROD013 | LOCKED | Every booking cancellation requires a staff-selected reason (preset options + free-text "Other"), permanently logged alongside a departure-state snapshot taken at cancellation time — read from the pre-cancellation row, never the booking's live/editable fields, so the audit trail can't be skewed by a later correction |
| ROD014 | LOCKED | Recorded-payment corrections are additive only (never below the previously recorded value) and capped per portion at that portion's expected rate-formula amount; Expected payment itself is never edited and stays the correction basis |
| ROD015 | LOCKED | Island-group province visibility is filtered only at UI option-construction call sites (never on the raw listProvinces()/listMunicipalities() result), always force-including the currently-selected value, so historical ID-to-label resolution and SearchableSelect's blank-on-missing-value behavior are never broken |
| ROD016 | LOCKED | Domain: racos.app; Owners' Portal hosted on owners.racos.app subdomain — attached to a free-tier host (e.g. Vercel) at deploy time, not needed during development |
| ROD017 | LOCKED | One business per desktop install — local cache is single-tenant scoped to whichever business is signed in; Supabase sync exists for backup/continuity if the device is lost or damaged, not for switching between multiple business accounts on one machine |
| ROD018 | LOCKED | Owner login is a permanent 8-char code (not a claim-once step) — owner types it into the portal, browser remembers them after; requires a custom Edge Function since Supabase Auth has no native code-based login. Optional email can be attached later purely for recovery if a code is lost/reissued. Registering an owner requires connectivity (code uniqueness resolved against Supabase); the code is staff/admin-visible but read-only, never editable |
| ROD019 | LOCKED | Which local tables/columns sync to Supabase stays a fixed, code-level decision (per-table mirror, not a full schema copy) — not exposed as a per-business runtime setting unless a concrete business need for it emerges |
| ROD020 | LOCKED | Owner-portal session model: `owner-login` Edge Function verifies the code, then mints a custom HS256 JWT (owner_id/business_id claims, signed with the project's real Auth JWT secret) rather than an opaque token + proxy-table API — portal reads go straight through PostgREST/RLS like any normal Supabase Auth session; chosen over the proxy alternative to match this project's RLS-everywhere pattern |
| ROD021 | LOCKED | No tool may bulk-wipe a business's own real data — Factory reset and Reset test data were both removed for exactly this (undermines RACOS's append-only/transparency guarantees even when local-only and logged); sign-out + fresh business signup is the only "start clean" path now. The one remaining bulk tool, Clear stale test data, only ever targets rows tied to a DIFFERENT business_id (never the current one) and never pushes a deletion to Cloud; every such action is logged (`action_logs`, `entity_type='system'`), never silent |
| ROD022 | LOCKED | Odometer/GPS/mileage log tables are immutable by RLS omission (select+insert policies only, no update/delete policy at all) rather than app-layer guards; each carries a two-timestamp variance pattern — claimed time (`reading_at`/period, can't be future-dated) vs system `recorded_at` — surfacing late or future-dated entries without blocking them |
| ROD023 | LOCKED | Manual GPS/odometer logging tools exist on both the Owners' Portal and admin/desktop sides, even though the admin side is often redundant with booking records — kept because it costs nothing when unused and is valuable when used; Record through MAP, Convert to location, and the Map tab's history trail are admin-only, not on the portal |
| ROD024 | LOCKED | Reverse-geocoded location labels (Nominatim) are cached in a separate upsertable table (`gps_location_labels`), never written onto the immutable `gps_location_entries` row |
| ROD025 | LOCKED | Owners' Portal login stays the existing permanent code-based system (ROD018) through the rest of this build; email+password+reset is deferred to near publishing (ROP012) |

---
## FILES
| FILE        | LOCATION                     |
|-------------|-------------------------------|
| RACOS.md    | /RACOS/_brain/RACOS.md        |
| SESSIONS.md | /RACOS/_brain/SESSIONS.md     |
| BUGS.md     | /RACOS/_brain/BUGS.md         |
| FIXES.md    | /RACOS/_brain/FIXES.md        |
| PLANS.md    | /RACOS/_brain/PLANS.md        |
| TEMPORARIES.md | /RACOS/_brain/TEMPORARIES.md |
| SCHEMA_LIBRARY.md | /RACOS/_brain/SCHEMA_LIBRARY.md — cross-check reference (columns/formulas per tab); updated alongside BRAINS, same cadence (session close / explicit request), not after every change |

---
# Lines: 114 / 120 — Budget remaining: 6 — next candidate: fold ROT001-006/008-010/011-014 rows further if budget gets tight again
