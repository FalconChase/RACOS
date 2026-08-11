// Analytics tab — per-vehicle revenue/utilization/overtime rollups. Pure
// data shaping (no I/O), same spirit as lib/destinationHistory.ts: the
// screen fetches, this shapes. Reuses computeOvertimeSettlement so a
// vehicle's overtime numbers here can never disagree with Settlements or
// Customers > Outstanding.

import { computeOvertimeSettlement, isOvertimeUnsettled } from "./overtimeSettlement";
import { exactHoursBetween } from "./duration";
import type { Booking, BusinessProfile, CustomRate, Province, RateMatrixRow, SeatingBand, Vehicle } from "./types";
import type { ChartPoint } from "../components/MiniChart";

// Same "did this actually happen" set destinationHistory.ts uses — a
// pending/confirmed booking hasn't rented the car out yet, and cancelled
// never did.
const REALIZED_STATUSES = new Set<Booking["status"]>(["active", "completed"]);

export interface VehicleAnalytics {
  bookingCount: number;
  realizedBookingCount: number;
  totalCollected: number;
  totalExpected: number;
  outstandingOvertime: number;
  outstandingReceivable: number;
  avgRevenuePerBooking: number | null;
  totalRentedHours: number;
  avgRentalHours: number | null;
  overtimeBookingCount: number;
  overtimeRate: number | null; // fraction 0..1 of realized bookings that ran late
  totalOvertimeHours: number;
  totalOvertimeCollected: number;
  unsettledOvertimeCount: number;
  revenueByMonth: ChartPoint[];
  bookingsByMonth: ChartPoint[];
}

function monthKey(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}
function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

export function buildVehicleAnalytics(
  vehicleId: string,
  allBookings: Booking[],
  vehicles: Vehicle[],
  businessProfile: BusinessProfile | null,
  provinces: Province[],
  seatingBands: SeatingBand[],
  rateMatrix: RateMatrixRow[],
  customRates: CustomRate[],
  dateFrom?: string,
  dateTo?: string,
): VehicleAnalytics {
  const bookings = allBookings.filter((b) => {
    if (b.vehicle_id !== vehicleId || b.status === "cancelled") return false;
    const day = b.start_date.slice(0, 10);
    if (dateFrom && day < dateFrom) return false;
    if (dateTo && day > dateTo) return false;
    return true;
  });

  let totalCollected = 0;
  let totalExpected = 0;
  let outstandingOvertime = 0;
  let outstandingReceivable = 0;
  let realizedBookingCount = 0;
  let totalRentedHours = 0;
  let overtimeBookingCount = 0;
  let totalOvertimeHours = 0;
  let totalOvertimeCollected = 0;
  let unsettledOvertimeCount = 0;

  const revenueByMonthMap = new Map<string, number>();
  const bookingsByMonthMap = new Map<string, number>();

  for (const b of bookings) {
    const basePayment = b.payment_amount ? Number(b.payment_amount) : 0;
    const additionalPayment = b.additional_payment ? Number(b.additional_payment) : 0;
    totalCollected += basePayment + additionalPayment;

    const expected = b.expected_payment ? Number(b.expected_payment) : 0;
    totalExpected += expected;

    if (b.payment_status === "receivable") {
      outstandingReceivable += basePayment;
    }

    const key = monthKey(b.start_date);
    revenueByMonthMap.set(key, (revenueByMonthMap.get(key) ?? 0) + basePayment + additionalPayment);
    bookingsByMonthMap.set(key, (bookingsByMonthMap.get(key) ?? 0) + 1);

    const settlement = computeOvertimeSettlement(b, vehicles, businessProfile, provinces, seatingBands, rateMatrix, customRates);
    if (REALIZED_STATUSES.has(b.status)) {
      realizedBookingCount++;
      totalRentedHours += exactHoursBetween(new Date(b.start_date), new Date(b.end_date)) + settlement.overtimeHours;
      if (settlement.overtimeHours > 0) {
        overtimeBookingCount++;
        totalOvertimeHours += settlement.overtimeHours;
        totalOvertimeCollected += settlement.currentOvertime;
        if (isOvertimeUnsettled(settlement)) {
          unsettledOvertimeCount++;
          if (settlement.amountOwed != null) outstandingOvertime += settlement.amountOwed;
        }
      }
    }
  }

  const monthKeys = [...new Set([...revenueByMonthMap.keys(), ...bookingsByMonthMap.keys()])].sort();

  return {
    bookingCount: bookings.length,
    realizedBookingCount,
    totalCollected,
    totalExpected,
    outstandingOvertime,
    outstandingReceivable,
    avgRevenuePerBooking: bookings.length > 0 ? totalCollected / bookings.length : null,
    totalRentedHours,
    avgRentalHours: realizedBookingCount > 0 ? totalRentedHours / realizedBookingCount : null,
    overtimeBookingCount,
    overtimeRate: realizedBookingCount > 0 ? overtimeBookingCount / realizedBookingCount : null,
    totalOvertimeHours,
    totalOvertimeCollected,
    unsettledOvertimeCount,
    revenueByMonth: monthKeys.map((k) => ({ label: monthLabel(k), value: revenueByMonthMap.get(k) ?? 0 })),
    bookingsByMonth: monthKeys.map((k) => ({ label: monthLabel(k), value: bookingsByMonthMap.get(k) ?? 0 })),
  };
}
