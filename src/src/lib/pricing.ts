import type { CustomRate, Province, RateMatrixRow, SeatingBand, Tier, Vehicle } from "./types";

// Tier 1 = same province as HQ, Tier 2 = different province same region,
// Tier 3 = everything else (outside region / interisland).
export function computeTier(
  destinationProvinceId: string,
  hqProvinceId: string,
  provinces: Province[],
): Tier | null {
  const dest = provinces.find((p) => p.id === destinationProvinceId);
  const hq = provinces.find((p) => p.id === hqProvinceId);
  if (!dest || !hq) return null;
  if (dest.id === hq.id) return 1;
  if (dest.region_name === hq.region_name) return 2;
  return 3;
}

export function findSeatingBand(seats: number, bands: SeatingBand[]): SeatingBand | null {
  return bands.find((b) => seats >= b.min_seats && (b.max_seats == null || seats <= b.max_seats)) ?? null;
}

export interface ResolvedRate {
  rate: string;
  basis: "custom" | "matrix" | "vehicle";
  tier?: Tier;
  band?: SeatingBand;
}

export interface ResolveRateInput {
  vehicle: Vehicle;
  destinationProvinceId: string | null;
  destinationCityId: string | null;
  hqProvinceId: string | null;
  provinces: Province[];
  seatingBands: SeatingBand[];
  rateMatrix: RateMatrixRow[];
  customRates: CustomRate[];
}

// Priority order:
//   1. Custom rate — an exact city + seating-band override (frequently-visited
//      destinations with their own negotiated rate).
//   2. Standard rate card — seating band x destination tier.
//   3. Vehicle's own daily_rate — fallback when nothing above resolves.
export function resolveRate(input: ResolveRateInput): ResolvedRate | null {
  const {
    vehicle,
    destinationProvinceId,
    destinationCityId,
    hqProvinceId,
    provinces,
    seatingBands,
    rateMatrix,
    customRates,
  } = input;

  const band = vehicle.seats != null ? findSeatingBand(vehicle.seats, seatingBands) : null;

  if (destinationCityId && band) {
    // destinationCityId is a municipalities.id.
    const custom = customRates.find((c) => c.city_id === destinationCityId && c.seating_band_id === band.id);
    if (custom) {
      return { rate: custom.rate, basis: "custom", band };
    }
  }

  if (destinationProvinceId && hqProvinceId && band) {
    const tier = computeTier(destinationProvinceId, hqProvinceId, provinces);
    if (tier) {
      const row = rateMatrix.find((r) => r.seating_band_id === band.id);
      const cell = row ? (tier === 1 ? row.rate_tier1 : tier === 2 ? row.rate_tier2 : row.rate_tier3) : null;
      if (cell) {
        return { rate: cell, basis: "matrix", tier, band };
      }
    }
  }

  if (vehicle.daily_rate) {
    return { rate: vehicle.daily_rate, basis: "vehicle" };
  }

  return null;
}
