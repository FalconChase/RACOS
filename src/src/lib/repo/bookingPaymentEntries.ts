// Feature 5 (ROT051) — supplementary fee/advance-payment/note entries tied
// to a booking, wholly separate from bookings.payment_amount/
// expected_payment/additional_payment. Nothing in Settlements/Remittances/
// Outstanding reads this table — it exists purely as a staff reference.
// Freely add/edit/delete (not append-only like the ROP011 logs); every
// change is logged to action_logs the same way other booking edits are.

import { getDb, currentBusinessId } from "../db";
import { queueOutbox } from "./outbox";
import { logAction } from "./actionLog";
import { bookingRef } from "../bookingRef";
import type { BookingPaymentEntry, BookingPaymentEntryType } from "../types";

export async function listBookingPaymentEntries(bookingId: string): Promise<BookingPaymentEntry[]> {
  const db = await getDb();
  return db.select<BookingPaymentEntry[]>(
    "select * from booking_payment_entries where business_id = ? and booking_id = ? order by created_at asc",
    [currentBusinessId(), bookingId],
  );
}

const TYPE_LABELS: Record<BookingPaymentEntryType, string> = {
  fee: "Fee",
  advance_payment: "Advance payment",
  other: "Other",
};

function entryDesc(type: BookingPaymentEntryType, amount: string | null, note: string | null): string {
  const parts = [TYPE_LABELS[type]];
  if (amount?.trim()) parts.push(amount.trim());
  if (note?.trim()) parts.push(note.trim());
  return parts.join(" — ");
}

export interface NewBookingPaymentEntryInput {
  booking_id: string;
  type: BookingPaymentEntryType;
  amount?: string;
  note?: string;
}

export async function createBookingPaymentEntry(
  input: NewBookingPaymentEntryInput,
): Promise<BookingPaymentEntry> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const business_id = currentBusinessId();
  const now = new Date().toISOString();

  const entry: BookingPaymentEntry = {
    id,
    business_id,
    booking_id: input.booking_id,
    type: input.type,
    amount: input.amount?.trim() || null,
    note: input.note?.trim() || null,
    created_at: now,
    updated_at: now,
  };

  await db.execute(
    `insert into booking_payment_entries (id, business_id, booking_id, type, amount, note, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?)`,
    [entry.id, entry.business_id, entry.booking_id, entry.type, entry.amount, entry.note, entry.created_at, entry.updated_at],
  );

  await queueOutbox(db, "booking_payment_entries", id, "insert", entry as unknown as Record<string, unknown>);
  await logAction({
    entityType: "booking",
    entityId: input.booking_id,
    entityLabel: bookingRef(input.booking_id),
    action: "updated",
    changes: [{ field: "booking_payment_entries", label: "Payment entry added", old: null, new: entryDesc(entry.type, entry.amount, entry.note) }],
  });

  return entry;
}

export interface BookingPaymentEntryUpdate {
  type: BookingPaymentEntryType;
  amount?: string;
  note?: string;
}

export async function updateBookingPaymentEntry(
  id: string,
  patch: BookingPaymentEntryUpdate,
): Promise<BookingPaymentEntry> {
  const db = await getDb();
  const rows = await db.select<BookingPaymentEntry[]>("select * from booking_payment_entries where id = ?", [id]);
  const before = rows[0];
  if (!before) throw new Error("Entry not found.");

  const now = new Date().toISOString();
  const nextAmount = patch.amount?.trim() || null;
  const nextNote = patch.note?.trim() || null;
  await db.execute(
    "update booking_payment_entries set type = ?, amount = ?, note = ?, updated_at = ? where id = ?",
    [patch.type, nextAmount, nextNote, now, id],
  );

  const updatedRows = await db.select<BookingPaymentEntry[]>("select * from booking_payment_entries where id = ?", [id]);
  const updated = updatedRows[0];
  if (!updated) throw new Error("Entry not found.");

  await queueOutbox(db, "booking_payment_entries", id, "update", updated as unknown as Record<string, unknown>);

  const beforeDesc = entryDesc(before.type, before.amount, before.note);
  const afterDesc = entryDesc(updated.type, updated.amount, updated.note);
  if (beforeDesc !== afterDesc) {
    await logAction({
      entityType: "booking",
      entityId: before.booking_id,
      entityLabel: bookingRef(before.booking_id),
      action: "updated",
      changes: [{ field: "booking_payment_entries", label: "Payment entry edited", old: beforeDesc, new: afterDesc }],
    });
  }

  return updated;
}

export async function deleteBookingPaymentEntry(id: string): Promise<void> {
  const db = await getDb();
  const rows = await db.select<BookingPaymentEntry[]>("select * from booking_payment_entries where id = ?", [id]);
  const before = rows[0];
  if (!before) return;

  await db.execute("delete from booking_payment_entries where id = ?", [id]);
  await queueOutbox(db, "booking_payment_entries", id, "delete", null);

  await logAction({
    entityType: "booking",
    entityId: before.booking_id,
    entityLabel: bookingRef(before.booking_id),
    action: "updated",
    changes: [{ field: "booking_payment_entries", label: "Payment entry removed", old: entryDesc(before.type, before.amount, before.note), new: null }],
  });
}
