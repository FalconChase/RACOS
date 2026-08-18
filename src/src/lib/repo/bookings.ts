import { getDb, currentBusinessId, currentProfileId } from "../db";
import { queueOutbox } from "./outbox";
import { updateVehicleStatus } from "./vehicles";
import { diffField, logAction } from "./actionLog";
import { bookingRef } from "../bookingRef";
import { formatHHMM } from "../duration";
import type { ActionLogChange, Booking, BookingStatus } from "../types";

// Calendar-day comparison (local time, matching how both the wizard's
// DatePicker and EditAgreementDateDialog construct their ISO values —
// `new Date(\`${date}T00:00:00\`)`) — used only for the agreement-execution
// guard below, never for anything timing-sensitive.
function dateOnly(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Cancellation reasons offered on CancelBookingDialog — kept narrow and
// preset (plus a free-text escape hatch) rather than an open text field for
// every cancellation, so the audit trail stays scannable/consistent instead
// of a pile of one-off phrasing.
export type CancellationReason = "neverArrived" | "returnedUnit" | "other";

export const CANCELLATION_REASON_LABELS: Record<CancellationReason, string> = {
  neverArrived: "Client never arrived / declined",
  returnedUnit: "Client returned the unit",
  other: "Other",
};

export async function listBookings(): Promise<Booking[]> {
  const db = await getDb();
  return db.select<Booking[]>(
    "select * from bookings where business_id = ? order by start_date desc",
    [currentBusinessId()],
  );
}

export async function getBookingById(id: string): Promise<Booking | null> {
  const db = await getDb();
  const rows = await db.select<Booking[]>("select * from bookings where id = ?", [id]);
  return rows[0] ?? null;
}

export interface TopDestination {
  municipalityId: string;
  count: number;
}

// The most-picked destination cities/municipalities across every booking
// (any status — this is about what staff search for most, not settled
// revenue), for the Rentals form's quick-pick chips. Cancelled bookings
// still count: staff picked that destination when filling out the form
// regardless of how the booking later turned out.
export async function getTopDestinations(limit = 10): Promise<TopDestination[]> {
  const db = await getDb();
  return db.select<TopDestination[]>(
    `select destination_city_id as municipalityId, count(*) as count
       from bookings
      where business_id = ? and destination_city_id is not null
      group by destination_city_id
      order by count desc
      limit ?`,
    [currentBusinessId(), limit],
  );
}

// One row of a vehicle's recent activity, as shown on the Fleet car-detail
// popup's Activity History table.
export interface VehicleActivityEntry {
  id: string;
  date: string; // ISO — the booking's start_date ("Out")
  lessee: string;
  destination: string;
  durationLabel: string; // "HH:MM"
}

interface VehicleActivityRow {
  id: string;
  start_date: string;
  end_date: string;
  actual_departure_at: string | null;
  actual_return_at: string | null;
  customer_name: string | null;
  province_name: string | null;
  municipality_name: string | null;
}

// Last `limit` bookings for a vehicle, excluding cancelled ones, for the
// Fleet car-detail popup. Duration prefers the actual departure/return
// timestamps when the booking has them recorded, falling back to the
// scheduled start/end otherwise — same convention Settlements/Tools use.
export async function listRecentActivityForVehicle(
  vehicleId: string,
  limit = 10,
): Promise<VehicleActivityEntry[]> {
  const db = await getDb();
  const rows = await db.select<VehicleActivityRow[]>(
    `select b.id, b.start_date, b.end_date, b.actual_departure_at, b.actual_return_at,
            c.full_name as customer_name, p.name as province_name, m.name as municipality_name
       from bookings b
       left join customers c on c.id = b.customer_id
       left join provinces p on p.id = b.destination_province_id
       left join municipalities m on m.id = b.destination_city_id
      where b.vehicle_id = ? and b.status != 'cancelled'
      order by b.start_date desc
      limit ?`,
    [vehicleId, limit],
  );

  return rows.map((r) => {
    const start = r.actual_departure_at ? new Date(r.actual_departure_at) : new Date(r.start_date);
    const end = r.actual_return_at ? new Date(r.actual_return_at) : new Date(r.end_date);
    return {
      id: r.id,
      date: r.start_date,
      lessee: r.customer_name ?? "—",
      destination: r.municipality_name ?? r.province_name ?? "—",
      durationLabel: formatHHMM(start, end),
    };
  });
}

export interface NewBookingInput {
  vehicle_id: string;
  customer_id: string;
  start_date: string; // ISO datetime
  end_date: string; // ISO datetime
  // Drives the pricing tier — see provinces/Rate Matrix.
  destination_province_id?: string;
  // Optional finer-grained destination, and what a custom rate matches on.
  destination_city_id?: string;
  // Optional free-text note on the primary destination. See destination_note
  // on the Booking type.
  destination_note?: string;
  // What staff recorded as actually collected — manual, not auto-computed.
  payment_amount?: string;
  // System-computed expected total, passed in from the booking form (which
  // already has the resolved rate on hand). Stored for the future Owners'
  // portal; never required, never shown by default.
  expected_payment?: string;
  // Free-form, display-only reason for the rental. Defaults to "Service" in
  // the booking form; never drives pricing or any other logic.
  purpose?: string;
  // Set when staff resolves a backdated booking's arrival right at save time
  // (either "same as due-back" or a manually entered arrival time). Omitted
  // means arrival isn't resolved yet — see status derivation in createBooking.
  actual_return_at?: string;
  // Per-hour rate resolveRate() came up with in the booking form, passed
  // through so it can be locked in on the row rather than recomputed later.
  resolved_rate?: string;
  // 'paid' (default, omit for normal bookings) or 'receivable' — the rare
  // known-customer case where staff records the booking before payment is
  // actually in hand. See payment_status on the Booking type.
  payment_status?: "paid" | "receivable";
  // When the agreement was actually executed/signed — ISO datetime. Omitted
  // means "now" (the booking form defaults its picker to today, but this
  // stays optional here so any future caller can rely on the same default).
  // See agreement_executed_at on the Booking type.
  agreement_executed_at?: string;
  // Extra stops beyond destination_province_id/city_id (the primary
  // destination) — see BookingLeg. Omitted/empty for the overwhelmingly
  // common single-destination case. IMPORTANT: end_date above must already
  // be the *overall* booking end (this array's last entry's end_at) — the
  // booking form computes that before calling createBooking, since legs are
  // continuous (each start_at chains off the previous end_at) and only ever
  // created here, alongside the booking itself.
  legs?: {
    destination_province_id?: string;
    destination_city_id?: string;
    note?: string;
    start_at: string;
    end_at: string;
    resolved_rate?: string;
  }[];
}

export async function createBooking(input: NewBookingInput): Promise<Booking> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const business_id = currentBusinessId();
  const now = new Date();
  const nowIso = now.toISOString();

  // Status is derived from timing, not picked directly by staff:
  //  - actual_return_at already given (backdated booking, arrival resolved at
  //    save time) -> completed, vehicle freed up immediately.
  //  - the rental period has already begun (start_date <= now) and arrival
  //    isn't resolved -> active: vehicle is out, still trackable for a time
  //    extension since nothing marks it back yet.
  //  - rental period hasn't started -> pending, vehicle left untouched.
  let status: BookingStatus = "pending";
  if (input.actual_return_at) {
    status = "completed";
  } else if (new Date(input.start_date).getTime() <= now.getTime()) {
    status = "active";
  }

  // Departure is taken as given/trusted at face value whenever the rental had
  // already begun by save time (same as how a backdated end_date is trusted) —
  // no separate confirmation needed there. Only a genuinely future-dated
  // ("pending") booking leaves this unresolved, surfaced later as a live
  // "departure due" flag once its scheduled start_date passes.
  const actual_departure_at = status !== "pending" ? input.start_date : null;

  // Agreement can never be executed after the rental it covers is scheduled
  // to go out — only on or before the Out date. Left unspecified, it
  // defaults to the same day as Out (not "now"/today's real date) — a
  // booking recorded well ahead of a future start_date otherwise looked
  // like an "advance" agreement by default, when nothing about it actually
  // was.
  if (input.agreement_executed_at && dateOnly(input.agreement_executed_at) > dateOnly(input.start_date)) {
    throw new Error("Agreement executed date can't be after the scheduled Out date.");
  }
  const agreement_executed_at = input.agreement_executed_at ?? input.start_date;

  const booking: Booking = {
    id,
    business_id,
    vehicle_id: input.vehicle_id,
    customer_id: input.customer_id,
    start_date: input.start_date,
    end_date: input.end_date,
    status,
    destination_province_id: input.destination_province_id ?? null,
    destination_city_id: input.destination_city_id ?? null,
    destination_note: input.destination_note ?? null,
    payment_amount: input.payment_amount ?? null,
    expected_payment: input.expected_payment ?? null,
    purpose: input.purpose ?? null,
    created_by: currentProfileId(),
    // No sync engine wired yet (that's a later ROT item), so every booking made
    // right now is effectively created offline from the server's point of view —
    // it always starts as a hold awaiting the live availability check (ROD003).
    pending_availability_check: 1,
    actual_return_at: input.actual_return_at ?? null,
    actual_departure_at,
    resolved_rate: input.resolved_rate ?? null,
    // Never set at creation — only Mark returned (an overtime return) writes
    // this, via markBookingReturned. The column defaults to NULL either way.
    additional_payment: null,
    // Never set at creation — only picked later, per booking, on the
    // Remittances report once Split is on Hybrid. See setRemittanceSplitOverride.
    remittance_split_override: null,
    payment_status: input.payment_status ?? "paid",
    // A 'paid' booking is treated as settled the moment it's recorded — same
    // spirit as actual_departure_at trusting a backdated start_date at face
    // value. 'receivable' leaves this null until markBookingPaid.
    paid_at: (input.payment_status ?? "paid") === "paid" ? nowIso : null,
    // Never set at creation — only waiveOvertimeBalance writes this, and
    // only after a booking has actually closed out with overtime.
    overtime_waived_at: null,
    // Defaults to the same day as Out (start_date) when the caller doesn't
    // pass one — see the guard/default computed above.
    agreement_executed_at,
    created_at: nowIso,
    updated_at: nowIso,
  };

  await db.execute(
    `insert into bookings
       (id, business_id, vehicle_id, customer_id, start_date, end_date, status, destination_province_id,
        destination_city_id, destination_note, payment_amount, expected_payment, purpose, created_by,
        pending_availability_check, actual_return_at, actual_departure_at, resolved_rate,
        remittance_split_override, payment_status, paid_at, agreement_executed_at, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      booking.id,
      booking.business_id,
      booking.vehicle_id,
      booking.customer_id,
      booking.start_date,
      booking.end_date,
      booking.status,
      booking.destination_province_id,
      booking.destination_city_id,
      booking.destination_note,
      booking.payment_amount,
      booking.expected_payment,
      booking.purpose,
      booking.created_by,
      booking.pending_availability_check,
      booking.actual_return_at,
      booking.actual_departure_at,
      booking.resolved_rate,
      booking.remittance_split_override,
      booking.payment_status,
      booking.paid_at,
      booking.agreement_executed_at,
      booking.created_at,
      booking.updated_at,
    ],
  );

  await queueOutbox(db, "bookings", id, "insert", booking as unknown as Record<string, unknown>);

  if (input.legs && input.legs.length > 0) {
    let sequence = 1;
    for (const leg of input.legs) {
      const legId = crypto.randomUUID();
      const legRow = {
        id: legId,
        business_id,
        booking_id: id,
        sequence,
        destination_province_id: leg.destination_province_id ?? null,
        destination_city_id: leg.destination_city_id ?? null,
        note: leg.note ?? null,
        start_at: leg.start_at,
        end_at: leg.end_at,
        resolved_rate: leg.resolved_rate ?? null,
        created_at: nowIso,
      };
      await db.execute(
        `insert into booking_legs
           (id, business_id, booking_id, sequence, destination_province_id, destination_city_id, note, start_at, end_at, resolved_rate, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          legRow.id,
          legRow.business_id,
          legRow.booking_id,
          legRow.sequence,
          legRow.destination_province_id,
          legRow.destination_city_id,
          legRow.note,
          legRow.start_at,
          legRow.end_at,
          legRow.resolved_rate,
          legRow.created_at,
        ],
      );
      await queueOutbox(db, "booking_legs", legId, "insert", legRow);
      sequence += 1;
    }
  }

  // Vehicle status follows the booking it was just tied to: out and
  // unresolved -> rented; resolved as arrived right away -> available.
  // A "pending" (not-yet-started) booking leaves the vehicle exactly as it was.
  if (status === "active") {
    await updateVehicleStatus(booking.vehicle_id, "rented");
  } else if (status === "completed") {
    await updateVehicleStatus(booking.vehicle_id, "available");
  }

  return booking;
}

// `reason` is required — CancelBookingDialog always collects one before
// calling this, so there's never a cancellation without one on record.
// `otherDetail` is only meaningful (and only stored) when reason === "other".
export async function cancelBooking(id: string, reason: CancellationReason, otherDetail?: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  const before = await getBookingById(id);

  await db.execute("update bookings set status = 'cancelled', updated_at = ? where id = ?", [now, id]);

  const rows = await db.select<Booking[]>("select * from bookings where id = ?", [id]);
  if (rows[0]) {
    await queueOutbox(db, "bookings", id, "update", rows[0] as unknown as Record<string, unknown>);
    // Logged only when the row actually existed to cancel — same guard as
    // the outbox queue just above, so a bogus id never produces a phantom
    // entry.
    const changes: ActionLogChange[] = [];

    // A cancellation that happens after the vehicle already departed is the
    // questionable case for an audit trail — staff cancelling a booking
    // that's already out is worth a second look, unlike cancelling one still
    // "pending" that never left. So when `before` already had a departure
    // recorded, that fact is snapshotted into changes[] right now, at
    // cancellation time — reading `before` (the row as it stood right
    // before this update) rather than anything derived after the fact means
    // this can never be affected by the cancellation itself, or by a later
    // Edit-times correction to actual_departure_at.
    if (before?.actual_departure_at) {
      changes.push({ field: "actual_departure_at", label: "Departed at", old: null, new: before.actual_departure_at });
    }

    // The reason staff gave, snapshotted the same permanent way — free text
    // only ever stored when "Other" was picked, never a preset label.
    const reasonText = reason === "other" && otherDetail ? `Other: ${otherDetail}` : CANCELLATION_REASON_LABELS[reason];
    changes.push({ field: "cancellation_reason", label: "Reason", old: null, new: reasonText });

    await logAction({ entityType: "booking", entityId: id, entityLabel: bookingRef(id), action: "cancelled", changes });
  }

  // Cancelling a booking that had already put the vehicle "rented" (active,
  // arrival unresolved) frees it back up — otherwise it'd stay stuck as
  // rented with no booking left pointing at it.
  if (before?.status === "active") {
    await updateVehicleStatus(before.vehicle_id, "available");
  }
}

// Marks an ongoing booking's vehicle as back — the general "Mark returned"
// action available on any active booking, not just ones resolved at backdated
// save time. Moves status to completed and frees the vehicle up.
// additionalPayment is only ever passed when ArrivalDialog detected overtime
// (actualReturnAt later than the booking's end_date) and staff entered an
// amount collected for it — stored separately from payment_amount.
export async function markBookingReturned(
  id: string,
  actualReturnAt: string,
  additionalPayment?: string,
): Promise<Booking> {
  const db = await getDb();
  const now = new Date().toISOString();

  await db.execute(
    "update bookings set status = 'completed', actual_return_at = ?, additional_payment = ?, updated_at = ? where id = ?",
    [actualReturnAt, additionalPayment ?? null, now, id],
  );

  const rows = await db.select<Booking[]>("select * from bookings where id = ?", [id]);
  const updated = rows[0];
  if (!updated) throw new Error("Booking not found.");

  await queueOutbox(db, "bookings", id, "update", updated as unknown as Record<string, unknown>);
  // Bare marker, no changes[] — same reasoning as cancelBooking.
  await logAction({ entityType: "booking", entityId: id, entityLabel: bookingRef(id), action: "completed" });
  await updateVehicleStatus(updated.vehicle_id, "available");
  return updated;
}

// Confirms a still-"pending" booking has actually departed — the counterpart
// to markBookingReturned, for a booking whose scheduled ETD (start_date) has
// passed (or is being confirmed early) without ever getting resolved at
// creation time. Moves status to active and marks the vehicle rented.
//
// `auto` distinguishes a staff click from AutoDepartureRunner firing this on
// its own once ETD passes (see Settings > Rental > "Auto-mark departed") —
// logged the same "departed" action either way, but an automatic run adds a
// changes[] note saying so, so the audit trail (Tools > Logs) can tell a
// deliberate staff action apart from the system just closing the loop.
export async function markBookingDeparted(id: string, actualDepartureAt: string, auto = false): Promise<Booking> {
  const db = await getDb();
  const now = new Date().toISOString();

  await db.execute(
    "update bookings set status = 'active', actual_departure_at = ?, updated_at = ? where id = ?",
    [actualDepartureAt, now, id],
  );

  const rows = await db.select<Booking[]>("select * from bookings where id = ?", [id]);
  const updated = rows[0];
  if (!updated) throw new Error("Booking not found.");

  await queueOutbox(db, "bookings", id, "update", updated as unknown as Record<string, unknown>);
  const changes = auto ? [{ field: "trigger", label: "Triggered by", old: null, new: "Automatic (ETD passed)" }] : undefined;
  await logAction({ entityType: "booking", entityId: id, entityLabel: bookingRef(id), action: "departed", changes });
  await updateVehicleStatus(updated.vehicle_id, "rented");
  return updated;
}

// Bulk-runs the "ETD passed, still pending" case for every business at once
// — called on an interval by AutoDepartureRunner whenever Settings > Rental
// > "Auto-mark departed" is on. Always resolves as "same as scheduled ETD"
// (actual_departure_at = start_date), the same default Mark departed itself
// offers first — never invents a different departure time on its own.
// Returns how many bookings it just auto-departed.
export async function autoMarkDepartedDueBookings(): Promise<number> {
  const db = await getDb();
  const nowIso = new Date().toISOString();
  const due = await db.select<Booking[]>(
    "select * from bookings where business_id = ? and status = 'pending' and start_date <= ?",
    [currentBusinessId(), nowIso],
  );
  for (const booking of due) {
    await markBookingDeparted(booking.id, booking.start_date, true);
  }
  return due.length;
}

// Corrects a booking's recorded timestamps after the fact — the fix-a-typo
// escape hatch for a fat-fingered date (e.g. an actual return accidentally
// landing weeks off, à la the ArrivalDialog "unusually long span" guard).
// Deliberately narrow: only the four date/time fields, never vehicle,
// customer, payment, or status — those still only change through their own
// dedicated actions. Every change is logged to action_logs the same way
// owner/vehicle edits are, so there's always a record of what a booking's
// times looked like before the correction.
export interface BookingTimeUpdate {
  start_date?: string;
  end_date?: string;
  actual_departure_at?: string | null;
  actual_return_at?: string | null;
}

const TIME_FIELD_LABELS: Record<keyof BookingTimeUpdate, string> = {
  start_date: "Out",
  end_date: "Due back",
  actual_departure_at: "Actual departure",
  actual_return_at: "Actual return",
};

export async function updateBookingTimes(id: string, updates: BookingTimeUpdate): Promise<Booking> {
  const db = await getDb();
  const before = await getBookingById(id);
  if (!before) throw new Error("Booking not found.");

  const fields = (Object.keys(updates) as (keyof BookingTimeUpdate)[]).filter((k) => updates[k] !== undefined);
  if (fields.length === 0) return before;

  const now = new Date().toISOString();
  const setClauses = [...fields.map((f) => `${f} = ?`), "updated_at = ?"];
  const args: (string | null)[] = [...fields.map((f) => updates[f] ?? null), now, id];

  await db.execute(`update bookings set ${setClauses.join(", ")} where id = ?`, args);

  const rows = await db.select<Booking[]>("select * from bookings where id = ?", [id]);
  const updated = rows[0];
  if (!updated) throw new Error("Booking not found.");

  await queueOutbox(db, "bookings", id, "update", updated as unknown as Record<string, unknown>);

  const changes = fields
    .map((f) => diffField(f, TIME_FIELD_LABELS[f], before[f] as string | null, updated[f] as string | null))
    .filter((c): c is NonNullable<typeof c> => c !== null);

  if (changes.length > 0) {
    await logAction({
      entityType: "booking",
      entityId: id,
      entityLabel: bookingRef(id),
      action: "updated",
      changes,
    });
  }

  return updated;
}

// Corrects a completed booking's actually-recorded payment figures after the
// fact — the fix for staff forgetting to log a payment (especially the
// overtime top-up) at Mark-returned time. Deliberately one-directional: a
// correction may only raise a figure, never lower it — this is a floor
// check against whatever's already on the row, enforced here regardless of
// what the caller passes. The upper bound (never recording more than the
// rate-formula expected amount) depends on a resolved rate, which this repo
// layer doesn't have easy access to — so that cap is the caller's
// responsibility (see recordedExpected/overtimeExpected in
// SettlementsScreen.tsx) before this ever gets called. Logged to
// action_logs the same way owner/vehicle edits are.
export interface PaymentCorrectionInput {
  payment_amount?: string;
  additional_payment?: string;
}

const PAYMENT_FIELD_LABELS: Record<keyof PaymentCorrectionInput, string> = {
  payment_amount: "Recorded payment",
  additional_payment: "Overtime payment",
};

export async function correctBookingPayment(id: string, patch: PaymentCorrectionInput): Promise<Booking> {
  const db = await getDb();
  const before = await getBookingById(id);
  if (!before) throw new Error("Booking not found.");

  const fields = (Object.keys(patch) as (keyof PaymentCorrectionInput)[]).filter((k) => patch[k] !== undefined);
  if (fields.length === 0) return before;

  for (const field of fields) {
    const oldValue = before[field] ? Number(before[field]) : 0;
    const newValue = Number(patch[field]);
    if (!(newValue >= oldValue)) {
      throw new Error(`${PAYMENT_FIELD_LABELS[field]} can't be corrected down — it can only be raised.`);
    }
  }

  const now = new Date().toISOString();
  const setClauses = [...fields.map((f) => `${f} = ?`), "updated_at = ?"];
  const args: (string | null)[] = [...fields.map((f) => patch[f] ?? null), now, id];

  await db.execute(`update bookings set ${setClauses.join(", ")} where id = ?`, args);

  const rows = await db.select<Booking[]>("select * from bookings where id = ?", [id]);
  const updated = rows[0];
  if (!updated) throw new Error("Booking not found.");

  await queueOutbox(db, "bookings", id, "update", updated as unknown as Record<string, unknown>);

  const changes = fields
    .map((f) => diffField(f, PAYMENT_FIELD_LABELS[f], before[f] as string | null, updated[f] as string | null))
    .filter((c): c is NonNullable<typeof c> => c !== null);

  if (changes.length > 0) {
    await logAction({
      entityType: "booking",
      entityId: id,
      entityLabel: bookingRef(id),
      action: "updated",
      changes,
    });
  }

  return updated;
}

// The "final settlement" half of partial/final overtime settlement — a
// deliberate write-off of whatever's left of a booking's overtime top-up
// once staff decides they're not going to collect any more of it. Doesn't
// touch additional_payment (whatever was actually collected, via
// correctBookingPayment, stays the true recorded figure) — this only stamps
// overtime_waived_at, which is what computeOvertimeSettlement/
// isOvertimeUnsettled check to stop treating the gap as still outstanding.
// One-directional and irreversible through the UI (no "un-waive" path
// today, same as markBookingPaid has no "un-mark" path) — logged to
// action_logs like every other payment-affecting correction here.
export async function waiveOvertimeBalance(id: string): Promise<Booking> {
  const db = await getDb();
  const before = await getBookingById(id);
  if (!before) throw new Error("Booking not found.");
  if (before.overtime_waived_at) return before;

  const now = new Date().toISOString();
  await db.execute(
    "update bookings set overtime_waived_at = ?, updated_at = ? where id = ?",
    [now, now, id],
  );

  const rows = await db.select<Booking[]>("select * from bookings where id = ?", [id]);
  const updated = rows[0];
  if (!updated) throw new Error("Booking not found.");

  await queueOutbox(db, "bookings", id, "update", updated as unknown as Record<string, unknown>);
  await logAction({
    entityType: "booking",
    entityId: id,
    entityLabel: bookingRef(id),
    action: "updated",
    changes: [{ field: "overtime_waived_at", label: "Overtime balance", old: "outstanding", new: "waived" }],
  });

  return updated;
}

// Persists which Remittances block math (Bucket or Recorded) this specific
// booking should use once the report's Split is set to Hybrid — see
// RemittancesReport.tsx. Set from that report's per-booking picker, shown
// only in Hybrid mode. null clears the override, letting Hybrid fall back to
// its Bucket default for this booking again. Logged to action_logs the same
// way owner/vehicle edits are, same as every other booking correction here.
export async function setRemittanceSplitOverride(
  id: string,
  mode: "bucket" | "recorded" | null,
): Promise<Booking> {
  const db = await getDb();
  const before = await getBookingById(id);
  if (!before) throw new Error("Booking not found.");

  const now = new Date().toISOString();
  await db.execute(
    "update bookings set remittance_split_override = ?, updated_at = ? where id = ?",
    [mode, now, id],
  );

  const rows = await db.select<Booking[]>("select * from bookings where id = ?", [id]);
  const updated = rows[0];
  if (!updated) throw new Error("Booking not found.");

  await queueOutbox(db, "bookings", id, "update", updated as unknown as Record<string, unknown>);

  const change = diffField(
    "remittance_split_override",
    "Remittance split (Hybrid)",
    before.remittance_split_override,
    mode,
  );
  if (change) {
    await logAction({ entityType: "booking", entityId: id, entityLabel: bookingRef(id), action: "updated", changes: [change] });
  }

  return updated;
}

// Corrects a booking's agreement execution date after the fact — e.g. staff
// entering the booking into the system later than it was actually signed,
// or a typo in the picker at recording time. Deliberately its own narrow
// function (mirrors updateBookingTimes' single-purpose shape) rather than a
// field folded into a general "edit booking" path, so there's always a
// clean action_logs entry showing exactly what changed and when. This is
// the ONE thing this function touches — vehicle, customer, payment, and the
// booking's actual timing all stay exactly as they are.
export async function updateAgreementExecutedAt(id: string, agreementExecutedAt: string): Promise<Booking> {
  const db = await getDb();
  const before = await getBookingById(id);
  if (!before) throw new Error("Booking not found.");

  // Same guard as createBooking — agreement can never be executed after the
  // rental's scheduled Out date.
  if (dateOnly(agreementExecutedAt) > dateOnly(before.start_date)) {
    throw new Error("Agreement executed date can't be after the scheduled Out date.");
  }

  const now = new Date().toISOString();
  await db.execute(
    "update bookings set agreement_executed_at = ?, updated_at = ? where id = ?",
    [agreementExecutedAt, now, id],
  );

  const rows = await db.select<Booking[]>("select * from bookings where id = ?", [id]);
  const updated = rows[0];
  if (!updated) throw new Error("Booking not found.");

  await queueOutbox(db, "bookings", id, "update", updated as unknown as Record<string, unknown>);

  const change = diffField(
    "agreement_executed_at",
    "Agreement executed",
    before.agreement_executed_at,
    updated.agreement_executed_at,
  );
  if (change) {
    await logAction({ entityType: "booking", entityId: id, entityLabel: bookingRef(id), action: "updated", changes: [change] });
  }

  return updated;
}

// Settles a 'receivable' booking — staff confirming the previously-agreed
// amount has actually been collected. Stamps paid_at at the real moment this
// is called, distinct from created_at (when the booking was originally
// logged). No-op-safe to call on an already-'paid' booking (paid_at stays
// whatever it already was) rather than erroring, since Settlements gates the
// button on payment_status anyway. Logged to action_logs like every other
// booking correction here.
export async function markBookingPaid(id: string): Promise<Booking> {
  const db = await getDb();
  const before = await getBookingById(id);
  if (!before) throw new Error("Booking not found.");
  if (before.payment_status === "paid") return before;

  const now = new Date().toISOString();
  await db.execute(
    "update bookings set payment_status = 'paid', paid_at = ?, updated_at = ? where id = ?",
    [now, now, id],
  );

  const rows = await db.select<Booking[]>("select * from bookings where id = ?", [id]);
  const updated = rows[0];
  if (!updated) throw new Error("Booking not found.");

  await queueOutbox(db, "bookings", id, "update", updated as unknown as Record<string, unknown>);
  await logAction({
    entityType: "booking",
    entityId: id,
    entityLabel: bookingRef(id),
    action: "updated",
    changes: [{ field: "payment_status", label: "Payment status", old: "receivable", new: "paid" }],
  });

  return updated;
}

// resetAllBookings() was removed (this session) — see Settings' "Reset test
// data" removal comment in SettingsScreen.tsx and BRAINS/RACOS.md ROD021
// for the reasoning: a tool that lets an admin bulk-wipe real booking
// history works against RACOS's transparency guarantees, even scoped to
// local-only data with an audit log entry recording that a wipe happened.
