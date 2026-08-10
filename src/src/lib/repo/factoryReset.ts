import { getDb, currentBusinessId } from "../db";
import { logAction } from "./actionLog";

// factoryReset() was removed this session — the same clean-slate outcome
// (full wipe of a business's data) is now reached by signing out and
// provisioning a fresh business, rather than an in-app destructive tool
// that duplicated it. See BRAINS/SESSIONS.md.

export interface StaleDataSummary {
  vehicles: number;
  customers: number;
  bookings: number;
  payments: number;
}

// ROT024 follow-up — a device is meant to be single-tenant (ROD017): local
// vehicles/customers/bookings/payments should only ever carry the currently
// signed-in business's id. Rows that don't (leftover from testing a
// different account on this same device before signing into this one — the
// exact risk SES013 flagged: sign-out never wipes local data) can never
// sync; Cloud RLS correctly rejects them since they don't belong to this
// session's business, and they'll sit "failed" retrying forever otherwise.
// Deliberately narrow: only clears rows tied to a business_id that ISN'T
// the current one, and only in the four tables that actually sync — this
// business's own bookings/vehicles/customers (however old) are never
// touched, nor are owners/rate_matrix/seating_bands/custom_rates/
// business_profile/action_logs. The removed factoryReset() and
// resetAllBookings() both let an admin wipe THIS business's own real
// history — this function never does that, by construction, not just by
// convention (the `!=` in every query below is the whole safety guarantee).
export async function clearStaleBusinessData(): Promise<StaleDataSummary> {
  const db = await getDb();
  const businessId = currentBusinessId();

  const [vehicleRows, customerRows, bookingRows, paymentRows] = await Promise.all([
    db.select<{ count: number }[]>("select count(*) as count from vehicles where business_id != ?", [businessId]),
    db.select<{ count: number }[]>("select count(*) as count from customers where business_id != ?", [businessId]),
    db.select<{ count: number }[]>("select count(*) as count from bookings where business_id != ?", [businessId]),
    db.select<{ count: number }[]>("select count(*) as count from payments where business_id != ?", [businessId]),
  ]);

  // Children before parents — payments/bookings reference vehicles/customers.
  await db.execute("delete from payments where business_id != ?", [businessId]);
  await db.execute("delete from bookings where business_id != ?", [businessId]);
  await db.execute("delete from vehicles where business_id != ?", [businessId]);
  await db.execute("delete from customers where business_id != ?", [businessId]);

  // Purge any outbox entries left pointing at a row that no longer exists —
  // covers the rows just deleted above, plus anything orphaned earlier by
  // ordinary use that was never cleaned up; either way, an entry for a
  // vanished row can never succeed and isn't worth retrying. Local-only —
  // nothing pushed to Cloud as a delete — but stale rows by definition were
  // never Cloud's current business's data anyway (that's the whole reason
  // they fail RLS in the first place).
  for (const table of ["vehicles", "customers", "bookings", "payments"] as const) {
    await db.execute(
      `delete from outbox where entity_table = ? and entity_id not in (select id from ${table})`,
      [table],
    );
  }

  const summary = {
    vehicles: vehicleRows[0]?.count ?? 0,
    customers: customerRows[0]?.count ?? 0,
    bookings: bookingRows[0]?.count ?? 0,
    payments: paymentRows[0]?.count ?? 0,
  };

  const total = summary.vehicles + summary.customers + summary.bookings + summary.payments;
  if (total > 0) {
    await logAction({
      entityType: "system",
      entityId: businessId,
      entityLabel: "Stale test data",
      action: "reset",
      changes: [
        { field: "vehicles", label: "Vehicles cleared", old: null, new: String(summary.vehicles) },
        { field: "customers", label: "Customers cleared", old: null, new: String(summary.customers) },
        { field: "bookings", label: "Bookings cleared", old: null, new: String(summary.bookings) },
      ],
    });
  }

  return summary;
}
