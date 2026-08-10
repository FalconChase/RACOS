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
ROP009 | DEFERRED | Local→Supabase outbound sync worker — intentionally left unbuilt while still in a delete-heavy local testing phase, to avoid orphaning test data in the shared DEV_BUSINESS_ID row on Supabase
ROP010 | DEFERRED | Tamper-resistant tracker hardware (hardwired OBD/CAN-bus device with real odometer + power-loss alerting) as a future upgrade from the current plug GT06
