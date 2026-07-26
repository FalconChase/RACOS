import { getDb, currentBusinessId } from "../db";
import { queueOutbox } from "./outbox";
import type { Customer } from "../types";

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
    created_at: now,
    updated_at: now,
  };

  await db.execute(
    `insert into customers
       (id, business_id, full_name, email, phone, license_number, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      customer.id,
      customer.business_id,
      customer.full_name,
      customer.email,
      customer.phone,
      customer.license_number,
      customer.created_at,
      customer.updated_at,
    ],
  );

  await queueOutbox(db, "customers", id, "insert", customer as unknown as Record<string, unknown>);
  return customer;
}

export async function deleteCustomer(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("delete from customers where id = ?", [id]);
  await queueOutbox(db, "customers", id, "delete", null);
}
