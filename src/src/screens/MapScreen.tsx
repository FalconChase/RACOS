import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { listVehicles } from "../lib/repo/vehicles";
import { listGpsLocationEntries } from "../lib/repo/gpsLocationEntries";
import { listGpsLocationLabels } from "../lib/repo/gpsLocationLabels";
import { useSettings } from "../lib/settingsContext";
import { formatDateTime } from "../lib/dateFormat";
import type { Vehicle, GpsLocationEntry, GpsLocationLabel } from "../lib/types";

// Preparatory shell for live fleet tracking (see BRAINS/PLANS.md ROP006) —
// the desktop app has no live-position feed yet. What it does have,
// per-vehicle, is the manual GPS location history logged under Tools >
// Entries (ROP011). Selecting a vehicle here plots that history as a
// numbered trail — the same "corroborating signal" data, just viewed on
// the map instead of as a list.
//
// Default view is centered on the Philippines, since that's where the
// RACOS province/municipality reference data lives.
const DEFAULT_CENTER: [number, number] = [12.8797, 121.774];
const DEFAULT_ZOOM = 6;

const ALL_VEHICLES = "__all__";

const selectStyle: React.CSSProperties = {
  border: "0.5px solid var(--border-strong)",
  background: "var(--surface-2)",
  color: "var(--text-primary)",
};

const fieldStyle: React.CSSProperties = selectStyle;

function markerIcon(index: number): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="background:var(--fill-accent,#378ADD);color:white;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4)">${index + 1}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

export default function MapScreen() {
  const { settings } = useSettings();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const historyMarkersRef = useRef<L.Marker[]>([]);
  const historyLineRef = useRef<L.Polyline | null>(null);

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(ALL_VEHICLES);
  const [history, setHistory] = useState<GpsLocationEntry[]>([]);
  const [labels, setLabels] = useState<Record<string, GpsLocationLabel>>({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    listVehicles().then(setVehicles);
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Load this vehicle's logged location history whenever the selection
  // changes. Cleared entirely for "All Vehicles" — plotting every
  // vehicle's trail at once would just be noise.
  useEffect(() => {
    if (selectedVehicleId === ALL_VEHICLES) {
      setHistory([]);
      setLabels({});
      setHistoryError(null);
      return;
    }
    setHistoryLoading(true);
    setHistoryError(null);
    Promise.all([listGpsLocationEntries(selectedVehicleId), listGpsLocationLabels()])
      .then(([entries, labelMap]) => {
        setHistory(entries);
        setLabels(labelMap);
      })
      .catch((err: unknown) => {
        setHistoryError(err instanceof Error ? err.message : "Couldn't load location history for this vehicle.");
      })
      .finally(() => setHistoryLoading(false));
  }, [selectedVehicleId]);

  const filteredHistory = history
    .filter((e) => {
      const day = e.reading_at.slice(0, 10);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      return true;
    })
    .filter((e) => e.latitude != null && e.longitude != null)
    .sort((a, b) => new Date(a.reading_at).getTime() - new Date(b.reading_at).getTime());

  // Redraw pins + trail line whenever the filtered history changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    historyMarkersRef.current.forEach((m) => m.remove());
    historyMarkersRef.current = [];
    historyLineRef.current?.remove();
    historyLineRef.current = null;

    if (filteredHistory.length === 0) return;

    const points: [number, number][] = filteredHistory.map((e) => [e.latitude as number, e.longitude as number]);

    historyMarkersRef.current = filteredHistory.map((e, i) => {
      const label = labels[e.id]?.formatted_address ?? e.location_text;
      const popup = `
        <strong>#${i + 1}</strong> — ${label}<br/>
        ${formatDateTime(e.reading_at, settings)}<br/>
        ${e.recorded_by_label} (${e.recorded_by_role})
        ${e.duration_minutes != null ? `<br/>Parked ${e.duration_minutes}m` : ""}
      `;
      return L.marker(points[i], { icon: markerIcon(i) }).addTo(map).bindPopup(popup);
    });

    // Leaflet's SVG renderer sets this as a plain "stroke" attribute, not an
    // inline style — CSS custom properties aren't reliably resolved there,
    // so this uses the same fallback hex the numbered pins use rather than
    // var(--fill-accent) directly.
    historyLineRef.current = L.polyline(points, { color: "#378ADD", weight: 3, opacity: 0.7 }).addTo(map);

    map.fitBounds(L.latLngBounds(points).pad(0.2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredHistory, labels, settings]);

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);

  return (
    <div className="space-y-4">
      <div
        className="rounded-md p-3 text-sm"
        style={{ background: "var(--surface-1)", color: "var(--text-muted)" }}
      >
        Live vehicle tracking isn't connected yet. Pick a vehicle below to see its logged location
        history (from Tools &gt; Entries &gt; GPS Log) plotted as a trail instead.
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            Vehicle
          </label>
          <select
            value={selectedVehicleId}
            onChange={(e) => setSelectedVehicleId(e.target.value)}
            className="rounded-md px-3 py-2 text-sm"
            style={selectStyle}
          >
            <option value={ALL_VEHICLES}>All Vehicles</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate_number}
                {[v.make, v.model].filter(Boolean).length > 0
                  ? ` — ${[v.make, v.model].filter(Boolean).join(" ")}`
                  : ""}
              </option>
            ))}
          </select>
        </div>

        {selectedVehicleId !== ALL_VEHICLES && (
          <>
            <div>
              <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>From</label>
              <input
                type="date"
                className="rounded-md px-3 py-2 text-sm"
                style={fieldStyle}
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>To</label>
              <input
                type="date"
                className="rounded-md px-3 py-2 text-sm"
                style={fieldStyle}
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            {(dateFrom || dateTo) && (
              <button
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                }}
                className="rounded-md px-3 py-2 text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                Clear dates
              </button>
            )}
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>
              {historyLoading
                ? "Loading history…"
                : filteredHistory.length === 0
                  ? `No logged locations for ${selectedVehicle?.plate_number ?? "this vehicle"}${dateFrom || dateTo ? " in this range" : ""}.`
                  : `${filteredHistory.length} logged location${filteredHistory.length === 1 ? "" : "s"}`}
            </span>
          </>
        )}
      </div>

      {historyError && (
        <p className="text-sm" style={{ color: "var(--text-danger)" }}>{historyError}</p>
      )}

      <div
        ref={containerRef}
        className="h-[70vh] w-full overflow-hidden rounded-md"
        style={{ border: "0.5px solid var(--border)" }}
      />
    </div>
  );
}
