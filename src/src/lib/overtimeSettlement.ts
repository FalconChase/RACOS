import { exactHoursBetween, roundToNearestHalfHour } from "./duration";
import { computeExpectedPayment, resolveBookingRate } from "./pricing";
import type { Booking, BusinessProfile, CustomRate, Province, RateMatrixRow, SeatingBand, Vehicle } from "./types";

// Single source of truth for "does this booking have overtime, and is it
// fully collected" — used by both Settlements > Records (per-row overtime
// column/cap) and Customers > Outstanding (the unsettled-overtime list), so
// the two screens can never quietly disagree on the same booking's numbers.
export interface OvertimeSettlement {
  settled: boolean;
  overtimeHours: number;
  overtimeExpected: number | null;
  currentOvertime: number;
  // null when overtimeExpected can't be resolved (no rate) — caller falls
  // back to "additional_payment is set at all" as its settled check.
  amountOwed: number | null;
  // True once staff has explicitly written off whatever's left via
  // waiveOvertimeBalance — the gap in amountOwed stops counting as
  // outstanding from that point on, even though it's still > 0.
  waived: boolean;
}

export function computeOvertimeSettlement(
  booking: Booking,
  vehicles: Vehicle[],
  businessProfile: BusinessProfile | null,
  provinces: Province[],
  seatingBands: SeatingBand[],
  rateMatrix: RateMatrixRow[],
  customRates: CustomRate[],
): OvertimeSettlement {
  const actualDeparture = booking.actual_departure_at ? new Date(booking.actual_departure_at) : null;
  const actualReturn = booking.actual_return_at ? new Date(booking.actual_return_at) : null;
  const settled = booking.status === "completed" && actualDeparture !== null && actualReturn !== null;
  const currentOvertime = booking.additional_payment ? Number(booking.additional_payment) : 0;
  const waived = booking.overtime_waived_at != null;

  if (!settled) {
    return { settled: false, overtimeHours: 0, overtimeExpected: null, currentOvertime, amountOwed: null, waived };
  }

  const end = new Date(booking.end_date);
  const rawOvertimeHours = exactHoursBetween(end, actualReturn!);
  const overtimeHours = roundToNearestHalfHour(rawOvertimeHours);

  if (overtimeHours <= 0) {
    return { settled: true, overtimeHours: 0, overtimeExpected: null, currentOvertime, amountOwed: null, waived };
  }

  const rate = resolveBookingRate(booking, vehicles, businessProfile, provinces, seatingBands, rateMatrix, customRates);
  const overtimeExpected = rate != null ? computeExpectedPayment(rate, overtimeHours) : null;
  const amountOwed = overtimeExpected != null ? overtimeExpected - currentOvertime : null;

  return { settled: true, overtimeHours, overtimeExpected, currentOvertime, amountOwed, waived };
}

// True when there's overtime, it isn't fully paid off, and nobody's
// deliberately written off the remainder yet. Falls back to "nothing at all
// recorded" when the expected amount can't be resolved (no rate available)
// — same fallback both screens used before this was shared.
export function isOvertimeUnsettled(s: OvertimeSettlement): boolean {
  if (!s.settled || s.overtimeHours <= 0 || s.waived) return false;
  return s.amountOwed != null ? s.amountOwed > 0.01 : s.currentOvertime === 0;
}
