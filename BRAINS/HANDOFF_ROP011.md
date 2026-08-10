# HANDOFF — ROP011 (next session's opening prompt)

Not a permanent BRAINS file (see RACOS.md > FILES for the real GAP-registered set) —
a one-off starter prompt for whoever opens the next RACOS session. Paste the block
below as the first message, or just point Claude at this file.

---

Continue RACOS. Read BRAINS/RACOS.md, BRAINS/TEMPORARIES.md, BRAINS/PLANS.md
(ROP011), and BRAINS/SCHEMA_LIBRARY.md first.

Last session (SES015) shipped: ROP009/ROT024 (outbound sync worker — hourly
auto-drain of `outbox` to Supabase + manual "Sync now", one-time backfill for
pre-existing local rows, Cloud `vehicles`/`bookings` widened, owner-scoped
read RLS); ROT020's remaining scope (Owners' Portal real data screens —
Vehicle status, Activity log, Financials); and ROT025 (Factory reset AND
Reset test data both removed — a tool that lets an admin bulk-wipe a
business's own real history undermines RACOS's transparency guarantees, even
scoped to local data with an audit log entry; sign-out + fresh business
signup is now the only "start clean" path; `action_logs` widened for
`entity_type='system'`/`action='reset'` so the one remaining bulk tool,
Clear stale test data — cross-business leftover rows only, never touches the
current business — always logs). All committed (`618e9e2`) and pushed to
`main`.

Next up: **ROP011** — a second, software-side layer of tamper-defense,
distinct from ROP010's hardware angle (tamper-resistant OBD/CAN-bus
tracker). Falcon's framing: RACOS gives staff and admins real power, and is
meant to keep the Owners' Portal genuinely transparent — but GPS alone
(Traccar) is a single, spoofable/riggable signal for catching unreported
extensions or unreported bookings. Falcon wants:

1. **Odometer reading history** as a second, harder-to-fake corroborating
   signal alongside GPS.
2. A **"manual GPS location" tool**, presented on BOTH sides:
   - **Owners' Portal** — the owner can do it themselves, self-report/check
     a location.
   - **Admin/desktop side** — staff have their own version of the same
     tool, possibly for a different purpose (e.g. correcting a bad GPS fix,
     vs. an owner's independent check).

Falcon said explicitly: **"I have an idea how it should be presented"** —
this was not shared yet. Do not design or build anything for ROP011 until
Falcon has walked through that idea. Start the session by asking for it.

Open questions to resolve once the idea is on the table (from the SES015
discussion, not yet answered):
- Odometer: captured at fixed booking lifecycle points (departure/return,
  alongside `actual_departure_at`/`actual_return_at`), or an ad-hoc log a
  staff/owner can add anytime?
- Odometer: does a reading lock once recorded, or is it correctable —
  and if correctable, up-only-and-logged like `payment_amount`/
  `additional_payment` (ROD014), or something else?
- Manual GPS tool: what does "manual" actually mean here — an owner
  self-reporting where they believe the vehicle is (an independent cross-
  check against Traccar), or something else?
- Manual GPS tool: is the admin/staff version the same action just also
  available to them, or does it serve a genuinely different purpose on
  that side (e.g. correcting/overriding a bad automatic fix)?
- Where does this live in the schema — new Cloud + local tables (mirroring
  the `vehicle_locations` pattern from ROT015), or extending `bookings`?
  Does it need its own RLS (owner-writable, not just owner-readable — a
  first for the Owners' Portal, which has been read-only per ROD005 so
  far)?

Once Falcon's presentation idea is in, treat this like the Owners' Portal
itself was scoped (SES012) — a real design pass (data model, RLS, UI shape
on both sides) before any code, not an on-the-fly build.
