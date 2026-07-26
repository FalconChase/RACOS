import { getDb, currentBusinessId } from "../db";
import { queueOutbox } from "./outbox";
import { diffField, logAction } from "./actionLog";
import type { Owner } from "../types";

export async function listOwners(): Promise<Owner[]> {
  const db = await getDb();
  return db.select<Owner[]>(
    "select * from owners where business_id = ? order by full_name",
    [currentBusinessId()],
  );
}

export async function getOwnerById(id: string): Promise<Owner | null> {
  const db = await getDb();
  const rows = await db.select<Owner[]>("select * from owners where id = ?", [id]);
  return rows[0] ?? null;
}

export interface NewOwnerInput {
  full_name: string;
  // Required by the Registry form going forward — see Owner.address_* in
  // lib/types.ts for why these stay nullable at the DB level.
  address_province_id: string;
  address_municipality_id?: string;
  address_line: string;
  // Optional at intake, editable later via updateOwner.
  contact_number?: string;
}

export async function createOwner(input: NewOwnerInput): Promise<Owner> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const business_id = currentBusinessId();
  const now = new Date().toISOString();

  const owner: Owner = {
    id,
    business_id,
    full_name: input.full_name,
    address_province_id: input.address_province_id,
    address_municipality_id: input.address_municipality_id ?? null,
    address_line: input.address_line,
    contact_number: input.contact_number ?? null,
    created_at: now,
    updated_at: now,
  };

  await db.execute(
    `insert into owners
       (id, business_id, full_name, address_province_id, address_municipality_id, address_line, contact_number, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      owner.id,
      owner.business_id,
      owner.full_name,
      owner.address_province_id,
      owner.address_municipality_id,
      owner.address_line,
      owner.contact_number,
      owner.created_at,
      owner.updated_at,
    ],
  );

  await queueOutbox(db, "owners", id, "insert", owner as unknown as Record<string, unknown>);
  await logAction({ entityType: "owner", entityId: id, entityLabel: owner.full_name, action: "created" });
  return owner;
}

// Partial update — only the fields present in `patch` are changed. Every
// field that actually differs from the current row is written to
// action_logs (Settings > Action History), by field label so the log reads
// in plain English rather than raw column names.
export interface UpdateOwnerInput {
  full_name?: string;
  address_province_id?: string;
  address_municipality_id?: string | null;
  address_line?: string;
  contact_number?: string | null;
}

const OWNER_FIELD_LABELS: Record<keyof UpdateOwnerInput, string> = {
  full_name: "Full name",
  address_province_id: "Address province",
  address_municipality_id: "Address municipality",
  address_line: "Address line",
  contact_number: "Contact number",
};

export async function updateOwner(id: string, patch: UpdateOwnerInput): Promise<Owner> {
  const db = await getDb();
  const current = await getOwnerById(id);
  if (!current) throw new Error("Owner not found.");

  const now = new Date().toISOString();
  const next: Owner = { ...current, ...patch, updated_at: now };

  const changes = (Object.keys(patch) as (keyof UpdateOwnerInput)[])
    .map((field) => diffField(field, OWNER_FIELD_LABELS[field], current[field] ?? null, patch[field] ?? null))
    .filter((c): c is NonNullable<typeof c> => c !== null);

  await db.execute(
    `update owners
        set full_name = ?, address_province_id = ?, address_municipality_id = ?, address_line = ?,
            contact_number = ?, updated_at = ?
      where id = ?`,
    [
      next.full_name,
      next.address_province_id,
      next.address_municipality_id,
      next.address_line,
      next.contact_number,
      next.updated_at,
      id,
    ],
  );

  await queueOutbox(db, "owners", id, "update", next as unknown as Record<string, unknown>);
  if (changes.length > 0) {
    await logAction({ entityType: "owner", entityId: id, entityLabel: next.full_name, action: "updated", changes });
  }
  return next;
}

export async function countVehiclesForOwner(ownerId: string): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ count: number }[]>(
    "select count(*) as count from vehicles where owner_id = ?",
    [ownerId],
  );
  return rows[0]?.count ?? 0;
}

export class OwnerHasVehiclesError extends Error {
  count: number;
  constructor(count: number) {
    super(`Cannot delete — ${count} vehicle${count === 1 ? " is" : "s are"} still registered to this owner.`);
    this.name = "OwnerHasVehiclesError";
    this.count = count;
  }
}

export async function deleteOwner(id: string): Promise<void> {
  // Guard: an owner tied to any vehicle can't be deleted — every vehicle now
  // requires an owner, so removing this one would leave those vehicles
  // pointing at nothing. Reassign or delete those vehicles first.
  const vehicleCount = await countVehiclesForOwner(id);
  if (vehicleCount > 0) {
    throw new OwnerHasVehiclesError(vehicleCount);
  }

  const db = await getDb();
  await db.execute("delete from owners where id = ?", [id]);
  await queueOutbox(db, "owners", id, "delete", null);
}
