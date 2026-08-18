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
ROP011 | PROMOTED → ROT026-030 | Secondary tamper-defense layer, software side — odometer readings + manual GPS logging as corroborating signals alongside Traccar; see TEMPORARIES.md / RACOS.md ROT026-030
ROP012 | DEFERRED | Owners' Portal auth redesign — replace/augment the permanent code-based login (ROD018) with email+password+reset. Explicitly deferred (SES016): current code-based login stays as-is through the rest of the build; revisit near publishing
ROP013 | DEFERRED | Road-oriented/road-snapped routing on Map — real road distance/route (not straight-line haversine), via either a self-hosted router (OSRM/GraphHopper on an OSM road extract, free but real infra + PH coverage risk) or a hosted directions API (Mapbox/Google, paid past free tier, new "phones home" dependency). No active goal yet (Falcon: "just curious for now") — would also be the natural upgrade path for gpsLogSheet.ts/gpsTrailMetrics.ts's node-to-node distance calc if ever built, but that's not blocked on it
