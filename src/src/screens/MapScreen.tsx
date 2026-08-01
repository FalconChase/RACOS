import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { listVehicles } from "../lib/repo/vehicles";
import type { Vehicle } from "../lib/types";

// Preparatory shell for live fleet tracking. The GPS pipeline
// (Traccar → gps-ingest → vehicle_locations on Supabase, see
// BRAINS/PLANS.md ROP006) is proven end to end on the backend, but the
// desktop app has no Supabase read access yet (blocked on ROT007). This
// screen is deliberately just a real, working map with no pins on it —
// the shape of the feature exists ahead of the data wiring.
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

export default function MapScreen() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(ALL_VEHICLES);

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

  return (
    <div className="space-y-4">
      <div
        className="rounded-md p-3 text-sm"
        style={{ background: "var(--surface-1)", color: "var(--text-muted)" }}
      >
        Live vehicle tracking isn't connected yet — this is a preview of where it will live. Once GPS
        devices are wired up, vehicles will appear here in real time, and Fleet's Current Location
        column will link straight to a vehicle's pin.
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
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
        {selectedVehicleId !== ALL_VEHICLES && (
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            No live position yet for this vehicle.
          </span>
        )}
      </div>

      <div
        ref={containerRef}
        className="h-[70vh] w-full overflow-hidden rounded-md"
        style={{ border: "0.5px solid var(--border)" }}
      />
    </div>
  );
}
