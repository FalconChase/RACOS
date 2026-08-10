// ROP011 — odometer log. Append-only: deliberately no updateOdometerReading
// or deleteOdometerReading anywhere in this file. A reading locks the
// instant it's saved — corroboration comes from comparing independent
// entries later (owner vs staff vs the booking record), never from editing
// one after the fact. See supabase/migrations/20260810210000_odometer_gps_manual_entries.sql
// for the RLS side of that same guarantee.

import { getDb, currentBusinessId, currentProfileId } from "../db";
import { queueOutbox } from "./outbox";
import type { OdometerReading } from "../types";

export async function listOdometerReadings(vehicleId?: string): Promise<OdometerReading[]> {
  const db = await getDb();
  if (vehicleId) {
    return db.select<OdometerReading[]>(
      "select * from odometer_readings where business_id = ? and vehicle_id = ? order by reading_at desc",
      [currentBusinessId(), vehicleId],
    );
  }
  return db.select<OdometerReading[]>(
    "select * from odometer_readings where business_id = ? order by reading_at desc",
    [currentBusinessId()],
  );
}

export interface NewOdometerReadingInput {
  vehicle_id: string;
  reading_km: number;
  // ISO string, staff-picked. Validated here (not just the form's max
  // attribute) against the same instant recorded_at gets, so this can never
  // silently save a future-dated reading even if the UI guard is bypassed.
  reading_at: string;
  note?: string;
}

export async function createOdometerReading(input: NewOdometerReadingInput): Promise<OdometerReading> {
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

  const reading: OdometerReading = {
    id,
    business_id,
    vehicle_id: input.vehicle_id,
    reading_km: input.reading_km,
    reading_at: input.reading_at,
    recorded_at,
    recorded_by_role: "staff",
    recorded_by_id: profileId,
    recorded_by_label,
    note: input.note ?? null,
  };

  await db.execute(
    `insert into odometer_readings
       (id, business_id, vehicle_id, reading_km, reading_at, recorded_at, recorded_by_role, recorded_by_id, recorded_by_label, note)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      reading.id,
      reading.business_id,
      reading.vehicle_id,
      reading.reading_km,
      reading.reading_at,
      reading.recorded_at,
      reading.recorded_by_role,
      reading.recorded_by_id,
      reading.recorded_by_label,
      reading.note,
    ],
  );

  await queueOutbox(db, "odometer_readings", id, "insert", reading as unknown as Record<string, unknown>);
  return reading;
}
