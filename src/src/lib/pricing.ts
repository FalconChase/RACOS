import type { Booking, BusinessProfile, CustomRate, Province, RateMatrixRow, SeatingBand, Tier, Vehicle } from "./types";

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

// Same formula BookingsScreen's booking-form preview uses (ROD009): exact
// hours x (rate / 24), rounded up to the nearest 50 — no half-day/nightly
// rounding. Pulled out here so Settlements > Records can bill overtime at the
// same rate/rule as the original scheduled span, on the booking's actual
// total elapsed time, instead of re-deriving the formula a second time.
export function computeExpectedPayment(rate: number, hours: number): number | null {
  if (!Number.isFinite(rate) || !Number.isFinite(hours)) return null;
  const raw = (rate / 24) * hours;
  return Math.ceil(raw / 50) * 50;
}

// The rate that applies to an existing (already-recorded) booking — its own
// resolved_rate if one was locked in at creation time (migration 0015),
// otherwise a live recompute off today's Rate Matrix as a best-effort
// fallback for rows created before that column existed. Shared by
// Settlements > Records and the overtime-payment prompt on Mark returned, so
// both agree on the same rate for the same booking.
export function resolveBookingRate(
  booking: Booking,
  vehicles: Vehicle[],
  businessProfile: BusinessProfile | null,
  provinces: Province[],
  seatingBands: SeatingBand[],
  rateMatrix: RateMatrixRow[],
  customRates: CustomRate[],
): number | null {
  if (booking.resolved_rate) return Number(booking.resolved_rate);
  const vehicle = vehicles.find((v) => v.id === booking.vehicle_id);
  if (!vehicle) return null;
  const resolved = resolveRate({
    vehicle,
    destinationProvinceId: booking.destination_province_id,
    destinationCityId: booking.destination_city_id,
    hqProvinceId: businessProfile?.hq_province_id ?? null,
    provinces,
    seatingBands,
    rateMatrix,
    customRates,
  });
  return resolved ? Number(resolved.rate) : null;
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
