// ROP011 — GPS location log (split from the old combined gps_manual_entries
// table, see 0030_split_gps_locations_and_mileage.sql). Append-only, same
// as odometerReadings.ts — no update/delete anywhere in this file.
//
// latitude/longitude (0031_gps_location_entries_coordinates.sql) are set
// together or not at all — manual entries leave them null; the "Record
// through MAP" trail tool fills both alongside a coordinate-string
// location_text (see createGpsLocationEntriesBatch below).

import { getDb, currentBusinessId, currentProfileId } from "../db";
import { queueOutbox } from "./outbox";
import type { GpsLocationEntry } from "../types";
import type Database from "@tauri-apps/plugin-sql";

export async function listGpsLocationEntries(vehicleId?: string): Promise<GpsLocationEntry[]> {
  const db = await getDb();
  if (vehicleId) {
    return db.select<GpsLocationEntry[]>(
      "select * from gps_location_entries where business_id = ? and vehicle_id = ? order by reading_at desc",
      [currentBusinessId(), vehicleId],
    );
  }
  return db.select<GpsLocationEntry[]>(
    "select * from gps_location_entries where business_id = ? order by reading_at desc",
    [currentBusinessId()],
  );
}

export interface NewGpsLocationEntryInput {
  vehicle_id: string;
  location_text: string;
  latitude?: number;
  longitude?: number;
  duration_minutes?: number;
  reading_at: string;
  note?: string;
}

async function resolveRecordedByLabel(db: Database, profileId: string): Promise<string> {
  const profileRows = await db.select<{ full_name: string | null }[]>(
    "select full_name from profiles where id = ?",
    [profileId],
  );
  return profileRows[0]?.full_name ?? "Staff";
}

export async function createGpsLocationEntry(input: NewGpsLocationEntryInput): Promise<GpsLocationEntry> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const business_id = currentBusinessId();
  const profileId = currentProfileId();
  const recorded_at = new Date().toISOString();

  if (new Date(input.reading_at).getTime() > new Date(recorded_at).getTime()) {
    throw new Error("Observed time can't be in the future.");
  }
  if ((input.latitude == null) !== (input.longitude == null)) {
    throw new Error("Latitude and longitude must be set together.");
  }

  const recorded_by_label = await resolveRecordedByLabel(db, profileId);

  const entry: GpsLocationEntry = {
    id,
    business_id,
    vehicle_id: input.vehicle_id,
    location_text: input.location_text,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    duration_minutes: input.duration_minutes ?? null,
    reading_at: input.reading_at,
    recorded_at,
    recorded_by_role: "staff",
    recorded_by_id: profileId,
    recorded_by_label,
    note: input.note ?? null,
  };

  await db.execute(
    `insert into gps_location_entries
       (id, business_id, vehicle_id, location_text, latitude, longitude, duration_minutes, reading_at, recorded_at, recorded_by_role, recorded_by_id, recorded_by_label, note)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.id,
      entry.business_id,
      entry.vehicle_id,
      entry.location_text,
      entry.latitude,
      entry.longitude,
      entry.duration_minutes,
      entry.reading_at,
      entry.recorded_at,
      entry.recorded_by_role,
      entry.recorded_by_id,
      entry.recorded_by_label,
      entry.note,
    ],
  );

  await queueOutbox(db, "gps_location_entries", id, "insert", entry as unknown as Record<string, unknown>);
  return entry;
}

export interface BatchCreateResult {
  created: GpsLocationEntry[];
  // Set only if a stop failed partway through — everything in `created` up
  // to that point is already saved and permanent (no rollback exists here,
  // same as every other append-only table), so the caller needs to know
  // exactly how far it got, not just that something went wrong.
  error: { atIndex: number; message: string } | null;
}

// "Record through MAP" — one trail submits as a batch, but each stop is
// still just an ordinary createGpsLocationEntry() call under the hood, one
// at a time. There's no multi-row transaction here (tauri-plugin-sql has no
// primitive for one exposed to this layer, and every row is independently
// valid/immutable anyway) — a failure partway through leaves the earlier
// stops saved for real, which BatchCreateResult.error surfaces explicitly
// rather than pretending it was all-or-nothing.
export async function createGpsLocationEntriesBatch(inputs: NewGpsLocationEntryInput[]): Promise<BatchCreateResult> {
  const created: GpsLocationEntry[] = [];
  for (let i = 0; i < inputs.length; i++) {
    try {
      created.push(await createGpsLocationEntry(inputs[i]));
    } catch (err) {
      return { created, error: { atIndex: i, message: err instanceof Error ? err.message : "Couldn't save this stop." } };
    }
  }
  return { created, error: null };
}
