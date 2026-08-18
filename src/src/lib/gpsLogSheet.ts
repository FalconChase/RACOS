// GPS Log > Log sheet — read-only digitized version of the paper
// "VEHICLES GPS LOG" sheet (Points / Time / Location / Park time /
// Estimated distance / Estimated speed). Every column is either an
// existing gps_location_entries field or derived from it — no new schema.
//
// Deliberately NOT gpsTrailMetrics.ts: that module skips entries without
// coordinates so it can report one continuous best-effort trail total for
// Analytics. This sheet instead mirrors the paper form's literal row-N vs
// row-(N-1) adjacency — every logged entry gets a numbered row, in order,
// and a row's distance/speed is blank whenever it or the row directly
// before it has no coordinates, rather than reaching back to the nearest
// coordinate-having entry. Same haversine + moving-time-minus-parked-time
// math as gpsTrailMetrics.ts (see geo.ts), just applied point-to-adjacent-
// point instead of point-to-nearest-coordinate-point.
//
// Pure data shaping, no I/O — same convention as vehicleAnalytics.ts /
// gpsTrailMetrics.ts. The per-row shape here is meant to be reusable
// as-is for a future Analytics chart (distance/speed over time), not just
// this table.

import { haversineKm } from "./geo";
import type { GpsLocationEntry } from "./types";

export interface GpsLogSheetRow {
  point: number; // 1-indexed, ascending by reading_at — matches the paper form's "POINTS" column
  entry: GpsLocationEntry;
  // null when there's no previous row, or either this row or the previous
  // one lacks coordinates (manually typed entry) — nothing to compute from.
  distanceKm: number | null;
  speedKmh: number | null;
}

// `entries` should already be scoped to one vehicle — caller owns the
// slice, same convention as buildTrailMetrics/buildDestinationHistory.
export function buildGpsLogSheet(entries: GpsLocationEntry[]): GpsLogSheetRow[] {
  const sorted = entries
    .slice()
    .sort((a, b) => new Date(a.reading_at).getTime() - new Date(b.reading_at).getTime());

  return sorted.map((entry, i) => {
    const point = i + 1;
    if (i === 0) {
      return { point, entry, distanceKm: null, speedKmh: null };
    }

    const prev = sorted[i - 1];
    const bothHaveCoords = prev.latitude != null && prev.longitude != null && entry.latitude != null && entry.longitude != null;
    if (!bothHaveCoords) {
      return { point, entry, distanceKm: null, speedKmh: null };
    }

    const distanceKm = haversineKm(prev.latitude as number, prev.longitude as number, entry.latitude as number, entry.longitude as number);
    const elapsedMinutes = (new Date(entry.reading_at).getTime() - new Date(prev.reading_at).getTime()) / 60000;
    const movingMinutes = Math.max(0, elapsedMinutes - (prev.duration_minutes ?? 0));
    const speedKmh = movingMinutes > 0 ? distanceKm / (movingMinutes / 60) : null;

    return { point, entry, distanceKm, speedKmh };
  });
}
