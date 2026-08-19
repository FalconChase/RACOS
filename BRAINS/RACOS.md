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
Phase 0 build. Desktop app has a full working screen set (Home, Fleet, Map, Registry, Customers, Bookings/Rentals, Checkout, Settings, Rate Matrix, Settlements, Tools, Analytics) running against the local SQLite cache, with real Supabase Auth (ROT007) — no more dev placeholder tenant. Booking lifecycle and vehicle status auto-sync end to end; Settlements, Tools, and cancellation/payment-correction audit trails have shipped. GPS pipeline (Traccar) proven end to end but not yet wired into the desktop app's live-tracking read side. As of SES015, local→Cloud data actually flows: the outbound sync worker (ROT024/ROP009) drains the outbox continuously, and the Owners' Portal (ROT020) reads real owner-scoped data through it. SES016 shipped ROP011 (software tamper-defense layer): Tools > Entries (Odometer Log / GPS Log / Reports) on desktop, the Owners' Portal's first-ever write access, and the Map tab plotting a selected vehicle's logged GPS history as a trail. SES017 shipped a data-model round (customer address, booking payment_status, fuel_level_entries, booking_legs, vehicle notes/color/description/fuel_max_level) and rebuilt New rental into a 5-step popup wizard. SES018 turned "mapping features" into a real analytics layer: Customers > Outstanding (unsettled overtime + receivables, shared settle logic with Settlements, confirm-before-record dialogs everywhere money gets touched), partial vs. final overtime settlement (`overtime_waived_at` write-off, typed confirmation), a required Payment amount on the booking form, Map's Destination history layer (Nominatim-geocoded, cached, aggregated pins), a brand-new Analytics tab (per-vehicle revenue/utilization/overtime/top-destinations/mileage/odometer), an approximate Booking-vs-GPS-Log corroboration signal (Map + Analytics), GPS-trail-derived distance/speed, and HQ as a geocoded origin/datum feeding displacement + Tier context into both Map and Analytics. SES019 added a digitized GPS Log sheet view (Tools > GPS Log, paper-form parity, zero new schema) feeding a matching Analytics chart section, and a navigation consolidation (new top-level Logs tab merging Settlements > Records + Tools > Logs; Outstanding moved from Customers into Settlements) purely to reduce sidebar/subtab clutter, no logic changes. SES020 began a round of additive gaps Falcon found while testing the booking-recording flow, kicking off with ROT047 — agreement execution date (`agreement_executed_at`), letting the Owners' Portal flag a pending booking as booked in advance rather than same-day, staff-correctable with a logged audit trail; ROT048 shipped next — multi-entry customer contacts (`customer_contacts`, additive alongside the existing phone/email fields, Customers screen panel, logged); ROT049 followed — a hybrid province/city search box (`HybridLocationSearch.tsx`) added alongside every existing destination/address picker pair (New rental Destination + Profile, Customers add + Edit info), full PSGC, typo-tolerant, order-independent. ROT050 followed — an app-wide `DateTimePicker` (circular clock-face hour + minute dials, one continuous auto-advancing calendar-then-time popup, no back-navigation) replacing every DatePicker+TimePicker pair, plus a new device-local `timeStepMinutes` setting (Settings > General, migration 0052, default flipped 15→5 same session) controlling minute-dial spacing; the Agreement executed field on both the New rental Summary step and its row-action edit dialog was upgraded from date-only to the same DateTimePicker, guarded to never be after the booking's Out date (defaults to same day+time as Out when left blank). ROT051 closed the session out — a supplementary, purely informational payment breakdown (`booking_payment_entries`, migration 0054) that never feeds Expected/Settlements/Remittances/Outstanding: after an initial list-style build (staff-only, wizard + row-action dialog), Falcon asked for an Excel-style grid instead — `PaymentBreakdownGrid.tsx` on the New rental wizard's Payment step redisplays the existing required Payment amount/AR fields in-grid, adds fixed Fee/Others rows plus "+"-added extra rows (own type picker), and a client-only Total; the entries' separate `label` column was dropped via migration 0055 (Local + Cloud) as redundant once `note` covered the same "please specify" need. The existing-booking row-action dialog stays list-style for now, pending Falcon's follow-up call after seeing the grid. Also fixed this session: DatePicker's popup now flips upward near the bottom of a tall dialog instead of rendering off-screen (RC017/FX017), and migration 0050 was caught missing its lib.rs registration before it ever shipped (RC018/FX018 — same class of miss as RC006). Per explicit request, BRAINS docs are no longer updated after every change — only at session close or when Falcon explicitly asks. SES021 shipped ROT052 — region-level destination pick, promoted from PLANS.md ROP014: Phase 1 (picker + tier/pricing) let every real PH region be searched inside `HybridLocationSearch.tsx` alongside real places, storing `bookings.destination_region_name` and pricing it via an offline `computeTierFromRegion()` (plain region-name compare against HQ's own region); Phase 2 (representative-point resolution) added a static `municipalities.is_capital` PSGC backfill and a `region_representative_points` cache resolving the farthest province in the region from HQ (worst-case distance, computed live off HQ's geocode, never hardcoded per region/business), labelled with its capital when known, wired into Map's "Compare booking vs GPS Log" pin. Falcon then discussed (no build) road-oriented Map tracing via OSRM — confirmed the current trail is decorative-only (straight-line, no logic reads it), sized the self-hosted-vs-public-API tradeoff, and deferred it (ROP013) since it's "purely decorative for now." Still open: cold-start inbound sync (ROT021), enforcing the ROD004 free-tier threshold — otherwise nothing queued; printable rental agreement (ROT046) stays deferred pending Falcon's clause text; whether to rebuild the row-action payment-breakdown dialog into the grid style is still Falcon's open call.

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
| ROT046 | MED | Printable rental agreement — Bookings/Settlements reprint action, auto-filled renter/vehicle/dates/payment/destination, physical signatures; clauses supplied by Falcon | — |

### DONE
| ID | PRIORITY | ITEM        | SESSION |
|----|----------|-------------|---------|
| ROT001-019 | — | Phase 0 foundation through GPS pipeline: scaffold, Supabase+RLS, SQLite cache/outbox, core desktop UI, Rate Matrix tier pricing, PSGC municipalities+HQ, Owners+Registry, booking lifecycle, Settlements, Tools+Car Activity, Tools>Logs+audit trail, Traccar GPS pipeline (Stage 0+1), Map+Fleet remodel, Remittances Recorded-split, payment correction, Locations island-group toggle | SES001-011 |
| ROT007,022-025 | HIGH | Real Supabase Auth; Home identity header + owner login-code system; Owners' Portal (login Edge Function, portal scaffold, real data screens via owner RLS); outbound sync worker (hourly+manual, idempotent, backfill); Factory reset/Reset test data removed (ROD021) | SES012-015 |
| ROT026-036 | HIGH | ROP011 tamper-defense layer (odometer/GPS/mileage logs, Tools>Entries, Owners' Portal Entries, Record through MAP, Convert to location, Map history trail); data-model round (address/payment_status/legs/fuel/vehicle fields); New rental rebuilt into 5-step popup wizard (bidirectional customer edits, inline fuel/odometer, review nav); fuel_max_level cap | SES016-017 |
| ROT037-043 | HIGH | Customers>Outstanding tab (unsettled overtime+receivables, shared settle logic w/ Settlements, confirm-before-record dialogs); partial/final overtime settlement (overtime_waived_at write-off, typed confirm); booking Payment amount now required; Map Destination history layer (Nominatim-geocoded, cached, aggregated pins); Analytics tab (per-vehicle revenue/utilization/overtime/top-destinations/mileage/odometer charts); Booking vs GPS Log corroboration (soft text-match, Map+Analytics); GPS trail distance/speed (moving-time-based); HQ as origin datum (geocoded, Map pin, displacement+Tier in Map/Analytics) | SES018 |
| ROT044-045 | MED | GPS Log sheet (paper-form digitization, no new schema, matching Analytics chart section); Logs nav consolidation (Settlements>Records + Tools>Logs merged into new top-level Logs tab, Outstanding moved into Settlements, ArrivalDialog overtime copy clarified) | SES019 |
| ROT047-051 | MED | Agreement execution date (agreement_executed_at, Owners' Portal Advance badge); multi-entry customer contacts (customer_contacts, Customers "Edit info", New rental collapsible contacts); hybrid province/city search box on every destination/address picker; app-wide DateTimePicker (circular hour/minute dial, auto-advancing, timeStepMinutes setting, default 5-min) replacing DatePicker+TimePicker pairs incl. Agreement date edits; booking payment breakdown (booking_payment_entries, Excel-style grid on New rental Payment step, staff-only, never affects billing math) | SES020 |
| ROT052 | MED | Region-level destination pick (promoted from PLANS.md ROP014) — searchable PH regions in HybridLocationSearch, destination_region_name + offline computeTierFromRegion() tier/pricing (Phase 1); farthest-from-HQ representative point cache + capital-city backfill, wired into Map's booking-vs-GPS-Log pin (Phase 2) | SES021 |

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
| ROD026 | LOCKED | Destination coordinates (Map/Analytics/HQ) come from auto-geocoding province/municipality via Nominatim, cached per unique place in `destination_geocodes` (not per booking) — local-only, never synced to Cloud, same precedent as `gps_location_labels`'s reverse-geocode cache but the forward direction |
| ROD027 | LOCKED | Overtime settlement stays additive/capped by default (ROD014); a separate "Final settlement" action (`overtime_waived_at`, typed confirmation) is the only way to close out a balance that won't be fully collected — deliberate, one-directional, never automatic |
| ROD028 | LOCKED | Booking vs GPS Log corroboration is a soft, approximate signal only — matched by vehicle + the booking's actual window, destination match is text-only (no distance math), since GPS Log entries are never linked to a booking_id in the schema |
| ROD029 | LOCKED | HQ's map location is geocoded from its existing province/city, not separately hand-pinned — every destination it's compared against is also only city-center precision, so a more exact HQ pin wouldn't meaningfully improve the displacement figures |
| ROD030 | LOCKED | Booking form's Payment step requires an amount before save regardless of Receivable status — closes a gap where a booking could be recorded with no payment figure at all |
| ROD031 | LOCKED | Region-level destination picks resolve to a "representative point" — the farthest province in the region from HQ (worst-case distance, computed live off HQ's own geocode, never hardcoded per region/business) — labelled with its capital city when flagged (`municipalities.is_capital`), never a client's actual named place; tier/pricing runs via `computeTierFromRegion()` (plain region-name compare against HQ's own region, fully offline); real-world verification stays exclusively through the existing GPS Log, no corroboration workaround built for it |

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
# Lines: 115 / 120 — Budget remaining: 5 — next candidate: fold ROT001-019/026-050 rows further if budget gets tight again
