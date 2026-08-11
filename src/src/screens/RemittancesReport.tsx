import { useEffect, useMemo, useState } from "react";
import { listBookings, setRemittanceSplitOverride } from "../lib/repo/bookings";
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
import DatePicker from "../components/DatePicker";
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

// How each block's dollar amount is computed once a breakdown is on (has no
// effect on "Per rent", which is already a single row). See buildBookingRows
// for the two implementations.
//  - "bucket": today's original behavior — one shared cash bucket, a block
//    bills the clean rate-formula amount until the bucket runs short, then
//    whichever block happens to be last (or first-to-run-short) absorbs the
//    entire remainder in one shot.
//  - "recorded": every block absorbs its fair share proportionally instead —
//    scheduled and overtime are split from their own real recorded pools
//    (payment_amount / additional_payment), sliced by actual hours, so no
//    single block ever carries a shortfall that belongs to another block.
type SplitMode = "bucket" | "recorded";

// The Split control's actual options. "hybrid" isn't a third computation
// strategy of its own — every booking still runs through buildBookingRows as
// either "bucket" or "recorded", see resolveSplitMode. It's a per-booking
// selector: each booking uses whichever of the two its own
// remittance_split_override says (falling back to "bucket" when unset),
// instead of the report applying one mode uniformly to every row.
type SplitSelection = SplitMode | "hybrid";

// Resolves what a specific booking actually renders with. Outside Hybrid,
// this is just the report-wide selection, unchanged. In Hybrid: autoDefault
// (see autoSplitModeFromSummary) is what a booking shows out of the box —
// Recorded once it's overpaid, Bucket otherwise — but a booking's own
// persisted choice always overrules it once staff explicitly sets one, same
// as before. Auto is the default, not a hard lock: it just means nobody has
// to manually decide the common case, while still being free to override
// any specific booking either direction.
function resolveSplitMode(selection: SplitSelection, booking: Booking, autoDefault: SplitMode): SplitMode {
  if (selection !== "hybrid") return selection;
  return booking.remittance_split_override ?? autoDefault;
}

// Hybrid's un-set default: "recorded" for an overpaid booking (spreads the
// surplus proportionally instead of concentrating it on one block, same
// reasoning as the Bucket/Recorded comparison this whole feature grew out
// of), "bucket" for everything else (on-target or short — clean per-block
// numbers, same as before Hybrid existed). Reuses the exact PAID/EXPECTED
// totals already shown in the R[..]/O[..] summary line right above the
// picker, so the auto-pick always matches what's visibly on screen. Falls
// back to "bucket" whenever the rate can't be resolved at all — there's
// nothing to compare against then, so no heuristic to apply.
function autoSplitModeFromSummary(summary: BookingSummary): SplitMode {
  if (summary.recordedExpected == null || summary.overtimeExpected == null) return "bucket";
  const totalPaid = summary.recordedPaid + summary.overtimePaid;
  const totalExpected = summary.recordedExpected + summary.overtimeExpected;
  return totalPaid > totalExpected + EPSILON_MONEY ? "recorded" : "bucket";
}

// ~30 seconds — guards against a near-zero excess/overtime row appearing
// purely from floating-point drift in the hour math.
const EPSILON_HOURS = 1 / 120;
// A few centavos of float drift shouldn't be the difference between a block
// qualifying for the clean full-rate amount or not.
const EPSILON_MONEY = 0.01;

// Remittance period — a From/To date range for the whole report, both blank
// by default ("All time", today's original unfiltered behavior). A booking
// only counts as "clean" for the period if its whole actual span (departure
// through return, so overtime counts) fits inside [from, to] — the same
// basis buildBookingRows already uses for everything else. A booking whose
// span overlaps the period but isn't fully contained (started earlier, or
// overtime ran past the end) is a "boundary" case: left out of the totals
// entirely rather than silently included or awkwardly half-counted, and
// surfaced instead via the boundary banner so staff can widen the range on
// purpose if they want it in. A booking that doesn't overlap the period at
// all is just irrelevant to it — outside, no banner mention.
type PeriodStatus = "clean" | "boundary" | "outside";

function classifyBookingForPeriod(booking: Booking, from: Date | null, to: Date | null): PeriodStatus {
  if (!from && !to) return "clean";
  const dep = new Date(booking.actual_departure_at ?? booking.start_date);
  const ret = new Date(booking.actual_return_at ?? booking.end_date);
  const overlaps = (!to || dep.getTime() <= to.getTime()) && (!from || ret.getTime() >= from.getTime());
  if (!overlaps) return "outside";
  const fullyContained = (!from || dep.getTime() >= from.getTime()) && (!to || ret.getTime() <= to.getTime());
  return fullyContained ? "clean" : "boundary";
}

// Plain-language reason a boundary booking got left out — shown in the
// banner so staff know exactly which edge it crosses without having to work
// it out themselves.
function boundaryReason(booking: Booking, from: Date | null, to: Date | null): string {
  const dep = new Date(booking.actual_departure_at ?? booking.start_date);
  const ret = new Date(booking.actual_return_at ?? booking.end_date);
  const beforeFrom = from != null && dep.getTime() < from.getTime();
  const afterTo = to != null && ret.getTime() > to.getTime();
  if (beforeFrom && afterTo) return "started before this period and its overtime ran past the end";
  if (beforeFrom) return "started before this period begins";
  if (afterTo) return "overtime ran past this period's end";
  return "crosses this period's edge";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Every calendar day a booking's actual span touches, inclusive on both
// ends — used to light up the Remittance period date pickers so staff can
// see which days already have booking activity before picking a range,
// rather than guessing.
function datesBetween(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cur.getTime() <= last.getTime()) {
    dates.push(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

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

// Slices `totalHours` into `blockHours`-sized segments, the last one being
// whatever's left over (never zero-padded up to a full block). Empty array
// when totalHours is negligible — the "no overtime at all" / degenerate case.
function sliceHours(totalHours: number, blockHours: number): number[] {
  if (totalHours <= EPSILON_HOURS) return [];
  const fullBlocks = Math.floor(totalHours / blockHours + 1e-9);
  const remainder = totalHours - fullBlocks * blockHours;
  const segs = Array<number>(fullBlocks).fill(blockHours);
  if (remainder > EPSILON_HOURS) segs.push(remainder);
  return segs;
}

// Splits `pool` (a real recorded payment — base or overtime) across segments
// proportionally to each segment's share of `totalHours`. The last segment
// gets whatever's left after rounding the earlier ones to the cent, rather
// than its own independently-rounded share, so the segments always sum back
// to `pool` exactly — a rounding correction, not a business rule.
function proportionalAmounts(segHours: number[], pool: number, totalHours: number): number[] {
  const amounts: number[] = [];
  let roundedSoFar = 0;
  segHours.forEach((h, i) => {
    if (i === segHours.length - 1) {
      amounts.push(Math.round((pool - roundedSoFar) * 100) / 100);
      return;
    }
    const raw = totalHours > EPSILON_HOURS ? (h / totalHours) * pool : 0;
    const rounded = Math.round(raw * 100) / 100;
    amounts.push(rounded);
    roundedSoFar += rounded;
  });
  return amounts;
}

// "Recorded split" mode — see the SplitMode comment above. Scheduled duration
// and overtime are sliced into their own independent block sequences (a
// block never straddles the boundary here, unlike bucket mode), each
// proportionally absorbing its share of the real payment actually recorded
// for that pool. Worked example: 16h scheduled + 8h overtime, 1400 recorded
// for the scheduled portion and 700 for overtime, as 12hr blocks —
// scheduled slices to 12h + 4h (1400 split 12/16 and 4/16 -> 1050, 350),
// overtime slices to a single 8h block (all of the 700). Every block's
// amount always sums back to the real total, same as bucket mode — it's
// just distributed by actual hours instead of dumped onto whichever block
// runs out last.
function buildRecordedSplitRows(
  booking: Booking,
  blockHours: 12 | 24,
  settings: AppSettings,
  rate: number | null,
  durationHours: number,
  overtimeHours: number,
  actualDeparture: Date,
  actualReturn: Date,
  base: number,
  extra: number,
): BreakdownRow[] {
  const schedSegs = sliceHours(durationHours, blockHours);
  const schedAmounts = proportionalAmounts(schedSegs, base, durationHours);
  const otSegs = sliceHours(overtimeHours, blockHours);
  const otAmounts = proportionalAmounts(otSegs, extra, overtimeHours);

  const scheduledEnd = new Date(actualDeparture.getTime() + durationHours * 3600000);
  const rows: BreakdownRow[] = [];
  let cursor = new Date(actualDeparture);

  schedSegs.forEach((segHours, i) => {
    const isLast = i === schedSegs.length - 1;
    const segStart = new Date(cursor);
    const segEnd = isLast ? scheduledEnd : new Date(cursor.getTime() + segHours * 3600000);
    rows.push({
      key: `${booking.id}-sched-${i + 1}`,
      tag: `block ${i + 1}/${schedSegs.length}`,
      etd: formatDateTime(segStart.toISOString(), settings),
      etaMain: formatDateTime(segEnd.toISOString(), settings),
      etaActual: null,
      late: false,
      duration: formatHoursAsHHMM(segHours),
      durationExtra: null,
      note: null,
      amount: schedAmounts[i],
      expected: rate != null ? computeExpectedPayment(rate, segHours) : null,
    });
    cursor = segEnd;
  });

  otSegs.forEach((segHours, i) => {
    const isLast = i === otSegs.length - 1;
    const segStart = new Date(cursor);
    const segEnd = isLast ? new Date(actualReturn) : new Date(cursor.getTime() + segHours * 3600000);
    rows.push({
      key: `${booking.id}-ot-${i + 1}`,
      tag: `overtime ${i + 1}/${otSegs.length}`,
      etd: formatDateTime(segStart.toISOString(), settings),
      etaMain: formatDateTime(segEnd.toISOString(), settings),
      etaActual: null,
      late: false,
      duration: formatHoursAsHHMM(segHours),
      durationExtra: null,
      note: null,
      amount: otAmounts[i],
      expected: rate != null ? computeExpectedPayment(rate, segHours) : null,
    });
    cursor = segEnd;
  });

  return rows;
}

// Expands one booking into however many rows the current breakdown mode
// calls for.
//
// "Per rent" (blockHours = null) is the booking as a single row, unchanged
// from before this feature existed — amount is the real total collected.
// splitMode has no effect here.
//
// "Per 12hr"/"Per 24hr" combines the scheduled duration and any overtime
// (rounded to the nearest half hour) into one continuous span and slices
// *that* into equal blocks — e.g. a 50h rental with 8h overtime is 58h
// total, which as 12hr blocks reads 12-12-12-12-10. The tail is just
// whatever's left over, not a separately flagged "overtime" row. Two modes
// for how each block's amount is computed:
//
// "bucket" — every block draws from *one* shared cash bucket, the booking's
// real total (payment_amount + additional_payment), with no separate
// scheduled/overtime split. Walking the blocks in order: a block bills the
// clean rate-formula amount (e.g. 1750 for a full 12h block) only if it's a
// genuinely full-length block AND the bucket still has enough left to cover
// that charge. The moment either isn't true — the bucket runs short, or this
// is the final, shorter-than-blockHours block — that block absorbs whatever's
// left in one shot, and every block after it is 0. This is what makes every
// block's amount sum back to the real Subtotal/Total exactly, and it's also
// why a block can bill the full rate even while straddling the scheduled/
// overtime boundary (e.g. 16h scheduled + 8h overtime, still a clean 24h
// block) as long as there's still enough real cash to cover it.
//
// "recorded" — see buildRecordedSplitRows: scheduled and overtime are sliced
// into their own independent block sequences instead, each proportionally
// absorbing its share of the real recorded payment for that pool. No single
// block ever absorbs a shortfall that belongs to another block or another
// pool.
//
// Expected is always the plain rate-formula amount for that block's hours in
// both modes, shown alongside for comparison even when it happens to match.
function buildBookingRows(
  booking: Booking,
  blockHours: BlockHours,
  settings: AppSettings,
  rate: number | null,
  splitMode: SplitMode,
): BreakdownRow[] {
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

  if (splitMode === "recorded") {
    const recordedRows = buildRecordedSplitRows(
      booking,
      blockHours,
      settings,
      rate,
      durationHours,
      overtimeHours,
      actualDeparture,
      actualReturn,
      base,
      extra,
    );
    if (recordedRows.length === 0) {
      // Degenerate edge case (a near-zero-length booking) — fall back to the
      // single-row view rather than showing nothing.
      return buildBookingRows(booking, null, settings, rate, splitMode);
    }
    return recordedRows;
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
    return buildBookingRows(booking, null, settings, rate, splitMode);
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
  // Only meaningful once a breakdown is on — see the SplitMode/SplitSelection
  // comments above.
  const [splitMode, setSplitMode] = useState<SplitSelection>("bucket");
  // Remittance period — both blank means "All time" (unfiltered, today's
  // original behavior). yyyy-mm-dd strings straight from the date inputs.
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");

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

  const periodFromDate = periodFrom ? new Date(`${periodFrom}T00:00:00`) : null;
  const periodToDate = periodTo ? new Date(`${periodTo}T23:59:59.999`) : null;

  // Split completed bookings into "clean" (fully inside the selected
  // Remittance period, or the period is unset) and "boundary" (overlaps the
  // period but isn't fully contained — see classifyBookingForPeriod). Only
  // "clean" bookings ever make it into the report/totals; "boundary" ones
  // are surfaced via the banner instead.
  const { inPeriod, boundary } = useMemo(() => {
    const inPeriod: Booking[] = [];
    const boundary: Booking[] = [];
    for (const b of completed) {
      const status = classifyBookingForPeriod(b, periodFromDate, periodToDate);
      if (status === "clean") inPeriod.push(b);
      else if (status === "boundary") boundary.push(b);
    }
    return { inPeriod, boundary };
  }, [completed, periodFrom, periodTo]);

  // Oldest to latest by ETA/Actual — the actual return time whenever it's
  // set (always true for a completed booking), falling back to the
  // scheduled end_date otherwise.
  const byVehicle = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const b of inPeriod) {
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
  }, [inPeriod]);

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

  // Persists one booking's Hybrid choice and updates local state so the
  // report re-renders with it immediately — no refetch needed since this is
  // the only field that changed.
  function handleSetSplitOverride(bookingId: string, mode: SplitMode | null) {
    setRemittanceSplitOverride(bookingId, mode)
      .then((updated) => {
        setBookings((prev) => prev.map((b) => (b.id === bookingId ? updated : b)));
      })
      .catch((err) => {
        console.error("Failed to set remittance split override:", err);
      });
  }

  const selectedOwner = owners.find((o) => o.id === ownerId) ?? null;
  const vehiclesToShow = unitId === ALL_UNITS ? ownerVehicles : ownerVehicles.filter((v) => v.id === unitId);
  const grandTotal = vehiclesToShow.reduce((sum, v) => sum + vehicleSubtotal(v.id), 0);
  const anyRows = vehiclesToShow.some((v) => vehicleRows(v.id).length > 0);

  // Boundary bookings scoped to what's actually on screen right now (the
  // selected owner's vehicles, or just the one unit if narrowed down) —
  // there's no point flagging a boundary case for some other owner's vehicle
  // the staff member isn't even looking at.
  const visibleVehicleIds = useMemo(() => new Set(vehiclesToShow.map((v) => v.id)), [vehiclesToShow]);
  const visibleBoundaryBookings = useMemo(
    () => boundary.filter((b) => visibleVehicleIds.has(b.vehicle_id)),
    [boundary, visibleVehicleIds],
  );
  const hasPeriod = periodFromDate != null || periodToDate != null;

  // Every calendar day touched by a completed booking for whichever vehicles
  // are currently in view (narrows to just the one unit once picked) — lights
  // up the Remittance period date pickers below so staff aren't guessing at
  // which days have activity. Ignores the period filter itself, since the
  // whole point is helping pick that filter in the first place.
  const highlightedDates = useMemo(() => {
    const set = new Set<string>();
    for (const b of completed) {
      if (!visibleVehicleIds.has(b.vehicle_id)) continue;
      const dep = new Date(b.actual_departure_at ?? b.start_date);
      const ret = new Date(b.actual_return_at ?? b.end_date);
      for (const d of datesBetween(dep, ret)) set.add(d);
    }
    return set;
  }, [completed, visibleVehicleIds]);

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

      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-end gap-3">
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
              Remittance period
            </label>
            <div className="flex items-center gap-2">
              <div className="w-36">
                <DatePicker value={periodFrom} onChange={setPeriodFrom} settings={settings} highlightedDates={highlightedDates} />
              </div>
              <span style={{ color: "var(--text-muted)" }}>to</span>
              <div className="w-36">
                <DatePicker value={periodTo} onChange={setPeriodTo} settings={settings} highlightedDates={highlightedDates} />
              </div>
              {(periodFrom || periodTo) && (
                <button
                  type="button"
                  onClick={() => {
                    setPeriodFrom("");
                    setPeriodTo("");
                  }}
                  className="text-sm font-medium"
                  style={{ color: "var(--text-accent)" }}
                >
                  All time
                </button>
              )}
            </div>
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

          {breakdown !== null && (
            <div>
              <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>
                Split
              </label>
              <div className="flex gap-1 rounded-md p-1" style={{ background: "var(--surface-2)", border: "0.5px solid var(--border-strong)" }}>
                {(
                  [
                    { value: "bucket" as const, label: "Bucket" },
                    { value: "recorded" as const, label: "Recorded" },
                    { value: "hybrid" as const, label: "Hybrid" },
                  ]
                ).map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setSplitMode(value)}
                    className="rounded px-3 py-1.5 text-sm font-medium"
                    style={
                      splitMode === value
                        ? { background: "var(--fill-primary)", color: "var(--on-primary)" }
                        : { color: "var(--text-secondary)" }
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => window.print()}
          className="flex shrink-0 items-center gap-2 rounded-md px-4 py-2.5 text-base"
          style={{ border: "0.5px solid var(--border-strong)", color: "var(--text-primary)" }}
        >
          <PrinterIcon size={18} />
          Print
        </button>
      </div>

      {/* Persistent, not a one-off popup — stays visible for as long as the
          current owner/unit/period combination has bookings straddling the
          period's edge, since this is a statement about to be printed and
          shouldn't quietly drop rows without an explanation staying on
          screen. Boundary bookings are always excluded from the totals
          below (never included, never gated behind a per-booking choice) —
          widening the Remittance period is how staff bring one back in. */}
      {!loading && ownerId && hasPeriod && visibleBoundaryBookings.length > 0 && (
        <div
          className="space-y-1.5 rounded-md p-3 text-sm print:block"
          style={{ background: "var(--bg-warning)", color: "var(--text-warning)" }}
        >
          <p className="font-medium">
            {visibleBoundaryBookings.length} booking{visibleBoundaryBookings.length === 1 ? "" : "s"} excluded — crosses this period's edge:
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            {visibleBoundaryBookings.map((b) => {
              const vehicle = vehicles.find((v) => v.id === b.vehicle_id);
              return (
                <li key={b.id}>
                  {bookingRef(b.id)} ({vehicle?.plate_number ?? "—"}) — {boundaryReason(b, periodFromDate, periodToDate)}
                </li>
              );
            })}
          </ul>
          <p style={{ color: "var(--text-warning)" }}>Widen the Remittance period if you want these included.</p>
        </div>
      )}

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
                  splitMode={splitMode}
                  onSetSplitOverride={handleSetSplitOverride}
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
  splitMode: SplitSelection;
  onSetSplitOverride: (bookingId: string, mode: SplitMode | null) => void;
}

// One vehicle's remittance lines — a compact statement block (section header
// with a subtotal, then the 6-column row table) rather than the app's usual
// fully-gridded operational table, since this is meant to read like a report
// handed to an owner, not a data-entry screen.
function UnitTable({
  vehicle,
  ownerLabel,
  rows,
  subtotal,
  settings,
  provinces,
  municipalities,
  rowRate,
  blockHours,
  splitMode,
  onSetSplitOverride,
}: UnitTableProps) {
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
            const summary = buildBookingSummary(b, rate);
            const autoDefault = autoSplitModeFromSummary(summary);
            const effectiveSplitMode = resolveSplitMode(splitMode, b, autoDefault);

            const blockRows = buildBookingRows(b, blockHours, settings, rate, effectiveSplitMode).map((row) => (
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
            // once the per-block "of which overtime" note was dropped. (summary
            // itself was already computed above, alongside effectiveSplitMode.)
            const summaryText = [
              summaryTag("R", summary.recordedHours, summary.recordedPaid, summary.recordedExpected),
              summary.overtimeHours > EPSILON_HOURS
                ? summaryTag("O", summary.overtimeHours, summary.overtimePaid, summary.overtimeExpected)
                : null,
            ]
              .filter(Boolean)
              .join(",");

            // Hybrid's per-booking picker — screen-only (print:hidden), and
            // only worth showing once there are actually blocks to compute
            // with it. Fully interactive either way: the booking's own
            // override always wins once set (Clear drops it back to auto),
            // and the "(auto — ...)" tag only shows while nothing's been
            // manually picked yet — auto is just what it starts on, not a
            // ceiling on what staff can choose.
            const hybridPicker =
              splitMode === "hybrid" && blockHours !== null ? (
                <tr key={`${b.id}-hybrid-picker`} className="print:hidden">
                  <td colSpan={COLUMNS.length} className="px-3 py-1.5" style={{ borderTop: "0.5px solid var(--border)" }}>
                    <div className="flex items-center gap-2 text-sm">
                      <span style={{ color: "var(--text-muted)" }}>
                        Split for this booking:
                        {b.remittance_split_override == null && (
                          <span className="ml-1 text-xs italic" style={{ color: "var(--text-muted)" }}>
                            (auto — {autoDefault === "recorded" ? "overpaid" : "on target or short"})
                          </span>
                        )}
                      </span>
                      <div className="flex gap-1 rounded-md p-0.5" style={{ background: "var(--surface-2)", border: "0.5px solid var(--border-strong)" }}>
                        {([
                          { value: "bucket" as const, label: "Bucket" },
                          { value: "recorded" as const, label: "Recorded" },
                        ]).map(({ value, label }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => onSetSplitOverride(b.id, value)}
                            className="rounded px-2 py-1 text-xs font-medium"
                            style={
                              effectiveSplitMode === value
                                ? { background: "var(--fill-primary)", color: "var(--on-primary)" }
                                : { color: "var(--text-secondary)" }
                            }
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {b.remittance_split_override != null && (
                        <button
                          type="button"
                          onClick={() => onSetSplitOverride(b.id, null)}
                          className="text-xs font-medium"
                          style={{ color: "var(--text-accent)" }}
                        >
                          Clear (use default)
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : null;

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
              ...(hybridPicker ? [hybridPicker] : []),
              ...blockRows,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
