import { getDb, currentBusinessId } from "../db";
import { queueOutbox } from "./outbox";
import { diffField, logAction } from "./actionLog";
import type { Vehicle, VehicleStatus, VehicleImageFit } from "../types";

export async function listVehicles(): Promise<Vehicle[]> {
  const db = await getDb();
  return db.select<Vehicle[]>(
    "select * from vehicles where business_id = ? order by created_at desc",
    [currentBusinessId()],
  );
}

export async function getVehicleById(id: string): Promise<Vehicle | null> {
  const db = await getDb();
  const rows = await db.select<Vehicle[]>("select * from vehicles where id = ?", [id]);
  return rows[0] ?? null;
}

export interface NewVehicleInput {
  plate_number: string;
  make: string;
  model: string;
  year?: number;
  // Determines the seating band (and therefore the Rate Matrix row) this
  // vehicle prices against — required now that daily_rate is no longer
  // collected on this form.
  seats: number;
  // Every vehicle must be tied to a registered owner going forward.
  owner_id: string;
  // Optional at intake (Registry form), editable later via updateVehicle.
  chassis_number?: string;
  engine_number?: string;
  gps_device_id?: string;
  gps_provider?: string;
  gps_notes?: string;
  // Local-only detail fields (Fleet car-detail popup) — not collected on the
  // intake form, only ever set later via the Registry Vehicles edit form.
  fuel?: string;
  fuel_capacity?: string;
  transmission?: string;
  car_image?: string;
  car_image_fit?: VehicleImageFit;
}

export async function createVehicle(input: NewVehicleInput): Promise<Vehicle> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const business_id = currentBusinessId();
  const now = new Date().toISOString();

  const vehicle: Vehicle = {
    id,
    business_id,
    plate_number: input.plate_number,
    make: input.make,
    model: input.model,
    year: input.year ?? null,
    status: "available",
    // No longer collected on the registration form — the Rate Matrix owns
    // pricing now. Stays null; the "vehicle's own rate" fallback in
    // resolveRate only ever applies to legacy vehicles that already had one.
    daily_rate: null,
    seats: input.seats,
    owner_id: input.owner_id,
    chassis_number: input.chassis_number ?? null,
    engine_number: input.engine_number ?? null,
    gps_device_id: input.gps_device_id ?? null,
    gps_provider: input.gps_provider ?? null,
    gps_notes: input.gps_notes ?? null,
    fuel: input.fuel ?? null,
    fuel_capacity: input.fuel_capacity ?? null,
    transmission: input.transmission ?? null,
    car_image: input.car_image ?? null,
    car_image_fit: input.car_image_fit ?? "cover",
    created_at: now,
    updated_at: now,
  };

  await db.execute(
    `insert into vehicles
       (id, business_id, plate_number, make, model, year, status, daily_rate, seats, owner_id,
        chassis_number, engine_number, gps_device_id, gps_provider, gps_notes,
        fuel, fuel_capacity, transmission, car_image, car_image_fit, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      vehicle.id,
      vehicle.business_id,
      vehicle.plate_number,
      vehicle.make,
      vehicle.model,
      vehicle.year,
      vehicle.status,
      vehicle.daily_rate,
      vehicle.seats,
      vehicle.owner_id,
      vehicle.chassis_number,
      vehicle.engine_number,
      vehicle.gps_device_id,
      vehicle.gps_provider,
      vehicle.gps_notes,
      vehicle.fuel,
      vehicle.fuel_capacity,
      vehicle.transmission,
      vehicle.car_image,
      vehicle.car_image_fit,
      vehicle.created_at,
      vehicle.updated_at,
    ],
  );

  await queueOutbox(db, "vehicles", id, "insert", vehicle as unknown as Record<string, unknown>);
  await logAction({ entityType: "vehicle", entityId: id, entityLabel: vehicle.plate_number, action: "created" });
  return vehicle;
}

// Partial update — only the fields present in `patch` are changed. Every
// field that actually differs from the current row is written to
// action_logs (Settings > Action History).
export interface UpdateVehicleInput {
  plate_number?: string;
  make?: string;
  model?: string;
  year?: number | null;
  seats?: number;
  owner_id?: string;
  chassis_number?: string | null;
  engine_number?: string | null;
  gps_device_id?: string | null;
  gps_provider?: string | null;
  gps_notes?: string | null;
  fuel?: string | null;
  fuel_capacity?: string | null;
  transmission?: string | null;
  car_image?: string | null;
  car_image_fit?: VehicleImageFit;
}

const VEHICLE_FIELD_LABELS: Record<keyof UpdateVehicleInput, string> = {
  plate_number: "Plate number",
  make: "Make",
  model: "Model",
  year: "Year",
  seats: "Seats",
  owner_id: "Owner",
  chassis_number: "Chassis number",
  engine_number: "Engine number",
  gps_device_id: "GPS device ID",
  gps_provider: "GPS provider",
  gps_notes: "GPS notes",
  fuel: "Fuel",
  fuel_capacity: "Fuel capacity",
  transmission: "Transmission",
  car_image: "Car image",
  car_image_fit: "Car image fit",
};

export async function updateVehicle(id: string, patch: UpdateVehicleInput): Promise<Vehicle> {
  const db = await getDb();
  const current = await getVehicleById(id);
  if (!current) throw new Error("Vehicle not found.");

  const now = new Date().toISOString();
  const next: Vehicle = { ...current, ...patch, updated_at: now };

  const changes = (Object.keys(patch) as (keyof UpdateVehicleInput)[])
    .map((field) => {
      const oldValue = current[field];
      const newValue = patch[field];
      // car_image holds a base64 data URL — logging its actual value would
      // dump a huge blob into action_logs, so it only ever gets a plain
      // "(image) -> (image)" marker recording that it changed, never the
      // real contents.
      if (field === "car_image") {
        return oldValue === newValue
          ? null
          : diffField(field, VEHICLE_FIELD_LABELS[field], oldValue ? "(image)" : null, newValue ? "(image)" : null);
      }
      return diffField(
        field,
        VEHICLE_FIELD_LABELS[field],
        oldValue === null || oldValue === undefined ? null : String(oldValue),
        newValue === null || newValue === undefined ? null : String(newValue),
      );
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  await db.execute(
    `update vehicles
        set plate_number = ?, make = ?, model = ?, year = ?, seats = ?, owner_id = ?,
            chassis_number = ?, engine_number = ?, gps_device_id = ?, gps_provider = ?, gps_notes = ?,
            fuel = ?, fuel_capacity = ?, transmission = ?, car_image = ?, car_image_fit = ?,
            updated_at = ?
      where id = ?`,
    [
      next.plate_number,
      next.make,
      next.model,
      next.year,
      next.seats,
      next.owner_id,
      next.chassis_number,
      next.engine_number,
      next.gps_device_id,
      next.gps_provider,
      next.gps_notes,
      next.fuel,
      next.fuel_capacity,
      next.transmission,
      next.car_image,
      next.car_image_fit,
      next.updated_at,
      id,
    ],
  );

  await queueOutbox(db, "vehicles", id, "update", next as unknown as Record<string, unknown>);
  if (changes.length > 0) {
    await logAction({ entityType: "vehicle", entityId: id, entityLabel: next.plate_number, action: "updated", changes });
  }
  return next;
}

export async function updateVehicleStatus(id: string, status: VehicleStatus): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute("update vehicles set status = ?, updated_at = ? where id = ?", [status, now, id]);

  const rows = await db.select<Vehicle[]>("select * from vehicles where id = ?", [id]);
  if (rows[0]) await queueOutbox(db, "vehicles", id, "update", rows[0] as unknown as Record<string, unknown>);
}

// Statuses that count as "this vehicle is actively booked" for the deletion
// guard below — mirrors ONGOING_STATUSES in BookingsScreen.tsx.
const ACTIVE_BOOKING_STATUSES = ["pending", "confirmed", "active"];

export async function countActiveBookingsForVehicle(vehicleId: string): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ count: number }[]>(
    `select count(*) as count from bookings
     where vehicle_id = ? and status in (${ACTIVE_BOOKING_STATUSES.map(() => "?").join(", ")})`,
    [vehicleId, ...ACTIVE_BOOKING_STATUSES],
  );
  return rows[0]?.count ?? 0;
}

export class VehicleHasActiveBookingsError extends Error {
  count: number;
  constructor(count: number) {
    super(`Cannot delete — ${count} active booking${count === 1 ? "" : "s"} still reference this vehicle.`);
    this.name = "VehicleHasActiveBookingsError";
    this.count = count;
  }
}

export async function deleteVehicle(id: string): Promise<void> {
  // Guard: block deletion outright while this vehicle is actually out on (or
  // holding) a rental — pending/confirmed/active bookings. Completed/cancelled
  // history doesn't block this check, but see the catch below: the bookings
  // table's vehicle_id FK is NOT NULL with no ON DELETE clause, so SQLite
  // still refuses the physical delete while ANY booking row (including
  // history) references this vehicle.
  const activeCount = await countActiveBookingsForVehicle(id);
  if (activeCount > 0) {
    throw new VehicleHasActiveBookingsError(activeCount);
  }

  const db = await getDb();
  try {
    await db.execute("delete from vehicles where id = ?", [id]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes("foreign key")) {
      throw new Error(
        "Cannot delete — this vehicle still has booking history (completed/cancelled) on file, and removing it would break those records. Mark this vehicle Retired instead of deleting it, so its history stays intact.",
      );
    }
    throw err;
  }
  await queueOutbox(db, "vehicles", id, "delete", null);
}
