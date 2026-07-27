import { useEffect, useMemo, useState } from "react";
import {
  deleteVehicle,
  listVehicles,
  updateVehicle,
  updateVehicleStatus,
} from "../lib/repo/vehicles";
import { listOwners } from "../lib/repo/owners";
import type { Owner, Vehicle, VehicleStatus } from "../lib/types";

const STATUS_STYLES: Record<VehicleStatus, React.CSSProperties> = {
  available: { background: "var(--bg-success)", color: "var(--text-success)" },
  rented: { background: "var(--bg-warning)", color: "var(--text-warning)" },
  maintenance: { background: "var(--bg-danger)", color: "var(--text-danger)" },
  retired: { background: "var(--surface-1)", color: "var(--text-muted)" },
};

const inputStyle: React.CSSProperties = {
  border: "0.5px solid var(--border-strong)",
  background: "var(--surface-2)",
  color: "var(--text-primary)",
};

interface VehiclesScreenProps {
  onNavigateToRegistry?: () => void;
}

export default function VehiclesScreen({ onNavigateToRegistry }: VehiclesScreenProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Separate from editingId (the full vehicle-details edit row below) — this
  // only ever swaps the Status pill for a dropdown, and only offers
  // available/maintenance/retired. "rented" is never a manual choice: it's
  // set automatically the moment a booking actually goes active (see
  // updateVehicleStatus calls in lib/repo/bookings.ts) and cleared the same
  // way on return, so there's nothing to hand-edit while a vehicle reads
  // "rented" — the edit affordance is hidden for that state entirely.
  const [statusEditId, setStatusEditId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const [v, o] = await Promise.all([listVehicles(), listOwners()]);
    setVehicles(v);
    setOwners(o);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  function ownerLabel(id: string | null) {
    if (!id) return "—";
    return owners.find((o) => o.id === id)?.full_name ?? "—";
  }

  async function handleStatusChange(id: string, status: VehicleStatus) {
    await updateVehicleStatus(id, status);
    await refresh();
  }

  async function handleDelete(id: string) {
    setDeleteError(null);
    try {
      await deleteVehicle(id);
      await refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-4">
      {deleteError && (
        <div
          className="flex items-start justify-between gap-4 rounded-md p-3 text-sm"
          style={{ background: "var(--bg-danger)", color: "var(--text-danger)" }}
        >
          <span>{deleteError}</span>
          <button onClick={() => setDeleteError(null)} className="shrink-0 font-medium">
            Dismiss
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 rounded-md p-3 text-sm" style={{ background: "var(--surface-1)", color: "var(--text-muted)" }}>
        <span>New vehicles are registered together with their owner from the Registry tab.</span>
        {onNavigateToRegistry && (
          <button onClick={onNavigateToRegistry} className="shrink-0 text-sm font-medium" style={{ color: "var(--text-accent)" }}>
            Go to Registry
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-base" style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : vehicles.length === 0 ? (
        <p className="text-base" style={{ color: "var(--text-muted)" }}>No vehicles yet.</p>
      ) : (
        <table className="w-full border-collapse text-left text-base">
          <thead>
            <tr style={{ background: "var(--surface-1)" }}>
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Plate</th>
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Make / model</th>
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Year</th>
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Seats</th>
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Owner</th>
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Status</th>
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)" }}></th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) =>
              editingId === v.id ? (
                <VehicleEditRow
                  key={v.id}
                  vehicle={v}
                  owners={owners}
                  onCancel={() => setEditingId(null)}
                  onSaved={async () => {
                    setEditingId(null);
                    await refresh();
                  }}
                />
              ) : (
                <tr key={v.id}>
                  <td className="px-3 py-2.5 font-medium" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>{v.plate_number}</td>
                  <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>
                    {[v.make, v.model].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>{v.year ?? "—"}</td>
                  <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>{v.seats ?? "—"}</td>
                  <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>{ownerLabel(v.owner_id)}</td>
                  <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)" }}>
                    {statusEditId === v.id ? (
                      <select
                        autoFocus
                        value={v.status}
                        onChange={async (e) => {
                          await handleStatusChange(v.id, e.target.value as VehicleStatus);
                          setStatusEditId(null);
                        }}
                        onBlur={() => setStatusEditId(null)}
                        className="rounded-full border-0 px-3 py-1.5 text-sm font-medium"
                        style={STATUS_STYLES[v.status]}
                      >
                        <option value="available">available</option>
                        <option value="maintenance">maintenance</option>
                        <option value="retired">retired</option>
                      </select>
                    ) : (
                      <div className="flex items-center gap-2.5">
                        <span className="rounded-full px-3 py-1.5 text-sm font-medium" style={STATUS_STYLES[v.status]}>
                          {v.status}
                        </span>
                        {v.status !== "rented" && (
                          <button
                            onClick={() => setStatusEditId(v.id)}
                            className="text-sm"
                            style={{ color: "var(--text-accent)" }}
                          >
                            Edit status
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right" style={{ border: "0.5px solid var(--border)" }}>
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => setEditingId(v.id)}
                        className="text-sm font-medium"
                        style={{ color: "var(--text-accent)" }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(v.id)}
                        className="text-sm font-medium"
                        style={{ color: "var(--text-danger)" }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function VehicleEditRow({
  vehicle,
  owners,
  onCancel,
  onSaved,
}: {
  vehicle: Vehicle;
  owners: Owner[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [plateNumber, setPlateNumber] = useState(vehicle.plate_number);
  const [make, setMake] = useState(vehicle.make ?? "");
  const [model, setModel] = useState(vehicle.model ?? "");
  const [year, setYear] = useState(vehicle.year != null ? String(vehicle.year) : "");
  const [seats, setSeats] = useState(vehicle.seats != null ? String(vehicle.seats) : "");
  const [ownerId, setOwnerId] = useState(vehicle.owner_id ?? "");
  const [chassisNumber, setChassisNumber] = useState(vehicle.chassis_number ?? "");
  const [engineNumber, setEngineNumber] = useState(vehicle.engine_number ?? "");
  const [gpsDeviceId, setGpsDeviceId] = useState(vehicle.gps_device_id ?? "");
  const [gpsProvider, setGpsProvider] = useState(vehicle.gps_provider ?? "");
  const [gpsNotes, setGpsNotes] = useState(vehicle.gps_notes ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const canSave = useMemo(
    () => Boolean(plateNumber.trim()) && Boolean(make.trim()) && Boolean(model.trim()) && Boolean(seats.trim()) && Boolean(ownerId),
    [plateNumber, make, model, seats, ownerId],
  );

  async function handleSave() {
    if (!canSave) return;
    setSaveError(null);
    setSaving(true);
    try {
      await updateVehicle(vehicle.id, {
        plate_number: plateNumber.trim(),
        make: make.trim(),
        model: model.trim(),
        year: year.trim() ? Number(year) : null,
        seats: Number(seats),
        owner_id: ownerId,
        chassis_number: chassisNumber.trim() || null,
        engine_number: engineNumber.trim() || null,
        gps_device_id: gpsDeviceId.trim() || null,
        gps_provider: gpsProvider.trim() || null,
        gps_notes: gpsNotes.trim() || null,
      });
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td colSpan={7} className="p-0" style={{ border: "0.5px solid var(--border)" }}>
        <div className="space-y-3 p-4" style={{ background: "var(--surface-1)" }}>
          {saveError && (
            <div
              className="flex items-start justify-between gap-4 rounded-md p-3 text-sm"
              style={{ background: "var(--bg-danger)", color: "var(--text-danger)" }}
            >
              <span>{saveError}</span>
              <button onClick={() => setSaveError(null)} className="shrink-0 font-medium">
                Dismiss
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <input className="rounded-md px-3 py-2.5 text-base" style={inputStyle} placeholder="Plate number *" value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)} />
            <input className="rounded-md px-3 py-2.5 text-base" style={inputStyle} placeholder="Make *" value={make} onChange={(e) => setMake(e.target.value)} />
            <input className="rounded-md px-3 py-2.5 text-base" style={inputStyle} placeholder="Model *" value={model} onChange={(e) => setModel(e.target.value)} />
            <input className="rounded-md px-3 py-2.5 text-base" style={inputStyle} placeholder="Year" type="number" value={year} onChange={(e) => setYear(e.target.value)} />
            <input className="rounded-md px-3 py-2.5 text-base" style={inputStyle} placeholder="Seats *" type="number" min={1} value={seats} onChange={(e) => setSeats(e.target.value)} />
            <select className="rounded-md px-3 py-2.5 text-base" style={inputStyle} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">Owner *</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>{o.full_name}</option>
              ))}
            </select>
            <input className="rounded-md px-3 py-2.5 text-base" style={inputStyle} placeholder="Chassis number" value={chassisNumber} onChange={(e) => setChassisNumber(e.target.value)} />
            <input className="rounded-md px-3 py-2.5 text-base" style={inputStyle} placeholder="Engine number" value={engineNumber} onChange={(e) => setEngineNumber(e.target.value)} />
            <input className="rounded-md px-3 py-2.5 text-base" style={inputStyle} placeholder="GPS device ID" value={gpsDeviceId} onChange={(e) => setGpsDeviceId(e.target.value)} />
            <input className="rounded-md px-3 py-2.5 text-base" style={inputStyle} placeholder="GPS provider" value={gpsProvider} onChange={(e) => setGpsProvider(e.target.value)} />
            <input className="col-span-2 rounded-md px-3 py-2.5 text-base" style={inputStyle} placeholder="GPS notes" value={gpsNotes} onChange={(e) => setGpsNotes(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !canSave}
              className="rounded-md px-4 py-2 text-base font-medium disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={onCancel} className="rounded-md px-4 py-2 text-base font-medium" style={{ color: "var(--text-secondary)" }}>
              Cancel
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}
