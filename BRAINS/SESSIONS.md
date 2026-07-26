# SESSIONS.md
# RACOS completed session archive. Per-project (U011). Empty at onboarding.
---
## SES001 — 2026-07-25 — Phase 0 scaffold shipped
Progress made    : ROT001 — Tauri 2 + React + TS + Tailwind scaffold complete, identifier com.corelogix.racos confirmed against entERP precedent
Items moved      : ROT001 → DONE
Bugs found       : none
Fixes applied    : none
Lessons recorded : none
Carried forward  : ROT002 (Supabase project + RLS schema), ROT003 (SQLite cache + outbox table) — still NEXT
State at close   : RACOS onboarded via GAP protocol, Phase 0 scaffold shipped (Tauri 2.11.4, React 19.2.8, Tailwind 3.4.19, TS 5.8.3), RO/ROD/ROP/ROT registered. Mid-session, O006 was found wrong — TEMPORARIES.md was ecosystem-wide only in name; ET001 precedent showed project work belongs there. Amended O006 (Correction... no — Amendment, same ID, per user call) across BRAIN.md, ONBOARDING.md, ADOPTION.md, UPDATER.md, MANIFEST.md, REGISTRY.md. RACOS/_brain/TEMPORARIES.md created holding only ROT002/ROT003. User set a standing preference: no cross-project mentions in RACOS work going forward. Next session picks up at ROT002.

## SES002 — 2026-07-25 — Supabase project + RLS schema shipped
Progress made    : ROT002 — dedicated Supabase project confirmed (ref nnsjqnxvpkercbbwvqjj, region ap-northeast-1, FalconBit Org, free tier). Schema built: businesses (tenant root), profiles (extends auth.users), vehicles, customers, bookings, payments — all with business_id + RLS enabled. Helper fn current_business_id() (security definer, fixed search_path) resolves tenant scope from auth.uid() without recursive-policy issues on profiles. 5 migrations applied in order: init_multi_tenant_schema, rls_policies_business_id, harden_functions, optimize_rls_initplan, index_remaining_foreign_keys.
Items moved      : ROT002 → DONE. ROT003 unblocked (BLOCKED BY cleared).
Bugs found       : none
Fixes applied    : Security advisor flagged mutable search_path on trigger fn + public/anon execute on current_business_id() — fixed. Performance advisor flagged auth.uid() re-evaluated per row in businesses/profiles policies — rewritten as (select auth.uid()). Two FK columns missing covering indexes — indexed. Remaining WARN (current_business_id callable by authenticated via RPC) is inherent to the security-definer pattern RLS requires; accepted, not a data-exposure risk (only returns caller's own business_id).
Lessons recorded : User flagged a real security concern about connector access to secret keys before proceeding — resolved by confirming the Supabase MCP exposes no service-role-key tool at all (only get_publishable_keys), and by having them approve the create_project call individually. First create_project attempt showed "User rejected" but the project was created anyway (or already existed) — discovered via list_projects rather than assuming failure.
Carried forward  : ROT003 (SQLite local cache + outbox table) — now NEXT, unblocked.

## SES003 — 2026-07-25 — Local SQLite cache + outbox shipped
Progress made    : ROT003 — local SQLite schema mirroring the Supabase tables (businesses, profiles, vehicles, customers, bookings, payments), all SQLite-typed (TEXT for uuid/timestamp, TEXT for money to avoid float rounding). Added outbox table (queued insert/update/delete mutations, client-generated entity_id, status/retry/error tracking) and sync_state table (last_synced_at, offline_since — feeds ROD004's 5-day/50-record threshold check). bookings gained a local-only pending_availability_check flag operationalizing ROD003 (holds created offline await a live check on sync). Wired tauri-plugin-sql into Cargo.toml/package.json/lib.rs with migrations, granted sql capability permissions.
Items moved      : ROT003 → DONE.
Bugs found       : none
Fixes applied    : n/a
Lessons recorded : No cargo/rustc in the sandbox, so the Rust wiring couldn't be full `cargo check`'d — verified the SQL migrations directly instead (executed both files against a real SQLite db via Python's sqlite3, including FK and CHECK constraint behavior) and manually reviewed Cargo.toml/lib.rs/capabilities syntax.
Carried forward  : nothing queued in NEXT — TEMPORARIES.md/RACOS.md STATE both empty. User set a new standing preference mid-session: only update BRAIN files on explicit request or at session close, not after every change.

## SES004 — 2026-07-25 — Local-first desktop UI shipped (retroactive catch-up entry)
Progress made    : ROT004 — full screen set built against the local SQLite cache: DB access layer + TS entity types + CRUD repo functions with outbox writes; app shell with RACM-inspired sidebar; Vehicles/Customers/Bookings/Home screens; Checkout flow; two full dark-theme design-token restyles (Excel-grid tables, then Tabler-icon sidebar rebuild matched to a mockup, then sidebar resized to ~1/5 width with app-wide font bump); booking reference helper (RNT- prefix) and polished create form; app_settings table + settings repo/React context; date/time formatting utility + custom DatePicker/TimePicker components wired into the booking form; payment_amount/expected_payment schema + rental-duration settings + FormQuestion Google-Forms-style booking form; inline cancel confirmation; Rentals split into Ongoing/History subtabs.
Items moved      : ROT004 → DONE.
Bugs found       : none logged (BRAIN wasn't updated live across this span per the user's standing preference — this entry is a retroactive summary, not a session-by-session log).
Fixes applied    : n/a
Lessons recorded : none
Carried forward  : Rate Matrix / tier pricing work picked up next (ROT005).

## SES005 — 2026-07-25 — Rate Matrix + tier pricing shipped (retroactive catch-up entry)
Progress made    : ROT005 — migration for provinces/business_profile/seating_bands/rate_matrix; SearchableSelect filterable-dropdown component; Rate Matrix screen + sidebar nav item; Seats field added to Vehicles; destination + tier pricing wired into the booking form and Checkout. Follow-on migration added business-scoped `cities`, `custom_rates`, HQ city, destination city, and a booking Purpose field; pricing.ts resolveRate updated for custom-rate override priority (custom > standard matrix > vehicle daily_rate fallback); a Settings toggle controlled whether Tier-1 cities showed in the UI; Rate Matrix screen expanded for HQ city + city management + custom rates; booking form and Checkout updated for combined province/city destination + Purpose.
Items moved      : ROT005 → DONE.
Bugs found       : none logged (same retroactive-entry caveat as SES004).
Fixes applied    : n/a
Lessons recorded : none
Carried forward  : User flagged the business-scoped `cities` table + Tier-1 toggle as "absurd" and asked for real PSGC-sourced municipalities instead — picked up in SES006.

## SES006 — 2026-07-25 — PSGC municipalities, HQ relocation, and a save-breaking FK bug fixed
Progress made    : ROT006 — fetched full PSGC (Philippine Standard Geographic Code) city/municipality data region-by-region via web_fetch (avoided truncation seen on the full-country endpoint); built migration 0007 seeding a global `municipalities` table (1597 rows, joined to existing `provinces` by normalized name; Maguindanao's ~37 municipalities + Cotabato City intentionally excluded due to a province-split ambiguity between this PSGC snapshot and the already-seeded two-row Maguindanao del Norte/del Sur split — documented in the migration header). Migration 0008 dropped the business-scoped `cities` table and the `show_tier1_cities` app_settings column entirely: HQ's own province/city is now automatically Tier 1 with no separate toggle, and Custom Rates were redesigned to a structured province-then-municipality SearchableSelect (no free-text destination strings). Everything is embedded locally — zero runtime network calls, addressing the user's explicit preference for desktop-local operations over pulling reference data from Supabase. Per follow-up request, HQ province/city was moved out of the Rate Matrix screen into a new read-only "Business" section on Settings, with a "Change" link to re-open the editable form (deliberately not hard-locked, so tier logic can still be exercised during this build phase — logged as ROD008).
Bugs found       : RC001 — SearchableSelect's full-screen invisible overlay silently swallowed clicks meant for other buttons (e.g. Settings "Save") whenever a dropdown was left open; surfaced as "can't save the HQ location." RC002 — after migration 0008 dropped `cities`, three columns (hq_city_id, custom_rates.city_id, bookings.destination_city_id) still declared `references cities(id)`; the real tauri-plugin-sql/sqlx runtime enforces foreign keys (the sqlite3-module dry-run tests used earlier do not), so every write to those columns failed with "no such table: main.cities" — surfaced as the save still silently failing even after RC001 was fixed.
Fixes applied    : FX001 (SearchableSelect outside-click listener, no page-covering overlay) and FX002 (migration 0009 — recreated business_profile/custom_rates/bookings with the three columns repointed at `municipalities(id)`; verified by replaying all 9 migrations with `PRAGMA foreign_keys=ON` and reproducing the exact failing save).
Lessons recorded : Dry-run migration testing via Python's bare `sqlite3` module defaults to `PRAGMA foreign_keys=OFF`, which does NOT match the real app runtime (tauri-plugin-sql/sqlx enforces FKs) — future migration verification should explicitly set `PRAGMA foreign_keys=ON` to catch this class of bug before shipping, not just check for orphaned rows/duplicate ids.
Carried forward  : ROT007 (Supabase Auth wiring, replacing the DEV_BUSINESS_ID placeholder) is the next unstarted item — nothing else queued in NEXT.
