// Map > Destination history — aggregates every booking (and every extra
// leg — a 3-stop booking contributes to 3 different pins) into one entry
// per unique destination, so a repeatedly-booked municipality gets a
// single pin rather than overlapping markers. Pure data shaping, no I/O —
// MapScreen pairs this with lib/repo/destinationGeocodes.ts for the actual
// coordinates.

import { bookingRef } from "./bookingRef";
import { buildLocationKey } from "./repo/destinationGeocodes";
import type { Booking, BookingLeg, Customer, Municipality, Province, Vehicle } from "./types";

export interface DestinationVisit {
  bookingId: string;
  ref: string;
  customerLabel: string;
  vehicleLabel: string;
  // The stop's own date — start_date for a primary destination, the leg's
  // own start_at for an extra stop, so the popup list can be sorted most
  // recent first regardless of which kind of stop it is.
  date: string;
}

export interface DestinationHistoryPoint {
  locationKey: string;
  provinceId: string;
  cityId: string | null;
  label: string;
  visits: DestinationVisit[];
}

// Bookings still on the calendar (pending/confirmed/active) haven't
// actually happened yet — same "reflects settled state" spirit
// SettlementsScreen uses for Overtime/Total time, applied here to what
// counts as "somewhere we've been". Cancelled is excluded everywhere else
// in the app for the same reason (never happened at all).
const REALIZED_STATUSES = new Set<Booking["status"]>(["active", "completed"]);

export function buildDestinationHistory(
  bookings: Booking[],
  legs: BookingLeg[],
  customers: Customer[],
  vehicles: Vehicle[],
  provinces: Province[],
  municipalities: Municipality[],
  // When set, only this vehicle's bookings count — mirrors the Map
  // screen's existing vehicle filter for the GPS trail layer, so picking a
  // vehicle narrows both layers together.
  vehicleId?: string,
): DestinationHistoryPoint[] {
  const legsByBooking = new Map<string, BookingLeg[]>();
  for (const leg of legs) {
    const list = legsByBooking.get(leg.booking_id) ?? [];
    list.push(leg);
    legsByBooking.set(leg.booking_id, list);
  }

  function customerLabel(id: string) {
    return customers.find((c) => c.id === id)?.full_name ?? "—";
  }
  function vehicleLabel(id: string) {
    return vehicles.find((v) => v.id === id)?.plate_number ?? "—";
  }
  function placeLabel(provinceId: string, cityId: string | null) {
    const province = provinces.find((p) => p.id === provinceId);
    const municipality = cityId ? municipalities.find((m) => m.id === cityId) : null;
    if (municipality && province) return `${municipality.name}, ${province.name}`;
    return province?.name ?? "Unknown destination";
  }

  const points = new Map<string, DestinationHistoryPoint>();

  function addStop(provinceId: string | null, cityId: string | null, visit: DestinationVisit) {
    if (!provinceId) return;
    const locationKey = buildLocationKey(provinceId, cityId);
    let point = points.get(locationKey);
    if (!point) {
      point = { locationKey, provinceId, cityId, label: placeLabel(provinceId, cityId), visits: [] };
      points.set(locationKey, point);
    }
    point.visits.push(visit);
  }

  for (const b of bookings) {
    if (!REALIZED_STATUSES.has(b.status)) continue;
    if (vehicleId && b.vehicle_id !== vehicleId) continue;

    const visitBase = { bookingId: b.id, ref: bookingRef(b.id), customerLabel: customerLabel(b.customer_id), vehicleLabel: vehicleLabel(b.vehicle_id) };
    addStop(b.destination_province_id, b.destination_city_id, { ...visitBase, date: b.start_date });

    for (const leg of legsByBooking.get(b.id) ?? []) {
      addStop(leg.destination_province_id, leg.destination_city_id, { ...visitBase, date: leg.start_at });
    }
  }

  for (const point of points.values()) {
    point.visits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  return [...points.values()];
}
