# PLANS.md
# RACOS project backlog — deferred builds and features not yet in active scope.
# Promotion to TEMPORARIES.md/RACOS.md STATE requires explicit user instruction (U005).
---
ROP001 | DEFERRED | Full tier feature breakdown beyond sync threshold + online booking
ROP002 | DEFERRED | Paid-tier sync threshold
ROP003 | DEFERRED | Billing implementation — Stripe is the candidate, not yet decided
ROP004 | DEFERRED | Multi-branch conflict handling
ROP005 | DEFERRED | Whether RACOS formally hosts public storefronts (ties to BOOQ directory model)
ROP006 | DEFERRED | RACOS desktop "Track Fleet" GPS subtab — needs some form of Supabase read access in the app first, which doesn't exist yet (blocked on ROT007 or a narrower standalone read client)
ROP007 | PROMOTED → ROT020 | Owners' Portal build — promoted to active scope (full activity log + financials, not just GPS/vehicle_locations); see TEMPORARIES.md / RACOS.md ROT020
ROP008 | DEFERRED | GPS Stage 2: VPS hosting decision (Oracle free tier vs. ~$6/mo paid), move Traccar off embedded H2 to a real DB, redirect the real GT06 tracker via SMS (reversible; note DAGPS's current server IP/port first)
ROP009 | PROMOTED → ROT024 | Local→Supabase outbound sync worker — promoted to active scope by explicit user instruction (SES015); see TEMPORARIES.md / RACOS.md ROT024
ROP010 | DEFERRED | Tamper-resistant tracker hardware (hardwired OBD/CAN-bus device with real odometer + power-loss alerting) as a future upgrade from the current plug GT06
ROP011 | DEFERRED | Secondary tamper-defense layer, software side (distinct from ROP010's hardware angle) — GPS alone is a single, spoofable/riggable signal for catching unreported extensions/bookings; wants odometer reading history as a corroborating second signal, plus a "manual GPS location" tool presented on BOTH the Owners' Portal (owner self-reports/checks location themselves) and the admin/staff side (own version, possibly different purpose — correcting a bad fix vs. an owner's independent check). Discussed at a high level only (SES015) — open questions before design can start: whether odometer is captured at fixed booking lifecycle points (departure/return) or ad-hoc, whether a reading locks once recorded or is upward-correctable like payments; and the exact meaning/purpose split of the manual GPS tool between owner and admin. Falcon has a specific presentation idea not yet shared — pick up with that next session
