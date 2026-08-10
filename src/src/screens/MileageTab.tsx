import { useEffect, useState } from "react";
import { listVehicles } from "../lib/repo/vehicles";
import { listMileageEntries, createMileageEntry } from "../lib/repo/mileageEntries";
import { computeDateVariance } from "../lib/variance";
import { formatDate } from "../lib/dateFormat";
import { useSettings } from "../lib/settingsContext";
import ConfirmDialog from "../components/ConfirmDialog";
import type { Vehicle, MileageEntry } from "../lib/types";

const fieldStyle: React.CSSProperties = {
  border: "0.5px solid var(--border-strong)",
  background: "var(--surface-2)",
  color: "var(--text-primary)",
};

const varianceColor: Record<string, string> = {
  live: "var(--text-success)",
  late: "var(--text-warning)",
  future: "var(--text-danger)",
};

function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface PendingEntry {
  vehicleId: string;
  mileageKm: number;
  periodStart: string;
  periodEnd: string;
  note?: string;
}

// ROP011 follow-up — a mileage figure covers a period, daily by default:
// periodEnd starts locked to periodStart and only becomes independently
// editable once "Range" is toggled on, so the common case (one day, one
// figure) stays a single date picker.
export default function MileageTab() {
  const { settings } = useSettings();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [entries, setEntries] = useState<MileageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingEntry | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [vehicleId, setVehicleId] = useState("");
  const [mileageKm, setMileageKm] = useState("");
  const [periodStart, setPeriodStart] = useState(() => todayLocal());
  const [periodEnd, setPeriodEnd] = useState(() => todayLocal());
  const [isRange, setIsRange] = useState(false);
  const [note, setNote] = useState("");

  async function reload() {
    try {
      const [v, e] = await Promise.all([listVehicles(), listMileageEntries()]);
      setVehicles(v);
      setEntries(e);
      setVehicleId((prev) => prev || v[0]?.id || "");
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load mileage entries.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  function handleStartChange(value: string) {
    setPeriodStart(value);
    if (!isRange) setPeriodEnd(value);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const km = Number(mileageKm);
    if (!vehicleId || !Number.isFinite(km) || km < 0) {
      setError("Pick a vehicle and enter a valid mileage figure.");
      return;
    }
    if (periodEnd < periodStart) {
      setError("End date can't be before the start date.");
      return;
    }
    if (periodEnd > todayLocal()) {
      setError("End date can't be in the future.");
      return;
    }
    setPending({ vehicleId, mileageKm: Math.round(km), periodStart, periodEnd, note: note.trim() || undefined });
  }

  async function confirmSubmit() {
    if (!pending) return;
    setError(null);
    setSaving(true);
    try {
      await createMileageEntry({
        vehicle_id: pending.vehicleId,
        mileage_km: pending.mileageKm,
        period_start: pending.periodStart,
        period_end: pending.periodEnd,
        note: pending.note,
      });
      setMileageKm("");
      setNote("");
      const today = todayLocal();
      setPeriodStart(today);
      setPeriodEnd(today);
      setIsRange(false);
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

  function periodLabel(entry: { period_start: string; period_end: string }): string {
    if (entry.period_start === entry.period_end) return formatDate(entry.period_start, settings);
    return `${formatDate(entry.period_start, settings)} – ${formatDate(entry.period_end, settings)}`;
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
        <p className="text-base" style={{ color: "var(--text-muted)" }}>Add a vehicle in Fleet before logging mileage.</p>
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
            <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>Mileage (km)</label>
            <input
              type="number"
              min={0}
              className="w-32 rounded-md px-3 py-2.5 text-base"
              style={fieldStyle}
              value={mileageKm}
              onChange={(e) => setMileageKm(e.target.value)}
              placeholder="Traccar figure"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>
              {isRange ? "Start date" : "Date"}
            </label>
            <input
              type="date"
              className="rounded-md px-3 py-2.5 text-base"
              style={fieldStyle}
              value={periodStart}
              max={todayLocal()}
              onChange={(e) => handleStartChange(e.target.value)}
            />
          </div>
          {isRange && (
            <div>
              <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>End date</label>
              <input
                type="date"
                className="rounded-md px-3 py-2.5 text-base"
                style={fieldStyle}
                value={periodEnd}
                min={periodStart}
                max={todayLocal()}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          )}
          <label className="flex items-center gap-2 pb-2.5 text-sm" style={{ color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={isRange}
              onChange={(e) => {
                setIsRange(e.target.checked);
                if (!e.target.checked) setPeriodEnd(periodStart);
              }}
            />
            Range
          </label>
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
            Log mileage
          </button>
          {error && <p className="w-full text-sm" style={{ color: "var(--text-danger)" }}>{error}</p>}
        </form>
      )}

      <div className="rounded-md" style={{ border: "0.5px solid var(--border)" }}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr style={{ color: "var(--text-muted)" }}>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Mileage</th>
              <th className="px-4 py-3">Logged by</th>
              <th className="px-4 py-3">Timing</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const variance = computeDateVariance(e.period_end, e.recorded_at);
              return (
                <tr key={e.id} style={{ borderTop: "0.5px solid var(--border)" }}>
                  <td className="px-4 py-3 font-medium">{vehicleLabel(e.vehicle_id)}</td>
                  <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{periodLabel(e)}</td>
                  <td className="px-4 py-3">{e.mileage_km.toLocaleString()} km</td>
                  <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                    {e.recorded_by_label} <span style={{ color: "var(--text-muted)" }}>({e.recorded_by_role})</span>
                  </td>
                  <td className="px-4 py-3" style={{ color: varianceColor[variance.tone] }}>{variance.label}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {entries.length === 0 && (
          <p className="px-4 py-6 text-sm" style={{ color: "var(--text-muted)" }}>No mileage logged yet.</p>
        )}
      </div>

      {pending && (
        <ConfirmDialog
          title="Log this mileage?"
          description={
            <>
              <strong>{vehicleLabel(pending.vehicleId)}</strong> — {pending.mileageKm.toLocaleString()} km,{" "}
              {periodLabel({ period_start: pending.periodStart, period_end: pending.periodEnd })}.
              <br />
              This can&rsquo;t be edited or deleted once saved.
            </>
          }
          confirmLabel="Log mileage"
          onConfirm={confirmSubmit}
          onCancel={() => setPending(null)}
          busy={saving}
        />
      )}
    </div>
  );
}
