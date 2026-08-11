// Booking vs GPS Log corroboration — the manual GPS Log (Tools > Entries)
// isn't linked to a booking_id anywhere in the schema, so "does this
// booking have corroborating GPS data" is computed here, not stored: match
// by vehicle + falling inside the booking's real window (actual departure
// to actual return, falling back to the scheduled start/end for a booking
// that hasn't resolved those yet), same window computeOvertimeSettlement
// treats as "did this actually happen".
//
// Deliberately approximate past that, per how the GPS Log itself is kept —
// hand-copied from a tracker, not a precise link — so the "mismatch" signal
// here is soft: it only fires when a matched entry has *some* location text
// (typed or reverse-geocoded) that doesn't mention the booked destination's
// name anywhere. No distance/coordinate math, no external geocoding calls
// just to compute this — text-only, cheap enough to run over a vehicle's
// entire history on every Analytics load.

import type { Booking, GpsLocationEntry, GpsLocationLabel, Municipality, Province } from "./types";

export type CorroborationStatus = "unverified" | "corroborated" | "possible_mismatch";

export interface BookingCorroboration {
  bookingId: string;
  status: CorroborationStatus;
  windowStart: string;
  windowEnd: string;
  matchedEntries: GpsLocationEntry[];
}

function bookingWindow(booking: Booking): [Date, Date] {
  const start = booking.actual_departure_at ? new Date(booking.actual_departure_at) : new Date(booking.start_date);
  const end = booking.actual_return_at ? new Date(booking.actual_return_at) : new Date(booking.end_date);
  return [start, end];
}

// Primary destination only (province + municipality names) — extra legs
// aren't included in the text match yet, a known simplification (same
// spirit as the overtime rate always billing at the primary destination's
// rate in Settlements).
function destinationNames(booking: Booking, provinces: Province[], municipalities: Municipality[]): string[] {
  const names: string[] = [];
  const province = booking.destination_province_id ? provinces.find((p) => p.id === booking.destination_province_id) : null;
  const municipality = booking.destination_city_id ? municipalities.find((m) => m.id === booking.destination_city_id) : null;
  if (province) names.push(province.name);
  if (municipality) names.push(municipality.name);
  return names;
}

export function buildBookingCorroboration(
  booking: Booking,
  gpsEntries: GpsLocationEntry[],
  gpsLabels: Record<string, GpsLocationLabel>,
  provinces: Province[],
  municipalities: Municipality[],
): BookingCorroboration {
  const [start, end] = bookingWindow(booking);
  const startMs = start.getTime();
  const endMs = end.getTime();

  const matchedEntries = gpsEntries.filter((e) => {
    if (e.vehicle_id !== booking.vehicle_id) return false;
    const t = new Date(e.reading_at).getTime();
    return t >= startMs && t <= endMs;
  });

  if (matchedEntries.length === 0) {
    return { bookingId: booking.id, status: "unverified", windowStart: start.toISOString(), windowEnd: end.toISOString(), matchedEntries: [] };
  }

  const names = destinationNames(booking, provinces, municipalities).map((n) => n.toLowerCase());
  const entryTexts = matchedEntries.map((e) => [e.location_text, gpsLabels[e.id]?.formatted_address].filter(Boolean).join(" ").toLowerCase());
  const anyTextAvailable = entryTexts.some((t) => t.trim() !== "");
  const anyMatchesName = names.length > 0 && entryTexts.some((t) => names.some((n) => t.includes(n)));

  const status: CorroborationStatus = anyTextAvailable && names.length > 0 && !anyMatchesName ? "possible_mismatch" : "corroborated";

  return { bookingId: booking.id, status, windowStart: start.toISOString(), windowEnd: end.toISOString(), matchedEntries };
}

export interface CorroborationSummary {
  total: number;
  corroborated: number;
  unverified: number;
  possibleMismatch: number;
  corroborationRate: number | null; // fraction 0..1 of bookings with at least one matching GPS entry
}

export function summarizeCorroboration(results: BookingCorroboration[]): CorroborationSummary {
  let corroborated = 0;
  let unverified = 0;
  let possibleMismatch = 0;
  for (const r of results) {
    if (r.status === "unverified") unverified++;
    else if (r.status === "possible_mismatch") possibleMismatch++;
    else corroborated++;
  }
  const total = results.length;
  return {
    total,
    corroborated,
    unverified,
    possibleMismatch,
    corroborationRate: total > 0 ? (corroborated + possibleMismatch) / total : null,
  };
}
