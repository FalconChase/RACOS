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
| ROT020 | HIGH | Owners' Portal (Next.js, owners.racos.app) — owner identity + login-code system done (ROT023); remaining: code-login Edge Function, portal app itself | — |
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

---
# Lines: 45 / 100 — Budget remaining: 55
