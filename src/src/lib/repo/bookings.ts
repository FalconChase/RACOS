import { getDb, currentBusinessId, currentProfileId } from "../db";
import { queueOutbox } from "./outbox";
import type { Booking } from "../types";

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
}

export async function createBooking(input: NewBookingInput): Promise<Booking> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const business_id = currentBusinessId();
  const now = new Date().toISOString();

  const booking: Booking = {
    id,
    business_id,
    vehicle_id: input.vehicle_id,
    customer_id: input.customer_id,
    start_date: input.start_date,
    end_date: input.end_date,
    status: "pending",
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
    created_at: now,
    updated_at: now,
  };

  await db.execute(
    `insert into bookings
       (id, business_id, vehicle_id, customer_id, start_date, end_date, status, destination_province_id,
        destination_city_id, payment_amount, expected_payment, purpose, created_by,
        pending_availability_check, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      booking.created_at,
      booking.updated_at,
    ],
  );

  await queueOutbox(db, "bookings", id, "insert", booking as unknown as Record<string, unknown>);
  return booking;
}

export async function cancelBooking(id: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute("update bookings set status = 'cancelled', updated_at = ? where id = ?", [now, id]);

  const rows = await db.select<Booking[]>("select * from bookings where id = ?", [id]);
  if (rows[0]) await queueOutbox(db, "bookings", id, "update", rows[0] as unknown as Record<string, unknown>);
}
