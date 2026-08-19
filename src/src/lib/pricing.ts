import { exactHoursBetween } from "./duration";
import type { Booking, BookingLeg, BusinessProfile, CustomRate, Province, RateMatrixRow, SeatingBand, Tier, Vehicle } from "./types";

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

// Tier for a region-level destination pick (ROT052) — no coordinates
// involved, just a plain region_name compare against HQ's own province's
// region, same string HQ/destination provinces already carry. Tier 1 is
// never reachable this way by definition (picking a whole region means the
// client didn't specify HQ's own exact province) — only 2 or 3.
export function computeTierFromRegion(
  destinationRegionName: string,
  hqProvinceId: string,
  provinces: Province[],
): Tier | null {
  const hq = provinces.find((p) => p.id === hqProvinceId);
  if (!hq) return null;
  return destinationRegionName === hq.region_name ? 2 : 3;
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
  // ROT052 — set instead of destinationProvinceId when a region-level pick
  // was made (see Booking.destination_region_name). Only ever consulted
  // when destinationProvinceId is null.
  destinationRegionName?: string | null;
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
    destinationRegionName,
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

  // ROT052 — a region-level pick (no specific province/city) prices the
  // exact same way, just off a name compare instead of a province id.
  if (!destinationProvinceId && destinationRegionName && hqProvinceId && band) {
    const tier = computeTierFromRegion(destinationRegionName, hqProvinceId, provinces);
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

// A leg's own resolved rate — same priority as resolveBookingRate: trust the
// locked-in value if one exists, otherwise recompute live off that leg's own
// destination.
function resolveLegRate(
  leg: Pick<BookingLeg, "resolved_rate" | "destination_province_id" | "destination_city_id">,
  vehicle: Vehicle,
  businessProfile: BusinessProfile | null,
  provinces: Province[],
  seatingBands: SeatingBand[],
  rateMatrix: RateMatrixRow[],
  customRates: CustomRate[],
): number | null {
  if (leg.resolved_rate) return Number(leg.resolved_rate);
  const resolved = resolveRate({
    vehicle,
    destinationProvinceId: leg.destination_province_id,
    destinationCityId: leg.destination_city_id,
    hqProvinceId: businessProfile?.hq_province_id ?? null,
    provinces,
    seatingBands,
    rateMatrix,
    customRates,
  });
  return resolved ? Number(resolved.rate) : null;
}

// Sums a multi-destination booking's expected payment across its primary
// destination plus every extra leg (see BookingLeg) — each priced at its own
// resolved rate for its own span, rather than one rate applied to the whole
// booking. legs is empty for the overwhelmingly common single-destination
// case, where this reduces to exactly computeExpectedPayment(primaryRate,
// hours) — the same figure as before this feature existed.
//
// Returns null (never a partial/short sum) if the primary rate or ANY leg's
// rate can't be resolved — a booking with an unresolvable rate shows "—"
// same as today, rather than a misleadingly-low total that silently omits
// whatever couldn't be priced.
//
// Note: this only feeds the single "Per rent" / whole-booking expected
// figure (BookingsScreen preview, Settlements > Records, Remittances'
// Per-rent row and R[..]/O[..] summary). Remittances' Per-12hr/24hr block
// breakdown still prices every block off the primary rate alone —
// accurately attributing which rate applies to a block that straddles a leg
// boundary is unsolved, flagged as a known follow-up rather than silently
// wrong.
export function computeMultiLegExpectedPayment(
  booking: Pick<Booking, "start_date" | "end_date" | "destination_province_id" | "destination_city_id" | "resolved_rate">,
  legs: BookingLeg[],
  vehicle: Vehicle,
  businessProfile: BusinessProfile | null,
  provinces: Province[],
  seatingBands: SeatingBand[],
  rateMatrix: RateMatrixRow[],
  customRates: CustomRate[],
): number | null {
  const primaryRate = resolveLegRate(
    {
      resolved_rate: booking.resolved_rate,
      destination_province_id: booking.destination_province_id,
      destination_city_id: booking.destination_city_id,
    },
    vehicle,
    businessProfile,
    provinces,
    seatingBands,
    rateMatrix,
    customRates,
  );
  if (primaryRate == null || !Number.isFinite(primaryRate)) return null;

  const sortedLegs = [...legs].sort((a, b) => a.sequence - b.sequence);
  const primaryEnd = sortedLegs[0]?.start_at ?? booking.end_date;
  const primaryExpected = computeExpectedPayment(
    primaryRate,
    exactHoursBetween(new Date(booking.start_date), new Date(primaryEnd)),
  );
  if (primaryExpected == null) return null;

  let total = primaryExpected;
  for (const leg of sortedLegs) {
    const legRate = resolveLegRate(leg, vehicle, businessProfile, provinces, seatingBands, rateMatrix, customRates);
    if (legRate == null || !Number.isFinite(legRate)) return null;
    const legExpected = computeExpectedPayment(legRate, exactHoursBetween(new Date(leg.start_at), new Date(leg.end_at)));
    if (legExpected == null) return null;
    total += legExpected;
  }

  return total;
}
