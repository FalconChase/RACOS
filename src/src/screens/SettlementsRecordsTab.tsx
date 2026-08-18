// Records — moved here verbatim from Settlements > Records (see
// LogsHubScreen.tsx). Same booking ledger table, same logic, same look;
// only its home in the nav changed, grouped with Tools > Logs under a new
// top-level Logs tab to cut sidebar clutter.

import { useEffect, useMemo, useState } from "react";
import { correctBookingPayment, listBookings, markBookingPaid } from "../lib/repo/bookings";
import { listAllBookingLegs } from "../lib/repo/bookingLegs";
import { listVehicles } from "../lib/repo/vehicles";
import { listCustomers } from "../lib/repo/customers";
import { getBusinessProfile, listMunicipalities, listProvinces } from "../lib/repo/locations";
import { listCustomRates, listRateMatrix, listSeatingBands } from "../lib/repo/rateMatrix";
import { useSettings } from "../lib/settingsContext";
import { formatDateTime } from "../lib/dateFormat";
import { exactHoursBetween, formatHHMM, formatHoursAsHHMM } from "../lib/duration";
import { computeExpectedPayment, computeMultiLegExpectedPayment, resolveBookingRate } from "../lib/pricing";
import { computeOvertimeSettlement } from "../lib/overtimeSettlement";
import { bookingRef } from "../lib/bookingRef";
import { destinationLabel } from "../lib/destinationLabel";
import ConfirmDialog from "../components/ConfirmDialog";
import WaiveOvertimeButton from "../components/WaiveOvertimeButton";
import type {
  Booking,
  BookingLeg,
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

export default function SettlementsRecordsTab() {
  const { settings } = useSettings();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [seatingBands, setSeatingBands] = useState<SeatingBand[]>([]);
  const [rateMatrix, setRateMatrix] = useState<RateMatrixRow[]>([]);
  const [customRates, setCustomRates] = useState<CustomRate[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [bookingLegs, setBookingLegs] = useState<BookingLeg[]>([]);
  const [loading, setLoading] = useState(true);
  // Only one row at a time can have its Payment being corrected — see
  // PaymentEditRow below.
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [markPaidBusy, setMarkPaidBusy] = useState(false);

  async function refresh() {
    const [b, v, c, p, profile, bands, matrix, customRts, munis, legs] = await Promise.all([
      listBookings(),
      listVehicles(),
      listCustomers(),
      listProvinces(),
      getBusinessProfile(),
      listSeatingBands(),
      listRateMatrix(),
      listCustomRates(),
      listMunicipalities(),
      listAllBookingLegs(),
    ]);
    setBookings(b);
    setVehicles(v);
    setCustomers(c);
    setProvinces(p);
    setBusinessProfile(profile);
    setSeatingBands(bands);
    setRateMatrix(matrix);
    setCustomRates(customRts);
    setMunicipalities(munis);
    setBookingLegs(legs);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  function vehicleLabel(id: string) {
    return vehicles.find((v) => v.id === id)?.plate_number ?? "—";
  }
  function customerLabel(id: string) {
    return customers.find((c) => c.id === id)?.full_name ?? "—";
  }

  async function handleMarkPaid(id: string) {
    setMarkPaidBusy(true);
    try {
      await markBookingPaid(id);
      setMarkingPaidId(null);
      await refresh();
    } finally {
      setMarkPaidBusy(false);
    }
  }

  function rowRate(booking: Booking): number | null {
    return resolveBookingRate(booking, vehicles, businessProfile, provinces, seatingBands, rateMatrix, customRates);
  }

  // listBookings() returns every status ordered start_date desc — cancelled
  // bookings are excluded here since they never actually settled anything
  // and already have a home in Rentals > History.
  const rows = useMemo(() => bookings.filter((b) => b.status !== "cancelled"), [bookings]);

  // Grouped once per bookingLegs change rather than filtering per row — same
  // pattern as logsByBooking on BookingsScreen.
  const legsByBooking = useMemo(() => {
    const map = new Map<string, BookingLeg[]>();
    for (const leg of bookingLegs) {
      const list = map.get(leg.booking_id) ?? [];
      list.push(leg);
      map.set(leg.booking_id, list);
    }
    return map;
  }, [bookingLegs]);

  return (
    <div className="space-y-4">
      {loading ? (
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
              // Shared with Customers > Outstanding — same computation, so
              // the two screens can't drift on what a booking's overtime
              // hours/expected amount are.
              const overtimeSettlement = computeOvertimeSettlement(
                b, vehicles, businessProfile, provinces, seatingBands, rateMatrix, customRates,
              );
              const overtimeHours = overtimeSettlement.overtimeHours;
              const overtime = !settled ? "—" : overtimeHours > 0 ? formatHoursAsHHMM(overtimeHours) : "00:00";
              const totalTime = settled ? formatHoursAsHHMM(durationHours + overtimeHours) : "—";

              const rate = rowRate(b);
              const legs = legsByBooking.get(b.id) ?? [];
              const vehicle = vehicles.find((v) => v.id === b.vehicle_id) ?? null;
              // Multi-destination bookings price the scheduled span as the
              // sum of each stop's own rate x its own duration (see
              // computeMultiLegExpectedPayment), rather than one rate over
              // the whole span. Overtime (past the last stop's due-back)
              // still bills at the primary destination's rate — a known,
              // deliberately simplified corner, same spirit as
              // RemittancesReport's block-breakdown limitation. The
              // single-destination case (the overwhelming majority) is
              // untouched: same one-call-rounded math as before.
              const multiLegRecorded =
                settled && legs.length > 0 && vehicle
                  ? computeMultiLegExpectedPayment(b, legs, vehicle, businessProfile, provinces, seatingBands, rateMatrix, customRates)
                  : null;
              const recomputedExpected =
                multiLegRecorded != null
                  ? multiLegRecorded + (settled && overtimeHours > 0 && rate != null ? computeExpectedPayment(rate, overtimeHours) ?? 0 : 0)
                  : settled && rate != null
                    ? computeExpectedPayment(rate, durationHours + overtimeHours)
                    : null;
              const expectedPaymentText =
                recomputedExpected != null ? formatMoney(recomputedExpected) : b.expected_payment ?? "—";

              // The two separate caps a payment correction can never
              // exceed — see PaymentEditRow. Split out from the combined
              // recomputedExpected above the same way RemittancesReport's
              // buildBookingSummary does.
              const recordedExpected =
                multiLegRecorded ?? (settled && rate != null ? computeExpectedPayment(rate, durationHours) : null);
              const overtimeExpected = overtimeSettlement.overtimeExpected;

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

              if (editingPaymentId === b.id) {
                return (
                  <PaymentEditRow
                    key={b.id}
                    booking={b}
                    recordedExpected={recordedExpected}
                    overtimeExpected={overtimeExpected}
                    overtimeHours={overtimeHours}
                    overtimeWaived={overtimeSettlement.waived}
                    onCancel={() => setEditingPaymentId(null)}
                    onSaved={async () => {
                      setEditingPaymentId(null);
                      await refresh();
                    }}
                  />
                );
              }

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
                    {destinationLabel(b, provinces, municipalities, legs)}
                  </td>
                  <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>
                    {expectedPaymentText}
                  </td>
                  <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>
                    {b.payment_status === "receivable" ? (
                      <>
                        <span style={{ color: "var(--text-warning)" }}>Receivable — not yet paid</span>
                        {paymentTotal != null && (
                          <div className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                            agreed: {formatMoney(paymentTotal)}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {paymentTotal != null ? formatMoney(paymentTotal) : "—"}
                        {additionalPayment != null && (
                          <div className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                            incl. {formatMoney(additionalPayment)} overtime
                          </div>
                        )}
                        {overtimeSettlement.waived && (
                          <div className="mt-1 text-sm" style={{ color: "var(--text-warning)" }}>
                            overtime balance written off
                          </div>
                        )}
                      </>
                    )}
                    {settled && (
                      <div className="mt-1 flex gap-3">
                        {b.payment_status === "receivable" && (
                          <button
                            onClick={() => setMarkingPaidId(b.id)}
                            className="text-sm font-medium"
                            style={{ color: "var(--text-success)" }}
                          >
                            Mark as paid
                          </button>
                        )}
                        <button
                          onClick={() => setEditingPaymentId(b.id)}
                          className="text-sm font-medium"
                          style={{ color: "var(--text-accent)" }}
                        >
                          Edit payment
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {markingPaidId && (() => {
        const booking = bookings.find((b) => b.id === markingPaidId);
        if (!booking) return null;
        return (
          <ConfirmDialog
            title="Mark as paid?"
            description={
              <>
                Mark <strong>{bookingRef(booking.id)}</strong> for <strong>{customerLabel(booking.customer_id)}</strong> as paid
                {booking.payment_amount ? <> ({formatMoney(Number(booking.payment_amount))})</> : null}. This clears its receivable
                status — undo it manually if this was a mistake.
              </>
            }
            confirmLabel="Mark as paid"
            onConfirm={() => handleMarkPaid(booking.id)}
            onCancel={() => setMarkingPaidId(null)}
            busy={markPaidBusy}
          />
        );
      })()}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  border: "0.5px solid var(--border-strong)",
  background: "var(--surface-2)",
  color: "var(--text-primary)",
};

// Corrects a completed booking's recorded/overtime payment — the fix for
// staff forgetting to log a payment (especially the overtime top-up) at
// Mark-returned time. Expected payment itself never changes here; it stays
// the fixed rate-formula basis. Each field can only be raised, and only up
// to its own expected cap — recorded payment against recordedExpected,
// overtime payment against overtimeExpected — never past it and never
// below what's already recorded (see correctBookingPayment for the
// floor half of that; the cap is enforced here since it needs the resolved
// rate, which the repo layer doesn't have).
function PaymentEditRow({
  booking,
  recordedExpected,
  overtimeExpected,
  overtimeHours,
  overtimeWaived,
  onCancel,
  onSaved,
}: {
  booking: Booking;
  recordedExpected: number | null;
  overtimeExpected: number | null;
  overtimeHours: number;
  overtimeWaived: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const currentRecorded = booking.payment_amount ? Number(booking.payment_amount) : 0;
  const currentOvertime = booking.additional_payment ? Number(booking.additional_payment) : 0;
  const hasOvertime = overtimeHours > 0;
  // Once the remaining balance has been written off, the overtime figure is
  // final — no more editing it here, only Final settlement (below, via
  // WaiveOvertimeButton) touches it, and that's already been used.
  const editableOvertime = hasOvertime && !overtimeWaived;

  const [recordedPayment, setRecordedPayment] = useState(String(currentRecorded));
  const [overtimePayment, setOvertimePayment] = useState(String(currentOvertime));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Same confirm-before-commit speed bump as OvertimeSettleForm/"Mark as
  // paid" — Save opens this instead of writing straight away.
  const [confirming, setConfirming] = useState(false);

  const recordedNum = Number(recordedPayment);
  const overtimeNum = Number(overtimePayment);

  const recordedValid =
    recordedPayment.trim() !== "" &&
    !Number.isNaN(recordedNum) &&
    recordedNum >= currentRecorded &&
    (recordedExpected == null || recordedNum <= recordedExpected);

  const overtimeValid =
    !editableOvertime ||
    (overtimePayment.trim() !== "" &&
      !Number.isNaN(overtimeNum) &&
      overtimeNum >= currentOvertime &&
      (overtimeExpected == null || overtimeNum <= overtimeExpected));

  const canSave = recordedValid && overtimeValid;

  async function handleSave() {
    if (!canSave) return;
    setSaveError(null);
    setSaving(true);
    try {
      await correctBookingPayment(booking.id, {
        payment_amount: String(recordedNum),
        additional_payment: editableOvertime ? String(overtimeNum) : undefined,
      });
      setConfirming(false);
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td colSpan={COLUMNS.length} className="p-0" style={{ border: "0.5px solid var(--border)" }}>
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>
                Recorded payment (currently {formatMoney(currentRecorded)}
                {recordedExpected != null ? `, capped at ${formatMoney(recordedExpected)}` : ""})
              </label>
              <input
                type="number"
                className="w-full rounded-md px-3 py-2.5 text-base"
                style={inputStyle}
                value={recordedPayment}
                onChange={(e) => setRecordedPayment(e.target.value)}
              />
              {!recordedValid && recordedPayment.trim() !== "" && (
                <p className="mt-1 text-sm" style={{ color: "var(--text-danger)" }}>
                  Must be at least {formatMoney(currentRecorded)}
                  {recordedExpected != null ? ` and at most ${formatMoney(recordedExpected)}` : ""}.
                </p>
              )}
            </div>

            {hasOvertime && (
              <div>
                <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>
                  Overtime payment (currently {formatMoney(currentOvertime)}
                  {overtimeExpected != null ? `, capped at ${formatMoney(overtimeExpected)}` : ""})
                </label>
                {overtimeWaived ? (
                  <p className="text-sm" style={{ color: "var(--text-warning)" }}>
                    Remaining balance written off — this figure is final.
                  </p>
                ) : (
                  <>
                    <input
                      type="number"
                      className="w-full rounded-md px-3 py-2.5 text-base"
                      style={inputStyle}
                      value={overtimePayment}
                      onChange={(e) => setOvertimePayment(e.target.value)}
                    />
                    {!overtimeValid && overtimePayment.trim() !== "" && (
                      <p className="mt-1 text-sm" style={{ color: "var(--text-danger)" }}>
                        Must be at least {formatMoney(currentOvertime)}
                        {overtimeExpected != null ? ` and at most ${formatMoney(overtimeExpected)}` : ""}.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Corrections can only raise what's recorded, up to the expected amount — expected payment itself
            never changes. Use this to catch up a payment staff forgot to log at the time.
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex gap-2">
              <button
                onClick={() => setConfirming(true)}
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
            {editableOvertime && (
              <WaiveOvertimeButton
                booking={booking}
                pendingOvertimeAmount={Number.isNaN(overtimeNum) ? currentOvertime : overtimeNum}
                overtimeExpected={overtimeExpected}
                onWaived={onSaved}
              />
            )}
          </div>

          {confirming && (
            <ConfirmDialog
              title="Save payment correction?"
              description={
                <>
                  Record <strong>{formatMoney(recordedNum)}</strong> as the recorded payment
                  {hasOvertime ? (
                    <>
                      {" "}and <strong>{formatMoney(overtimeNum)}</strong> as collected overtime
                    </>
                  ) : null}{" "}
                  for <strong>{bookingRef(booking.id)}</strong>. This can be corrected upward later, but never lowered.
                </>
              }
              confirmLabel="Save"
              onConfirm={handleSave}
              onCancel={() => setConfirming(false)}
              busy={saving}
            />
          )}
        </div>
      </td>
    </tr>
  );
}
