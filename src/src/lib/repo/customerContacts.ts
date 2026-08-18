// Extra contact entries beyond a customer's single phone/email fields (see
// customer_contacts, migration 0051) — purely additive, the existing phone/
// email columns on customers are untouched by anything here. Freely add/
// edit/delete (not append-only like the ROP011 logs); every change is
// logged to action_logs the same way other customer edits are.

import { getDb, currentBusinessId } from "../db";
import { queueOutbox } from "./outbox";
import { logAction } from "./actionLog";
import type { CustomerContact, CustomerContactType } from "../types";

export async function listCustomerContacts(customerId: string): Promise<CustomerContact[]> {
  const db = await getDb();
  return db.select<CustomerContact[]>(
    "select * from customer_contacts where business_id = ? and customer_id = ? order by created_at asc",
    [currentBusinessId(), customerId],
  );
}

// Batch variant for a screen showing many customers at once (e.g. a future
// Customers list column) — avoids one query per row. Not used yet, but
// following the same shape as listActionLogsByType's grouping convention.
export async function listCustomerContactsForBusiness(): Promise<CustomerContact[]> {
  const db = await getDb();
  return db.select<CustomerContact[]>(
    "select * from customer_contacts where business_id = ? order by created_at asc",
    [currentBusinessId()],
  );
}

function contactLabel(type: CustomerContactType, label: string | null): string {
  if (type === "other") return label?.trim() || "Other";
  return label?.trim() || (type === "phone" ? "Phone" : "Email");
}

export interface NewCustomerContactInput {
  customer_id: string;
  type: CustomerContactType;
  // Free-text "please specify" description when type === "other" (required
  // there by the form, not enforced here); optional descriptive label
  // otherwise (e.g. "Work", "Emergency").
  label?: string;
  value: string;
}

export async function createCustomerContact(
  input: NewCustomerContactInput,
  customerLabel: string,
): Promise<CustomerContact> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const business_id = currentBusinessId();
  const now = new Date().toISOString();

  const contact: CustomerContact = {
    id,
    business_id,
    customer_id: input.customer_id,
    type: input.type,
    label: input.label?.trim() || null,
    value: input.value.trim(),
    created_at: now,
    updated_at: now,
  };

  await db.execute(
    `insert into customer_contacts (id, business_id, customer_id, type, label, value, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?)`,
    [contact.id, contact.business_id, contact.customer_id, contact.type, contact.label, contact.value, contact.created_at, contact.updated_at],
  );

  await queueOutbox(db, "customer_contacts", id, "insert", contact as unknown as Record<string, unknown>);
  await logAction({
    entityType: "customer",
    entityId: input.customer_id,
    entityLabel: customerLabel,
    action: "updated",
    changes: [{ field: "customer_contacts", label: "Contact added", old: null, new: `${contactLabel(contact.type, contact.label)}: ${contact.value}` }],
  });

  return contact;
}

export interface CustomerContactUpdate {
  type: CustomerContactType;
  label?: string;
  value: string;
}

export async function updateCustomerContact(
  id: string,
  patch: CustomerContactUpdate,
  customerLabel: string,
): Promise<CustomerContact> {
  const db = await getDb();
  const rows = await db.select<CustomerContact[]>("select * from customer_contacts where id = ?", [id]);
  const before = rows[0];
  if (!before) throw new Error("Contact not found.");

  const now = new Date().toISOString();
  const nextLabel = patch.label?.trim() || null;
  const nextValue = patch.value.trim();
  await db.execute(
    "update customer_contacts set type = ?, label = ?, value = ?, updated_at = ? where id = ?",
    [patch.type, nextLabel, nextValue, now, id],
  );

  const updatedRows = await db.select<CustomerContact[]>("select * from customer_contacts where id = ?", [id]);
  const updated = updatedRows[0];
  if (!updated) throw new Error("Contact not found.");

  await queueOutbox(db, "customer_contacts", id, "update", updated as unknown as Record<string, unknown>);

  const before_desc = `${contactLabel(before.type, before.label)}: ${before.value}`;
  const after_desc = `${contactLabel(updated.type, updated.label)}: ${updated.value}`;
  if (before_desc !== after_desc) {
    await logAction({
      entityType: "customer",
      entityId: before.customer_id,
      entityLabel: customerLabel,
      action: "updated",
      changes: [{ field: "customer_contacts", label: "Contact edited", old: before_desc, new: after_desc }],
    });
  }

  return updated;
}

export async function deleteCustomerContact(id: string, customerLabel: string): Promise<void> {
  const db = await getDb();
  const rows = await db.select<CustomerContact[]>("select * from customer_contacts where id = ?", [id]);
  const before = rows[0];
  if (!before) return;

  await db.execute("delete from customer_contacts where id = ?", [id]);
  await queueOutbox(db, "customer_contacts", id, "delete", null);

  await logAction({
    entityType: "customer",
    entityId: before.customer_id,
    entityLabel: customerLabel,
    action: "updated",
    changes: [{ field: "customer_contacts", label: "Contact removed", old: `${contactLabel(before.type, before.label)}: ${before.value}`, new: null }],
  });
}
