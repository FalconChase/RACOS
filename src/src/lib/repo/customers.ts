import { getDb, currentBusinessId } from "../db";
import { queueOutbox } from "./outbox";
import { diffField, logAction } from "./actionLog";
import type { ActionLogChange, Customer } from "../types";

export async function listCustomers(): Promise<Customer[]> {
  const db = await getDb();
  return db.select<Customer[]>(
    "select * from customers where business_id = ? order by created_at desc",
    [currentBusinessId()],
  );
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  const db = await getDb();
  const rows = await db.select<Customer[]>("select * from customers where id = ?", [id]);
  return rows[0] ?? null;
}

export interface NewCustomerInput {
  full_name: string;
  email?: string;
  phone?: string;
  license_number?: string;
  // Optional at intake, same as everything below — editable later via
  // updateCustomerAddress.
  address_province_id?: string;
  address_municipality_id?: string;
  address_line?: string;
}

export async function createCustomer(input: NewCustomerInput): Promise<Customer> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const business_id = currentBusinessId();
  const now = new Date().toISOString();

  const customer: Customer = {
    id,
    business_id,
    full_name: input.full_name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    license_number: input.license_number ?? null,
    address_province_id: input.address_province_id ?? null,
    address_municipality_id: input.address_municipality_id ?? null,
    address_line: input.address_line ?? null,
    created_at: now,
    updated_at: now,
  };

  await db.execute(
    `insert into customers
       (id, business_id, full_name, email, phone, license_number,
        address_province_id, address_municipality_id, address_line, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      customer.id,
      customer.business_id,
      customer.full_name,
      customer.email,
      customer.phone,
      customer.license_number,
      customer.address_province_id,
      customer.address_municipality_id,
      customer.address_line,
      customer.created_at,
      customer.updated_at,
    ],
  );

  await queueOutbox(db, "customers", id, "insert", customer as unknown as Record<string, unknown>);
  return customer;
}

// Corrects/fills in a customer's address after the fact — the "editable
// later" half of intake leaving it optional. Deliberately narrow, same
// spirit as updateBookingTimes: only the three address fields, never name/
// email/phone/license (those still have no edit path of their own yet).
// Logged to action_logs the same way owner/vehicle edits are.
export interface CustomerAddressUpdate {
  address_province_id: string | null;
  address_municipality_id: string | null;
  address_line: string | null;
}

const CUSTOMER_ADDRESS_FIELD_LABELS: Record<keyof CustomerAddressUpdate, string> = {
  address_province_id: "Address province",
  address_municipality_id: "Address city/municipality",
  address_line: "Street address",
};

export async function updateCustomerAddress(id: string, patch: CustomerAddressUpdate): Promise<Customer> {
  const db = await getDb();
  const before = await getCustomerById(id);
  if (!before) throw new Error("Customer not found.");

  const now = new Date().toISOString();
  await db.execute(
    `update customers
        set address_province_id = ?, address_municipality_id = ?, address_line = ?, updated_at = ?
      where id = ?`,
    [patch.address_province_id, patch.address_municipality_id, patch.address_line, now, id],
  );

  const rows = await db.select<Customer[]>("select * from customers where id = ?", [id]);
  const updated = rows[0];
  if (!updated) throw new Error("Customer not found.");

  await queueOutbox(db, "customers", id, "update", updated as unknown as Record<string, unknown>);

  const changes: ActionLogChange[] = (Object.keys(patch) as (keyof CustomerAddressUpdate)[])
    .map((field) => diffField(field, CUSTOMER_ADDRESS_FIELD_LABELS[field], before[field], patch[field]))
    .filter((c): c is NonNullable<typeof c> => c !== null);

  if (changes.length > 0) {
    await logAction({ entityType: "customer", entityId: id, entityLabel: updated.full_name, action: "updated", changes });
  }

  return updated;
}

// Same narrow, single-field spirit as updateCustomerAddress, just for phone
// — used by the booking wizard's Profile step so staff can fill in or
// correct a customer's number right there instead of leaving to Customers.
export async function updateCustomerPhone(id: string, phone: string | null): Promise<Customer> {
  const db = await getDb();
  const before = await getCustomerById(id);
  if (!before) throw new Error("Customer not found.");
  if (before.phone === phone) return before;

  const now = new Date().toISOString();
  await db.execute("update customers set phone = ?, updated_at = ? where id = ?", [phone, now, id]);

  const rows = await db.select<Customer[]>("select * from customers where id = ?", [id]);
  const updated = rows[0];
  if (!updated) throw new Error("Customer not found.");

  await queueOutbox(db, "customers", id, "update", updated as unknown as Record<string, unknown>);

  const change = diffField("phone", "Phone", before.phone, phone);
  if (change) {
    await logAction({ entityType: "customer", entityId: id, entityLabel: updated.full_name, action: "updated", changes: [change] });
  }

  return updated;
}

export async function deleteCustomer(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("delete from customers where id = ?", [id]);
  await queueOutbox(db, "customers", id, "delete", null);
}
