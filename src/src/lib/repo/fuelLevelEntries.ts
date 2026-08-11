// ROP011-style fuel level log. Append-only: deliberately no
// updateFuelLevelEntry or deleteFuelLevelEntry anywhere in this file, same
// spirit as odometerReadings.ts — an entry locks the instant it's saved. See
// supabase/migrations/20260811120000_fuel_level_entries.sql for the RLS side
// of that same guarantee.

import { getDb, currentBusinessId, currentProfileId } from "../db";
import { queueOutbox } from "./outbox";
import type { FuelLevelEntry } from "../types";

export async function listFuelLevelEntries(vehicleId?: string): Promise<FuelLevelEntry[]> {
  const db = await getDb();
  if (vehicleId) {
    return db.select<FuelLevelEntry[]>(
      "select * from fuel_level_entries where business_id = ? and vehicle_id = ? order by reading_at desc",
      [currentBusinessId(), vehicleId],
    );
  }
  return db.select<FuelLevelEntry[]>(
    "select * from fuel_level_entries where business_id = ? order by reading_at desc",
    [currentBusinessId()],
  );
}

export interface NewFuelLevelEntryInput {
  vehicle_id: string;
  level: number;
  unit: "bars" | "liters";
  // ISO string, staff-picked. Validated here (not just the form's max
  // attribute) against the same instant recorded_at gets, so this can never
  // silently save a future-dated reading even if the UI guard is bypassed.
  reading_at: string;
  note?: string;
}

export async function createFuelLevelEntry(input: NewFuelLevelEntryInput): Promise<FuelLevelEntry> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const business_id = currentBusinessId();
  const profileId = currentProfileId();
  const recorded_at = new Date().toISOString();

  if (new Date(input.reading_at).getTime() > new Date(recorded_at).getTime()) {
    throw new Error("Reading time can't be in the future.");
  }

  const profileRows = await db.select<{ full_name: string | null }[]>(
    "select full_name from profiles where id = ?",
    [profileId],
  );
  const recorded_by_label = profileRows[0]?.full_name ?? "Staff";

  const entry: FuelLevelEntry = {
    id,
    business_id,
    vehicle_id: input.vehicle_id,
    level: input.level,
    unit: input.unit,
    reading_at: input.reading_at,
    recorded_at,
    recorded_by_role: "staff",
    recorded_by_id: profileId,
    recorded_by_label,
    note: input.note ?? null,
  };

  await db.execute(
    `insert into fuel_level_entries
       (id, business_id, vehicle_id, level, unit, reading_at, recorded_at, recorded_by_role, recorded_by_id, recorded_by_label, note)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.id,
      entry.business_id,
      entry.vehicle_id,
      entry.level,
      entry.unit,
      entry.reading_at,
      entry.recorded_at,
      entry.recorded_by_role,
      entry.recorded_by_id,
      entry.recorded_by_label,
      entry.note,
    ],
  );

  await queueOutbox(db, "fuel_level_entries", id, "insert", entry as unknown as Record<string, unknown>);
  return entry;
}
