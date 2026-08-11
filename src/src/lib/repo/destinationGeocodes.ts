// Map > Destination history — forward-geocodes a booking destination
// (province + optional municipality) into coordinates via Nominatim
// (OpenStreetMap's geocoder — same free, no-key provider gps_location_labels
// already uses for the reverse direction). Cached per unique place, not per
// booking, since the same municipality is typically booked repeatedly —
// see buildLocationKey.
//
// Same usage-policy spirit as gps_location_labels: no more than ~1
// request/second, never automatic/bulk beyond what a single Map screen
// visit actually needs (only the destinations not already cached).

import { getDb, currentBusinessId } from "../db";
import { isConnectivityError } from "../network";
import type { DestinationGeocode, Municipality, Province } from "../types";

interface StoredRow {
  business_id: string;
  location_key: string;
  province_id: string;
  municipality_id: string | null;
  display_name: string;
  latitude: number;
  longitude: number;
  raw_response: string | null;
  resolved_at: string;
}

function parseRow(row: StoredRow): DestinationGeocode {
  return { ...row, raw_response: row.raw_response ? JSON.parse(row.raw_response) : null };
}

// destination_city_id when a specific municipality was picked, otherwise
// 'province:{province_id}' — the one definition of this key, shared by
// every caller so aggregation and caching always agree on identity.
export function buildLocationKey(provinceId: string, cityId: string | null): string {
  return cityId ?? `province:${provinceId}`;
}

// Keyed by location_key for O(1) lookup while aggregating a booking list.
export async function listDestinationGeocodes(): Promise<Record<string, DestinationGeocode>> {
  const db = await getDb();
  const rows = await db.select<StoredRow[]>(
    "select * from destination_geocodes where business_id = ?",
    [currentBusinessId()],
  );
  const byKey: Record<string, DestinationGeocode> = {};
  for (const row of rows) byKey[row.location_key] = parseRow(row);
  return byKey;
}

async function fetchNominatimCoordinates(query: string): Promise<{ lat: number; lon: number; displayName: string; raw: unknown }> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&countrycodes=ph&format=jsonv2&limit=1`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { "Accept-Language": "en" } });
  } catch (err) {
    // Same distinction gps_location_labels draws — this is a live lookup,
    // nothing the outbox can queue and retry offline.
    if (isConnectivityError(err)) {
      throw new Error("You're offline — destination history needs a connection to resolve new places. Try again once you're back online.");
    }
    throw err;
  }

  if (!res.ok) {
    throw new Error("Location lookup failed — try again in a moment.");
  }
  const data = (await res.json()) as { lat?: string; lon?: string; display_name?: string; error?: string }[];
  const match = data[0];
  if (!match || !match.lat || !match.lon) {
    throw new Error(`No coordinates found for "${query}".`);
  }
  return { lat: Number(match.lat), lon: Number(match.lon), displayName: match.display_name ?? query, raw: match };
}

// Resolves and caches one destination's coordinates. Callers own the
// ~1/sec pacing across a batch of unresolved destinations (see
// resolveDestinationGeocodes below) — this function itself makes exactly
// one request.
export async function geocodeDestination(
  provinceId: string,
  cityId: string | null,
  provinces: Province[],
  municipalities: Municipality[],
): Promise<DestinationGeocode> {
  const province = provinces.find((p) => p.id === provinceId);
  if (!province) throw new Error("Unknown province — can't geocode this destination.");
  const municipality = cityId ? municipalities.find((m) => m.id === cityId) : null;

  const query = municipality
    ? `${municipality.name}, ${province.name}, Philippines`
    : `${province.name}, Philippines`;

  const { lat, lon, displayName, raw } = await fetchNominatimCoordinates(query);

  const db = await getDb();
  const business_id = currentBusinessId();
  const resolved_at = new Date().toISOString();
  const geocode: DestinationGeocode = {
    business_id,
    location_key: buildLocationKey(provinceId, cityId),
    province_id: provinceId,
    municipality_id: cityId,
    display_name: displayName,
    latitude: lat,
    longitude: lon,
    raw_response: raw,
    resolved_at,
  };

  await db.execute(
    `insert into destination_geocodes
       (business_id, location_key, province_id, municipality_id, display_name, latitude, longitude, raw_response, resolved_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)
     on conflict(business_id, location_key) do update set
       province_id = excluded.province_id,
       municipality_id = excluded.municipality_id,
       display_name = excluded.display_name,
       latitude = excluded.latitude,
       longitude = excluded.longitude,
       raw_response = excluded.raw_response,
       resolved_at = excluded.resolved_at`,
    [
      geocode.business_id,
      geocode.location_key,
      geocode.province_id,
      geocode.municipality_id,
      geocode.display_name,
      geocode.latitude,
      geocode.longitude,
      JSON.stringify(geocode.raw_response),
      geocode.resolved_at,
    ],
  );

  // Local-only cache, rebuildable from municipalities/provinces at any
  // time — deliberately not queued to the outbox (unlike gps_location_labels).
  return geocode;
}

const NOMINATIM_PACING_MS = 1100;

// Geocodes every not-yet-cached destination in `targets`, one at a time
// with Nominatim's usage-policy pacing between calls. A destination that
// fails to resolve (typo-prone municipality name, transient lookup
// failure) is skipped rather than aborting the rest of the batch — it
// simply won't have a pin until the next attempt. onProgress reports
// (resolved so far, total to resolve) for a "Resolving locations… n/m" UI.
export async function resolveDestinationGeocodes(
  targets: { provinceId: string; cityId: string | null }[],
  provinces: Province[],
  municipalities: Municipality[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const cached = await listDestinationGeocodes();
  const pending = targets.filter((t) => !cached[buildLocationKey(t.provinceId, t.cityId)]);
  // De-dupe — the same destination can appear many times across bookings.
  const seen = new Set<string>();
  const unique = pending.filter((t) => {
    const key = buildLocationKey(t.provinceId, t.cityId);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  for (let i = 0; i < unique.length; i++) {
    const target = unique[i];
    try {
      await geocodeDestination(target.provinceId, target.cityId, provinces, municipalities);
    } catch {
      // Skipped — see function comment. A future Map visit will retry it
      // since it's still absent from the cache.
    }
    onProgress?.(i + 1, unique.length);
    if (i < unique.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, NOMINATIM_PACING_MS));
    }
  }
}
