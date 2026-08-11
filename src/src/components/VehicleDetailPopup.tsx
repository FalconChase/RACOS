import { useEffect, useState } from "react";
import { listRecentActivityForVehicle } from "../lib/repo/bookings";
import type { VehicleActivityEntry } from "../lib/repo/bookings";
import { useSettings } from "../lib/settingsContext";
import { formatDate } from "../lib/dateFormat";
import type { Vehicle } from "../lib/types";

interface VehicleDetailPopupProps {
  vehicle: Vehicle;
  ownerLabel: string;
  onClose: () => void;
}

const FADE_MS = 150;

const rowLabelStyle: React.CSSProperties = { color: "var(--text-secondary)" };
const rowValueStyle: React.CSSProperties = { color: "var(--text-primary)" };

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm" style={{ borderBottom: "0.5px solid var(--border)" }}>
      <span style={rowLabelStyle}>{label}</span>
      <span className="font-medium" style={rowValueStyle}>{value}</span>
    </div>
  );
}

// Click a Fleet row to pop this open; clicking the backdrop (anywhere
// outside the card) fades it back out. Purely a read-only detail view —
// editing still only happens from Registry's Vehicles subtab.
export default function VehicleDetailPopup({ vehicle, ownerLabel, onClose }: VehicleDetailPopupProps) {
  const { settings } = useSettings();
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [activity, setActivity] = useState<VehicleActivityEntry[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(true);

  useEffect(() => {
    // Two-step mount so the opacity transition actually animates in, rather
    // than the browser coalescing the initial 0 -> 1 change into one frame.
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    listRecentActivityForVehicle(vehicle.id).then((rows) => {
      setActivity(rows);
      setLoadingActivity(false);
    });
  }, [vehicle.id]);

  function requestClose() {
    setVisible(false);
    setClosing(true);
    setTimeout(onClose, FADE_MS);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 transition-opacity"
      style={{
        background: "rgba(0, 0, 0, 0.5)",
        opacity: visible && !closing ? 1 : 0,
        transitionDuration: `${FADE_MS}ms`,
      }}
      onClick={requestClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl overflow-hidden rounded-lg transition-all"
        style={{
          background: "var(--surface-1)",
          border: "0.5px solid var(--border)",
          opacity: visible && !closing ? 1 : 0,
          transform: visible && !closing ? "scale(1)" : "scale(0.97)",
          transitionDuration: `${FADE_MS}ms`,
          maxHeight: "85vh",
        }}
      >
        <div className="flex items-center justify-between gap-4 px-5 py-4" style={{ borderBottom: "0.5px solid var(--border)" }}>
          <h2 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>{vehicle.plate_number}</h2>
          <button onClick={requestClose} className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            Close
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-5 py-4" style={{ maxHeight: "calc(85vh - 64px)" }}>
          <div className="flex gap-4">
            {vehicle.car_image ? (
              <img
                src={vehicle.car_image}
                alt={vehicle.plate_number}
                className="h-72 w-72 shrink-0 rounded-md"
                style={{
                  border: "0.5px solid var(--border)",
                  objectFit: vehicle.car_image_fit,
                  background: "var(--surface-2)",
                }}
              />
            ) : (
              <div
                className="flex h-72 w-72 shrink-0 items-center justify-center rounded-md text-center text-xs"
                style={{ border: "0.5px solid var(--border)", color: "var(--text-muted)" }}
              >
                No image on file
                <br />
                (set from Registry &gt; Vehicles)
              </div>
            )}

            <div className="min-w-0 flex-1">
              <DetailRow label="Make" value={vehicle.make ?? "—"} />
              <DetailRow label="Model" value={vehicle.model ?? "—"} />
              <DetailRow label="Description" value={vehicle.description ?? "—"} />
              <DetailRow label="Year" value={vehicle.year != null ? String(vehicle.year) : "—"} />
              <DetailRow label="Color" value={vehicle.color ?? "—"} />
              <DetailRow label="Seating" value={vehicle.seats != null ? String(vehicle.seats) : "—"} />
              <DetailRow label="Fuel" value={vehicle.fuel ?? "—"} />
              <DetailRow label="Fuel capacity" value={vehicle.fuel_capacity ?? "—"} />
              <DetailRow label="Max fuel level" value={vehicle.fuel_max_level != null ? String(vehicle.fuel_max_level) : "—"} />
              <DetailRow label="Engine" value={vehicle.engine_number ?? "—"} />
              <DetailRow label="Transmission" value={vehicle.transmission ?? "—"} />
              <DetailRow
                label="GPS"
                value={vehicle.gps_device_id ? `${vehicle.gps_device_id}${vehicle.gps_provider ? ` (${vehicle.gps_provider})` : ""}` : "Not set"}
              />
              <DetailRow label="Owner" value={ownerLabel} />
              <DetailRow label="Notes" value={vehicle.notes ?? "—"} />
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
              Activity history (last 10, excluding cancelled)
            </h3>
            {loadingActivity ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
            ) : activity.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>No rental history yet.</p>
            ) : (
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr style={{ background: "var(--surface-2)" }}>
                    <th className="px-2.5 py-1.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Date</th>
                    <th className="px-2.5 py-1.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Lessee</th>
                    <th className="px-2.5 py-1.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Destination</th>
                    <th className="px-2.5 py-1.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Duration (HH:MM)</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.map((a) => (
                    <tr key={a.id}>
                      <td className="px-2.5 py-1.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>{formatDate(a.date, settings)}</td>
                      <td className="px-2.5 py-1.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>{a.lessee}</td>
                      <td className="px-2.5 py-1.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>{a.destination}</td>
                      <td className="px-2.5 py-1.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>{a.durationLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
