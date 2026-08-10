// ROP011 — mileage log (split from the old combined gps_manual_entries
// table, see 0030_split_gps_locations_and_mileage.sql). A mileage figure
// covers a period (daily by default, rangeable per row) rather than an
// instant — hand-copied from Traccar until real API auto-sync exists.
// Append-only, same as odometerReadings.ts.

import { getDb, currentBusinessId, currentProfileId } from "../db";
import { queueOutbox } from "./outbox";
import type { MileageEntry } from "../types";

export async function listMileageEntries(vehicleId?: string): Promise<MileageEntry[]> {
  const db = await getDb();
  if (vehicleId) {
    return db.select<MileageEntry[]>(
      "select * from mileage_entries where business_id = ? and vehicle_id = ? order by period_end desc",
      [currentBusinessId(), vehicleId],
    );
  }
  return db.select<MileageEntry[]>(
    "select * from mileage_entries where business_id = ? order by period_end desc",
    [currentBusinessId()],
  );
}

export interface NewMileageEntryInput {
  vehicle_id: string;
  mileage_km: number;
  period_start: string; // YYYY-MM-DD
  period_end: string; // YYYY-MM-DD — defaults to period_start on the form (daily)
  note?: string;
}

export async function createMileageEntry(input: NewMileageEntryInput): Promise<MileageEntry> {
  if (input.period_end < input.period_start) {
    throw new Error("End date can't be before the start date.");
  }

  const db = await getDb();
  const id = crypto.randomUUID();
  const business_id = currentBusinessId();
  const profileId = currentProfileId();
  const recorded_at = new Date().toISOString();
  const recordedDate = recorded_at.slice(0, 10);

  if (input.period_end > recordedDate) {
    throw new Error("End date can't be in the future.");
  }

  const profileRows = await db.select<{ full_name: string | null }[]>(
    "select full_name from profiles where id = ?",
    [profileId],
  );
  const recorded_by_label = profileRows[0]?.full_name ?? "Staff";

  const entry: MileageEntry = {
    id,
    business_id,
    vehicle_id: input.vehicle_id,
    mileage_km: input.mileage_km,
    period_start: input.period_start,
    period_end: input.period_end,
    recorded_at,
    recorded_by_role: "staff",
    recorded_by_id: profileId,
    recorded_by_label,
    note: input.note ?? null,
  };

  await db.execute(
    `insert into mileage_entries
       (id, business_id, vehicle_id, mileage_km, period_start, period_end, recorded_at, recorded_by_role, recorded_by_id, recorded_by_label, note)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.id,
      entry.business_id,
      entry.vehicle_id,
      entry.mileage_km,
      entry.period_start,
      entry.period_end,
      entry.recorded_at,
      entry.recorded_by_role,
      entry.recorded_by_id,
      entry.recorded_by_label,
      entry.note,
    ],
  );

  await queueOutbox(db, "mileage_entries", id, "insert", entry as unknown as Record<string, unknown>);
  return entry;
}
