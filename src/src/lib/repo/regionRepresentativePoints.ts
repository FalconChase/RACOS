// ROT052 Phase 2 — resolves and caches the "representative point" for a
// region-level destination pick: the farthest province within that region
// from HQ (a worst-case distance, not average/nearest), labelled with that
// province's capital municipality when one is flagged (see
// Municipality.is_capital, migration 0057). See PLANS.md ROP014 for the
// full design discussion this implements.
//
// The heavy lifting reuses the existing destination_geocodes pipeline
// (lib/repo/destinationGeocodes.ts) entirely — every province in the
// region gets geocoded (or read from cache) the exact same paced,
// rate-limit-respecting way Map's Destination history already resolves
// places. Only the small finished ANSWER (which province won, its
// capital, the resulting lat/lng) gets cached here and synced to Cloud —
// never the geocoding itself, which stays local-only like every other
// destination_geocodes entry.
//
// Resolution is lazy (only called when Map/Analytics actually need to draw
// something for a region-picked booking — never at booking-save time,
// which stays fully offline/instant) and cached per region, not per
// booking — a province's location never changes, so once resolved it's
// reused forever unless HQ itself moves (see hq_location_key staleness
// check below).

import { getDb, currentBusinessId } from "../db";
import { queueOutbox } from "./outbox";
import { buildLocationKey, listDestinationGeocodes, resolveDestinationGeocodes } from "./destinationGeocodes";
import { haversineKm } from "../geo";
import type { DestinationGeocode, Municipality, Province, RegionRepresentativePoint } from "../types";

async function readCached(regionName: string): Promise<RegionRepresentativePoint | null> {
  const db = await getDb();
  const rows = await db.select<RegionRepresentativePoint[]>(
    "select * from region_representative_points where business_id = ? and region_name = ?",
    [currentBusinessId(), regionName],
  );
  return rows[0] ?? null;
}

async function store(point: RegionRepresentativePoint): Promise<void> {
  const db = await getDb();
  await db.execute(
    `insert into region_representative_points
       (business_id, region_name, hq_location_key, province_id, municipality_id, display_name, latitude, longitude, resolved_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)
     on conflict(business_id, region_name) do update set
       hq_location_key = excluded.hq_location_key,
       province_id = excluded.province_id,
       municipality_id = excluded.municipality_id,
       display_name = excluded.display_name,
       latitude = excluded.latitude,
       longitude = excluded.longitude,
       resolved_at = excluded.resolved_at`,
    [
      point.business_id,
      point.region_name,
      point.hq_location_key,
      point.province_id,
      point.municipality_id,
      point.display_name,
      point.latitude,
      point.longitude,
      point.resolved_at,
    ],
  );
  // Small finished answer only — the province-by-province geocoding this
  // was built from stays local-only (destination_geocodes), same
  // separation of concerns as the design doc (PLANS.md ROP014).
  await queueOutbox(db, "region_representative_points", point.region_name, "insert", point as unknown as Record<string, unknown>);
}

// Re-expressed as a DestinationGeocode so every existing Map/Analytics call
// site that already knows how to render one (popups, HQ-displacement,
// bounds-fitting) needs zero further changes to also handle a region pick —
// location_key uses the 'region:{name}' namespace so it can never collide
// with a real province/city key.
export function buildRegionLocationKey(regionName: string): string {
  return `region:${regionName}`;
}

function asDestinationGeocode(point: RegionRepresentativePoint): DestinationGeocode {
  return {
    business_id: point.business_id,
    location_key: buildRegionLocationKey(point.region_name),
    province_id: point.province_id,
    municipality_id: point.municipality_id,
    display_name: point.display_name,
    latitude: point.latitude,
    longitude: point.longitude,
    raw_response: null,
    resolved_at: point.resolved_at,
  };
}

// Resolves (or reads the still-fresh cached) representative point for a
// region, returned already shaped as a DestinationGeocode for direct reuse
// by Map/hqDistance. Caller must already have HQ's own geocode resolved
// (see MapScreen's existing hqGeocode effect) — this never geocodes HQ
// itself, only the candidate provinces within the region.
export async function resolveRegionRepresentativePoint(
  regionName: string,
  hqGeocode: DestinationGeocode,
  hqProvinceId: string,
  hqCityId: string | null,
  provinces: Province[],
  municipalities: Municipality[],
  onProgress?: (done: number, total: number) => void,
): Promise<DestinationGeocode> {
  const hqKey = buildLocationKey(hqProvinceId, hqCityId);

  const cached = await readCached(regionName);
  if (cached && cached.hq_location_key === hqKey) {
    // Still fresh — HQ hasn't moved since this was last resolved.
    return asDestinationGeocode(cached);
  }

  const candidateProvinces = provinces.filter((p) => p.region_name === regionName);
  if (candidateProvinces.length === 0) {
    throw new Error(`No provinces found for region "${regionName}".`);
  }

  // Reuses the existing paced batch resolver — already-cached provinces
  // (the common case after the first booking in a region) cost nothing
  // further; only genuinely new ones hit Nominatim, at its usual ~1/sec.
  await resolveDestinationGeocodes(
    candidateProvinces.map((p) => ({ provinceId: p.id, cityId: null })),
    provinces,
    municipalities,
    onProgress,
  );
  const geocodes = await listDestinationGeocodes();

  let farthest: { province: Province; geocode: DestinationGeocode } | null = null;
  for (const province of candidateProvinces) {
    const geocode = geocodes[buildLocationKey(province.id, null)];
    if (!geocode) continue; // skipped — see resolveDestinationGeocodes' own comment
    const distanceKm = haversineKm(hqGeocode.latitude, hqGeocode.longitude, geocode.latitude, geocode.longitude);
    if (!farthest || distanceKm > haversineKm(hqGeocode.latitude, hqGeocode.longitude, farthest.geocode.latitude, farthest.geocode.longitude)) {
      farthest = { province, geocode };
    }
  }

  if (!farthest) {
    // Nothing in the region could be geocoded at all (e.g. fully offline on
    // a first-ever use) — nothing to cache, caller shows "unresolved".
    throw new Error(`Couldn't resolve any province in "${regionName}" — try again once you're online.`);
  }

  const capital = municipalities.find((m) => m.province_id === farthest!.province.id && m.is_capital);
  const displayName = capital
    ? `${capital.name} (representative point)`
    : `${farthest.province.name} (representative point)`;

  const point: RegionRepresentativePoint = {
    business_id: currentBusinessId(),
    region_name: regionName,
    hq_location_key: hqKey,
    province_id: farthest.province.id,
    municipality_id: capital?.id ?? null,
    display_name: displayName,
    latitude: farthest.geocode.latitude,
    longitude: farthest.geocode.longitude,
    resolved_at: new Date().toISOString(),
  };
  await store(point);
  return asDestinationGeocode(point);
}
