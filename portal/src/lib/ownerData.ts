// ROT020 remaining scope — real data screens. Every query here rides the
// owner's session JWT (createOwnerClient) straight through PostgREST; RLS
// (ROP009 migration — owner_read_own_vehicles/owner_read_own_bookings) is
// what actually scopes results to this owner's vehicles, not app logic —
// these functions never filter by owner_id themselves.
//
// Money fields (payment_amount/expected_payment/resolved_rate/
// additional_payment) are exact-decimal text on the wire (see
// SCHEMA_LIBRARY.md) — Number()-parsed here the same way the desktop app's
// own correctBookingPayment() does, purely for display/summing.

import { createOwnerClient } from "./supabaseClient";

export type VehicleStatus = "available" | "rented" | "maintenance" | "retired";

export interface OwnerVehicle {
  id: string;
  plate_number: string;
  make: string | null;
  model: string | null;
  year: number | null;
  status: VehicleStatus;
  seats: number | null;
  chassis_number: string | null;
  engine_number: string | null;
  created_at: string;
}

export type BookingStatus = "pending" | "confirmed" | "active" | "completed" | "cancelled";

export interface OwnerBooking {
  id: string;
  vehicle_id: string;
  start_date: string;
  end_date: string;
  status: BookingStatus;
  destination_label: string | null;
  purpose: string | null;
  payment_amount: string | null;
  expected_payment: string | null;
  additional_payment: string | null;
  actual_departure_at: string | null;
  actual_return_at: string | null;
  created_at: string;
  vehicle: { plate_number: string; make: string | null; model: string | null } | null;
}

export async function fetchOwnerVehicles(token: string): Promise<OwnerVehicle[]> {
  const client = createOwnerClient(token);
  const { data, error } = await client
    .from("vehicles")
    .select("id, plate_number, make, model, year, status, seats, chassis_number, engine_number, created_at")
    .order("plate_number", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as OwnerVehicle[];
}

export async function fetchOwnerBookings(token: string, limit = 200): Promise<OwnerBooking[]> {
  const client = createOwnerClient(token);
  const { data, error } = await client
    .from("bookings")
    .select(
      "id, vehicle_id, start_date, end_date, status, destination_label, purpose, payment_amount, expected_payment, additional_payment, actual_departure_at, actual_return_at, created_at, vehicle:vehicles(plate_number, make, model)",
    )
    .order("start_date", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  // Supabase's TS types infer the embedded relation as an array even for a
  // to-one FK join — vehicle_id -> vehicles.id is many-to-one, so it's
  // always at most one row; normalize it here rather than fighting the
  // generated type everywhere this is consumed.
  return ((data ?? []) as unknown as (Omit<OwnerBooking, "vehicle"> & {
    vehicle: OwnerBooking["vehicle"] | OwnerBooking["vehicle"][];
  })[]).map((row) => ({
    ...row,
    vehicle: Array.isArray(row.vehicle) ? (row.vehicle[0] ?? null) : row.vehicle,
  }));
}

export function money(value: string | null): number {
  if (!value) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatPeso(value: number): string {
  return `₱${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface FinancialsSummary {
  totalCollected: number;
  totalExpected: number;
  completedCount: number;
  perVehicle: { vehicleId: string; label: string; collected: number; expected: number; count: number }[];
}

export function summarizeFinancials(bookings: OwnerBooking[]): FinancialsSummary {
  const perVehicle = new Map<string, { label: string; collected: number; expected: number; count: number }>();
  let totalCollected = 0;
  let totalExpected = 0;
  let completedCount = 0;

  for (const b of bookings) {
    if (b.status === "cancelled") continue;
    const collected = money(b.payment_amount) + money(b.additional_payment);
    const expected = money(b.expected_payment);
    totalCollected += collected;
    totalExpected += expected;
    if (b.status === "completed") completedCount++;

    const label = b.vehicle?.plate_number ?? b.vehicle_id;
    const entry = perVehicle.get(b.vehicle_id) ?? { label, collected: 0, expected: 0, count: 0 };
    entry.collected += collected;
    entry.expected += expected;
    entry.count += 1;
    perVehicle.set(b.vehicle_id, entry);
  }

  return {
    totalCollected,
    totalExpected,
    completedCount,
    perVehicle: Array.from(perVehicle.entries()).map(([vehicleId, v]) => ({ vehicleId, ...v })),
  };
}
