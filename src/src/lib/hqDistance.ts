// HQ as an origin/datum point — a straight-line "displacement" from HQ to
// wherever a booking's destination resolves to (destination_geocodes,
// same cache Map's Destination history layer already builds), computed
// the same approximate way every other distance in this app is: HQ and
// the destination are each only resolved to city/province-center
// precision (see destinationGeocodes.ts), so this is a gut-check signal
// alongside the existing Tier system, not a routing-grade figure.

import { haversineKm } from "./geo";
import { buildLocationKey } from "./repo/destinationGeocodes";
import { computeTier } from "./pricing";
import type { BusinessProfile, DestinationGeocode, Province, Tier } from "./types";

// null when the business hasn't set an HQ province yet (BusinessProfile.
// hq_province_id nullable — see types.ts).
export function hqLocationKey(profile: BusinessProfile | null): string | null {
  if (!profile?.hq_province_id) return null;
  return buildLocationKey(profile.hq_province_id, profile.hq_city_id);
}

export interface HqDisplacement {
  distanceKm: number;
  tier: Tier | null;
}

export function computeHqDisplacement(
  hqGeocode: DestinationGeocode,
  destinationGeocode: DestinationGeocode,
  hqProvinceId: string,
  provinces: Province[],
): HqDisplacement {
  return {
    distanceKm: haversineKm(hqGeocode.latitude, hqGeocode.longitude, destinationGeocode.latitude, destinationGeocode.longitude),
    tier: computeTier(destinationGeocode.province_id, hqProvinceId, provinces),
  };
}
