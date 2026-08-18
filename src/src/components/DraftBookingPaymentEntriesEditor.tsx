import { useState } from "react";
import { EntryFields } from "./BookingPaymentEntriesPanel";
import type { BookingPaymentEntryType } from "../lib/types";

// One not-yet-saved payment-breakdown entry, staged on the New rental form
// before the booking has a real id — see DraftPaymentEntry usage in
// BookingsScreen.saveBooking(), which loops these through
// createBookingPaymentEntry() right after createBooking() succeeds.
//
// NOTE: the New rental wizard's Payment step now uses PaymentBreakdownGrid
// instead of this list-style editor (see BookingsScreen.tsx) — this file is
// currently unused there, kept only in case a future list-style surface
// wants the same staging pattern DraftContactsEditor uses.
export interface DraftPaymentEntry {
  type: BookingPaymentEntryType;
  amount: string;
  note: string;
}

const TYPE_LABELS: Record<BookingPaymentEntryType, string> = { fee: "Fee", advance_payment: "Advance payment", other: "Other" };

function displayTag(e: DraftPaymentEntry): string {
  return TYPE_LABELS[e.type];
}

function isValidAmount(amount: string): boolean {
  if (!amount.trim()) return true;
  const n = Number(amount);
  return Number.isFinite(n) && n >= 0;
}

export default function DraftBookingPaymentEntriesEditor({
  entries,
  setEntries,
}: {
  entries: DraftPaymentEntry[];
  setEntries: (updater: (prev: DraftPaymentEntry[]) => DraftPaymentEntry[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<BookingPaymentEntryType>("fee");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const canAdd = (amount.trim().length > 0 || note.trim().length > 0) && isValidAmount(amount);

  function handleAdd() {
    if (!canAdd) return;
    setEntries((prev) => [...prev, { type, amount: amount.trim(), note: note.trim() }]);
    setType("fee");
    setAmount("");
    setNote("");
    setAdding(false);
  }

  function handleRemove(index: number) {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      {entries.length > 0 && (
        <div className="space-y-1.5">
          {entries.map((e, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm"
              style={{ background: "var(--surface-2)" }}
            >
              <div>
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>{displayTag(e)}</span>
                {e.amount && <span className="ml-2" style={{ color: "var(--text-secondary)" }}>{e.amount}</span>}
                {e.note && <span className="ml-2 italic" style={{ color: "var(--text-muted)" }}>{e.note}</span>}
              </div>
              <button onClick={() => handleRemove(i)} className="text-sm font-medium" style={{ color: "var(--text-danger)" }}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div className="space-y-2 rounded-md p-2.5" style={{ border: "0.5px dashed var(--border-strong)" }}>
          <EntryFields type={type} setType={setType} amount={amount} setAmount={setAmount} note={note} setNote={setNote} />
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={!canAdd}
              className="rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
            >
              Add
            </button>
            <button onClick={() => setAdding(false)} className="rounded-md px-3 py-1.5 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="text-sm font-medium" style={{ color: "var(--text-accent)" }}>
          + Add entry
        </button>
      )}
    </div>
  );
}
