import { getDb, currentBusinessId } from "../db";

export interface FactoryResetSummary {
  vehicles: number;
  customers: number;
  bookings: number;
  owners: number;
}

// DEV-ONLY: full clean slate for the current business — every vehicle,
// owner, customer, booking, payment, seating band, rate matrix row, custom
// rate, action history entry, and the HQ province selection, wiped back to
// empty (as if the app were just installed).
//
// Deliberately NOT wiped:
//   - provinces / municipalities — global, one-time PSGC reference data seeded
//     via migration INSERT statements with no runtime re-seed path. Deleting
//     these would be unrecoverable without reinstalling the app.
//   - businesses / profiles — the dev tenant/owner identity rows (see
//     ensureDevBusiness in lib/db.ts). Nothing else works without these.
//   - app_settings — per-device UI preferences (date/time format, duration
//     display, etc.), not test data tied to this business.
export async function factoryReset(): Promise<FactoryResetSummary> {
  const db = await getDb();
  const business_id = currentBusinessId();

  const [vehicleRows, customerRows, bookingRows, ownerRows] = await Promise.all([
    db.select<{ count: number }[]>("select count(*) as count from vehicles where business_id = ?", [business_id]),
    db.select<{ count: number }[]>("select count(*) as count from customers where business_id = ?", [business_id]),
    db.select<{ count: number }[]>("select count(*) as count from bookings where business_id = ?", [business_id]),
    db.select<{ count: number }[]>("select count(*) as count from owners where business_id = ?", [business_id]),
  ]);

  // Deletion order respects foreign keys — children before the parents they
  // reference, so nothing trips a "FOREIGN KEY constraint failed" mid-way.
  // vehicles.owner_id references owners(id), so vehicles must go first.
  await db.execute("delete from payments where business_id = ?", [business_id]);
  await db.execute("delete from custom_rates where business_id = ?", [business_id]);
  await db.execute("delete from bookings where business_id = ?", [business_id]);
  await db.execute("delete from rate_matrix where business_id = ?", [business_id]);
  await db.execute("delete from seating_bands where business_id = ?", [business_id]);
  await db.execute("delete from vehicles where business_id = ?", [business_id]);
  await db.execute("delete from owners where business_id = ?", [business_id]);
  await db.execute("delete from customers where business_id = ?", [business_id]);
  await db.execute("delete from business_profile where business_id = ?", [business_id]);
  await db.execute("delete from action_logs where business_id = ?", [business_id]);

  // Sync bookkeeping — nothing left worth pushing once everything above is gone.
  await db.execute("delete from outbox");
  await db.execute("delete from sync_state where business_id = ?", [business_id]);

  return {
    vehicles: vehicleRows[0]?.count ?? 0,
    customers: customerRows[0]?.count ?? 0,
    bookings: bookingRows[0]?.count ?? 0,
    owners: ownerRows[0]?.count ?? 0,
  };
}
