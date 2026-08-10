// ROP011 follow-up — "Convert to location": reverse-geocodes a
// GpsLocationEntry's coordinates into a friendly display label via
// Nominatim (OpenStreetMap's geocoder — same provider the map tiles
// already come from, free, no API key). Unlike the append-only log tables,
// this is an upsertable 1:1 cache (see types.ts GpsLocationLabel) — a
// re-resolve overwrites in place.
//
// Nominatim's usage policy wants a descriptive identifier and no more than
// ~1 request/second — trivial at this app's volume (a handful of
// on-demand conversions, never automatic/bulk). If that ever changes,
// this is the one place a server-side proxy would need to slot in.

import { getDb, currentBusinessId } from "../db";
import { queueOutbox } from "./outbox";
import { isConnectivityError } from "../network";
import type { GpsLocationEntry, GpsLocationLabel } from "../types";

interface StoredLabelRow {
  entry_id: string;
  business_id: string;
  formatted_address: string;
  raw_response: string | null;
  resolved_at: string;
}

function parseRow(row: StoredLabelRow): GpsLocationLabel {
  return { ...row, raw_response: row.raw_response ? JSON.parse(row.raw_response) : null };
}

// Keyed by entry_id for O(1) lookup against a list of entries in the UI.
export async function listGpsLocationLabels(): Promise<Record<string, GpsLocationLabel>> {
  const db = await getDb();
  const rows = await db.select<StoredLabelRow[]>(
    "select * from gps_location_labels where business_id = ?",
    [currentBusinessId()],
  );
  const byEntryId: Record<string, GpsLocationLabel> = {};
  for (const row of rows) byEntryId[row.entry_id] = parseRow(row);
  return byEntryId;
}

async function fetchNominatimAddress(lat: number, lon: number): Promise<{ formatted: string; raw: unknown }> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&zoom=18&addressdetails=1`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { "Accept-Language": "en" } });
  } catch (err) {
    // Unlike the rest of RACOS, this call has no offline fallback — it's a
    // live lookup against Nominatim, not something the outbox can queue
    // and retry later. Distinguishing "no connection" from "Nominatim
    // itself failed" here means the UI can say something the person can
    // actually act on, instead of a raw fetch error.
    if (isConnectivityError(err)) {
      throw new Error("You're offline — this entry is saved, but converting it needs a connection. Try again once you're back online.");
    }
    throw err;
  }

  if (!res.ok) {
    throw new Error("Location lookup failed — try again in a moment.");
  }
  const data = (await res.json()) as { display_name?: string; error?: string };
  if (!data.display_name) {
    throw new Error(data.error ?? "No address found for this location.");
  }
  return { formatted: data.display_name, raw: data };
}

export async function resolveGpsLocationLabel(entry: GpsLocationEntry): Promise<GpsLocationLabel> {
  if (entry.latitude == null || entry.longitude == null) {
    throw new Error("This entry has no coordinates to convert.");
  }

  const { formatted, raw } = await fetchNominatimAddress(entry.latitude, entry.longitude);

  const db = await getDb();
  const business_id = currentBusinessId();
  const resolved_at = new Date().toISOString();
  const label: GpsLocationLabel = {
    entry_id: entry.id,
    business_id,
    formatted_address: formatted,
    raw_response: raw,
    resolved_at,
  };

  await db.execute(
    `insert into gps_location_labels (entry_id, business_id, formatted_address, raw_response, resolved_at)
     values (?, ?, ?, ?, ?)
     on conflict(entry_id) do update set
       formatted_address = excluded.formatted_address,
       raw_response = excluded.raw_response,
       resolved_at = excluded.resolved_at`,
    [label.entry_id, label.business_id, label.formatted_address, JSON.stringify(label.raw_response), label.resolved_at],
  );

  await queueOutbox(db, "gps_location_labels", entry.id, "insert", {
    ...label,
    raw_response: JSON.stringify(label.raw_response),
  });
  return label;
}
