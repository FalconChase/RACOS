import type { Booking, Municipality, Province } from "./types";

// Human-readable destination for a booking — "{municipality}, {province}"
// when a specific city/municipality was picked, otherwise just the province.
// Used wherever a Rate column gets swapped out for a compact Destination
// column (Settlements > Records, Remittances) with the rate itself moved to
// a hover tooltip instead of its own column.
export function destinationLabel(
  booking: Pick<Booking, "destination_province_id" | "destination_city_id">,
  provinces: Province[],
  municipalities: Municipality[],
): string {
  const province = booking.destination_province_id
    ? provinces.find((p) => p.id === booking.destination_province_id)
    : null;
  const municipality = booking.destination_city_id
    ? municipalities.find((m) => m.id === booking.destination_city_id)
    : null;
  if (municipality && province) return `${municipality.name}, ${province.name}`;
  if (province) return province.name;
  return "—";
}
