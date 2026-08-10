import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { createGpsLocationEntriesBatch, type NewGpsLocationEntryInput } from "../lib/repo/gpsLocationEntries";
import ConfirmDialog from "../components/ConfirmDialog";
import type { Vehicle } from "../lib/types";

const DEFAULT_CENTER: [number, number] = [12.8797, 121.774];
const DEFAULT_ZOOM = 6;

const fieldStyle: React.CSSProperties = {
  border: "0.5px solid var(--border-strong)",
  background: "var(--surface-2)",
  color: "var(--text-primary)",
};

function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function nowHm(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Stop {
  localId: string;
  lat: number;
  lng: number;
  time: string; // HH:MM, blank until filled in
  durationMinutes: string;
  note: string;
}

function markerIcon(index: number): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="background:var(--fill-accent,#378ADD);color:white;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4)">${index + 1}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

// "Record through MAP" — click the map to drop a numbered stop, fill in
// each stop's time afterward, then finalize the whole trail as one batch.
// Nothing is written until Finalize is confirmed — stops live only in
// component state until then (see gpsLocationEntries.ts
// createGpsLocationEntriesBatch for why it's a batch of ordinary single
// inserts, not a real DB transaction).
export default function MapTrailRecorder({
  vehicles,
  onSaved,
  onCancel,
}: {
  vehicles: Vehicle[];
  onSaved: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const [tripDate, setTripDate] = useState(() => todayLocal());
  const [stops, setStops] = useState<Stop[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [partialResult, setPartialResult] = useState<{ savedCount: number; message: string } | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    map.on("click", (e: L.LeafletMouseEvent) => {
      setStops((prev) => [
        ...prev,
        { localId: crypto.randomUUID(), lat: e.latlng.lat, lng: e.latlng.lng, time: "", durationMinutes: "", note: "" },
      ]);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Rebuild markers whenever the stops list changes — simplest correct
  // approach for trail sizes this small (a handful of stops per day), no
  // need to diff individual marker updates.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = stops.map((s, i) => L.marker([s.lat, s.lng], { icon: markerIcon(i) }).addTo(map));
  }, [stops]);

  function updateStop(localId: string, patch: Partial<Stop>) {
    setStops((prev) => prev.map((s) => (s.localId === localId ? { ...s, ...patch } : s)));
  }

  function removeStop(localId: string) {
    setStops((prev) => prev.filter((s) => s.localId !== localId));
  }

  function handleFinalize() {
    setError(null);
    if (!vehicleId) {
      setError("Pick a vehicle.");
      return;
    }
    if (stops.length === 0) {
      setError("Click the map to drop at least one stop first.");
      return;
    }
    const missingTime = stops.some((s) => !s.time);
    if (missingTime) {
      setError("Every stop needs a time before finalizing.");
      return;
    }
    const now = new Date();
    for (const s of stops) {
      const combined = new Date(`${tripDate}T${s.time}:00`);
      if (combined.getTime() > now.getTime()) {
        setError(`Stop at ${s.time} can't be in the future.`);
        return;
      }
    }
    setConfirming(true);
  }

  async function confirmFinalize() {
    setSaving(true);
    setPartialResult(null);
    const inputs: NewGpsLocationEntryInput[] = stops.map((s) => ({
      vehicle_id: vehicleId,
      location_text: `${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}`,
      latitude: s.lat,
      longitude: s.lng,
      duration_minutes: s.durationMinutes.trim() ? Math.round(Number(s.durationMinutes)) : undefined,
      reading_at: new Date(`${tripDate}T${s.time}:00`).toISOString(),
      note: s.note.trim() || undefined,
    }));

    const result = await createGpsLocationEntriesBatch(inputs);
    setSaving(false);
    setConfirming(false);

    if (result.error) {
      // Stops before the failure are already permanent — drop only those
      // from the draft, so what's left on screen is exactly what still
      // needs finalizing (and won't get double-submitted on retry).
      setStops((prev) => prev.slice(result.error!.atIndex));
      setPartialResult({
        savedCount: result.created.length,
        message: `Saved ${result.created.length} of ${inputs.length} stops before hitting an error: ${result.error.message}`,
      });
      if (result.created.length > 0) await onSaved();
      return;
    }

    setStops([]);
    await onSaved();
  }

  const vehicleLabel = vehicles.find((v) => v.id === vehicleId)?.plate_number ?? "—";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>Vehicle</label>
          <select className="w-48 rounded-md px-3 py-2.5 text-base" style={fieldStyle} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>{v.plate_number}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>Trail date</label>
          <input
            type="date"
            className="rounded-md px-3 py-2.5 text-base"
            style={fieldStyle}
            value={tripDate}
            max={todayLocal()}
            onChange={(e) => setTripDate(e.target.value)}
          />
        </div>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Click the map to drop a stop. Every stop shares this one date — fill in each stop's time below.
        </p>
        <button
          onClick={onCancel}
          className="ml-auto rounded-md px-4 py-2 text-sm font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          Cancel
        </button>
      </div>

      <div ref={containerRef} className="h-[50vh] w-full overflow-hidden rounded-md" style={{ border: "0.5px solid var(--border)" }} />

      {partialResult && (
        <p className="text-sm" style={{ color: "var(--text-warning)" }}>{partialResult.message}</p>
      )}

      {stops.length > 0 && (
        <div className="rounded-md" style={{ border: "0.5px solid var(--border)" }}>
          {stops.map((s, i) => (
            <div
              key={s.localId}
              className="flex flex-wrap items-end gap-3 px-4 py-3 text-sm"
              style={{ borderTop: i === 0 ? undefined : "0.5px solid var(--border)" }}
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                style={{ background: "var(--fill-accent)", color: "var(--on-accent)" }}
              >
                {i + 1}
              </span>
              <button
                type="button"
                onClick={() => mapRef.current?.flyTo([s.lat, s.lng], 17)}
                className="underline-offset-2 hover:underline"
                style={{ color: "var(--text-accent)" }}
                title="Jump to this pin on the map above"
              >
                {s.lat.toFixed(5)}, {s.lng.toFixed(5)}
              </button>
              <div>
                <label className="mb-1 block text-xs" style={{ color: "var(--text-muted)" }}>Time</label>
                <input
                  type="time"
                  className="rounded-md px-2 py-1.5 text-sm"
                  style={fieldStyle}
                  value={s.time}
                  onChange={(e) => updateStop(s.localId, { time: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs" style={{ color: "var(--text-muted)" }}>Parked (min)</label>
                <input
                  type="number"
                  min={0}
                  className="w-20 rounded-md px-2 py-1.5 text-sm"
                  style={fieldStyle}
                  value={s.durationMinutes}
                  onChange={(e) => updateStop(s.localId, { durationMinutes: e.target.value })}
                />
              </div>
              <div className="min-w-[8rem] flex-1">
                <label className="mb-1 block text-xs" style={{ color: "var(--text-muted)" }}>Note</label>
                <input
                  type="text"
                  className="w-full rounded-md px-2 py-1.5 text-sm"
                  style={fieldStyle}
                  value={s.note}
                  onChange={(e) => updateStop(s.localId, { note: e.target.value })}
                />
              </div>
              <button onClick={() => removeStop(s.localId)} className="text-sm" style={{ color: "var(--text-danger)" }}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            const last = stops[stops.length - 1];
            if (last && !last.time) updateStop(last.localId, { time: nowHm() });
          }}
          className="rounded-md px-4 py-2 text-sm font-medium"
          style={{ border: "0.5px solid var(--border-strong)", color: "var(--text-secondary)" }}
          disabled={stops.length === 0}
        >
          Fill last stop's time as now
        </button>
        <button
          onClick={handleFinalize}
          className="rounded-md px-4 py-2.5 text-sm font-medium"
          style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
        >
          Finalize trail ({stops.length} stop{stops.length === 1 ? "" : "s"})
        </button>
        {error && <p className="text-sm" style={{ color: "var(--text-danger)" }}>{error}</p>}
      </div>

      {confirming && (
        <ConfirmDialog
          title="Save this trail?"
          description={
            <>
              <strong>{vehicleLabel}</strong> — {stops.length} stop{stops.length === 1 ? "" : "s"} on {tripDate}:
              <ul className="mt-1 list-inside list-disc">
                {stops.map((s, i) => (
                  <li key={s.localId}>
                    #{i + 1} at {s.time} — {s.lat.toFixed(5)}, {s.lng.toFixed(5)}
                  </li>
                ))}
              </ul>
              <br />
              None of these can be edited or deleted once saved.
            </>
          }
          confirmLabel="Save trail"
          onConfirm={confirmFinalize}
          onCancel={() => setConfirming(false)}
          busy={saving}
        />
      )}
    </div>
  );
}
