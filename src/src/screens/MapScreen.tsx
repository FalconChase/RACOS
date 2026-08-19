import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { listVehicles } from "../lib/repo/vehicles";
import { listGpsLocationEntries } from "../lib/repo/gpsLocationEntries";
import { listGpsLocationLabels } from "../lib/repo/gpsLocationLabels";
import { listBookings } from "../lib/repo/bookings";
import { listAllBookingLegs } from "../lib/repo/bookingLegs";
import { listCustomers } from "../lib/repo/customers";
import { getBusinessProfile, listMunicipalities, listProvinces } from "../lib/repo/locations";
import { listDestinationGeocodes, resolveDestinationGeocodes, geocodeDestination, buildLocationKey } from "../lib/repo/destinationGeocodes";
import { resolveRegionRepresentativePoint, buildRegionLocationKey } from "../lib/repo/regionRepresentativePoints";
import { buildDestinationHistory, type DestinationHistoryPoint } from "../lib/destinationHistory";
import { buildBookingCorroboration, type BookingCorroboration } from "../lib/bookingGpsCorroboration";
import { hqLocationKey, computeHqDisplacement } from "../lib/hqDistance";
import { bookingRef } from "../lib/bookingRef";
import { destinationLabel } from "../lib/destinationLabel";
import { useSettings } from "../lib/settingsContext";
import { formatDateTime } from "../lib/dateFormat";
import type {
  Booking,
  BookingLeg,
  BusinessProfile,
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

// Headquarters — the origin/datum every displacement figure is measured
// from (see lib/hqDistance.ts). A star, not a teardrop or bullseye, so it
// reads as "home base" at a glance among the other two pin styles.
function hqPinIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `
      <div style="position:relative;width:30px;height:30px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5));">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="#EAB308" stroke="white" stroke-width="1.5">
          <path d="M12 2 14.9 8.6 22 9.3 16.7 14 18.2 21 12 17.3 5.8 21 7.3 14 2 9.3 9.1 8.6Z"/>
        </svg>
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

// The selected booking's destination, for Booking vs GPS comparison — a
// bullseye rather than a teardrop so it reads as "the target" next to the
// highlighted GPS points, not another entry in the destination-history layer.
function bookingTargetIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="width:26px;height:26px;border-radius:50%;background:#F97316;border:3px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.5);"></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

export default function MapScreen() {
  const { settings } = useSettings();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const historyMarkersRef = useRef<L.Marker[]>([]);
  const historyLineRef = useRef<L.Polyline | null>(null);
  const destinationMarkersRef = useRef<L.Marker[]>([]);
  const comparisonMarkersRef = useRef<L.Layer[]>([]);
  const hqMarkerRef = useRef<L.Marker | null>(null);

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(ALL_VEHICLES);
  const [history, setHistory] = useState<GpsLocationEntry[]>([]);
  const [labels, setLabels] = useState<Record<string, GpsLocationLabel>>({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Booking/destination reference data — bookings, legs, customers,
  // provinces, municipalities, the geocode cache — loaded once on mount,
  // needed unconditionally now (both Destination history and Booking vs
  // GPS below depend on it), not just when Destination history is toggled
  // on.
  const [bookingDataLoaded, setBookingDataLoaded] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingLegs, setBookingLegs] = useState<BookingLeg[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [geocodes, setGeocodes] = useState<Record<string, DestinationGeocode>>({});
  const [bookingDataError, setBookingDataError] = useState<string | null>(null);

  // Headquarters — the origin/datum for every displacement figure (see
  // lib/hqDistance.ts). Resolved once, on demand, the same single-lookup
  // way the selected booking's destination is below — it's one fixed
  // point, not a paced batch.
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [hqGeocodeLoading, setHqGeocodeLoading] = useState(false);
  const [hqGeocodeError, setHqGeocodeError] = useState<string | null>(null);

  // Destination history layer — off by default, since resolving every
  // not-yet-cached destination is the heavier, paced Nominatim pass.
  const [showDestinationHistory, setShowDestinationHistory] = useState(false);
  const [destinationError, setDestinationError] = useState<string | null>(null);
  const [resolveProgress, setResolveProgress] = useState<{ done: number; total: number } | null>(null);

  // Booking vs GPS Log — pick one of the selected vehicle's realized
  // bookings and see its booked destination pinned next to whichever GPS
  // Log entries fall inside its actual window (see
  // lib/bookingGpsCorroboration.ts).
  const [selectedBookingId, setSelectedBookingId] = useState<string>("");
  const [bookingGeocodeLoading, setBookingGeocodeLoading] = useState(false);
  const [bookingGeocodeError, setBookingGeocodeError] = useState<string | null>(null);

  useEffect(() => {
    listVehicles().then(setVehicles);
  }, []);

  // Same booking/reference data Destination history uses, just loaded
  // unconditionally now — Booking vs GPS needs the vehicle's booking list
  // even before Destination history is ever switched on.
  useEffect(() => {
    setBookingDataError(null);
    Promise.all([
      listBookings(),
      listAllBookingLegs(),
      listCustomers(),
      listProvinces(),
      listMunicipalities(),
      listDestinationGeocodes(),
      getBusinessProfile(),
    ])
      .then(([b, legs, c, p, m, cachedGeocodes, profile]) => {
        setBookings(b);
        setBookingLegs(legs);
        setCustomers(c);
        setProvinces(p);
        setMunicipalities(m);
        setGeocodes(cachedGeocodes);
        setBusinessProfile(profile);
        setBookingDataLoaded(true);
      })
      .catch((err: unknown) => {
        setBookingDataError(err instanceof Error ? err.message : "Couldn't load booking data.");
      });
  }, []);

  // Picking a different vehicle invalidates whatever booking was selected
  // for comparison — it belonged to the previous vehicle's list.
  useEffect(() => {
    setSelectedBookingId("");
  }, [selectedVehicleId]);

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

  const hqKey = hqLocationKey(businessProfile);
  const hqGeocode = hqKey ? geocodes[hqKey] : null;

  // Resolves HQ's coordinates on demand, once — a single fixed lookup, not
  // the paced batch Destination history runs for every past destination.
  useEffect(() => {
    if (!businessProfile?.hq_province_id || hqGeocode) return;
    let cancelled = false;
    setHqGeocodeLoading(true);
    setHqGeocodeError(null);
    geocodeDestination(businessProfile.hq_province_id, businessProfile.hq_city_id, provinces, municipalities)
      .then((geocode) => {
        if (cancelled) return;
        setGeocodes((prev) => ({ ...prev, [geocode.location_key]: geocode }));
      })
      .catch((err: unknown) => {
        if (!cancelled) setHqGeocodeError(err instanceof Error ? err.message : "Couldn't resolve HQ's location.");
      })
      .finally(() => {
        if (!cancelled) setHqGeocodeLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessProfile, hqGeocode, provinces, municipalities]);

  // Renders the HQ pin — always shown once resolved, independent of every
  // other toggle here, since it's a fixed reference point rather than a
  // filtered layer.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    hqMarkerRef.current?.remove();
    hqMarkerRef.current = null;

    if (!hqGeocode) return;

    hqMarkerRef.current = L.marker([hqGeocode.latitude, hqGeocode.longitude], { icon: hqPinIcon(), zIndexOffset: 1000 })
      .addTo(map)
      .bindPopup(`<strong>Headquarters</strong><br/>${hqGeocode.display_name}`);
  }, [hqGeocode]);

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

  // Memoized so this only rebuilds when the underlying data or vehicle
  // filter actually changes — not on every unrelated re-render (typing in
  // the date filter, etc.), which would otherwise tear down and rebuild
  // every destination marker (closing any open popup) each keystroke.
  const destinationPoints: DestinationHistoryPoint[] = useMemo(
    () =>
      bookingDataLoaded
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
    [bookingDataLoaded, bookings, bookingLegs, customers, vehicles, provinces, municipalities, selectedVehicleId],
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
      const hqLine =
        hqGeocode && businessProfile?.hq_province_id
          ? (() => {
              const d = computeHqDisplacement(hqGeocode, geocode, businessProfile.hq_province_id as string, provinces);
              return `${d.distanceKm.toFixed(0)} km from HQ${d.tier != null ? ` (Tier ${d.tier})` : ""}<br/><br/>`;
            })()
          : "";
      const popup = `
        <strong>${point.label}</strong><br/>
        ${point.visits.length} booking${point.visits.length === 1 ? "" : "s"}<br/>
        ${hqLine}
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
  }, [showDestinationHistory, destinationPoints, geocodes, settings, hqGeocode, businessProfile, provinces]);

  // This vehicle's realized (active/completed) bookings — the only ones
  // Booking vs GPS can say anything about, same set the corroboration
  // helper itself only computes for.
  const vehicleBookingOptions = useMemo(
    () =>
      selectedVehicleId === ALL_VEHICLES
        ? []
        : bookings
            .filter((b) => b.vehicle_id === selectedVehicleId && (b.status === "active" || b.status === "completed"))
            .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()),
    [bookings, selectedVehicleId],
  );

  const selectedBooking = bookings.find((b) => b.id === selectedBookingId) ?? null;

  // Uses the vehicle's full GPS history (`history`, not the date-filtered
  // `filteredHistory`) — the booking's own window is the relevant range
  // here, independent of whatever date filter the trail layer above has set.
  const corroboration: BookingCorroboration | null = useMemo(
    () => (selectedBooking ? buildBookingCorroboration(selectedBooking, history, labels, provinces, municipalities) : null),
    [selectedBooking, history, labels, provinces, municipalities],
  );

  const selectedBookingLocationKey = selectedBooking?.destination_province_id
    ? buildLocationKey(selectedBooking.destination_province_id, selectedBooking.destination_city_id)
    : selectedBooking?.destination_region_name
      ? buildRegionLocationKey(selectedBooking.destination_region_name)
      : null;
  const selectedBookingGeocode = selectedBookingLocationKey ? geocodes[selectedBookingLocationKey] : null;

  // Resolves the selected booking's destination on demand — a single
  // lookup, not the paced batch Destination history runs, since this is
  // one specific place the person just asked to compare, not "everything".
  // A region-level pick (ROT052 Phase 2) resolves its cached/computed
  // "representative point" instead of a direct province/city geocode —
  // needs HQ already resolved (hqGeocode), since the representative point
  // is defined relative to HQ (farthest province in the region from it).
  useEffect(() => {
    if (!selectedBooking || selectedBookingGeocode) return;
    let cancelled = false;

    if (selectedBooking.destination_province_id) {
      setBookingGeocodeLoading(true);
      setBookingGeocodeError(null);
      geocodeDestination(selectedBooking.destination_province_id, selectedBooking.destination_city_id, provinces, municipalities)
        .then((geocode) => {
          if (cancelled) return;
          setGeocodes((prev) => ({ ...prev, [geocode.location_key]: geocode }));
        })
        .catch((err: unknown) => {
          if (!cancelled) setBookingGeocodeError(err instanceof Error ? err.message : "Couldn't resolve this destination.");
        })
        .finally(() => {
          if (!cancelled) setBookingGeocodeLoading(false);
        });
    } else if (selectedBooking.destination_region_name && hqGeocode && businessProfile?.hq_province_id) {
      setBookingGeocodeLoading(true);
      setBookingGeocodeError(null);
      resolveRegionRepresentativePoint(
        selectedBooking.destination_region_name,
        hqGeocode,
        businessProfile.hq_province_id,
        businessProfile.hq_city_id,
        provinces,
        municipalities,
      )
        .then((geocode) => {
          if (cancelled) return;
          setGeocodes((prev) => ({ ...prev, [geocode.location_key]: geocode }));
        })
        .catch((err: unknown) => {
          if (!cancelled) setBookingGeocodeError(err instanceof Error ? err.message : "Couldn't resolve this region's representative point.");
        })
        .finally(() => {
          if (!cancelled) setBookingGeocodeLoading(false);
        });
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBooking, selectedBookingGeocode, provinces, municipalities, hqGeocode, businessProfile]);

  // Redraw the comparison layer — the booked-destination pin plus a
  // highlight ring around whichever GPS trail markers actually corroborate
  // it — whenever the selected booking or what's known about it changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    comparisonMarkersRef.current.forEach((m) => m.remove());
    comparisonMarkersRef.current = [];

    if (!selectedBooking) return;

    const layers: L.Layer[] = [];

    if (selectedBookingGeocode) {
      const hqLine =
        hqGeocode && businessProfile?.hq_province_id
          ? (() => {
              const d = computeHqDisplacement(hqGeocode, selectedBookingGeocode, businessProfile.hq_province_id as string, provinces);
              return `<br/>${d.distanceKm.toFixed(0)} km from HQ${d.tier != null ? ` (Tier ${d.tier})` : ""}`;
            })()
          : "";
      const popup = `<strong>Booked destination</strong><br/>${destinationLabel(selectedBooking, provinces, municipalities)}${hqLine}`;
      layers.push(
        L.marker([selectedBookingGeocode.latitude, selectedBookingGeocode.longitude], { icon: bookingTargetIcon() })
          .addTo(map)
          .bindPopup(popup),
      );
    }

    const matchedWithCoords = (corroboration?.matchedEntries ?? []).filter((e) => e.latitude != null && e.longitude != null);
    for (const entry of matchedWithCoords) {
      layers.push(
        L.circleMarker([entry.latitude as number, entry.longitude as number], {
          radius: 14,
          color: "#22C55E",
          weight: 3,
          fill: false,
        }).addTo(map),
      );
    }

    comparisonMarkersRef.current = layers;

    const boundsPoints: [number, number][] = [];
    if (selectedBookingGeocode) boundsPoints.push([selectedBookingGeocode.latitude, selectedBookingGeocode.longitude]);
    for (const entry of matchedWithCoords) boundsPoints.push([entry.latitude as number, entry.longitude as number]);
    if (boundsPoints.length > 0) {
      map.fitBounds(L.latLngBounds(boundsPoints).pad(0.3));
    }
  }, [selectedBooking, selectedBookingGeocode, corroboration, provinces, municipalities, hqGeocode, businessProfile]);

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

      {selectedVehicleId !== ALL_VEHICLES && (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Compare booking vs GPS Log
            </label>
            <select
              value={selectedBookingId}
              onChange={(e) => setSelectedBookingId(e.target.value)}
              className="rounded-md px-3 py-2 text-sm"
              style={{ ...selectStyle, minWidth: 260 }}
            >
              <option value="">None</option>
              {vehicleBookingOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  {bookingRef(b.id)} — {formatDateTime(b.start_date, settings)} — {destinationLabel(b, provinces, municipalities)}
                </option>
              ))}
            </select>
          </div>

          {selectedBooking && (
            <span
              className="text-sm"
              style={{
                color:
                  bookingGeocodeLoading || !corroboration
                    ? "var(--text-muted)"
                    : corroboration.status === "corroborated"
                      ? "var(--text-success)"
                      : corroboration.status === "possible_mismatch"
                        ? "var(--text-danger)"
                        : "var(--text-warning)",
              }}
            >
              {bookingGeocodeLoading
                ? "Resolving booked destination…"
                : bookingGeocodeError
                  ? bookingGeocodeError
                  : corroboration?.status === "corroborated"
                    ? `Corroborated — ${corroboration.matchedEntries.length} matching GPS Log entr${corroboration.matchedEntries.length === 1 ? "y" : "ies"}.`
                    : corroboration?.status === "possible_mismatch"
                      ? `Possible mismatch — ${corroboration.matchedEntries.length} GPS Log entr${corroboration.matchedEntries.length === 1 ? "y" : "ies"} logged, none mention the booked destination.`
                      : "Unverified — no GPS Log entries logged during this booking's window."}
            </span>
          )}
        </div>
      )}

      {historyError && (
        <p className="text-sm" style={{ color: "var(--text-danger)" }}>{historyError}</p>
      )}
      {bookingDataError && (
        <p className="text-sm" style={{ color: "var(--text-danger)" }}>{bookingDataError}</p>
      )}
      {hqGeocodeLoading && (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Resolving HQ's location…</p>
      )}
      {hqGeocodeError && (
        <p className="text-sm" style={{ color: "var(--text-danger)" }}>{hqGeocodeError}</p>
      )}

      {showDestinationHistory && (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {!bookingDataLoaded
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
