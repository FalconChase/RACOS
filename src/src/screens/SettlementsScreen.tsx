import { useEffect, useMemo, useState } from "react";
import { listBookings } from "../lib/repo/bookings";
import { listVehicles } from "../lib/repo/vehicles";
import { listCustomers } from "../lib/repo/customers";
import { getBusinessProfile, listMunicipalities, listProvinces } from "../lib/repo/locations";
import { listCustomRates, listRateMatrix, listSeatingBands } from "../lib/repo/rateMatrix";
import { useSettings } from "../lib/settingsContext";
import { formatDateTime } from "../lib/dateFormat";
import { exactHoursBetween, formatHHMM, formatHoursAsHHMM, roundToNearestHalfHour } from "../lib/duration";
import { computeExpectedPayment, resolveBookingRate } from "../lib/pricing";
import { bookingRef } from "../lib/bookingRef";
import { destinationLabel } from "../lib/destinationLabel";
import RemittancesReport from "./RemittancesReport";
import type {
  Booking,
  BookingStatus,
  BusinessProfile,
  Customer,
  CustomRate,
  Municipality,
  Province,
  RateMatrixRow,
  SeatingBand,
  Vehicle,
} from "../lib/types";

type Subtab = "records" | "remittances";

// Same plain-status pill colors BookingsScreen/HomeScreen use, so a booking
// reads identically wherever it shows up.
const STATUS_STYLES: Record<BookingStatus, { bg: string; color: string }> = {
  pending: { bg: "var(--bg-warning)", color: "var(--text-warning)" },
  confirmed: { bg: "var(--bg-accent)", color: "var(--text-accent)" },
  active: { bg: "var(--bg-success)", color: "var(--text-success)" },
  completed: { bg: "var(--surface-1)", color: "var(--text-muted)" },
  cancelled: { bg: "var(--bg-danger)", color: "var(--text-danger)" },
};

const COLUMNS = [
  "Ref",
  "Unit",
  "Lessee",
  "Status",
  "ETD",
  "ETA",
  "Duration",
  "Overtime",
  "Total time",
  "Destination",
  "Expected payment",
  "Payment",
];

// Trims float noise from rate/hour math without forcing pesos-only display —
// same helper BookingsScreen keeps locally for the same reason.
function formatMoney(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

export default function SettlementsScreen() {
  const { settings } = useSettings();
  // Only one subtab exists today, but it's rendered as a real subtab bar
  // (same pattern as Rentals' Ongoing/History) so a second one — Owner
  // Payouts, say — can land later without restructuring this screen.
  const [subtab, setSubtab] = useState<Subtab>("records");

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [seatingBands, setSeatingBands] = useState<SeatingBand[]>([]);
  const [rateMatrix, setRateMatrix] = useState<RateMatrixRow[]>([]);
  const [customRates, setCustomRates] = useState<CustomRate[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      listBookings(),
      listVehicles(),
      listCustomers(),
      listProvinces(),
      getBusinessProfile(),
      listSeatingBands(),
      listRateMatrix(),
      listCustomRates(),
      listMunicipalities(),
    ]).then(([b, v, c, p, profile, bands, matrix, customRts, munis]) => {
      setBookings(b);
      setVehicles(v);
      setCustomers(c);
      setProvinces(p);
      setBusinessProfile(profile);
      setSeatingBands(bands);
      setRateMatrix(matrix);
      setCustomRates(customRts);
      setMunicipalities(munis);
      setLoading(false);
    });
  }, []);

  function vehicleLabel(id: string) {
    return vehicles.find((v) => v.id === id)?.plate_number ?? "—";
  }
  function customerLabel(id: string) {
    return customers.find((c) => c.id === id)?.full_name ?? "—";
  }

  function rowRate(booking: Booking): number | null {
    return resolveBookingRate(booking, vehicles, businessProfile, provinces, seatingBands, rateMatrix, customRates);
  }

  // listBookings() returns every status ordered start_date desc — cancelled
  // bookings are excluded here since they never actually settled anything
  // and already have a home in Rentals > History.
  const rows = useMemo(() => bookings.filter((b) => b.status !== "cancelled"), [bookings]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-md p-1 print:hidden" style={{ background: "var(--surface-1)" }}>
        {(["records", "remittances"] as Subtab[]).map((t) => (
          <button
            key={t}
            onClick={() => setSubtab(t)}
            className="rounded px-4 py-1.5 text-sm font-medium capitalize"
            style={
              subtab === t
                ? { background: "var(--fill-primary)", color: "var(--on-primary)" }
                : { color: "var(--text-secondary)" }
            }
          >
            {t}
          </button>
        ))}
      </div>

      {subtab === "remittances" && <RemittancesReport />}

      {subtab === "records" &&
        (loading ? (
          <p className="text-base" style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-base" style={{ color: "var(--text-muted)" }}>No bookings recorded yet.</p>
        ) : (
          <table className="w-full border-collapse text-left text-base">
            <thead>
              <tr style={{ background: "var(--surface-1)" }}>
                {COLUMNS.map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2.5 font-semibold"
                    style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const start = new Date(b.start_date);
                const end = new Date(b.end_date);
                const actualDeparture = b.actual_departure_at ? new Date(b.actual_departure_at) : null;
                const actualReturn = b.actual_return_at ? new Date(b.actual_return_at) : null;

                // Overtime/Total time/recomputed Expected payment only exist
                // once a booking has actually closed out — a still-open
                // booking shows "—" rather than a live-ticking guess here;
                // Records reflects settled state, not the live ops view.
                const settled = b.status === "completed" && actualDeparture !== null && actualReturn !== null;

                const duration = formatHHMM(start, end);
                // Overtime bills at the nearest half hour, not to the exact
                // minute — an exact "6h24m" overtime span would otherwise
                // produce a messy non-round peso amount once run through the
                // rate. The base scheduled Duration above stays exact.
                const durationHours = exactHoursBetween(start, end);
                const rawOvertimeHours = settled ? exactHoursBetween(end, actualReturn!) : 0;
                const overtimeHours = roundToNearestHalfHour(rawOvertimeHours);
                const overtime = !settled ? "—" : overtimeHours > 0 ? formatHoursAsHHMM(overtimeHours) : "00:00";
                const totalTime = settled ? formatHoursAsHHMM(durationHours + overtimeHours) : "—";

                const rate = rowRate(b);
                const recomputedExpected =
                  settled && rate != null ? computeExpectedPayment(rate, durationHours + overtimeHours) : null;
                const expectedPaymentText =
                  recomputedExpected != null ? formatMoney(recomputedExpected) : b.expected_payment ?? "—";

                const hasArrivalDiff = actualReturn !== null && actualReturn.getTime() !== end.getTime();
                const overtimeColor = overtime !== "—" && overtime !== "00:00" ? "var(--text-danger)" : "var(--text-secondary)";
                const statusStyle = STATUS_STYLES[b.status];

                // Payment shown as one received total (base rental +
                // overtime top-up collected on Mark returned), with the
                // overtime portion broken out underneath when it exists.
                const basePayment = b.payment_amount ? Number(b.payment_amount) : null;
                const additionalPayment = b.additional_payment ? Number(b.additional_payment) : null;
                const paymentTotal =
                  basePayment != null || additionalPayment != null ? (basePayment ?? 0) + (additionalPayment ?? 0) : null;

                return (
                  <tr key={b.id}>
                    <td className="px-3 py-2.5 font-mono text-sm" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>
                      {bookingRef(b.id)}
                    </td>
                    <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>
                      {vehicleLabel(b.vehicle_id)}
                    </td>
                    <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>
                      {customerLabel(b.customer_id)}
                    </td>
                    <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)" }}>
                      <span
                        className="rounded-full px-3 py-1.5 text-sm font-medium"
                        style={{ background: statusStyle.bg, color: statusStyle.color }}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>
                      {formatDateTime(b.start_date, settings)}
                    </td>
                    <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>
                      {formatDateTime(b.end_date, settings)}
                      {hasArrivalDiff && (
                        <div
                          className="mt-1 text-sm"
                          style={{ color: actualReturn!.getTime() > end.getTime() ? "var(--text-danger)" : "var(--text-success)" }}
                        >
                          actual: {formatDateTime(b.actual_return_at as string, settings)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-sm" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>
                      {duration}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-sm" style={{ border: "0.5px solid var(--border)", color: overtimeColor }}>
                      {overtime}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-sm" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>
                      {totalTime}
                    </td>
                    <td
                      className="px-3 py-2.5"
                      style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}
                      title={rate != null ? `Rate: ${formatMoney(rate)}` : undefined}
                    >
                      {destinationLabel(b, provinces, municipalities)}
                    </td>
                    <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>
                      {expectedPaymentText}
                    </td>
                    <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>
                      {paymentTotal != null ? formatMoney(paymentTotal) : "—"}
                      {additionalPayment != null && (
                        <div className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                          incl. {formatMoney(additionalPayment)} overtime
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ))}
    </div>
  );
}
