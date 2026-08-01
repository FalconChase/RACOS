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

---
## PHASE
Phase 0 build, deep into local-first UI. Desktop app has a full working screen set (Home, Fleet (simplified), Map, Registry (Vehicle & Owner + Owners + Vehicles subtabs), Customers, Bookings/Rentals, Checkout, Settings, Rate Matrix, Settlements, Tools) running entirely against the local SQLite cache. Booking lifecycle (pending/active/completed, timing-derived) and vehicle rented/available status now auto-sync end to end. Settlements (Records + Remittances, PDF-verified breakdown billing, Bucket/Recorded split modes, period filter, print) and a Tools tab (Car Activity vehicle timeline, Logs audit-trail tab) have shipped. Recorded payments can be corrected upward (never down), fully logged. Every booking cancellation requires a staff-picked reason and is checked against departure state; departure confirmation can happen automatically once ETD passes (toggleable in Settings). Province visibility is filterable by island group, and bookings gained ranked top-destination quick-picks. GPS pipeline (Traccar) proven end to end but not yet wired into the desktop app's read side. Tenant scoping is still a fixed dev placeholder (DEV_BUSINESS_ID in lib/db.ts) — Supabase Auth wiring is the acknowledged next real step, not yet started.

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
| ROT007 | HIGH | Wire real Supabase Auth; replace DEV_BUSINESS_ID/DEV_PROFILE_ID placeholder in lib/db.ts with signed-in session | — |

### DONE
| ID | PRIORITY | ITEM        | SESSION |
|----|----------|-------------|---------|
| ROT001-006 | — | Phase 0 foundation: Tauri/React/TS/Tailwind scaffold, Supabase project + RLS schema, SQLite local cache + outbox, full local-first desktop UI (core screens/theme/pickers/settings), Rate Matrix tier pricing, PSGC municipalities + HQ relocation | SES001-006 |
| ROT008 | MED  | Rate Matrix panel on the booking form (replaces expected-payment text); pricing finalized as exact elapsed hours x (daily rate / 24), rounded up to nearest 50 — no half-day/nightly billing rounding; half-day count kept as display-only reference | SES007 |
| ROT009 | HIGH | Owners + Registry: `owners` table, vehicle must have an owner to register on Fleet, unified Vehicle & Owner Registry tab (Owners subtab), `action_logs` + Settings Action History for edits to optional fields, optional chassis/engine/GPS fields, structured owner address; Fleet registration simplified to Owner + seats (daily rate field removed); Rentals defaults to Ongoing subtab | SES007 |
| ROT010 | HIGH | Booking lifecycle overhaul: status (pending/active/completed) derived from timing + actual_return_at/actual_departure_at rather than set directly; vehicle rented/available status auto-syncs with it; backdated-booking arrival confirmation + general Mark returned/Mark departed actions; live real-time overdue/departure-due counters; Home live clock; Settings > Dashboard cosmetic terminology toggles (Unit/Lessee/ETD/ETA) | SES007 |
| ROT011 | HIGH | Settlements module (Records + Remittances): payment tracking, rate-based breakdown billing on a single shared cash bucket per booking (PDF-verified against user's reference scenarios), print-ready statements, compact R/O summary toggle, editable Business name | SES008 |
| ROT012 | MED  | Booking safety guards: pre-save absurd-duration confirmation on backdated entries, editable actual-return time with edit history, Fleet Status made read-only | SES008 |
| ROT013 | MED  | Tools tab + Car Activity: per-vehicle month timeline (ETD/ETA/actual bars), overlap-conflict detection, viewport-fit day grid, self-clamping hover tooltip | SES008 |
| ROT014 | HIGH | Tools > Logs tab (flat most-recent-first booking history, owner/vehicle filters, sort modes, print) + full lifecycle audit trail: action_logs widened to completed/cancelled/departed; cancellation now requires a staff-picked reason + departure-state snapshot (flags cancel-after-departure red vs. blue, with a variance); auto-mark-departed setting (background runner, tagged distinct from a manual click) | SES009 |
| ROT015 | HIGH | GPS tracking pipeline (Stage 0+1 proven, Traccar replacing DAGPS): vehicle_locations table + vehicles.gps_device_id/gps_provider/gps_notes on Supabase, RLS via current_business_id(); gps-ingest Edge Function deployed; full local pipeline (Docker Traccar + Android phone) tested end-to-end with real GPS data | SES010 |
| ROT016 | MED  | Map tab (real Leaflet map, vehicle dropdown, no GPS pins yet) added as a top-level nav item; Fleet remodeled to a simplified read-mostly view (Plate/Make-Model/Status/Current Location); full vehicle admin moved to a new Registry > Vehicles subtab; car-detail popup (click a Fleet row) with spec fields, Activity History table, and user-controlled Fill/Fit image display set at upload time | SES011 |
| ROT017 | MED  | Remittances: new "Recorded split" mode (proportionally splits actual recorded base+overtime across blocks by hours, no absorption) alongside existing Bucket mode; Remittance period date filter excludes boundary-straddling bookings with a persistent explanatory banner; calendar date pickers highlight days with booking activity; fixed toolbar overflow pushing the Print button off-screen | SES011 |
| ROT018 | MED  | Settlements > Records payment correction: actual recorded Payment (base/overtime) can be raised but never lowered, capped at each portion's expected rate-formula amount, Expected stays fixed as basis; every correction logs to the booking's action-log history | SES011 |
| ROT019 | MED  | Settings > Locations: show/hide provinces by island group (Luzon/Visayas/Mindanao, at least one always on) applied everywhere provinces are picked (Rate Matrix, booking destination, owner address, HQ); booking form gained up-to-10 ranked top-destination quick-pick chips above the Province/City search fields | SES011 |

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

---
# Lines: 101 / 120 — Budget remaining: 19 — past amendment threshold (100); trim before next addition (candidate: fold ROT008-ROT010 into one summary row)
