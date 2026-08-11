// Analytics — distance/speed estimated from a vehicle's manually-logged GPS
// Log trail (Tools > Entries > GPS Log). The log is a continuous,
// booking-independent point log — nothing here ties back to any booking_id
// (see lib/bookingGpsCorroboration.ts for the separate, approximate
// booking-window matching). This is purely "point A to point B": distance
// via haversine, and speed off the *moving* time between them — each
// point's own duration_minutes is how long the vehicle sat parked there
// before departing for the next one, so it's subtracted out of the raw
// timestamp gap rather than treated as travel time. Computed for every
// consecutive pair regardless of how far apart in time they are — a long
// gap just means a long (recorded) parking stretch, not something to
// discard.

import { haversineKm } from "./geo";
import type { GpsLocationEntry } from "./types";

export interface TrailSegment {
  from: GpsLocationEntry;
  to: GpsLocationEntry;
  distanceKm: number;
  // Raw wall-clock gap between the two readings.
  elapsedMinutes: number;
  // elapsedMinutes minus `from`'s own logged parking time — the portion of
  // the gap actually spent traveling. Floored at 0 (a data-entry
  // inconsistency, e.g. duration logged longer than the actual gap,
  // shouldn't produce negative travel time).
  movingMinutes: number;
  // null when movingMinutes is 0 — no meaningful speed to report (either
  // back-to-back readings with no gap, or duration_minutes consumed the
  // whole gap).
  speedKmh: number | null;
}

export interface TrailMetrics {
  segments: TrailSegment[];
  totalDistanceKm: number;
  totalMovingMinutes: number;
  avgSpeedKmh: number | null;
  maxSpeedKmh: number | null;
}

// `entries` should already be scoped to one vehicle — this doesn't filter
// by vehicle_id itself, same "caller owns the slice" convention as
// buildDestinationHistory's optional vehicleId param elsewhere.
export function buildTrailMetrics(entries: GpsLocationEntry[]): TrailMetrics {
  const withCoords = entries
    .filter((e) => e.latitude != null && e.longitude != null)
    .slice()
    .sort((a, b) => new Date(a.reading_at).getTime() - new Date(b.reading_at).getTime());

  const segments: TrailSegment[] = [];
  for (let i = 1; i < withCoords.length; i++) {
    const from = withCoords[i - 1];
    const to = withCoords[i];
    const distanceKm = haversineKm(from.latitude as number, from.longitude as number, to.latitude as number, to.longitude as number);
    const elapsedMinutes = (new Date(to.reading_at).getTime() - new Date(from.reading_at).getTime()) / 60000;
    const movingMinutes = Math.max(0, elapsedMinutes - (from.duration_minutes ?? 0));
    const speedKmh = movingMinutes > 0 ? distanceKm / (movingMinutes / 60) : null;
    segments.push({ from, to, distanceKm, elapsedMinutes, movingMinutes, speedKmh });
  }

  const totalDistanceKm = segments.reduce((sum, s) => sum + s.distanceKm, 0);
  const totalMovingMinutes = segments.reduce((sum, s) => sum + s.movingMinutes, 0);
  const speeds = segments.map((s) => s.speedKmh).filter((s): s is number => s != null);

  return {
    segments,
    totalDistanceKm,
    totalMovingMinutes,
    avgSpeedKmh: totalMovingMinutes > 0 ? totalDistanceKm / (totalMovingMinutes / 60) : null,
    maxSpeedKmh: speeds.length > 0 ? Math.max(...speeds) : null,
  };
}
