import { getDb, currentBusinessId } from "../db";
import { queueOutbox } from "./outbox";
import type { Vehicle, VehicleStatus } from "../types";

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
  make?: string;
  model?: string;
  year?: number;
  daily_rate?: string;
  seats?: number;
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
    make: input.make ?? null,
    model: input.model ?? null,
    year: input.year ?? null,
    status: "available",
    daily_rate: input.daily_rate ?? null,
    seats: input.seats ?? null,
    created_at: now,
    updated_at: now,
  };

  await db.execute(
    `insert into vehicles
       (id, business_id, plate_number, make, model, year, status, daily_rate, seats, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      vehicle.created_at,
      vehicle.updated_at,
    ],
  );

  await queueOutbox(db, "vehicles", id, "insert", vehicle as unknown as Record<string, unknown>);
  return vehicle;
}

export async function updateVehicleStatus(id: string, status: VehicleStatus): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute("update vehicles set status = ?, updated_at = ? where id = ?", [status, now, id]);

  const rows = await db.select<Vehicle[]>("select * from vehicles where id = ?", [id]);
  if (rows[0]) await queueOutbox(db, "vehicles", id, "update", rows[0] as unknown as Record<string, unknown>);
}

export async function deleteVehicle(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("delete from vehicles where id = ?", [id]);
  await queueOutbox(db, "vehicles", id, "delete", null);
}
