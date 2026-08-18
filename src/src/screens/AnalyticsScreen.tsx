import { useEffect, useMemo, useState } from "react";
import { listVehicles } from "../lib/repo/vehicles";
import { listBookings } from "../lib/repo/bookings";
import { listAllBookingLegs } from "../lib/repo/bookingLegs";
import { listCustomers } from "../lib/repo/customers";
import { listMileageEntries } from "../lib/repo/mileageEntries";
import { listOdometerReadings } from "../lib/repo/odometerReadings";
import { listGpsLocationEntries } from "../lib/repo/gpsLocationEntries";
import { listGpsLocationLabels } from "../lib/repo/gpsLocationLabels";
import { getBusinessProfile, listMunicipalities, listProvinces } from "../lib/repo/locations";
import { listCustomRates, listRateMatrix, listSeatingBands } from "../lib/repo/rateMatrix";
import { listDestinationGeocodes, resolveDestinationGeocodes } from "../lib/repo/destinationGeocodes";
import { useSettings } from "../lib/settingsContext";
import { formatDate, formatDateTime } from "../lib/dateFormat";
import { formatHoursAsHHMM } from "../lib/duration";
import { buildVehicleAnalytics } from "../lib/vehicleAnalytics";
import { buildDestinationHistory } from "../lib/destinationHistory";
import { buildBookingCorroboration, summarizeCorroboration } from "../lib/bookingGpsCorroboration";
import { buildTrailMetrics } from "../lib/gpsTrailMetrics";
import { buildGpsLogSheet } from "../lib/gpsLogSheet";
import { hqLocationKey, computeHqDisplacement } from "../lib/hqDistance";
import { bookingRef } from "../lib/bookingRef";
import { MiniBarChart, MiniLineChart, type ChartPoint } from "../components/MiniChart";
import type {
  Booking,
  BookingLeg,
  BusinessProfile,
  Customer,
  CustomRate,
  DestinationGeocode,
  GpsLocationEntry,
  GpsLocationLabel,
  MileageEntry,
  Municipality,
  OdometerReading,
  Province,
  RateMatrixRow,
  SeatingBand,
  Vehicle,
} from "../lib/types";

const selectStyle: React.CSSProperties = {
  border: "0.5px solid var(--border-strong)",
  background: "var(--surface-2)",
  color: "var(--text-primary)",
};

function formatMoney(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function formatPercent(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function StatCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "default" | "warning" | "danger" }) {
  const color = tone === "warning" ? "var(--text-warning)" : tone === "danger" ? "var(--text-danger)" : "var(--text-primary)";
  return (
    <div className="rounded-md p-4" style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)" }}>
      <div className="text-sm" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="mt-1 text-2xl font-semibold" style={{ color }}>{value}</div>
      {sub && <div className="mt-0.5 text-sm" style={{ color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-md p-4" style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)" }}>
      <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h3>
      {children}
    </div>
  );
}

export default function AnalyticsScreen() {
  const { settings } = useSettings();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [legs, setLegs] = useState<BookingLeg[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [seatingBands, setSeatingBands] = useState<SeatingBand[]>([]);
  const [rateMatrix, setRateMatrix] = useState<RateMatrixRow[]>([]);
  const [customRates, setCustomRates] = useState<CustomRate[]>([]);
  const [mileageEntries, setMileageEntries] = useState<MileageEntry[]>([]);
  const [odometerReadings, setOdometerReadings] = useState<OdometerReading[]>([]);
  const [gpsEntries, setGpsEntries] = useState<GpsLocationEntry[]>([]);
  const [gpsLabels, setGpsLabels] = useState<Record<string, GpsLocationLabel>>({});
  const [geocodes, setGeocodes] = useState<Record<string, DestinationGeocode>>({});
  const [geocodeResolveProgress, setGeocodeResolveProgress] = useState<{ done: number; total: number } | null>(null);

  const [loading, setLoading] = useState(true);
  const [mileageLoading, setMileageLoading] = useState(false);

  // Everything but mileage/odometer is business-wide reference data + every
  // booking — loaded once, same as Settlements/Remittances do, then sliced
  // per vehicle client-side rather than re-querying per selection.
  useEffect(() => {
    Promise.all([
      listVehicles(),
      listBookings(),
      listAllBookingLegs(),
      listCustomers(),
      listProvinces(),
      listMunicipalities(),
      getBusinessProfile(),
      listSeatingBands(),
      listRateMatrix(),
      listCustomRates(),
      listDestinationGeocodes(),
    ]).then(([v, b, l, c, p, m, profile, bands, matrix, customRts, cachedGeocodes]) => {
      setVehicles(v);
      setBookings(b);
      setLegs(l);
      setCustomers(c);
      setProvinces(p);
      setMunicipalities(m);
      setBusinessProfile(profile);
      setSeatingBands(bands);
      setRateMatrix(matrix);
      setCustomRates(customRts);
      setGeocodes(cachedGeocodes);
      setLoading(false);
    });
  }, []);

  // Mileage/odometer are per-vehicle queries — cheap to re-fetch on
  // selection change rather than pulling the whole fleet's logs up front.
  useEffect(() => {
    if (!selectedVehicleId) {
      setMileageEntries([]);
      setOdometerReadings([]);
      setGpsEntries([]);
      setGpsLabels({});
      return;
    }
    setMileageLoading(true);
    Promise.all([
      listMileageEntries(selectedVehicleId),
      listOdometerReadings(selectedVehicleId),
      listGpsLocationEntries(selectedVehicleId),
      listGpsLocationLabels(),
    ])
      .then(([mileage, odometer, gps, labels]) => {
        setMileageEntries(mileage);
        setOdometerReadings(odometer);
        setGpsEntries(gps);
        setGpsLabels(labels);
      })
      .finally(() => setMileageLoading(false));
  }, [selectedVehicleId]);

  const analytics = useMemo(
    () =>
      selectedVehicleId
        ? buildVehicleAnalytics(
            selectedVehicleId,
            bookings,
            vehicles,
            businessProfile,
            provinces,
            seatingBands,
            rateMatrix,
            customRates,
            dateFrom || undefined,
            dateTo || undefined,
          )
        : null,
    [selectedVehicleId, bookings, legs, vehicles, businessProfile, provinces, seatingBands, rateMatrix, customRates, dateFrom, dateTo],
  );

  // Vehicle + date-range filtered bookings (cancelled excluded), shared by
  // Top destinations and GPS corroboration below so both agree on exactly
  // which bookings are "in view".
  const filteredVehicleBookings = useMemo(() => {
    if (!selectedVehicleId) return [];
    return bookings.filter((b) => {
      if (b.vehicle_id !== selectedVehicleId || b.status === "cancelled") return false;
      const day = b.start_date.slice(0, 10);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      return true;
    });
  }, [selectedVehicleId, bookings, dateFrom, dateTo]);

  const topDestinations = useMemo(() => {
    if (filteredVehicleBookings.length === 0) return [];
    const filteredLegs = legs.filter((l) => filteredVehicleBookings.some((b) => b.id === l.booking_id));
    return buildDestinationHistory(filteredVehicleBookings, filteredLegs, customers, vehicles, provinces, municipalities, selectedVehicleId)
      .sort((a, b) => b.visits.length - a.visits.length)
      .slice(0, 8);
  }, [filteredVehicleBookings, legs, customers, vehicles, provinces, municipalities, selectedVehicleId]);

  const hqKey = hqLocationKey(businessProfile);

  // Resolves whichever of this vehicle's top destinations (plus HQ itself)
  // aren't cached yet — same paced Nominatim batch Map's Destination
  // history uses, just triggered off this vehicle's own top-destinations
  // list instead of the whole business's history.
  useEffect(() => {
    if (topDestinations.length === 0 && !hqKey) return;
    const targets = topDestinations
      .filter((p) => !geocodes[p.locationKey])
      .map((p) => ({ provinceId: p.provinceId, cityId: p.cityId }));
    if (hqKey && !geocodes[hqKey] && businessProfile?.hq_province_id) {
      targets.push({ provinceId: businessProfile.hq_province_id, cityId: businessProfile.hq_city_id });
    }
    if (targets.length === 0) return;

    let cancelled = false;
    resolveDestinationGeocodes(targets, provinces, municipalities, (done, total) => {
      if (!cancelled) setGeocodeResolveProgress({ done, total });
    })
      .then(() => listDestinationGeocodes())
      .then((refreshed) => {
        if (!cancelled) setGeocodes(refreshed);
      })
      .finally(() => {
        if (!cancelled) setGeocodeResolveProgress(null);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topDestinations, hqKey, geocodes, provinces, municipalities, businessProfile]);

  // Distance/tier per top destination, once both it and HQ have resolved
  // coordinates — see lib/hqDistance.ts. Destinations that haven't
  // resolved yet (still mid-batch, or a lookup that failed) simply show no
  // distance rather than blocking the rest of the list.
  const topDestinationsWithHq = useMemo(() => {
    const hqGeocode = hqKey ? geocodes[hqKey] : null;
    return topDestinations.map((d) => {
      const destGeocode = geocodes[d.locationKey];
      const hq =
        hqGeocode && destGeocode && businessProfile?.hq_province_id
          ? computeHqDisplacement(hqGeocode, destGeocode, businessProfile.hq_province_id, provinces)
          : null;
      return { ...d, hq };
    });
  }, [topDestinations, geocodes, hqKey, businessProfile, provinces]);

  const hqDistanceSummary = useMemo(() => {
    const distances = topDestinationsWithHq.filter((d) => d.hq != null).map((d) => ({ label: d.label, km: d.hq!.distanceKm }));
    if (distances.length === 0) return null;
    const avgKm = distances.reduce((sum, d) => sum + d.km, 0) / distances.length;
    const farthest = distances.reduce((max, d) => (d.km > max.km ? d : max), distances[0]);
    return { avgKm, farthest };
  }, [topDestinationsWithHq]);

  // GPS corroboration only means anything for bookings that actually
  // happened (active/completed) — same "did this actually happen" set
  // destinationHistory.ts/vehicleAnalytics.ts already use.
  const corroborationResults = useMemo(() => {
    const realized = filteredVehicleBookings.filter((b) => b.status === "active" || b.status === "completed");
    return realized.map((b) => buildBookingCorroboration(b, gpsEntries, gpsLabels, provinces, municipalities));
  }, [filteredVehicleBookings, gpsEntries, gpsLabels, provinces, municipalities]);

  const corroborationSummary = useMemo(() => summarizeCorroboration(corroborationResults), [corroborationResults]);

  const flaggedBookings = useMemo(
    () =>
      corroborationResults
        .filter((r) => r.status !== "corroborated")
        .map((r) => ({ result: r, booking: filteredVehicleBookings.find((b) => b.id === r.bookingId)! }))
        .sort((a, b) => new Date(b.result.windowStart).getTime() - new Date(a.result.windowStart).getTime()),
    [corroborationResults, filteredVehicleBookings],
  );

  const mileageChartData: ChartPoint[] = useMemo(() => {
    return mileageEntries
      .filter((e) => (!dateFrom || e.period_end >= dateFrom) && (!dateTo || e.period_end <= dateTo))
      .slice()
      .sort((a, b) => a.period_end.localeCompare(b.period_end))
      .map((e) => ({ label: formatDate(e.period_end, settings), value: e.mileage_km }));
  }, [mileageEntries, dateFrom, dateTo, settings]);

  const odometerChartData: ChartPoint[] = useMemo(() => {
    return odometerReadings
      .filter((r) => (!dateFrom || r.reading_at.slice(0, 10) >= dateFrom) && (!dateTo || r.reading_at.slice(0, 10) <= dateTo))
      .slice()
      .sort((a, b) => a.reading_at.localeCompare(b.reading_at))
      .map((r) => ({ label: formatDate(r.reading_at, settings), value: r.reading_km }));
  }, [odometerReadings, dateFrom, dateTo, settings]);

  // Distance/speed estimated from the GPS Log's own trail — a continuous,
  // booking-independent point log (see lib/gpsTrailMetrics.ts). Date-range
  // filtered the same way the mileage/odometer charts above are, so the
  // side-by-side comparison below is apples to apples.
  const trailMetrics = useMemo(() => {
    const inRange = gpsEntries.filter(
      (e) => (!dateFrom || e.reading_at.slice(0, 10) >= dateFrom) && (!dateTo || e.reading_at.slice(0, 10) <= dateTo),
    );
    return buildTrailMetrics(inRange);
  }, [gpsEntries, dateFrom, dateTo]);

  // Side-by-side only, per how this is meant to be used for now — a
  // corroboration signal against what's actually logged in Mileage, not a
  // replacement for it.
  const loggedMileageTotal = useMemo(() => mileageChartData.reduce((sum, p) => sum + p.value, 0), [mileageChartData]);

  // Log sheet — same date-range-filtered entries as the trail metrics
  // above, but run through lib/gpsLogSheet.ts's point-to-adjacent-point
  // math (GPS Log > Log sheet) instead of trailMetrics' gap-skipping one,
  // so these two charts show the exact same numbers that tab's table does.
  // Rows with nothing to compute (no previous point, or either point
  // missing coordinates) are simply left out of each chart rather than
  // plotted as zero.
  const logSheetRows = useMemo(() => {
    const inRange = gpsEntries.filter(
      (e) => (!dateFrom || e.reading_at.slice(0, 10) >= dateFrom) && (!dateTo || e.reading_at.slice(0, 10) <= dateTo),
    );
    return buildGpsLogSheet(inRange);
  }, [gpsEntries, dateFrom, dateTo]);

  const logSheetDistanceChart: ChartPoint[] = useMemo(
    () =>
      logSheetRows
        .filter((r) => r.distanceKm != null)
        .map((r) => ({ label: formatDate(r.entry.reading_at, settings), value: r.distanceKm as number })),
    [logSheetRows, settings],
  );

  const logSheetSpeedChart: ChartPoint[] = useMemo(
    () =>
      logSheetRows
        .filter((r) => r.speedKmh != null)
        .map((r) => ({ label: formatDate(r.entry.reading_at, settings), value: r.speedKmh as number })),
    [logSheetRows, settings],
  );

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);

  return (
    <div className="space-y-4">
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
            <option value="">Select a vehicle…</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate_number}
                {[v.make, v.model].filter(Boolean).length > 0 ? ` — ${[v.make, v.model].filter(Boolean).join(" ")}` : ""}
              </option>
            ))}
          </select>
        </div>

        {selectedVehicleId && (
          <>
            <div>
              <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>From</label>
              <input
                type="date"
                className="rounded-md px-3 py-2 text-sm"
                style={selectStyle}
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
                style={selectStyle}
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
          </>
        )}
      </div>

      {loading ? (
        <p className="text-base" style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : !selectedVehicleId ? (
        <p className="text-base" style={{ color: "var(--text-muted)" }}>
          Pick a vehicle above to see its revenue, utilization, overtime and mileage history.
        </p>
      ) : analytics ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            {selectedVehicle?.plate_number}
            {selectedVehicle && [selectedVehicle.make, selectedVehicle.model].filter(Boolean).length > 0
              ? ` — ${[selectedVehicle.make, selectedVehicle.model].filter(Boolean).join(" ")}`
              : ""}
          </h2>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Bookings" value={String(analytics.bookingCount)} sub={`${analytics.realizedBookingCount} realized`} />
            <StatCard label="Total collected" value={formatMoney(analytics.totalCollected)} sub={`of ${formatMoney(analytics.totalExpected)} expected`} />
            <StatCard
              label="Avg revenue / booking"
              value={analytics.avgRevenuePerBooking != null ? formatMoney(analytics.avgRevenuePerBooking) : "—"}
            />
            <StatCard
              label="Outstanding overtime"
              value={formatMoney(analytics.outstandingOvertime)}
              sub={analytics.unsettledOvertimeCount > 0 ? `${analytics.unsettledOvertimeCount} unsettled` : undefined}
              tone={analytics.outstandingOvertime > 0 ? "danger" : "default"}
            />
            <StatCard
              label="Outstanding receivable"
              value={formatMoney(analytics.outstandingReceivable)}
              tone={analytics.outstandingReceivable > 0 ? "warning" : "default"}
            />
          </div>

          <Section title="Revenue by month">
            <MiniBarChart data={analytics.revenueByMonth} color="#378ADD" valueFormatter={(n) => formatMoney(n)} emptyMessage="No revenue recorded yet." />
          </Section>

          <Section title="Bookings by month">
            <MiniBarChart data={analytics.bookingsByMonth} color="#22C55E" valueFormatter={(n) => String(Math.round(n))} emptyMessage="No bookings yet." />
          </Section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Section title="Utilization">
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Total rented time" value={formatHoursAsHHMM(analytics.totalRentedHours)} />
                <StatCard label="Avg rental length" value={analytics.avgRentalHours != null ? formatHoursAsHHMM(analytics.avgRentalHours) : "—"} />
              </div>
            </Section>

            <Section title="Overtime behavior">
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  label="Overtime rate"
                  value={analytics.overtimeRate != null ? formatPercent(analytics.overtimeRate) : "—"}
                  sub={`${analytics.overtimeBookingCount} of ${analytics.realizedBookingCount} bookings`}
                />
                <StatCard label="Total overtime" value={formatHoursAsHHMM(analytics.totalOvertimeHours)} sub={`${formatMoney(analytics.totalOvertimeCollected)} collected`} />
              </div>
            </Section>
          </div>

          <Section title="Top destinations &amp; distance from HQ">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Straight-line distance from headquarters to each destination (city/province-center precision on
              both ends — a gut-check figure, not routing-grade) alongside the existing Tier the destination
              already prices at.
            </p>
            {geocodeResolveProgress && (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Resolving locations… {geocodeResolveProgress.done}/{geocodeResolveProgress.total}
              </p>
            )}
            {hqDistanceSummary && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
                <StatCard label="Avg distance from HQ" value={`${Math.round(hqDistanceSummary.avgKm)} km`} />
                <StatCard label="Farthest destination" value={`${Math.round(hqDistanceSummary.farthest.km)} km`} sub={hqDistanceSummary.farthest.label} />
              </div>
            )}
            {topDestinationsWithHq.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>No completed bookings in range.</p>
            ) : (
              <div className="space-y-2">
                {topDestinationsWithHq.map((d) => (
                  <div key={d.locationKey} className="flex items-center justify-between text-sm">
                    <span style={{ color: "var(--text-primary)" }}>{d.label}</span>
                    <span style={{ color: "var(--text-muted)" }}>
                      {d.hq ? `${Math.round(d.hq.distanceKm)} km${d.hq.tier != null ? ` (Tier ${d.hq.tier})` : ""} · ` : ""}
                      {d.visits.length} booking{d.visits.length === 1 ? "" : "s"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="GPS corroboration">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Whether each completed/active booking has a matching GPS Log entry (Tools &gt; Entries) logged
              during its actual window — a soft cross-check, not a precise link.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                label="Corroboration rate"
                value={corroborationSummary.corroborationRate != null ? formatPercent(corroborationSummary.corroborationRate) : "—"}
                sub={`${corroborationSummary.total} realized bookings`}
              />
              <StatCard label="Corroborated" value={String(corroborationSummary.corroborated)} />
              <StatCard
                label="Unverified"
                value={String(corroborationSummary.unverified)}
                sub="no GPS logged"
                tone={corroborationSummary.unverified > 0 ? "warning" : "default"}
              />
              <StatCard
                label="Possible mismatch"
                value={String(corroborationSummary.possibleMismatch)}
                sub="logged text doesn't mention destination"
                tone={corroborationSummary.possibleMismatch > 0 ? "danger" : "default"}
              />
            </div>

            {flaggedBookings.length > 0 && (
              <div className="mt-2 space-y-2">
                <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Flagged bookings</p>
                {flaggedBookings.slice(0, 15).map(({ result, booking }) => (
                  <div key={booking.id} className="flex items-center justify-between text-sm">
                    <span style={{ color: "var(--text-primary)" }}>
                      {bookingRef(booking.id)} — {formatDateTime(booking.start_date, settings)}
                    </span>
                    <span style={{ color: result.status === "unverified" ? "var(--text-warning)" : "var(--text-danger)" }}>
                      {result.status === "unverified" ? "No GPS logged" : "Possible mismatch"}
                    </span>
                  </div>
                ))}
                {flaggedBookings.length > 15 && (
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>+{flaggedBookings.length - 15} more</p>
                )}
              </div>
            )}
          </Section>

          <Section title="GPS trail — distance &amp; speed">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Estimated from consecutive GPS Log points (Tools &gt; Entries) — distance via straight-line
              coordinates, speed off the moving time between them (each point's own logged parking time is
              excluded from that gap). The GPS Log is a continuous, booking-independent trail — this has
              nothing to do with which booking, if any, was active at the time.
            </p>
            {mileageLoading ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCard label="GPS-estimated distance" value={`${Math.round(trailMetrics.totalDistanceKm)} km`} sub={`${trailMetrics.segments.length} trail segment${trailMetrics.segments.length === 1 ? "" : "s"}`} />
                  <StatCard label="Logged mileage (same range)" value={`${Math.round(loggedMileageTotal)} km`} sub="side-by-side only, for now" />
                  <StatCard label="Avg moving speed" value={trailMetrics.avgSpeedKmh != null ? `${Math.round(trailMetrics.avgSpeedKmh)} km/h` : "—"} />
                  <StatCard label="Max speed" value={trailMetrics.maxSpeedKmh != null ? `${Math.round(trailMetrics.maxSpeedKmh)} km/h` : "—"} />
                </div>
                <MiniBarChart
                  data={trailMetrics.segments.map((s) => ({ label: formatDate(s.to.reading_at, settings), value: s.distanceKm }))}
                  color="#EC4899"
                  valueFormatter={(n) => `${n.toFixed(1)} km`}
                  emptyMessage="Not enough GPS points with coordinates to estimate a trail yet."
                />
              </>
            )}
          </Section>

          <Section title="GPS log sheet — distance &amp; speed per point">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              The digitized GPS log sheet (Tools &gt; GPS Log &gt; Log sheet), charted — each point's distance
              and speed relative to the point directly before it, rather than the nearest coordinate-having one.
              Points with nothing to compare against are left off rather than plotted as zero.
            </p>
            {mileageLoading ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Distance between points</p>
                  <MiniLineChart data={logSheetDistanceChart} color="#0EA5E9" valueFormatter={(n) => `${n.toFixed(1)} km`} emptyMessage="No point-to-point distances yet." />
                </div>
                <div>
                  <p className="mb-1.5 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Speed between points</p>
                  <MiniLineChart data={logSheetSpeedChart} color="#F97316" valueFormatter={(n) => `${Math.round(n)} km/h`} emptyMessage="No point-to-point speeds yet." />
                </div>
              </div>
            )}
          </Section>

          <Section title="Mileage log">
            {mileageLoading ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
            ) : (
              <MiniBarChart data={mileageChartData} color="#F59E0B" valueFormatter={(n) => `${Math.round(n)} km`} emptyMessage="No mileage entries logged yet." />
            )}
          </Section>

          <Section title="Odometer readings">
            {mileageLoading ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
            ) : (
              <MiniLineChart data={odometerChartData} color="#A855F7" valueFormatter={(n) => `${Math.round(n)} km`} emptyMessage="No odometer readings logged yet." />
            )}
          </Section>
        </div>
      ) : null}
    </div>
  );
}
