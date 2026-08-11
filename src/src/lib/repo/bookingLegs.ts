// Multi-destination bookings — extra stops beyond a booking's own primary
// destination. See types.ts's BookingLeg and 0042_booking_legs.sql. Created
// only via createBooking (bookings.ts) alongside the booking itself — no
// standalone create/update/delete here, same append-only spirit as ROP011's
// entry tables, just scoped to booking creation instead of open-ended
// logging.

import { getDb, currentBusinessId } from "../db";
import type { BookingLeg } from "../types";

export async function listBookingLegsForBooking(bookingId: string): Promise<BookingLeg[]> {
  const db = await getDb();
  return db.select<BookingLeg[]>(
    "select * from booking_legs where booking_id = ? order by sequence asc",
    [bookingId],
  );
}

// Every leg for every booking this business has, for screens that need to
// recompute multi-leg expected payment across a whole list of bookings at
// once (Settlements > Records, Remittances) without a query per row. Group
// client-side by booking_id, same pattern those screens already use for
// vehicles/customers.
export async function listAllBookingLegs(): Promise<BookingLeg[]> {
  const db = await getDb();
  return db.select<BookingLeg[]>(
    "select * from booking_legs where business_id = ? order by booking_id asc, sequence asc",
    [currentBusinessId()],
  );
}
