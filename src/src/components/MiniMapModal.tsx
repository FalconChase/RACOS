import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const ZOOM = 16;

// Lightweight "peek at this coordinate" popup — used wherever a saved
// GPS entry's location is clicked (GPS Locations list, Reports timeline).
// Unlike jumping to the Map tab, this stays on the current screen so
// whatever the person was doing there (a form, a filter, scroll position)
// isn't disturbed.
export default function MiniMapModal({
  lat,
  lng,
  label,
  onClose,
}: {
  lat: number;
  lng: number;
  label?: string;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, { center: [lat, lng], zoom: ZOOM });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    const marker = L.marker([lat, lng]).addTo(map);
    if (label) marker.bindPopup(label).openPopup();
    mapRef.current = map;

    // Leaflet sizes itself off the container's dimensions at init time —
    // since this modal animates/mounts into a freshly-laid-out box, force
    // a resize check once layout has settled.
    setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lng, label]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-md p-4"
        style={{ background: "var(--surface-1)", border: "0.5px solid var(--border-strong)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {label ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`}
          </p>
          <button
            onClick={onClose}
            className="text-sm"
            style={{ color: "var(--text-secondary)" }}
          >
            Close
          </button>
        </div>
        <div
          ref={containerRef}
          className="h-80 w-full overflow-hidden rounded-md"
          style={{ border: "0.5px solid var(--border)" }}
        />
      </div>
    </div>
  );
}
