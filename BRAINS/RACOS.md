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
| Core tables      | businesses, profiles, vehicles, customers, bookings, payments (all RLS-enabled) |
| Migrations (server) | /RACOS/supabase/migrations/ |
| Local cache      | SQLite via tauri-plugin-sql; mirrors core tables + outbox + sync_state |
| Migrations (local) | /RACOS/src/src-tauri/migrations/ |

---
## PHASE
Phase 0 build, deep into local-first UI. Desktop app has a full working screen set (Home, Vehicles/Fleet, Registry (Vehicle & Owner + Owners subtabs), Customers, Bookings/Rentals, Checkout, Settings, Rate Matrix) running entirely against the local SQLite cache. Booking lifecycle (pending/active/completed, timing-derived) and vehicle rented/available status now auto-sync end to end. Tenant scoping is still a fixed dev placeholder (DEV_BUSINESS_ID in lib/db.ts) — Supabase Auth wiring is the acknowledged next real step, not yet started.

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
| ROT001 | HIGH | Tauri 2 + React + TS + Tailwind scaffold | SES001 |
| ROT002 | HIGH | Supabase project creation + RLS schema on business_id | SES002 |
| ROT003 | MED  | SQLite local cache schema + outbox table | SES003 |
| ROT004 | HIGH | Local-first desktop UI: Vehicles/Customers/Bookings/Home/Checkout screens, sidebar nav, dark design-token theme, custom Date/Time pickers, Settings screen + app_settings, payment/rental-duration settings, Rentals Ongoing/History subtabs | SES004 |
| ROT005 | MED  | Rate Matrix pricing: provinces + business_profile + seating_bands + rate_matrix schema, tier computation (1=same province as HQ, 2=same region, 3=other), custom per-city rate overrides, wired through booking form + Checkout | SES005 |
| ROT006 | MED  | Replaced business-scoped `cities` table with a global PSGC-sourced `municipalities` table (1597 rows, embedded locally, zero runtime network calls); removed the per-city Tier-1 toggle (HQ's own province/city is now automatically Tier 1); relocated HQ province/city from Rate Matrix into a read-only Business section on Settings (one-time-set with a "Change" re-edit link) | SES006 |
| ROT008 | MED  | Rate Matrix panel on the booking form (replaces expected-payment text); pricing finalized as exact elapsed hours x (daily rate / 24), rounded up to nearest 50 — no half-day/nightly billing rounding; half-day count kept as display-only reference | SES007 |
| ROT009 | HIGH | Owners + Registry: `owners` table, vehicle must have an owner to register on Fleet, unified Vehicle & Owner Registry tab (Owners subtab), `action_logs` + Settings Action History for edits to optional fields, optional chassis/engine/GPS fields, structured owner address; Fleet registration simplified to Owner + seats (daily rate field removed); Rentals defaults to Ongoing subtab | SES007 |
| ROT010 | HIGH | Booking lifecycle overhaul: status (pending/active/completed) derived from timing + actual_return_at/actual_departure_at rather than set directly; vehicle rented/available status auto-syncs with it; backdated-booking arrival confirmation + general Mark returned/Mark departed actions; live real-time overdue/departure-due counters; Home live clock; Settings > Dashboard cosmetic terminology toggles (Unit/Lessee/ETD/ETA) | SES007 |

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
# Lines: ~93 / 120 — Budget remaining: ~27 — estimate by BRAIN, CLODE to re-verify per CL010
