import { useEffect, useState } from "react";
import { listVehicles } from "../lib/repo/vehicles";
import { listGpsLocationEntries, createGpsLocationEntry } from "../lib/repo/gpsLocationEntries";
import { listGpsLocationLabels, resolveGpsLocationLabel } from "../lib/repo/gpsLocationLabels";
import { computeVariance } from "../lib/variance";
import { useSettings } from "../lib/settingsContext";
import { formatDateTime } from "../lib/dateFormat";
import ConfirmDialog from "../components/ConfirmDialog";
import MiniMapModal from "../components/MiniMapModal";
import MapTrailRecorder from "./MapTrailRecorder";
import type { Vehicle, GpsLocationEntry, GpsLocationLabel } from "../lib/types";

const fieldStyle: React.CSSProperties = {
  border: "0.5px solid var(--border-strong)",
  background: "var(--surface-2)",
  color: "var(--text-primary)",
};

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const varianceColor: Record<string, string> = {
  live: "var(--text-success)",
  late: "var(--text-warning)",
  future: "var(--text-danger)",
};

interface PendingEntry {
  vehicleId: string;
  locationText: string;
  durationMinutes?: number;
  readingAtIso: string;
  note?: string;
}

export default function GpsLocationsTab() {
  const { settings } = useSettings();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [entries, setEntries] = useState<GpsLocationEntry[]>([]);
  const [labels, setLabels] = useState<Record<string, GpsLocationLabel>>({});
  const [converting, setConverting] = useState<string | null>(null);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingEntry | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<"manual" | "map">("manual");
  const [mapPeek, setMapPeek] = useState<{ lat: number; lng: number; label?: string } | null>(null);

  const [vehicleId, setVehicleId] = useState("");
  const [locationText, setLocationText] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [readingAt, setReadingAt] = useState(() => toLocalInputValue(new Date()));
  const [note, setNote] = useState("");

  async function reload() {
    try {
      const [v, e, l] = await Promise.all([listVehicles(), listGpsLocationEntries(), listGpsLocationLabels()]);
      setVehicles(v);
      setEntries(e);
      setLabels(l);
      setVehicleId((prev) => prev || v[0]?.id || "");
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load location entries.");
    } finally {
      setLoading(false);
    }
  }

  async function handleConvert(entry: GpsLocationEntry) {
    setConvertError(null);
    setConverting(entry.id);
    try {
      const label = await resolveGpsLocationLabel(entry);
      setLabels((prev) => ({ ...prev, [entry.id]: label }));
    } catch (err) {
      setConvertError(err instanceof Error ? err.message : "Couldn't convert this location.");
    } finally {
      setConverting(null);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!vehicleId || !locationText.trim()) {
      setError("Pick a vehicle and enter a location.");
      return;
    }
    setPending({
      vehicleId,
      locationText: locationText.trim(),
      durationMinutes: durationMinutes.trim() ? Math.round(Number(durationMinutes)) : undefined,
      readingAtIso: new Date(readingAt).toISOString(),
      note: note.trim() || undefined,
    });
  }

  async function confirmSubmit() {
    if (!pending) return;
    setError(null);
    setSaving(true);
    try {
      await createGpsLocationEntry({
        vehicle_id: pending.vehicleId,
        location_text: pending.locationText,
        duration_minutes: pending.durationMinutes,
        reading_at: pending.readingAtIso,
        note: pending.note,
      });
      setLocationText("");
      setDurationMinutes("");
      setNote("");
      setReadingAt(toLocalInputValue(new Date()));
      setPending(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that entry.");
      setPending(null);
    } finally {
      setSaving(false);
    }
  }

  function vehicleLabel(id: string): string {
    const v = vehicles.find((x) => x.id === id);
    return v ? v.plate_number : "—";
  }

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
        <button
          onClick={() => {
            setLoading(true);
            reload();
          }}
          className="rounded-md px-4 py-2 text-sm font-medium"
          style={{ border: "0.5px solid var(--border-strong)", color: "var(--text-secondary)" }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {vehicles.length === 0 ? (
        <p className="text-base" style={{ color: "var(--text-muted)" }}>Add a vehicle in Fleet before logging a location.</p>
      ) : mode === "map" ? (
        <MapTrailRecorder
          vehicles={vehicles}
          onSaved={reload}
          onCancel={() => setMode("manual")}
        />
      ) : (
        <>
        <div className="flex justify-end">
          <button
            onClick={() => setMode("map")}
            className="rounded-md px-4 py-2 text-sm font-medium"
            style={{ border: "0.5px solid var(--border-strong)", color: "var(--text-secondary)" }}
          >
            Record through MAP
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 rounded-md p-3" style={{ border: "0.5px solid var(--border)" }}>
          <div>
            <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>Vehicle</label>
            <select className="w-48 rounded-md px-3 py-2.5 text-base" style={fieldStyle} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.plate_number}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[12rem]">
            <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>Location</label>
            <input
              type="text"
              className="w-full rounded-md px-3 py-2.5 text-base"
              style={fieldStyle}
              value={locationText}
              onChange={(e) => setLocationText(e.target.value)}
              placeholder="e.g. Ayala Ave, Makati"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>Parked (min, optional)</label>
            <input
              type="number"
              min={0}
              className="w-28 rounded-md px-3 py-2.5 text-base"
              style={fieldStyle}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>Observed at</label>
            <input
              type="datetime-local"
              className="rounded-md px-3 py-2.5 text-base"
              style={fieldStyle}
              value={readingAt}
              max={toLocalInputValue(new Date())}
              onChange={(e) => setReadingAt(e.target.value)}
            />
          </div>
          <div className="flex-1 min-w-[10rem]">
            <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>Note (optional)</label>
            <input
              type="text"
              className="w-full rounded-md px-3 py-2.5 text-base"
              style={fieldStyle}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className="rounded-md px-4 py-2.5 text-sm font-medium"
            style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
          >
            Log entry
          </button>
          {error && <p className="w-full text-sm" style={{ color: "var(--text-danger)" }}>{error}</p>}
        </form>
        </>
      )}

      <div className="rounded-md" style={{ border: "0.5px solid var(--border)" }}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr style={{ color: "var(--text-muted)" }}>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Observed at</th>
              <th className="px-4 py-3">Logged by</th>
              <th className="px-4 py-3">Timing</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const variance = computeVariance(e.reading_at, e.recorded_at);
              const label = labels[e.id];
              const hasCoordinates = e.latitude != null && e.longitude != null;
              return (
                <tr key={e.id} style={{ borderTop: "0.5px solid var(--border)" }}>
                  <td className="px-4 py-3 font-medium">{vehicleLabel(e.vehicle_id)}</td>
                  <td className="px-4 py-3">
                    {hasCoordinates ? (
                      <button
                        onClick={() =>
                          setMapPeek({ lat: e.latitude as number, lng: e.longitude as number, label: label?.formatted_address ?? e.location_text })
                        }
                        className="text-left underline-offset-2 hover:underline"
                        style={{ color: "var(--text-accent)" }}
                        title="View on map"
                      >
                        {label ? (
                          <>
                            <div>{label.formatted_address}</div>
                            <div className="text-xs" style={{ color: "var(--text-muted)" }}>{e.location_text}</div>
                          </>
                        ) : (
                          e.location_text
                        )}
                      </button>
                    ) : label ? (
                      <>
                        <div>{label.formatted_address}</div>
                        <div className="text-xs" style={{ color: "var(--text-muted)" }}>{e.location_text}</div>
                      </>
                    ) : (
                      e.location_text
                    )}
                    {e.duration_minutes != null && (
                      <span style={{ color: "var(--text-muted)" }}> · parked {e.duration_minutes}m</span>
                    )}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{formatDateTime(e.reading_at, settings)}</td>
                  <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                    {e.recorded_by_label} <span style={{ color: "var(--text-muted)" }}>({e.recorded_by_role})</span>
                  </td>
                  <td className="px-4 py-3" style={{ color: varianceColor[variance.tone] }}>{variance.label}</td>
                  <td className="px-4 py-3 text-right">
                    {hasCoordinates && !label && (
                      <button
                        onClick={() => handleConvert(e)}
                        disabled={converting === e.id}
                        className="text-sm"
                        style={{ color: "var(--text-accent)", opacity: converting === e.id ? 0.5 : 1 }}
                      >
                        {converting === e.id ? "Converting…" : "Convert"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {entries.length === 0 && (
          <p className="px-4 py-6 text-sm" style={{ color: "var(--text-muted)" }}>No location entries logged yet.</p>
        )}
        {convertError && (
          <p className="px-4 py-3 text-sm" style={{ color: "var(--text-danger)", borderTop: "0.5px solid var(--border)" }}>{convertError}</p>
        )}
      </div>

      {pending && (
        <ConfirmDialog
          title="Log this location?"
          description={
            <>
              <strong>{vehicleLabel(pending.vehicleId)}</strong> — {pending.locationText}, observed{" "}
              {formatDateTime(pending.readingAtIso, settings)}.
              <br />
              This can&rsquo;t be edited or deleted once saved.
            </>
          }
          confirmLabel="Log entry"
          onConfirm={confirmSubmit}
          onCancel={() => setPending(null)}
          busy={saving}
        />
      )}

      {mapPeek && (
        <MiniMapModal lat={mapPeek.lat} lng={mapPeek.lng} label={mapPeek.label} onClose={() => setMapPeek(null)} />
      )}
    </div>
  );
}
