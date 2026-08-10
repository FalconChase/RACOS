import { useEffect, useState } from "react";
import { listVehicles } from "../lib/repo/vehicles";
import { listOdometerReadings, createOdometerReading } from "../lib/repo/odometerReadings";
import { computeVariance } from "../lib/variance";
import { useSettings } from "../lib/settingsContext";
import { formatDateTime } from "../lib/dateFormat";
import ConfirmDialog from "../components/ConfirmDialog";
import type { Vehicle, OdometerReading } from "../lib/types";

const fieldStyle: React.CSSProperties = {
  border: "0.5px solid var(--border-strong)",
  background: "var(--surface-2)",
  color: "var(--text-primary)",
};

// datetime-local wants local wall-clock time with no timezone, "now" as the
// max so a reading can never be future-dated from the picker itself (the
// repo layer double-checks this — see odometerReadings.ts — since the max
// attribute alone doesn't stop a manually typed value).
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const varianceColor: Record<string, string> = {
  live: "var(--text-success)",
  late: "var(--text-warning)",
  future: "var(--text-danger)",
};

export default function OdometerLogTab() {
  const { settings } = useSettings();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [readings, setReadings] = useState<OdometerReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [vehicleId, setVehicleId] = useState("");
  const [readingKm, setReadingKm] = useState("");
  const [readingAt, setReadingAt] = useState(() => toLocalInputValue(new Date()));
  const [note, setNote] = useState("");
  // Set only after the form validates — holds exactly what the confirm
  // dialog shows and what actually gets submitted, so there's no gap where
  // the two could disagree.
  const [pending, setPending] = useState<{ vehicleId: string; km: number; readingAtIso: string; note?: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function reload() {
    try {
      const [v, r] = await Promise.all([listVehicles(), listOdometerReadings()]);
      setVehicles(v);
      setReadings(r);
      setVehicleId((prev) => prev || v[0]?.id || "");
      setLoadError(null);
    } catch (err) {
      // Most likely cause: the local schema hasn't caught up yet (a Tauri
      // migration needs a real app restart, not just a frontend reload) —
      // surfacing this beats hanging on "Loading…" forever with no clue why.
      setLoadError(err instanceof Error ? err.message : "Couldn't load odometer data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const km = Number(readingKm);
    if (!vehicleId || !Number.isFinite(km) || km < 0) {
      setError("Pick a vehicle and enter a valid odometer reading.");
      return;
    }
    setPending({
      vehicleId,
      km: Math.round(km),
      readingAtIso: new Date(readingAt).toISOString(),
      note: note.trim() || undefined,
    });
  }

  async function confirmSubmit() {
    if (!pending) return;
    setError(null);
    setSaving(true);
    try {
      await createOdometerReading({
        vehicle_id: pending.vehicleId,
        reading_km: pending.km,
        reading_at: pending.readingAtIso,
        note: pending.note,
      });
      setReadingKm("");
      setNote("");
      setReadingAt(toLocalInputValue(new Date()));
      setPending(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that reading.");
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
        <p className="text-base" style={{ color: "var(--text-muted)" }}>Add a vehicle in Fleet before logging a reading.</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 rounded-md p-3" style={{ border: "0.5px solid var(--border)" }}>
          <div>
            <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>Vehicle</label>
            <select className="w-48 rounded-md px-3 py-2.5 text-base" style={fieldStyle} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.plate_number}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>Odometer (km)</label>
            <input
              type="number"
              min={0}
              className="w-32 rounded-md px-3 py-2.5 text-base"
              style={fieldStyle}
              value={readingKm}
              onChange={(e) => setReadingKm(e.target.value)}
              placeholder="84210"
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
              placeholder="e.g. HQ arrival, audit"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md px-4 py-2.5 text-sm font-medium"
            style={{ background: "var(--fill-primary)", color: "var(--on-primary)", opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Saving…" : "Log reading"}
          </button>
          {error && <p className="w-full text-sm" style={{ color: "var(--text-danger)" }}>{error}</p>}
        </form>
      )}

      <div className="rounded-md" style={{ border: "0.5px solid var(--border)" }}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr style={{ color: "var(--text-muted)" }}>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Reading</th>
              <th className="px-4 py-3">Observed at</th>
              <th className="px-4 py-3">Logged by</th>
              <th className="px-4 py-3">Timing</th>
              <th className="px-4 py-3">Note</th>
            </tr>
          </thead>
          <tbody>
            {readings.map((r) => {
              const variance = computeVariance(r.reading_at, r.recorded_at);
              return (
                <tr key={r.id} style={{ borderTop: "0.5px solid var(--border)" }}>
                  <td className="px-4 py-3 font-medium">{vehicleLabel(r.vehicle_id)}</td>
                  <td className="px-4 py-3">{r.reading_km.toLocaleString()} km</td>
                  <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{formatDateTime(r.reading_at, settings)}</td>
                  <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                    {r.recorded_by_label} <span style={{ color: "var(--text-muted)" }}>({r.recorded_by_role})</span>
                  </td>
                  <td className="px-4 py-3" style={{ color: varianceColor[variance.tone] }}>{variance.label}</td>
                  <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>{r.note ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {readings.length === 0 && (
          <p className="px-4 py-6 text-sm" style={{ color: "var(--text-muted)" }}>No odometer readings logged yet.</p>
        )}
      </div>

      {pending && (
        <ConfirmDialog
          title="Log this reading?"
          description={
            <>
              <strong>{vehicleLabel(pending.vehicleId)}</strong> — {pending.km.toLocaleString()} km, observed{" "}
              {formatDateTime(pending.readingAtIso, settings)}.
              <br />
              This can&rsquo;t be edited or deleted once saved.
            </>
          }
          confirmLabel="Log reading"
          onConfirm={confirmSubmit}
          onCancel={() => setPending(null)}
          busy={saving}
        />
      )}
    </div>
  );
}
