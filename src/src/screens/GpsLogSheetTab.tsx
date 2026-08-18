import { useEffect, useMemo, useState } from "react";
import { listVehicles } from "../lib/repo/vehicles";
import { listGpsLocationEntries } from "../lib/repo/gpsLocationEntries";
import { listGpsLocationLabels } from "../lib/repo/gpsLocationLabels";
import { buildGpsLogSheet } from "../lib/gpsLogSheet";
import { useSettings } from "../lib/settingsContext";
import { formatDateTime } from "../lib/dateFormat";
import type { Vehicle, GpsLocationEntry, GpsLocationLabel } from "../lib/types";

const selectStyle: React.CSSProperties = {
  border: "0.5px solid var(--border-strong)",
  background: "var(--surface-2)",
  color: "var(--text-primary)",
};

// Digitized version of the paper "VEHICLES GPS LOG" sheet — Points / Time /
// Location / Park time / Estimated distance / Estimated speed. Entirely
// read-only: every column is either a gps_location_entries field or derived
// from it (see lib/gpsLogSheet.ts), so there's nothing here to submit or
// edit, just the existing log rendered the way the paper form lays it out.
export default function GpsLogSheetTab() {
  const { settings } = useSettings();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [entries, setEntries] = useState<GpsLocationEntry[]>([]);
  const [labels, setLabels] = useState<Record<string, GpsLocationLabel>>({});
  const [loading, setLoading] = useState(true);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    listVehicles()
      .then((v) => {
        setVehicles(v);
        setVehicleId((prev) => prev || v[0]?.id || "");
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Couldn't load vehicles."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!vehicleId) {
      setEntries([]);
      setLabels({});
      return;
    }
    setEntriesLoading(true);
    setLoadError(null);
    Promise.all([listGpsLocationEntries(vehicleId), listGpsLocationLabels()])
      .then(([e, l]) => {
        setEntries(e);
        setLabels(l);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Couldn't load location entries."))
      .finally(() => setEntriesLoading(false));
  }, [vehicleId]);

  const rows = useMemo(() => buildGpsLogSheet(entries), [entries]);

  function locationLabel(entry: GpsLocationEntry): string {
    const label = labels[entry.id];
    return label?.formatted_address ?? entry.location_text;
  }

  if (loading) {
    return <p className="text-base" style={{ color: "var(--text-muted)" }}>Loading…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            Vehicle
          </label>
          <select
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            className="rounded-md px-3 py-2 text-sm"
            style={selectStyle}
          >
            {vehicles.length === 0 && <option value="">No vehicles</option>}
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate_number}
                {[v.make, v.model].filter(Boolean).length > 0 ? ` — ${[v.make, v.model].filter(Boolean).join(" ")}` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loadError && <p className="text-sm" style={{ color: "var(--text-danger)" }}>{loadError}</p>}

      <div className="rounded-md" style={{ border: "0.5px solid var(--border)" }}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr style={{ color: "var(--text-muted)" }}>
              <th className="px-4 py-3">Points</th>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Park time</th>
              <th className="px-4 py-3">Estimated distance</th>
              <th className="px-4 py-3">Estimated speed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.entry.id} style={{ borderTop: "0.5px solid var(--border)" }}>
                <td className="px-4 py-3 font-medium">{r.point}</td>
                <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{formatDateTime(r.entry.reading_at, settings)}</td>
                <td className="px-4 py-3">{locationLabel(r.entry)}</td>
                <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                  {r.entry.duration_minutes != null ? `${r.entry.duration_minutes}m` : "—"}
                </td>
                <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                  {r.distanceKm != null ? `${r.distanceKm.toFixed(1)} km` : "—"}
                </td>
                <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                  {r.speedKmh != null ? `${Math.round(r.speedKmh)} km/h` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!entriesLoading && rows.length === 0 && (
          <p className="px-4 py-6 text-sm" style={{ color: "var(--text-muted)" }}>
            {vehicleId ? "No location entries logged for this vehicle yet." : "Add a vehicle in Fleet before logging a location."}
          </p>
        )}
        {entriesLoading && <p className="px-4 py-6 text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>}
      </div>
    </div>
  );
}
