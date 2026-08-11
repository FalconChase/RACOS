import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { listVehicles } from "../lib/repo/vehicles";
import { listGpsLocationEntries } from "../lib/repo/gpsLocationEntries";
import { listGpsLocationLabels } from "../lib/repo/gpsLocationLabels";
import { listBookings } from "../lib/repo/bookings";
import { listAllBookingLegs } from "../lib/repo/bookingLegs";
import { listCustomers } from "../lib/repo/customers";
import { listMunicipalities, listProvinces } from "../lib/repo/locations";
import { listDestinationGeocodes, resolveDestinationGeocodes } from "../lib/repo/destinationGeocodes";
import { buildDestinationHistory, type DestinationHistoryPoint } from "../lib/destinationHistory";
import { useSettings } from "../lib/settingsContext";
import { formatDateTime } from "../lib/dateFormat";
import type {
  Booking,
  BookingLeg,
  Customer,
  DestinationGeocode,
  GpsLocationEntry,
  GpsLocationLabel,
  Municipality,
  Province,
  Vehicle,
} from "../lib/types";

// Preparatory shell for live fleet tracking (see BRAINS/PLANS.md ROP006) —
// the desktop app has no live-position feed yet. What it does have,
// per-vehicle, is the manual GPS location history logged under Tools >
// Entries (ROP011). Selecting a vehicle here plots that history as a
// numbered trail — the same "corroborating signal" data, just viewed on
// the map instead of as a list.
//
// A second, independent layer — Destination history — plots every past
// booking's destination(s) instead, aggregated one pin per unique place
// (see lib/destinationHistory.ts) since the same municipality is typically
// booked over and over. Coordinates come from lib/repo/destinationGeocodes.ts,
// resolved lazily via Nominatim and cached — provinces/municipalities have
// no coordinates of their own.
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

const fieldStyle: React.CSSProperties = selectStyle;

function markerIcon(index: number): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="background:var(--fill-accent,#378ADD);color:white;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4)">${index + 1}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

// A teardrop pin, deliberately distinct from the vehicle trail's numbered
// circles — this layer is "places we've been", not "one vehicle's path in
// order". The badge is the visit count, the same aggregate the popup lists.
function destinationPinIcon(visitCount: number): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `
      <div style="position:relative;width:28px;height:36px;">
        <svg width="28" height="36" viewBox="0 0 28 36" style="position:absolute;top:0;left:0;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4));">
          <path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.3 21.7 0 14 0z" fill="#A855F7"/>
        </svg>
        <div style="position:absolute;top:4px;left:0;width:28px;height:20px;display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:700;">${visitCount}</div>
      </div>
    `,
    iconSize: [28, 36],
    iconAnchor: [14, 36],
  });
}

export default function MapScreen() {
  const { settings } = useSettings();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const historyMarkersRef = useRef<L.Marker[]>([]);
  const historyLineRef = useRef<L.Polyline | null>(null);
  const destinationMarkersRef = useRef<L.Marker[]>([]);

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(ALL_VEHICLES);
  const [history, setHistory] = useState<GpsLocationEntry[]>([]);
  const [labels, setLabels] = useState<Record<string, GpsLocationLabel>>({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Destination history — off by default (it's the heavier, business-wide
  // query + first-time geocoding pass), loaded lazily the first time it's
  // switched on.
  const [showDestinationHistory, setShowDestinationHistory] = useState(false);
  const [destinationDataLoaded, setDestinationDataLoaded] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingLegs, setBookingLegs] = useState<BookingLeg[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [geocodes, setGeocodes] = useState<Record<string, DestinationGeocode>>({});
  const [destinationLoading, setDestinationLoading] = useState(false);
  const [destinationError, setDestinationError] = useState<string | null>(null);
  const [resolveProgress, setResolveProgress] = useState<{ done: number; total: number } | null>(null);

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

  // Load this vehicle's logged location history whenever the selection
  // changes. Cleared entirely for "All Vehicles" — plotting every
  // vehicle's trail at once would just be noise.
  useEffect(() => {
    if (selectedVehicleId === ALL_VEHICLES) {
      setHistory([]);
      setLabels({});
      setHistoryError(null);
      return;
    }
    setHistoryLoading(true);
    setHistoryError(null);
    Promise.all([listGpsLocationEntries(selectedVehicleId), listGpsLocationLabels()])
      .then(([entries, labelMap]) => {
        setHistory(entries);
        setLabels(labelMap);
      })
      .catch((err: unknown) => {
        setHistoryError(err instanceof Error ? err.message : "Couldn't load location history for this vehicle.");
      })
      .finally(() => setHistoryLoading(false));
  }, [selectedVehicleId]);

  const filteredHistory = history
    .filter((e) => {
      const day = e.reading_at.slice(0, 10);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      return true;
    })
    .filter((e) => e.latitude != null && e.longitude != null)
    .sort((a, b) => new Date(a.reading_at).getTime() - new Date(b.reading_at).getTime());

  // Redraw pins + trail line whenever the filtered history changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    historyMarkersRef.current.forEach((m) => m.remove());
    historyMarkersRef.current = [];
    historyLineRef.current?.remove();
    historyLineRef.current = null;

    if (filteredHistory.length === 0) return;

    const points: [number, number][] = filteredHistory.map((e) => [e.latitude as number, e.longitude as number]);

    historyMarkersRef.current = filteredHistory.map((e, i) => {
      const label = labels[e.id]?.formatted_address ?? e.location_text;
      const popup = `
        <strong>#${i + 1}</strong> — ${label}<br/>
        ${formatDateTime(e.reading_at, settings)}<br/>
        ${e.recorded_by_label} (${e.recorded_by_role})
        ${e.duration_minutes != null ? `<br/>Parked ${e.duration_minutes}m` : ""}
      `;
      return L.marker(points[i], { icon: markerIcon(i) }).addTo(map).bindPopup(popup);
    });

    // Leaflet's SVG renderer sets this as a plain "stroke" attribute, not an
    // inline style — CSS custom properties aren't reliably resolved there,
    // so this uses the same fallback hex the numbered pins use rather than
    // var(--fill-accent) directly.
    historyLineRef.current = L.polyline(points, { color: "#378ADD", weight: 3, opacity: 0.7 }).addTo(map);

    map.fitBounds(L.latLngBounds(points).pad(0.2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredHistory, labels, settings]);

  // Loads everything Destination history needs, once, the first time it's
  // switched on — bookings/legs/customers/provinces/municipalities are all
  // business-wide, unlike the per-vehicle GPS trail above.
  useEffect(() => {
    if (!showDestinationHistory || destinationDataLoaded) return;
    setDestinationLoading(true);
    setDestinationError(null);
    Promise.all([
      listBookings(),
      listAllBookingLegs(),
      listCustomers(),
      listProvinces(),
      listMunicipalities(),
      listDestinationGeocodes(),
    ])
      .then(([b, legs, c, p, m, cachedGeocodes]) => {
        setBookings(b);
        setBookingLegs(legs);
        setCustomers(c);
        setProvinces(p);
        setMunicipalities(m);
        setGeocodes(cachedGeocodes);
        setDestinationDataLoaded(true);
      })
      .catch((err: unknown) => {
        setDestinationError(err instanceof Error ? err.message : "Couldn't load destination history.");
      })
      .finally(() => setDestinationLoading(false));
  }, [showDestinationHistory, destinationDataLoaded]);

  // Memoized so this only rebuilds when the underlying data or vehicle
  // filter actually changes — not on every unrelated re-render (typing in
  // the date filter, etc.), which would otherwise tear down and rebuild
  // every destination marker (closing any open popup) each keystroke.
  const destinationPoints: DestinationHistoryPoint[] = useMemo(
    () =>
      destinationDataLoaded
        ? buildDestinationHistory(
            bookings,
            bookingLegs,
            customers,
            vehicles,
            provinces,
            municipalities,
            selectedVehicleId === ALL_VEHICLES ? undefined : selectedVehicleId,
          )
        : [],
    [destinationDataLoaded, bookings, bookingLegs, customers, vehicles, provinces, municipalities, selectedVehicleId],
  );

  // Resolves whatever destinations aren't cached yet, once the aggregate
  // list is known — paced ~1/sec per Nominatim's usage policy (see
  // resolveDestinationGeocodes), so this can take a few seconds the first
  // time a business has many distinct destinations. Every subsequent visit
  // is instant since the cache persists.
  useEffect(() => {
    if (!showDestinationHistory || destinationPoints.length === 0) return;
    const targets = destinationPoints
      .filter((p) => !geocodes[p.locationKey])
      .map((p) => ({ provinceId: p.provinceId, cityId: p.cityId }));
    if (targets.length === 0) return;

    let cancelled = false;
    setDestinationError(null);
    resolveDestinationGeocodes(targets, provinces, municipalities, (done, total) => {
      if (!cancelled) setResolveProgress({ done, total });
    })
      .then(() => listDestinationGeocodes())
      .then((refreshed) => {
        if (!cancelled) setGeocodes(refreshed);
      })
      .catch((err: unknown) => {
        if (!cancelled) setDestinationError(err instanceof Error ? err.message : "Couldn't resolve some destinations.");
      })
      .finally(() => {
        if (!cancelled) setResolveProgress(null);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDestinationHistory, destinationPoints, geocodes, provinces, municipalities]);

  // Redraw destination pins whenever the resolved set changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    destinationMarkersRef.current.forEach((m) => m.remove());
    destinationMarkersRef.current = [];

    if (!showDestinationHistory) return;

    const resolvedPoints = destinationPoints
      .map((point) => ({ point, geocode: geocodes[point.locationKey] }))
      .filter((x): x is { point: DestinationHistoryPoint; geocode: DestinationGeocode } => Boolean(x.geocode));

    if (resolvedPoints.length === 0) return;

    destinationMarkersRef.current = resolvedPoints.map(({ point, geocode }) => {
      const visitRows = point.visits
        .slice(0, 20)
        .map((v) => `${v.ref} — ${v.customerLabel} (${v.vehicleLabel}), ${formatDateTime(v.date, settings)}`)
        .join("<br/>");
      const more = point.visits.length > 20 ? `<br/>+${point.visits.length - 20} more` : "";
      const popup = `
        <strong>${point.label}</strong><br/>
        ${point.visits.length} booking${point.visits.length === 1 ? "" : "s"}<br/><br/>
        ${visitRows}${more}
      `;
      return L.marker([geocode.latitude, geocode.longitude], { icon: destinationPinIcon(point.visits.length) })
        .addTo(map)
        .bindPopup(popup, { maxHeight: 260 });
    });

    // Only auto-fit when the vehicle trail isn't also showing something —
    // two layers both trying to fitBounds on every render would otherwise
    // fight over the view.
    if (filteredHistory.length === 0) {
      const bounds = L.latLngBounds(resolvedPoints.map(({ geocode }) => [geocode.latitude, geocode.longitude] as [number, number]));
      map.fitBounds(bounds.pad(0.2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDestinationHistory, destinationPoints, geocodes, settings]);

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);
  const resolvedDestinationCount = destinationPoints.filter((p) => geocodes[p.locationKey]).length;

  return (
    <div className="space-y-4">
      <div
        className="rounded-md p-3 text-sm"
        style={{ background: "var(--surface-1)", color: "var(--text-muted)" }}
      >
        Live vehicle tracking isn't connected yet. Pick a vehicle below to see its logged location
        history (from Tools &gt; Entries &gt; GPS Log) plotted as a trail instead.
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
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
        </div>

        {selectedVehicleId !== ALL_VEHICLES && (
          <>
            <div>
              <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>From</label>
              <input
                type="date"
                className="rounded-md px-3 py-2 text-sm"
                style={fieldStyle}
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>To</label>
              <input
                type="date"
                className="rounded-md px-3 py-2 text-sm"
                style={fieldStyle}
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            {(dateFrom || dateTo) && (
              <button
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                }}
                className="rounded-md px-3 py-2 text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                Clear dates
              </button>
            )}
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>
              {historyLoading
                ? "Loading history…"
                : filteredHistory.length === 0
                  ? `No logged locations for ${selectedVehicle?.plate_number ?? "this vehicle"}${dateFrom || dateTo ? " in this range" : ""}.`
                  : `${filteredHistory.length} logged location${filteredHistory.length === 1 ? "" : "s"}`}
            </span>
          </>
        )}

        <label className="ml-auto flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={showDestinationHistory}
            onChange={(e) => setShowDestinationHistory(e.target.checked)}
          />
          Destination history
          {selectedVehicleId !== ALL_VEHICLES ? ` (${selectedVehicle?.plate_number ?? "this vehicle"} only)` : ""}
        </label>
      </div>

      {historyError && (
        <p className="text-sm" style={{ color: "var(--text-danger)" }}>{historyError}</p>
      )}

      {showDestinationHistory && (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {destinationLoading
            ? "Loading bookings…"
            : resolveProgress
              ? `Resolving locations… ${resolveProgress.done}/${resolveProgress.total}`
              : destinationPoints.length === 0
                ? "No completed bookings to show yet."
                : `${resolvedDestinationCount} of ${destinationPoints.length} destination${destinationPoints.length === 1 ? "" : "s"} plotted, ${destinationPoints.reduce((n, p) => n + p.visits.length, 0)} booking${destinationPoints.reduce((n, p) => n + p.visits.length, 0) === 1 ? "" : "s"} total.`}
        </p>
      )}

      {destinationError && (
        <p className="text-sm" style={{ color: "var(--text-danger)" }}>{destinationError}</p>
      )}

      <div
        ref={containerRef}
        className="h-[70vh] w-full overflow-hidden rounded-md"
        style={{ border: "0.5px solid var(--border)" }}
      />
    </div>
  );
}
