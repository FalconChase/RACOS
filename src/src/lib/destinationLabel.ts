import type { Booking, BookingLeg, Municipality, Province } from "./types";

// Human-readable destination for a single province/city pair —
// "{municipality}, {province}" when a specific city/municipality was
// picked, otherwise just the province. Shared by destinationLabel below for
// both the primary destination and each extra leg.
function oneDestinationLabel(
  destinationProvinceId: string | null,
  destinationCityId: string | null,
  provinces: Province[],
  municipalities: Municipality[],
  // ROT052 — fallback for a region-level pick (destinationProvinceId null).
  // Only ever passed for a booking's primary destination, never a leg's —
  // legs don't support region picks yet, so every existing call site with 4
  // args keeps behaving exactly as before.
  destinationRegionName?: string | null,
): string | null {
  const province = destinationProvinceId ? provinces.find((p) => p.id === destinationProvinceId) : null;
  const municipality = destinationCityId ? municipalities.find((m) => m.id === destinationCityId) : null;
  if (municipality && province) return `${municipality.name}, ${province.name}`;
  if (province) return province.name;
  if (destinationRegionName) return `${destinationRegionName} (region)`;
  return null;
}

// Human-readable destination for a booking. Single-destination (the
// overwhelmingly common case, and unchanged from before multi-destination
// existed): just that one label. Multi-destination (legs passed and
// non-empty): every stop joined "A → B → C", primary destination first —
// used wherever a Rate column gets swapped out for a compact Destination
// column (Settlements > Records, Remittances) with the rate itself moved to
// a hover tooltip instead of its own column.
export function destinationLabel(
  booking: Pick<Booking, "destination_province_id" | "destination_city_id" | "destination_region_name">,
  provinces: Province[],
  municipalities: Municipality[],
  legs: Pick<BookingLeg, "sequence" | "destination_province_id" | "destination_city_id">[] = [],
): string {
  const primary = oneDestinationLabel(
    booking.destination_province_id,
    booking.destination_city_id,
    provinces,
    municipalities,
    booking.destination_region_name,
  );
  if (legs.length === 0) return primary ?? "—";

  const stops = [primary, ...[...legs].sort((a, b) => a.sequence - b.sequence).map((l) =>
    oneDestinationLabel(l.destination_province_id, l.destination_city_id, provinces, municipalities),
  )].filter((label): label is string => Boolean(label));

  return stops.length > 0 ? stops.join(" → ") : "—";
}
