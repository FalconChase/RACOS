import { useEffect, useMemo, useState } from "react";
import { listBookings } from "../lib/repo/bookings";
import { listVehicles } from "../lib/repo/vehicles";
import { listOwners } from "../lib/repo/owners";
import { getBusinessProfile, listMunicipalities, listProvinces } from "../lib/repo/locations";
import { listCustomRates, listRateMatrix, listSeatingBands } from "../lib/repo/rateMatrix";
import { getCurrentBusinessName } from "../lib/db";
import { useSettings } from "../lib/settingsContext";
import { formatDateTime } from "../lib/dateFormat";
import { exactHoursBetween, formatHHMM, formatHoursAsHHMM, roundToNearestHalfHour } from "../lib/duration";
import { computeExpectedPayment, resolveBookingRate } from "../lib/pricing";
import { bookingRef } from "../lib/bookingRef";
import { destinationLabel } from "../lib/destinationLabel";
import { PrinterIcon } from "../components/icons";
import type {
  AppSettings,
  Booking,
  BusinessProfile,
  CustomRate,
  Municipality,
  Owner,
  Province,
  RateMatrixRow,
  SeatingBand,
  Vehicle,
} from "../lib/types";

// Sentinel unit-select value meaning "every unit this owner has" — always the
// last option in the dropdown, per how this screen is meant to be used.
const ALL_UNITS = "__all__";

const COLUMNS = ["Ref", "ETD", "ETA / Actual", "Duration / Total time", "Destination", "Payment"];

// Trims float noise from rate/payment math — same small helper every other
// money-displaying screen keeps locally.
function formatMoney(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

const selectStyle: React.CSSProperties = {
  border: "0.5px solid var(--border-strong)",
  background: "var(--surface-2)",
  color: "var(--text-primary)",
};

// null = "Per rent" (no breakdown, one row per booking). 12/24 = slice the
// scheduled duration into that many hours per block.
type BlockHours = 12 | 24 | null;

// ~30 seconds — guards against a near-zero excess/overtime row appearing
// purely from floating-point drift in the hour math.
const EPSILON_HOURS = 1 / 120;
// A few centavos of float drift shouldn't be the difference between a block
// qualifying for the clean full-rate amount or not.
const EPSILON_MONEY = 0.01;

interface BreakdownRow {
  key: string;
  tag: string | null;
  etd: string;
  etaMain: string;
  etaActual: string | null;
  late: boolean;
  duration: string;
  durationExtra: string | null;
  note: string | null;
  amount: number;
  expected: number | null;
}

// Expands one booking into however many rows the current breakdown mode
// calls for.
//
// "Per rent" (blockHours = null) is the booking as a single row, unchanged
// from before this feature existed — amount is the real total collected.
//
// "Per 12hr"/"Per 24hr" combines the scheduled duration and any overtime
// (rounded to the nearest half hour) into one continuous span and slices
// *that* into equal blocks — e.g. a 50h rental with 8h overtime is 58h
// total, which as 12hr blocks reads 12-12-12-12-10. The tail is just
// whatever's left over, not a separately flagged "overtime" row.
//
// Every block draws from *one* shared cash bucket — the booking's real total
// (payment_amount + additional_payment), with no separate scheduled/overtime
// split. Walking the blocks in order: a block bills the clean rate-formula
// amount (e.g. 1750 for a full 12h block) only if it's a genuinely
// full-length block AND the bucket still has enough left to cover that
// charge. The moment either isn't true — the bucket runs short, or this is
// the final, shorter-than-blockHours block — that block absorbs whatever's
// left in one shot, and every block after it is 0. This is what makes every
// block's amount sum back to the real Subtotal/Total exactly, and it's also
// why a block can bill the full rate even while straddling the scheduled/
// overtime boundary (e.g. 16h scheduled + 8h overtime, still a clean 24h
// block) as long as there's still enough real cash to cover it. Expected is
// always the plain rate-formula amount for that block's hours, shown
// alongside for comparison even when it happens to match.
function buildBookingRows(booking: Booking, blockHours: BlockHours, settings: AppSettings, rate: number | null): BreakdownRow[] {
  const start = new Date(booking.start_date);
  const end = new Date(booking.end_date);
  // Completed bookings always have both actual timestamps resolved (see
  // markBookingReturned) — falling back to scheduled times here is just a
  // defensive guard, not an expected path.
  const actualDeparture = booking.actual_departure_at ? new Date(booking.actual_departure_at) : start;
  const actualReturn = booking.actual_return_at ? new Date(booking.actual_return_at) : end;

  const base = booking.payment_amount ? Number(booking.payment_amount) : 0;
  const extra = booking.additional_payment ? Number(booking.additional_payment) : 0;
  const totalPayment = base + extra;

  const durationHours = exactHoursBetween(start, end);
  const totalHoursExact = exactHoursBetween(actualDeparture, actualReturn);
  // Overtime bills at the nearest half hour, not to the exact minute — an
  // exact "6h24m" overtime span would otherwise produce a messy non-round
  // peso amount once run through the rate. The scheduled Duration stays
  // exact; only this overtime portion rounds.
  const overtimeHours = roundToNearestHalfHour(Math.max(0, totalHoursExact - durationHours));
  const hasArrivalDiff = booking.actual_return_at != null && actualReturn.getTime() !== end.getTime();
  const late = actualReturn.getTime() > end.getTime();

  if (blockHours === null) {
    const expected = rate != null ? computeExpectedPayment(rate, durationHours + overtimeHours) : null;
    return [
      {
        key: booking.id,
        tag: null,
        etd: formatDateTime(booking.start_date, settings),
        etaMain: formatDateTime(booking.end_date, settings),
        etaActual: hasArrivalDiff ? formatDateTime(booking.actual_return_at as string, settings) : null,
        late,
        duration: formatHHMM(start, end),
        durationExtra: overtimeHours > EPSILON_HOURS ? `total: ${formatHoursAsHHMM(durationHours + overtimeHours)}` : null,
        note: extra > 0 ? `incl. ${formatMoney(extra)} overtime` : null,
        amount: totalPayment,
        expected,
      },
    ];
  }

  const totalSpanHours = durationHours + overtimeHours;
  const fullBlocks = Math.floor(totalSpanHours / blockHours + 1e-9);
  const remainderHours = totalSpanHours - fullBlocks * blockHours;
  const hasRemainder = remainderHours > EPSILON_HOURS;
  const segmentCount = hasRemainder ? fullBlocks + 1 : fullBlocks;

  let remaining = totalPayment;
  const rows: BreakdownRow[] = [];
  let cursor = new Date(actualDeparture);

  for (let i = 0; i < segmentCount; i++) {
    const isLast = i === segmentCount - 1;
    const segHours = isLast && hasRemainder ? remainderHours : blockHours;
    const segStart = new Date(cursor);
    // The very last segment's boundary is the true actual return time —
    // built directly from actualReturn rather than cursor + segHours so it
    // can't drift from the real timestamp by a rounding fraction of a minute.
    const segEnd = isLast ? new Date(actualReturn) : new Date(cursor.getTime() + segHours * 3600000);

    const expected = rate != null ? computeExpectedPayment(rate, segHours) : null;
    const isFullLength = Math.abs(segHours - blockHours) < EPSILON_HOURS;

    let amount: number;
    if (isFullLength && expected != null && remaining >= expected - EPSILON_MONEY) {
      amount = expected;
      remaining -= amount;
    } else {
      amount = remaining;
      remaining = 0;
    }

    rows.push({
      key: `${booking.id}-block-${i + 1}`,
      tag: `block ${i + 1}/${segmentCount}`,
      etd: formatDateTime(segStart.toISOString(), settings),
      etaMain: formatDateTime(segEnd.toISOString(), settings),
      etaActual: null,
      late: false,
      duration: formatHoursAsHHMM(segHours),
      durationExtra: null,
      note: null,
      amount,
      expected,
    });
    cursor = segEnd;
  }

  if (rows.length === 0) {
    // Degenerate edge case (a near-zero-length booking) — fall back to the
    // single-row view rather than showing nothing.
    return buildBookingRows(booking, null, settings, rate);
  }

  return rows;
}

interface BookingSummary {
  recordedHours: number;
  recordedPaid: number;
  recordedExpected: number | null;
  recordedUncounted: number | null;
  overtimeHours: number;
  overtimePaid: number;
  overtimeExpected: number | null;
  overtimeUncounted: number | null;
}

// The "recorded" vs "overtime" totals for one booking, each paired with what
// the rate formula alone says it should have cost and the gap between the
// two ("uncounted") — the same shape as the top summary in the reference
// sheet, shown once per booking above its own block breakdown so the blocks
// below aren't the only place the overtime picture shows up.
function buildBookingSummary(booking: Booking, rate: number | null): BookingSummary {
  const start = new Date(booking.start_date);
  const end = new Date(booking.end_date);
  const actualDeparture = booking.actual_departure_at ? new Date(booking.actual_departure_at) : start;
  const actualReturn = booking.actual_return_at ? new Date(booking.actual_return_at) : end;
  const base = booking.payment_amount ? Number(booking.payment_amount) : 0;
  const extra = booking.additional_payment ? Number(booking.additional_payment) : 0;

  const durationHours = exactHoursBetween(start, end);
  const totalHoursExact = exactHoursBetween(actualDeparture, actualReturn);
  const overtimeHours = roundToNearestHalfHour(Math.max(0, totalHoursExact - durationHours));

  const recordedExpected = rate != null ? computeExpectedPayment(rate, durationHours) : null;
  const overtimeExpected = rate != null ? computeExpectedPayment(rate, overtimeHours) : null;

  return {
    recordedHours: durationHours,
    recordedPaid: base,
    recordedExpected,
    recordedUncounted: recordedExpected != null ? recordedExpected - base : null,
    overtimeHours,
    overtimePaid: extra,
    overtimeExpected,
    overtimeUncounted: overtimeExpected != null ? overtimeExpected - extra : null,
  };
}

// Compact "R[HH:MM||PAID/EXPECTED]" form — one bracket per side, hours then
// paid/expected as a single ratio, no separate uncounted figure (still
// readable off the gap between the two numbers).
function summaryTag(letter: "R" | "O", hours: number, paid: number, expected: number | null): string {
  return `${letter}[${formatHoursAsHHMM(hours)}||${formatMoney(paid)}/${expected != null ? formatMoney(expected) : "—"}]`;
}

export default function RemittancesReport() {
  const { settings } = useSettings();
  // Owner picked first; Unit is dependent on it — repopulates with just that
  // owner's vehicles (plus "All units" as the last option) whenever the
  // owner changes.
  const [ownerId, setOwnerId] = useState("");
  const [unitId, setUnitId] = useState(ALL_UNITS);
  // "Per rent" is one row per booking (today's default view). "Per 12hr" /
  // "Per 24hr" expand each booking into its block/excess/overtime rows —
  // see buildBookingRows.
  const [breakdown, setBreakdown] = useState<BlockHours>(null);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [seatingBands, setSeatingBands] = useState<SeatingBand[]>([]);
  const [rateMatrix, setRateMatrix] = useState<RateMatrixRow[]>([]);
  const [customRates, setCustomRates] = useState<CustomRate[]>([]);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      listBookings(),
      listVehicles(),
      listOwners(),
      listProvinces(),
      listMunicipalities(),
      getBusinessProfile(),
      listSeatingBands(),
      listRateMatrix(),
      listCustomRates(),
      getCurrentBusinessName(),
    ]).then(([b, v, o, p, munis, profile, bands, matrix, customRts, bizName]) => {
      setBookings(b);
      setVehicles(v);
      setOwners(o);
      setProvinces(p);
      setMunicipalities(munis);
      setBusinessProfile(profile);
      setSeatingBands(bands);
      setRateMatrix(matrix);
      setCustomRates(customRts);
      setBusinessName(bizName);
      setLoading(false);
    });
  }, []);

  function rowRate(booking: Booking): number | null {
    return resolveBookingRate(booking, vehicles, businessProfile, provinces, seatingBands, rateMatrix, customRates);
  }

  function paymentTotal(booking: Booking): number {
    const base = booking.payment_amount ? Number(booking.payment_amount) : 0;
    const extra = booking.additional_payment ? Number(booking.additional_payment) : 0;
    return base + extra;
  }

  // A remittance is only ready once a booking is fully closed out —
  // pending/active bookings haven't settled anything yet, so they don't
  // count toward what's owed to an owner. (No revenue-split/commission math
  // here yet — Payment is the full amount, to be revisited.)
  const completed = useMemo(() => bookings.filter((b) => b.status === "completed"), [bookings]);

  // Oldest to latest by ETA/Actual — the actual return time whenever it's
  // set (always true for a completed booking), falling back to the
  // scheduled end_date otherwise.
  const byVehicle = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const b of completed) {
      const list = map.get(b.vehicle_id) ?? [];
      list.push(b);
      map.set(b.vehicle_id, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const aTime = new Date(a.actual_return_at ?? a.end_date).getTime();
        const bTime = new Date(b.actual_return_at ?? b.end_date).getTime();
        return aTime - bTime;
      });
    }
    return map;
  }, [completed]);

  function vehicleRows(vehicleId: string): Booking[] {
    return byVehicle.get(vehicleId) ?? [];
  }

  function vehicleSubtotal(vehicleId: string): number {
    return vehicleRows(vehicleId).reduce((sum, b) => sum + paymentTotal(b), 0);
  }

  // Every vehicle belonging to the selected owner, regardless of whether it
  // has any completed bookings yet — the dropdown should still list it, the
  // report area just says so if there's nothing to show.
  const ownerVehicles = useMemo(
    () => vehicles.filter((v) => v.owner_id === ownerId).sort((a, b) => a.plate_number.localeCompare(b.plate_number)),
    [vehicles, ownerId],
  );

  function handleOwnerChange(nextOwnerId: string) {
    setOwnerId(nextOwnerId);
    setUnitId(ALL_UNITS);
  }

  const selectedOwner = owners.find((o) => o.id === ownerId) ?? null;
  const vehiclesToShow = unitId === ALL_UNITS ? ownerVehicles : ownerVehicles.filter((v) => v.id === unitId);
  const grandTotal = vehiclesToShow.reduce((sum, v) => sum + vehicleSubtotal(v.id), 0);
  const anyRows = vehiclesToShow.some((v) => vehicleRows(v.id).length > 0);

  return (
    <div className="space-y-4">
      {/* Print-only — a formal statement header, never shown on screen.
          Hidden by default (Tailwind's `hidden`), switched on only inside
          @media print via the `print:block` variant. Deliberately just these
          three lines — the owner's identity is already the section heading
          right below (e.g. "MANUEL KESON — Total: ..."), so repeating their
          name/address up here was redundant. */}
      <div className="hidden print:block">
        <div className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          {businessName ?? "RACOS"}
        </div>
        <div className="text-base font-medium" style={{ color: "var(--text-secondary)" }}>
          Remittance statement
        </div>
        <div className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Printed {formatDateTime(new Date().toISOString(), settings)}
        </div>
      </div>

      {/* Print-only footer — fixed to the bottom of every physical page
          (Chromium-based print engines repeat `position: fixed` elements
          per page; this is the standard trick since CSS Paged Media's
          @page margin boxes aren't supported here). */}
      <div
        className="hidden print:block print:fixed print:inset-x-0 print:bottom-0 print:text-center print:text-sm"
        style={{ color: "var(--text-muted)" }}
      >
        Powered by RACOS
      </div>

      <div className="flex items-end justify-between gap-3 print:hidden">
        <div className="flex gap-3">
          <div>
            <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>
              Owner
            </label>
            <select
              className="w-64 rounded-md px-3 py-2.5 text-base"
              style={selectStyle}
              value={ownerId}
              onChange={(e) => handleOwnerChange(e.target.value)}
            >
              <option value="">Select an owner…</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.full_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>
              Unit
            </label>
            <select
              className="w-64 rounded-md px-3 py-2.5 text-base disabled:cursor-not-allowed disabled:opacity-40"
              style={selectStyle}
              value={unitId}
              disabled={!ownerId}
              onChange={(e) => setUnitId(e.target.value)}
            >
              {ownerVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate_number}
                </option>
              ))}
              <option value={ALL_UNITS}>All units</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>
              Breakdown
            </label>
            <div className="flex gap-1 rounded-md p-1" style={{ background: "var(--surface-2)", border: "0.5px solid var(--border-strong)" }}>
              {([
                { value: null, label: "Per rent" },
                { value: 12, label: "Per 12hr" },
                { value: 24, label: "Per 24hr" },
              ] as { value: BlockHours; label: string }[]).map(({ value, label }) => (
                <button
                  key={label}
                  onClick={() => setBreakdown(value)}
                  className="rounded px-3 py-1.5 text-sm font-medium"
                  style={
                    breakdown === value
                      ? { background: "var(--fill-primary)", color: "var(--on-primary)" }
                      : { color: "var(--text-secondary)" }
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-md px-4 py-2.5 text-base"
          style={{ border: "0.5px solid var(--border-strong)", color: "var(--text-primary)" }}
        >
          <PrinterIcon size={18} />
          Print
        </button>
      </div>

      {loading ? (
        <p className="text-base" style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : !ownerId ? (
        <p className="text-base" style={{ color: "var(--text-muted)" }}>Select an owner to view their remittance report.</p>
      ) : ownerVehicles.length === 0 ? (
        <p className="text-base" style={{ color: "var(--text-muted)" }}>{selectedOwner?.full_name} has no vehicles registered.</p>
      ) : !anyRows ? (
        <p className="text-base" style={{ color: "var(--text-muted)" }}>No completed bookings to remit yet.</p>
      ) : (
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
              {selectedOwner?.full_name}
            </h3>
            <span className="text-base font-medium" style={{ color: "var(--text-primary)" }}>
              Total: {formatMoney(grandTotal)}
            </span>
          </div>
          <div className="space-y-3">
            {vehiclesToShow
              .filter((v) => vehicleRows(v.id).length > 0)
              .map((vehicle) => (
                <UnitTable
                  key={vehicle.id}
                  vehicle={vehicle}
                  rows={vehicleRows(vehicle.id)}
                  subtotal={vehicleSubtotal(vehicle.id)}
                  settings={settings}
                  provinces={provinces}
                  municipalities={municipalities}
                  rowRate={rowRate}
                  blockHours={breakdown}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface UnitTableProps {
  vehicle: Vehicle;
  ownerLabel?: string;
  rows: Booking[];
  subtotal: number;
  settings: AppSettings;
  provinces: Province[];
  municipalities: Municipality[];
  rowRate: (booking: Booking) => number | null;
  blockHours: BlockHours;
}

// One vehicle's remittance lines — a compact statement block (section header
// with a subtotal, then the 6-column row table) rather than the app's usual
// fully-gridded operational table, since this is meant to read like a report
// handed to an owner, not a data-entry screen.
function UnitTable({ vehicle, ownerLabel, rows, subtotal, settings, provinces, municipalities, rowRate, blockHours }: UnitTableProps) {
  const showSummary = settings.showRemittanceSummary;

  return (
    <div className="overflow-hidden rounded-md" style={{ border: "0.5px solid var(--border)" }}>
      {/* Only the section header (plate + subtotal) is kept off a page break
          by itself — the table body below is left free to paginate normally.
          `breakInside: avoid` on the *whole* block (header + every row) was
          the bug: a table with many rows can't fit in what's left of a page,
          so the browser pushed the entire thing to the next page instead,
          leaving a large blank gap behind it. Each <tr> below gets its own
          avoid instead, which only stops a single row from splitting mid-row
          — the table itself still flows across as many pages as it needs,
          and the <thead> repeats automatically on each new page. */}
      <div
        className="flex items-baseline justify-between px-3 py-2"
        style={{ background: "var(--surface-1)", breakAfter: "avoid", breakInside: "avoid" }}
      >
        <div>
          <span className="text-base font-medium" style={{ color: "var(--text-primary)" }}>
            {vehicle.plate_number}
          </span>
          {ownerLabel && (
            <span className="ml-2 text-sm" style={{ color: "var(--text-muted)" }}>
              owned by {ownerLabel}
            </span>
          )}
        </div>
        <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          Subtotal: {formatMoney(subtotal)}
        </span>
      </div>
      <table className="w-full border-collapse text-left text-base">
        <thead>
          <tr>
            {COLUMNS.map((h) => (
              <th
                key={h}
                className="px-3 py-2 text-sm font-semibold"
                style={{ borderTop: "0.5px solid var(--border)", color: "var(--text-secondary)" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.flatMap((b) => {
            const rate = rowRate(b);
            const dest = destinationLabel(b, provinces, municipalities);

            const blockRows = buildBookingRows(b, blockHours, settings, rate).map((row) => (
              <tr key={row.key} style={{ breakInside: "avoid" }}>
                <td
                  className="px-3 py-2 font-mono text-sm"
                  style={{ borderTop: "0.5px solid var(--border)", color: "var(--text-secondary)" }}
                >
                  {bookingRef(b.id)}
                  {row.tag && <div style={{ color: "var(--text-muted)" }}>{row.tag}</div>}
                </td>
                <td
                  className="px-3 py-2 text-sm"
                  style={{ borderTop: "0.5px solid var(--border)", color: "var(--text-secondary)" }}
                >
                  {row.etd}
                </td>
                <td
                  className="px-3 py-2 text-sm"
                  style={{ borderTop: "0.5px solid var(--border)", color: "var(--text-secondary)" }}
                >
                  {row.etaMain}
                  {row.etaActual && (
                    <div style={{ color: row.late ? "var(--text-danger)" : "var(--text-success)" }}>
                      actual: {row.etaActual}
                    </div>
                  )}
                </td>
                <td
                  className="px-3 py-2 font-mono text-sm"
                  style={{ borderTop: "0.5px solid var(--border)", color: "var(--text-secondary)" }}
                >
                  {row.duration}
                  {row.durationExtra && <div style={{ color: "var(--text-danger)" }}>{row.durationExtra}</div>}
                </td>
                <td
                  className="px-3 py-2 text-sm"
                  style={{ borderTop: "0.5px solid var(--border)", color: "var(--text-secondary)" }}
                  title={rate != null ? `Rate: ${formatMoney(rate)}` : undefined}
                >
                  {dest}
                </td>
                <td
                  className="px-3 py-2 text-sm"
                  style={{ borderTop: "0.5px solid var(--border)", color: "var(--text-primary)" }}
                >
                  {formatMoney(row.amount)}
                  {/* Always shown, even when it matches the amount exactly —
                      this mirrors the reference sheet's own amount/expected
                      columns, which never hide the comparison. */}
                  {row.expected != null && (
                    <div style={{ color: "var(--text-muted)" }}>expected: {formatMoney(row.expected)}</div>
                  )}
                  {row.note && <div style={{ color: "var(--text-muted)" }}>{row.note}</div>}
                </td>
              </tr>
            ));

            // Shown for every breakdown mode now, including "Per rent" — it's
            // the one place the recorded-vs-overtime picture shows up at all
            // once the per-block "of which overtime" note was dropped.
            const summary = buildBookingSummary(b, rate);
            const summaryText = [
              summaryTag("R", summary.recordedHours, summary.recordedPaid, summary.recordedExpected),
              summary.overtimeHours > EPSILON_HOURS
                ? summaryTag("O", summary.overtimeHours, summary.overtimePaid, summary.overtimeExpected)
                : null,
            ]
              .filter(Boolean)
              .join(",");

            return [
              <tr
                key={`${b.id}-summary`}
                // Settings > Settlements toggles this on screen (off by
                // default — it's a staff/audit detail). Printing always
                // includes it regardless: `hidden` only ever applies on
                // screen, and `print:table-row` forces it back for a printed
                // statement even when the on-screen toggle is off.
                className={showSummary ? undefined : "hidden print:table-row"}
                style={{ breakInside: "avoid" }}
              >
                <td
                  colSpan={COLUMNS.length}
                  className="px-3 py-2 font-mono text-sm"
                  style={{ borderTop: "0.5px solid var(--border)", background: "var(--surface-2)", color: "var(--text-secondary)" }}
                >
                  {summaryText}
                </td>
              </tr>,
              ...blockRows,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
