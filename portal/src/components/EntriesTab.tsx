"use client";

import { useEffect, useState } from "react";
import type { OwnerSession } from "@/lib/ownerAuth";
import type { OwnerVehicle } from "@/lib/ownerData";
import {
  fetchOwnerOdometerReadings,
  fetchOwnerGpsLocationEntries,
  fetchOwnerMileageEntries,
  createOwnerOdometerReading,
  createOwnerGpsLocationEntry,
  createOwnerMileageEntry,
  type OwnerOdometerReading,
  type OwnerGpsLocationEntry,
  type OwnerMileageEntry,
} from "@/lib/ownerData";
import { computeVariance, computeDateVariance } from "@/lib/variance";
import ConfirmDialog from "./ConfirmDialog";

type Subtab = "odometer" | "gps";
type GpsSubtab = "locations" | "mileage";

const VARIANCE_STYLES: Record<string, string> = {
  live: "text-emerald-400",
  late: "text-amber-400",
  future: "text-red-400",
};

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { dateStyle: "medium" });
}

// ROP011 — the owner's own version of the same tools staff have (Tools >
// Entries on the desktop app). Same append-only shape, same confirm-before-
// save step (nothing here can be edited or deleted once saved), same
// Locations/Mileage split under GPS Log.
export default function EntriesTab({ session, vehicles }: { session: OwnerSession; vehicles: OwnerVehicle[] }) {
  const [subtab, setSubtab] = useState<Subtab>("odometer");
  const [gpsSubtab, setGpsSubtab] = useState<GpsSubtab>("locations");
  const [readings, setReadings] = useState<OwnerOdometerReading[]>([]);
  const [locationEntries, setLocationEntries] = useState<OwnerGpsLocationEntry[]>([]);
  const [mileageEntries, setMileageEntries] = useState<OwnerMileageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    try {
      const [r, l, m] = await Promise.all([
        fetchOwnerOdometerReadings(session.token),
        fetchOwnerGpsLocationEntries(session.token),
        fetchOwnerMileageEntries(session.token),
      ]);
      setReadings(r);
      setLocationEntries(l);
      setMileageEntries(m);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load entries.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.token]);

  return (
    <div className="space-y-4">
      <nav className="flex gap-1">
        {(
          [
            { id: "odometer", label: "Odometer Log" },
            { id: "gps", label: "GPS Log" },
          ] as { id: Subtab; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setSubtab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              subtab === t.id ? "bg-zinc-800 text-zinc-50" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : vehicles.length === 0 ? (
        <p className="text-sm text-zinc-500">No vehicles are registered to you yet.</p>
      ) : subtab === "odometer" ? (
        <OdometerLogSection session={session} vehicles={vehicles} readings={readings} onSaved={reload} />
      ) : (
        <div className="space-y-4">
          <nav className="flex gap-1">
            {(
              [
                { id: "locations", label: "Locations" },
                { id: "mileage", label: "Mileage" },
              ] as { id: GpsSubtab; label: string }[]
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setGpsSubtab(t.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  gpsSubtab === t.id ? "bg-zinc-800 text-zinc-50" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          {gpsSubtab === "locations" ? (
            <GpsLocationsSection session={session} vehicles={vehicles} entries={locationEntries} onSaved={reload} />
          ) : (
            <MileageSection session={session} vehicles={vehicles} entries={mileageEntries} onSaved={reload} />
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children, grow }: { label: string; children: React.ReactNode; grow?: boolean }) {
  return (
    <div className={grow ? "min-w-[10rem] flex-1" : undefined}>
      <label className="mb-1.5 block text-sm text-zinc-500">{label}</label>
      {children}
    </div>
  );
}

function OdometerLogSection({
  session,
  vehicles,
  readings,
  onSaved,
}: {
  session: OwnerSession;
  vehicles: OwnerVehicle[];
  readings: OwnerOdometerReading[];
  onSaved: () => void;
}) {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const [readingKm, setReadingKm] = useState("");
  const [readingAt, setReadingAt] = useState(() => toLocalInputValue(new Date()));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ vehicleId: string; km: number; readingAtIso: string; note?: string } | null>(null);

  function vehicleLabel(id: string): string {
    return vehicles.find((v) => v.id === id)?.plate_number ?? id;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const km = Number(readingKm);
    if (!vehicleId || !Number.isFinite(km) || km < 0) {
      setFormError("Pick a vehicle and enter a valid odometer reading.");
      return;
    }
    setPending({ vehicleId, km: Math.round(km), readingAtIso: new Date(readingAt).toISOString(), note: note.trim() || undefined });
  }

  async function confirmSubmit() {
    if (!pending) return;
    setSaving(true);
    try {
      await createOwnerOdometerReading(session.token, session.owner, {
        vehicle_id: pending.vehicleId,
        reading_km: pending.km,
        reading_at: pending.readingAtIso,
        note: pending.note,
      });
      setReadingKm("");
      setNote("");
      setReadingAt(toLocalInputValue(new Date()));
      setPending(null);
      onSaved();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't save that reading.");
      setPending(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-800 p-3">
        <Field label="Vehicle">
          <select
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
          >
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>{v.plate_number}</option>
            ))}
          </select>
        </Field>
        <Field label="Odometer (km)">
          <input
            type="number"
            min={0}
            className="w-32 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            value={readingKm}
            onChange={(e) => setReadingKm(e.target.value)}
            placeholder="84210"
          />
        </Field>
        <Field label="Observed at">
          <input
            type="datetime-local"
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            value={readingAt}
            max={toLocalInputValue(new Date())}
            onChange={(e) => setReadingAt(e.target.value)}
          />
        </Field>
        <Field label="Note (optional)" grow>
          <input
            type="text"
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <button type="submit" className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900">
          Log reading
        </button>
        {formError && <p className="w-full text-sm text-red-400">{formError}</p>}
      </form>

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Reading</th>
              <th className="px-4 py-3">Observed at</th>
              <th className="px-4 py-3">Logged by</th>
              <th className="px-4 py-3">Timing</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {readings.map((r) => {
              const variance = computeVariance(r.reading_at, r.recorded_at);
              return (
                <tr key={r.id} className="text-zinc-200">
                  <td className="px-4 py-3 font-medium">{r.vehicle?.plate_number ?? r.vehicle_id}</td>
                  <td className="px-4 py-3">{r.reading_km.toLocaleString()} km</td>
                  <td className="px-4 py-3 text-zinc-400">{formatDateTime(r.reading_at)}</td>
                  <td className="px-4 py-3 text-zinc-400">
                    {r.recorded_by_label} <span className="text-zinc-500">({r.recorded_by_role})</span>
                  </td>
                  <td className={`px-4 py-3 ${VARIANCE_STYLES[variance.tone]}`}>{variance.label}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {readings.length === 0 && <p className="px-4 py-6 text-sm text-zinc-500">No odometer readings yet.</p>}
      </div>

      {pending && (
        <ConfirmDialog
          title="Log this reading?"
          description={
            <>
              <strong>{vehicleLabel(pending.vehicleId)}</strong> — {pending.km.toLocaleString()} km, observed{" "}
              {formatDateTime(pending.readingAtIso)}.
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

function GpsLocationsSection({
  session,
  vehicles,
  entries,
  onSaved,
}: {
  session: OwnerSession;
  vehicles: OwnerVehicle[];
  entries: OwnerGpsLocationEntry[];
  onSaved: () => void;
}) {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const [locationText, setLocationText] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [readingAt, setReadingAt] = useState(() => toLocalInputValue(new Date()));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ vehicleId: string; locationText: string; durationMinutes?: number; readingAtIso: string; note?: string } | null>(null);

  function vehicleLabel(id: string): string {
    return vehicles.find((v) => v.id === id)?.plate_number ?? id;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!vehicleId || !locationText.trim()) {
      setFormError("Pick a vehicle and enter a location.");
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
    setSaving(true);
    try {
      await createOwnerGpsLocationEntry(session.token, session.owner, {
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
      onSaved();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't save that entry.");
      setPending(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-800 p-3">
        <Field label="Vehicle">
          <select
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
          >
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>{v.plate_number}</option>
            ))}
          </select>
        </Field>
        <Field label="Location" grow>
          <input
            type="text"
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            value={locationText}
            onChange={(e) => setLocationText(e.target.value)}
            placeholder="e.g. Ayala Ave, Makati"
          />
        </Field>
        <Field label="Parked (min, optional)">
          <input
            type="number"
            min={0}
            className="w-28 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
          />
        </Field>
        <Field label="Observed at">
          <input
            type="datetime-local"
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            value={readingAt}
            max={toLocalInputValue(new Date())}
            onChange={(e) => setReadingAt(e.target.value)}
          />
        </Field>
        <Field label="Note (optional)" grow>
          <input
            type="text"
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <button type="submit" className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900">
          Log entry
        </button>
        {formError && <p className="w-full text-sm text-red-400">{formError}</p>}
      </form>

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Observed at</th>
              <th className="px-4 py-3">Logged by</th>
              <th className="px-4 py-3">Timing</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {entries.map((e) => {
              const variance = computeVariance(e.reading_at, e.recorded_at);
              return (
                <tr key={e.id} className="text-zinc-200">
                  <td className="px-4 py-3 font-medium">{e.vehicle?.plate_number ?? e.vehicle_id}</td>
                  <td className="px-4 py-3">
                    {e.location_text}
                    {e.duration_minutes != null && <span className="text-zinc-500"> · parked {e.duration_minutes}m</span>}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{formatDateTime(e.reading_at)}</td>
                  <td className="px-4 py-3 text-zinc-400">
                    {e.recorded_by_label} <span className="text-zinc-500">({e.recorded_by_role})</span>
                  </td>
                  <td className={`px-4 py-3 ${VARIANCE_STYLES[variance.tone]}`}>{variance.label}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {entries.length === 0 && <p className="px-4 py-6 text-sm text-zinc-500">No location entries yet.</p>}
      </div>

      {pending && (
        <ConfirmDialog
          title="Log this location?"
          description={
            <>
              <strong>{vehicleLabel(pending.vehicleId)}</strong> — {pending.locationText}, observed{" "}
              {formatDateTime(pending.readingAtIso)}.
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
    </div>
  );
}

function MileageSection({
  session,
  vehicles,
  entries,
  onSaved,
}: {
  session: OwnerSession;
  vehicles: OwnerVehicle[];
  entries: OwnerMileageEntry[];
  onSaved: () => void;
}) {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const [mileageKm, setMileageKm] = useState("");
  const [periodStart, setPeriodStart] = useState(() => todayLocal());
  const [periodEnd, setPeriodEnd] = useState(() => todayLocal());
  const [isRange, setIsRange] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ vehicleId: string; mileageKm: number; periodStart: string; periodEnd: string; note?: string } | null>(null);

  function vehicleLabel(id: string): string {
    return vehicles.find((v) => v.id === id)?.plate_number ?? id;
  }

  function periodLabel(start: string, end: string): string {
    if (start === end) return formatDate(start);
    return `${formatDate(start)} – ${formatDate(end)}`;
  }

  function handleStartChange(value: string) {
    setPeriodStart(value);
    if (!isRange) setPeriodEnd(value);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const km = Number(mileageKm);
    if (!vehicleId || !Number.isFinite(km) || km < 0) {
      setFormError("Pick a vehicle and enter a valid mileage figure.");
      return;
    }
    if (periodEnd < periodStart) {
      setFormError("End date can't be before the start date.");
      return;
    }
    if (periodEnd > todayLocal()) {
      setFormError("End date can't be in the future.");
      return;
    }
    setPending({ vehicleId, mileageKm: Math.round(km), periodStart, periodEnd, note: note.trim() || undefined });
  }

  async function confirmSubmit() {
    if (!pending) return;
    setSaving(true);
    try {
      await createOwnerMileageEntry(session.token, session.owner, {
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
      onSaved();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't save that entry.");
      setPending(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-800 p-3">
        <Field label="Vehicle">
          <select
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
          >
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>{v.plate_number}</option>
            ))}
          </select>
        </Field>
        <Field label="Mileage (km)">
          <input
            type="number"
            min={0}
            className="w-32 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            value={mileageKm}
            onChange={(e) => setMileageKm(e.target.value)}
            placeholder="Traccar figure"
          />
        </Field>
        <Field label={isRange ? "Start date" : "Date"}>
          <input
            type="date"
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            value={periodStart}
            max={todayLocal()}
            onChange={(e) => handleStartChange(e.target.value)}
          />
        </Field>
        {isRange && (
          <Field label="End date">
            <input
              type="date"
              className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              value={periodEnd}
              min={periodStart}
              max={todayLocal()}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
          </Field>
        )}
        <label className="flex items-center gap-2 pb-2.5 text-sm text-zinc-400">
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
        <Field label="Note (optional)" grow>
          <input
            type="text"
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <button type="submit" className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900">
          Log mileage
        </button>
        {formError && <p className="w-full text-sm text-red-400">{formError}</p>}
      </form>

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Mileage</th>
              <th className="px-4 py-3">Logged by</th>
              <th className="px-4 py-3">Timing</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {entries.map((e) => {
              const variance = computeDateVariance(e.period_end, e.recorded_at);
              return (
                <tr key={e.id} className="text-zinc-200">
                  <td className="px-4 py-3 font-medium">{e.vehicle?.plate_number ?? e.vehicle_id}</td>
                  <td className="px-4 py-3 text-zinc-400">{periodLabel(e.period_start, e.period_end)}</td>
                  <td className="px-4 py-3">{e.mileage_km.toLocaleString()} km</td>
                  <td className="px-4 py-3 text-zinc-400">
                    {e.recorded_by_label} <span className="text-zinc-500">({e.recorded_by_role})</span>
                  </td>
                  <td className={`px-4 py-3 ${VARIANCE_STYLES[variance.tone]}`}>{variance.label}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {entries.length === 0 && <p className="px-4 py-6 text-sm text-zinc-500">No mileage logged yet.</p>}
      </div>

      {pending && (
        <ConfirmDialog
          title="Log this mileage?"
          description={
            <>
              <strong>{vehicleLabel(pending.vehicleId)}</strong> — {pending.mileageKm.toLocaleString()} km,{" "}
              {periodLabel(pending.periodStart, pending.periodEnd)}.
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
