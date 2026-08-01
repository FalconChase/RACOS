import { useEffect, useState } from "react";
import { listVehicles } from "../lib/repo/vehicles";
import { listOwners } from "../lib/repo/owners";
import VehicleDetailPopup from "../components/VehicleDetailPopup";
import type { Owner, Vehicle, VehicleStatus } from "../lib/types";

const STATUS_STYLES: Record<VehicleStatus, React.CSSProperties> = {
  available: { background: "var(--bg-success)", color: "var(--text-success)" },
  rented: { background: "var(--bg-warning)", color: "var(--text-warning)" },
  maintenance: { background: "var(--bg-danger)", color: "var(--text-danger)" },
  retired: { background: "var(--surface-1)", color: "var(--text-muted)" },
};

interface VehiclesScreenProps {
  onNavigateToRegistry?: () => void;
  onNavigateToMap?: () => void;
}

// Fleet is now a lightweight, mostly read-only overview — full vehicle
// details (year, seats, owner) plus editing and deletion moved to Registry's
// Vehicles subtab. Status here is purely a display pill (no manual toggle):
// it's fully driven by booking lifecycle, and any override happens from
// Registry instead. Current Location is a placeholder ahead of the GPS
// pipeline being wired into the desktop app (see BRAINS/PLANS.md ROP006) —
// it links over to the Map tab rather than showing real coordinates yet.
// Clicking a row (anywhere except "View on Map") opens a read-only detail
// popup — make/model/year/seats/fuel/engine/transmission/GPS/owner plus
// recent rental activity; clicking outside it fades it back out.
export default function VehiclesScreen({ onNavigateToRegistry, onNavigateToMap }: VehiclesScreenProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailVehicleId, setDetailVehicleId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listVehicles(), listOwners()]).then(([v, o]) => {
      setVehicles(v);
      setOwners(o);
      setLoading(false);
    });
  }, []);

  function ownerLabel(id: string | null) {
    if (!id) return "—";
    return owners.find((o) => o.id === id)?.full_name ?? "—";
  }

  const detailVehicle = vehicles.find((v) => v.id === detailVehicleId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 rounded-md p-3 text-sm" style={{ background: "var(--surface-1)", color: "var(--text-muted)" }}>
        <span>Registering, editing, and removing vehicles now happens from Registry's Vehicles subtab.</span>
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
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Status</th>
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Current location</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <tr key={v.id} onClick={() => setDetailVehicleId(v.id)} className="cursor-pointer">
                <td className="px-3 py-2.5 font-medium" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>{v.plate_number}</td>
                <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>
                  {[v.make, v.model].filter(Boolean).join(" ") || "—"}
                </td>
                <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)" }}>
                  <span className="rounded-full px-3 py-1.5 text-sm font-medium" style={STATUS_STYLES[v.status]}>
                    {v.status}
                  </span>
                </td>
                <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)" }}>
                  <div className="flex items-center gap-2.5">
                    <span style={{ color: "var(--text-muted)" }}>Not tracked yet</span>
                    {onNavigateToMap && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigateToMap();
                        }}
                        className="text-sm font-medium"
                        style={{ color: "var(--text-accent)" }}
                      >
                        View on Map
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {detailVehicle && (
        <VehicleDetailPopup
          vehicle={detailVehicle}
          ownerLabel={ownerLabel(detailVehicle.owner_id)}
          onClose={() => setDetailVehicleId(null)}
        />
      )}
    </div>
  );
}
