import { useEffect, useState } from "react";
import {
  createVehicle,
  deleteVehicle,
  listVehicles,
  updateVehicleStatus,
} from "../lib/repo/vehicles";
import type { Vehicle, VehicleStatus } from "../lib/types";

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

export default function VehiclesScreen() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [plateNumber, setPlateNumber] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [dailyRate, setDailyRate] = useState("");
  const [seats, setSeats] = useState("");

  async function refresh() {
    setLoading(true);
    setVehicles(await listVehicles());
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!plateNumber.trim()) return;
    await createVehicle({
      plate_number: plateNumber.trim(),
      make: make.trim() || undefined,
      model: model.trim() || undefined,
      year: year ? Number(year) : undefined,
      daily_rate: dailyRate.trim() || undefined,
      seats: seats ? Number(seats) : undefined,
    });
    setPlateNumber("");
    setMake("");
    setModel("");
    setYear("");
    setDailyRate("");
    setSeats("");
    setShowForm(false);
    await refresh();
  }

  async function handleStatusChange(id: string, status: VehicleStatus) {
    await updateVehicleStatus(id, status);
    await refresh();
  }

  async function handleDelete(id: string) {
    await deleteVehicle(id);
    await refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded px-5 py-2 text-base font-bold uppercase tracking-wide"
          style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
        >
          {showForm ? "Cancel" : "Record vehicle"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleAdd}
          className="grid grid-cols-2 gap-3 rounded-md p-4 sm:grid-cols-6"
          style={{ border: "0.5px solid var(--border)" }}
        >
          <input
            className="col-span-2 rounded-md px-3 py-2.5 text-base sm:col-span-1"
            style={inputStyle}
            placeholder="Plate number *"
            value={plateNumber}
            onChange={(e) => setPlateNumber(e.target.value)}
            required
          />
          <input
            className="rounded-md px-3 py-2.5 text-base"
            style={inputStyle}
            placeholder="Make"
            value={make}
            onChange={(e) => setMake(e.target.value)}
          />
          <input
            className="rounded-md px-3 py-2.5 text-base"
            style={inputStyle}
            placeholder="Model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
          <input
            className="rounded-md px-3 py-2.5 text-base"
            style={inputStyle}
            placeholder="Year"
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
          <input
            className="rounded-md px-3 py-2.5 text-base"
            style={inputStyle}
            placeholder="Seats"
            type="number"
            value={seats}
            onChange={(e) => setSeats(e.target.value)}
          />
          <input
            className="rounded-md px-3 py-2.5 text-base"
            style={inputStyle}
            placeholder="Daily rate (fallback)"
            value={dailyRate}
            onChange={(e) => setDailyRate(e.target.value)}
          />
          <button
            type="submit"
            className="col-span-2 rounded-md px-3 py-1.5 text-base font-medium sm:col-span-6"
            style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
          >
            Save
          </button>
        </form>
      )}

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
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Daily rate</th>
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Status</th>
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)" }}></th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <tr key={v.id}>
                <td className="px-3 py-2.5 font-medium" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>{v.plate_number}</td>
                <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>
                  {[v.make, v.model].filter(Boolean).join(" ") || "—"}
                </td>
                <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>{v.year ?? "—"}</td>
                <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>{v.seats ?? "—"}</td>
                <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>{v.daily_rate ?? "—"}</td>
                <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)" }}>
                  <select
                    value={v.status}
                    onChange={(e) => handleStatusChange(v.id, e.target.value as VehicleStatus)}
                    className="rounded-full border-0 px-3 py-1.5 text-sm font-medium"
                    style={STATUS_STYLES[v.status]}
                  >
                    <option value="available">available</option>
                    <option value="rented">rented</option>
                    <option value="maintenance">maintenance</option>
                    <option value="retired">retired</option>
                  </select>
                </td>
                <td className="px-3 py-2.5 text-right" style={{ border: "0.5px solid var(--border)" }}>
                  <button
                    onClick={() => handleDelete(v.id)}
                    className="text-sm font-medium"
                    style={{ color: "var(--text-danger)" }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
