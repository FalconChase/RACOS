import { getDb, currentBusinessId, currentProfileId } from "../db";
import { queueOutbox } from "./outbox";
import { updateVehicleStatus } from "./vehicles";
import { diffField, logAction } from "./actionLog";
import { bookingRef } from "../bookingRef";
import type { Booking, BookingStatus } from "../types";

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

export interface NewBookingInput {
  vehicle_id: string;
  customer_id: string;
  start_date: string; // ISO datetime
  end_date: string; // ISO datetime
  // Drives the pricing tier — see provinces/Rate Matrix.
  destination_province_id?: string;
  // Optional finer-grained destination, and what a custom rate matches on.
  destination_city_id?: string;
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
    created_at: nowIso,
    updated_at: nowIso,
  };

  await db.execute(
    `insert into bookings
       (id, business_id, vehicle_id, customer_id, start_date, end_date, status, destination_province_id,
        destination_city_id, payment_amount, expected_payment, purpose, created_by,
        pending_availability_check, actual_return_at, actual_departure_at, resolved_rate, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      booking.payment_amount,
      booking.expected_payment,
      booking.purpose,
      booking.created_by,
      booking.pending_availability_check,
      booking.actual_return_at,
      booking.actual_departure_at,
      booking.resolved_rate,
      booking.created_at,
      booking.updated_at,
    ],
  );

  await queueOutbox(db, "bookings", id, "insert", booking as unknown as Record<string, unknown>);

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

export async function cancelBooking(id: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  const before = await getBookingById(id);

  await db.execute("update bookings set status = 'cancelled', updated_at = ? where id = ?", [now, id]);

  const rows = await db.select<Booking[]>("select * from bookings where id = ?", [id]);
  if (rows[0]) await queueOutbox(db, "bookings", id, "update", rows[0] as unknown as Record<string, unknown>);

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
  await updateVehicleStatus(updated.vehicle_id, "available");
  return updated;
}

// Confirms a still-"pending" booking has actually departed — the counterpart
// to markBookingReturned, for a booking whose scheduled ETD (start_date) has
// passed (or is being confirmed early) without ever getting resolved at
// creation time. Moves status to active and marks the vehicle rented.
export async function markBookingDeparted(id: string, actualDepartureAt: string): Promise<Booking> {
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
  await updateVehicleStatus(updated.vehicle_id, "rented");
  return updated;
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

// DEV-ONLY: wipes every booking — ongoing and history alike — for the current
// business, so test data can be cleared without hand-deleting rows one at a
// time. Vehicles, customers, and rate/location data are untouched. This also
// frees up vehicles/customers that otherwise can't be deleted while a
// booking (even a completed/cancelled one) still references them, since
// bookings.vehicle_id/customer_id are NOT NULL foreign keys.
export async function resetAllBookings(): Promise<{ deletedCount: number }> {
  const db = await getDb();
  const business_id = currentBusinessId();

  const rows = await db.select<{ id: string }[]>(
    "select id from bookings where business_id = ?",
    [business_id],
  );
  const ids = rows.map((r) => r.id);

  // payments.booking_id is a NOT NULL FK — clear first so it never blocks the
  // bookings delete below, even though nothing in the app writes to payments
  // yet.
  await db.execute("delete from payments where business_id = ?", [business_id]);
  await db.execute("delete from bookings where business_id = ?", [business_id]);

  // Drop queued sync entries for the rows just wiped, so the (not yet built)
  // sync worker never tries to push a delete/update for an id that no longer
  // means anything locally.
  for (const id of ids) {
    await db.execute("delete from outbox where entity_table = 'bookings' and entity_id = ?", [id]);
  }

  // Vehicle status now follows booking state (see createBooking/markBookingReturned) —
  // after wiping every booking, nothing should still read as "rented" with no
  // booking left to justify it.
  await db.execute(
    "update vehicles set status = 'available', updated_at = ? where business_id = ? and status = 'rented'",
    [new Date().toISOString(), business_id],
  );

  return { deletedCount: ids.length };
}
