import { useEffect, useMemo, useState } from "react";
import { listVehicles } from "../lib/repo/vehicles";
import { listOdometerReadings } from "../lib/repo/odometerReadings";
import { listGpsLocationEntries } from "../lib/repo/gpsLocationEntries";
import { listGpsLocationLabels } from "../lib/repo/gpsLocationLabels";
import { listMileageEntries } from "../lib/repo/mileageEntries";
import { computeVariance, computeDateVariance } from "../lib/variance";
import { useSettings } from "../lib/settingsContext";
import { formatDateTime, formatDate } from "../lib/dateFormat";
import MiniMapModal from "../components/MiniMapModal";
import type { Vehicle, OdometerReading, GpsLocationEntry, MileageEntry, GpsLocationLabel } from "../lib/types";

const selectStyle: React.CSSProperties = {
  border: "0.5px solid var(--border-strong)",
  background: "var(--surface-2)",
  color: "var(--text-primary)",
};

const varianceColor: Record<string, string> = {
  live: "var(--text-success)",
  late: "var(--text-warning)",
  future: "var(--text-danger)",
};

// A mismatch below this is treated as normal slack (rounding, a mileage
// entry only covering part of the window, etc.) rather than flagged —
// whichever is larger of a flat floor or a percentage of the odometer
// delta, since a 5km gap means very different things on a 20km trip vs a
// 2,000km one.
const MISMATCH_FLOOR_KM = 30;
const MISMATCH_PCT = 0.2;

interface MileageSegment {
  fromReading: OdometerReading;
  toReading: OdometerReading;
  odometerDeltaKm: number;
  mileageSum: number | null; // null when no mileage_entries overlap this window
  flagged: boolean;
  flagReason: "decreased" | "mismatch" | null;
}

function buildSegments(readings: OdometerReading[], mileageEntries: MileageEntry[]): MileageSegment[] {
  const sorted = [...readings].sort((a, b) => new Date(a.reading_at).getTime() - new Date(b.reading_at).getTime());
  const segments: MileageSegment[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const fromReading = sorted[i];
    const toReading = sorted[i + 1];
    const odometerDeltaKm = toReading.reading_km - fromReading.reading_km;
    const windowStartDate = fromReading.reading_at.slice(0, 10);
    const windowEndDate = toReading.reading_at.slice(0, 10);

    // A mileage entry counts toward this window if its period overlaps the
    // window at all (period_start <= windowEnd and period_end >= windowStart).
    const overlapping = mileageEntries.filter((m) => m.period_start <= windowEndDate && m.period_end >= windowStartDate);
    const mileageSum = overlapping.length > 0 ? overlapping.reduce((sum, m) => sum + m.mileage_km, 0) : null;

    let flagged = false;
    let flagReason: MileageSegment["flagReason"] = null;
    if (odometerDeltaKm < 0) {
      flagged = true;
      flagReason = "decreased";
    } else if (mileageSum != null) {
      const threshold = Math.max(MISMATCH_FLOOR_KM, odometerDeltaKm * MISMATCH_PCT);
      if (Math.abs(odometerDeltaKm - mileageSum) > threshold) {
        flagged = true;
        flagReason = "mismatch";
      }
    }

    segments.push({ fromReading, toReading, odometerDeltaKm, mileageSum, flagged, flagReason });
  }

  // Most recent segment first, matching the rest of this screen's newest-first lists.
  return segments.reverse();
}

type TimelineItem =
  | { kind: "odometer"; at: string; label: string; variance: ReturnType<typeof computeVariance>; recordedByLabel: string; recordedByRole: string }
  | { kind: "location"; at: string; label: string; variance: ReturnType<typeof computeVariance>; recordedByLabel: string; recordedByRole: string; coords: { lat: number; lng: number } | null }
  | { kind: "mileage"; at: string; label: string; variance: ReturnType<typeof computeDateVariance>; recordedByLabel: string; recordedByRole: string };

export default function EntriesReportsTab() {
  const { settings } = useSettings();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [readings, setReadings] = useState<OdometerReading[]>([]);
  const [locationEntries, setLocationEntries] = useState<GpsLocationEntry[]>([]);
  const [mileageEntries, setMileageEntries] = useState<MileageEntry[]>([]);
  const [labels, setLabels] = useState<Record<string, GpsLocationLabel>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mapPeek, setMapPeek] = useState<{ lat: number; lng: number; label?: string } | null>(null);

  useEffect(() => {
    listVehicles()
      .then((v) => {
        setVehicles(v);
        setVehicleId((prev) => prev || v[0]?.id || "");
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : "Couldn't load vehicles.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!vehicleId) return;
    Promise.all([
      listOdometerReadings(vehicleId),
      listGpsLocationEntries(vehicleId),
      listMileageEntries(vehicleId),
      listGpsLocationLabels(),
    ])
      .then(([r, l, m, labelMap]) => {
        setReadings(r);
        setLocationEntries(l);
        setMileageEntries(m);
        setLabels(labelMap);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : "Couldn't load entries for this vehicle.");
      });
  }, [vehicleId]);

  const segments = useMemo(() => buildSegments(readings, mileageEntries), [readings, mileageEntries]);

  const timeline: TimelineItem[] = useMemo(() => {
    const items: TimelineItem[] = [
      ...readings.map((r): TimelineItem => ({
        kind: "odometer",
        at: r.reading_at,
        label: `Odometer — ${r.reading_km.toLocaleString()} km`,
        variance: computeVariance(r.reading_at, r.recorded_at),
        recordedByLabel: r.recorded_by_label,
        recordedByRole: r.recorded_by_role,
      })),
      ...locationEntries.map((l): TimelineItem => ({
        kind: "location",
        at: l.reading_at,
        label: `GPS — ${labels[l.id]?.formatted_address ?? l.location_text}`,
        variance: computeVariance(l.reading_at, l.recorded_at),
        recordedByLabel: l.recorded_by_label,
        recordedByRole: l.recorded_by_role,
        coords: l.latitude != null && l.longitude != null ? { lat: l.latitude, lng: l.longitude } : null,
      })),
      ...mileageEntries.map((m): TimelineItem => ({
        kind: "mileage",
        at: `${m.period_end}T23:59:59`,
        label:
          m.period_start === m.period_end
            ? `Mileage — ${m.mileage_km.toLocaleString()} km (${formatDate(m.period_start, settings)})`
            : `Mileage — ${m.mileage_km.toLocaleString()} km (${formatDate(m.period_start, settings)} – ${formatDate(m.period_end, settings)})`,
        variance: computeDateVariance(m.period_end, m.recorded_at),
        recordedByLabel: m.recorded_by_label,
        recordedByRole: m.recorded_by_role,
      })),
    ];
    return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [readings, locationEntries, mileageEntries, labels, settings]);

  const stats = useMemo(() => {
    const allVariances = [
      ...readings.map((r) => computeVariance(r.reading_at, r.recorded_at)),
      ...locationEntries.map((l) => computeVariance(l.reading_at, l.recorded_at)),
      ...mileageEntries.map((m) => computeDateVariance(m.period_end, m.recorded_at)),
    ];
    const total = allVariances.length;
    const liveCount = allVariances.filter((v) => v.tone === "live").length;
    const livePct = total > 0 ? Math.round((liveCount / total) * 100) : null;
    const latestReading = [...readings].sort((a, b) => new Date(b.reading_at).getTime() - new Date(a.reading_at).getTime())[0] ?? null;
    return { total, livePct, latestReading };
  }, [readings, locationEntries, mileageEntries]);

  if (loading) {
    return <p className="text-base" style={{ color: "var(--text-muted)" }}>Loading…</p>;
  }

  if (loadError) {
    return (
      <div className="space-y-2">
        <p className="text-base" style={{ color: "var(--text-danger)" }}>{loadError}</p>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          If this just appeared after an update, try fully restarting the app (not just reloading the window).
        </p>
      </div>
    );
  }

  if (vehicles.length === 0) {
    return <p className="text-base" style={{ color: "var(--text-muted)" }}>Add a vehicle in Fleet to see its entries here.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>Vehicle</label>
        <select className="w-56 rounded-md px-3 py-2.5 text-base" style={selectStyle} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>{v.plate_number}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Odometer readings" value={String(readings.length)} />
        <StatCard label="GPS + mileage entries" value={String(locationEntries.length + mileageEntries.length)} />
        <StatCard label="Logged live" value={stats.livePct != null ? `${stats.livePct}%` : "—"} />
        <StatCard
          label="Latest odometer"
          value={stats.latestReading ? `${stats.latestReading.reading_km.toLocaleString()} km` : "—"}
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-medium" style={{ color: "var(--text-primary)" }}>Mileage cross-check</p>
        {segments.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Needs at least two odometer readings to compare a distance against logged mileage.
          </p>
        ) : (
          <div className="rounded-md" style={{ border: "0.5px solid var(--border)" }}>
            {segments.map((seg, i) => (
              <div
                key={`${seg.fromReading.id}-${seg.toReading.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                style={{ borderTop: i === 0 ? undefined : "0.5px solid var(--border)" }}
              >
                <div>
                  <span style={{ color: "var(--text-secondary)" }}>
                    {formatDateTime(seg.fromReading.reading_at, settings)} → {formatDateTime(seg.toReading.reading_at, settings)}
                  </span>
                  <span className="ml-2" style={{ color: "var(--text-muted)" }}>
                    odometer {seg.odometerDeltaKm.toLocaleString()} km
                    {seg.mileageSum != null && ` · logged mileage ${seg.mileageSum.toLocaleString()} km`}
                  </span>
                </div>
                {seg.flagged ? (
                  <span
                    className="shrink-0 rounded px-2.5 py-1 text-xs font-medium"
                    style={{ background: "var(--bg-danger)", color: "var(--text-danger)" }}
                  >
                    {seg.flagReason === "decreased" ? "Odometer decreased" : "Mismatch"}
                  </span>
                ) : (
                  <span
                    className="shrink-0 rounded px-2.5 py-1 text-xs font-medium"
                    style={{ background: "var(--bg-success)", color: "var(--text-success)" }}
                  >
                    {seg.mileageSum != null ? "Within range" : "No mileage data"}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium" style={{ color: "var(--text-primary)" }}>Timeline</p>
        <div className="rounded-md" style={{ border: "0.5px solid var(--border)" }}>
          {timeline.map((item, i) => (
            <div
              key={`${item.kind}-${item.at}-${i}`}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
              style={{ borderTop: i === 0 ? undefined : "0.5px solid var(--border)" }}
            >
              <div>
                {item.kind === "location" && item.coords ? (
                  <button
                    onClick={() => setMapPeek({ lat: item.coords!.lat, lng: item.coords!.lng, label: item.label.replace(/^GPS — /, "") })}
                    className="underline-offset-2 hover:underline"
                    style={{ color: "var(--text-accent)" }}
                    title="View on map"
                  >
                    {item.label}
                  </button>
                ) : (
                  <span style={{ color: "var(--text-primary)" }}>{item.label}</span>
                )}
                <span className="ml-2" style={{ color: "var(--text-muted)" }}>
                  {item.kind === "mileage" ? "" : `${formatDateTime(item.at, settings)} · `}
                  {item.recordedByLabel} ({item.recordedByRole})
                </span>
              </div>
              <span className="shrink-0" style={{ color: varianceColor[item.variance.tone] }}>{item.variance.label}</span>
            </div>
          ))}
        </div>
        {timeline.length === 0 && (
          <p className="px-4 py-6 text-sm" style={{ color: "var(--text-muted)" }}>No entries logged yet for this vehicle.</p>
        )}
      </div>

      {mapPeek && (
        <MiniMapModal lat={mapPeek.lat} lng={mapPeek.lng} label={mapPeek.label} onClose={() => setMapPeek(null)} />
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md p-4" style={{ background: "var(--surface-1)" }}>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="mt-1 text-2xl font-medium" style={{ color: "var(--text-primary)" }}>{value}</p>
    </div>
  );
}
