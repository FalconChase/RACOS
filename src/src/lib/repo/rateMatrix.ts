import { getDb, currentBusinessId } from "../db";
import type { CustomRate, RateMatrixRow, SeatingBand } from "../types";

export async function listSeatingBands(): Promise<SeatingBand[]> {
  const db = await getDb();
  return db.select<SeatingBand[]>(
    "select * from seating_bands where business_id = ? order by sort_order, min_seats",
    [currentBusinessId()],
  );
}

export async function listRateMatrix(): Promise<RateMatrixRow[]> {
  const db = await getDb();
  return db.select<RateMatrixRow[]>(
    "select * from rate_matrix where business_id = ?",
    [currentBusinessId()],
  );
}

export interface NewSeatingBandInput {
  label: string;
  min_seats: number;
  max_seats?: number | null;
}

export async function createSeatingBand(input: NewSeatingBandInput): Promise<SeatingBand> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const business_id = currentBusinessId();
  const now = new Date().toISOString();

  const existing = await listSeatingBands();
  const sort_order = existing.length ? Math.max(...existing.map((b) => b.sort_order)) + 1 : 0;

  const band: SeatingBand = {
    id,
    business_id,
    label: input.label,
    min_seats: input.min_seats,
    max_seats: input.max_seats ?? null,
    sort_order,
    created_at: now,
    updated_at: now,
  };

  await db.execute(
    `insert into seating_bands (id, business_id, label, min_seats, max_seats, sort_order, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?)`,
    [band.id, band.business_id, band.label, band.min_seats, band.max_seats, band.sort_order, band.created_at, band.updated_at],
  );

  // Every seating band needs a matrix row to hold its tier rates, even before
  // staff have filled in any actual numbers.
  const rowId = crypto.randomUUID();
  await db.execute(
    `insert into rate_matrix (id, business_id, seating_band_id, rate_tier1, rate_tier2, rate_tier3, created_at, updated_at)
     values (?, ?, ?, null, null, null, ?, ?)`,
    [rowId, business_id, band.id, now, now],
  );

  return band;
}

export async function deleteSeatingBand(id: string): Promise<void> {
  const db = await getDb();
  // SQLite doesn't enforce foreign keys (and therefore "on delete cascade")
  // unless a connection explicitly turns on PRAGMA foreign_keys — not
  // something to depend on here, so dependent rows are deleted explicitly.
  await db.execute("delete from rate_matrix where seating_band_id = ?", [id]);
  await db.execute("delete from custom_rates where seating_band_id = ?", [id]);
  await db.execute("delete from seating_bands where id = ?", [id]);
}

export async function listCustomRates(): Promise<CustomRate[]> {
  const db = await getDb();
  return db.select<CustomRate[]>("select * from custom_rates where business_id = ?", [currentBusinessId()]);
}

// Upsert — one custom rate per (municipality, seating band). Re-saving an
// existing pair updates its rate rather than erroring, matching the unique
// index. `cityId` here is a municipalities.id (column kept its original name
// from when it pointed at the old business-scoped `cities` table).
export async function upsertCustomRate(cityId: string, seatingBandId: string, rate: string): Promise<CustomRate> {
  const db = await getDb();
  const business_id = currentBusinessId();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await db.execute(
    `insert into custom_rates (id, business_id, city_id, seating_band_id, rate, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?)
     on conflict(city_id, seating_band_id) do update set rate = excluded.rate, updated_at = excluded.updated_at`,
    [id, business_id, cityId, seatingBandId, rate, now, now],
  );

  const rows = await db.select<CustomRate[]>(
    "select * from custom_rates where city_id = ? and seating_band_id = ?",
    [cityId, seatingBandId],
  );
  return rows[0];
}

export async function deleteCustomRate(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("delete from custom_rates where id = ?", [id]);
}

export async function updateRateMatrixCell(
  seatingBandId: string,
  tier: 1 | 2 | 3,
  rate: string,
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  const column = tier === 1 ? "rate_tier1" : tier === 2 ? "rate_tier2" : "rate_tier3";
  await db.execute(
    `update rate_matrix set ${column} = ?, updated_at = ? where business_id = ? and seating_band_id = ?`,
    [rate, now, currentBusinessId(), seatingBandId],
  );
}

// Seeds two starter seating bands (matching the examples given when this
// feature was designed) so the Rate Matrix screen isn't empty on first run.
// Idempotent — a no-op once any seating band already exists for the business.
export async function ensureDefaultSeatingBands(): Promise<void> {
  const existing = await listSeatingBands();
  if (existing.length > 0) return;
  await createSeatingBand({ label: "3-5 seater", min_seats: 3, max_seats: 5 });
  await createSeatingBand({ label: "6-7 seater", min_seats: 6, max_seats: 7 });
}
