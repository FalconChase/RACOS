import { useEffect, useState } from "react";
import {
  createBookingPaymentEntry,
  deleteBookingPaymentEntry,
  listBookingPaymentEntries,
  updateBookingPaymentEntry,
} from "../lib/repo/bookingPaymentEntries";
import type { Booking, BookingPaymentEntry, BookingPaymentEntryType } from "../lib/types";

const inputStyle: React.CSSProperties = {
  border: "0.5px solid var(--border-strong)",
  background: "var(--surface-2)",
  color: "var(--text-primary)",
};

const TYPE_LABELS: Record<BookingPaymentEntryType, string> = {
  fee: "Fee",
  advance_payment: "Advance payment",
  other: "Other",
};

function isValidAmount(amount: string): boolean {
  if (!amount.trim()) return true; // optional, blank is fine
  const n = Number(amount);
  return Number.isFinite(n) && n >= 0;
}

// A purely supplementary, informational multi-row breakdown of fees/advance
// payments/notes for a booking — never read by payment_amount/
// expected_payment/additional_payment or any Settlements/Remittances/
// Outstanding computation (see booking_payment_entries, migration 0054;
// the original separate `label` field was dropped as redundant, migration
// 0055 — `note` carries any "please specify" detail now). hideHeader/
// onClose are optional — set hideHeader when this is embedded inside a
// wrapper that already provides its own heading and close affordance (e.g.
// BookingPaymentEntriesDialog's modal shell).
export default function BookingPaymentEntriesPanel({
  booking,
  onClose,
  hideHeader,
}: {
  booking: Booking;
  onClose?: () => void;
  hideHeader?: boolean;
}) {
  const [entries, setEntries] = useState<BookingPaymentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setEntries(await listBookingPaymentEntries(booking.id));
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking.id]);

  async function handleDelete(id: string) {
    setError(null);
    try {
      await deleteBookingPaymentEntry(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-3 rounded-md p-3" style={{ background: "var(--surface-2)" }}>
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Payment breakdown
          </p>
          {onClose && (
            <button onClick={onClose} className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Close
            </button>
          )}
        </div>
      )}

      {error && (
        <div
          className="flex items-start justify-between gap-4 rounded-md p-2.5 text-sm"
          style={{ background: "var(--bg-danger)", color: "var(--text-danger)" }}
        >
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 font-medium">Dismiss</button>
        </div>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : entries.length === 0 && !adding ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          No fees, advance payments, or notes on file yet — this never affects Payment amount or Settlements.
        </p>
      ) : (
        <div className="space-y-1.5">
          {entries.map((entry) =>
            editingId === entry.id ? (
              <EntryEditRow
                key={entry.id}
                entry={entry}
                onCancel={() => setEditingId(null)}
                onSaved={async () => {
                  setEditingId(null);
                  await refresh();
                }}
              />
            ) : (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm"
                style={{ background: "var(--surface-1)" }}
              >
                <div>
                  <span className="font-medium" style={{ color: "var(--text-primary)" }}>{TYPE_LABELS[entry.type]}</span>
                  {entry.amount && <span className="ml-2" style={{ color: "var(--text-secondary)" }}>{entry.amount}</span>}
                  {entry.note && (
                    <span className="ml-2 italic" style={{ color: "var(--text-muted)" }}>{entry.note}</span>
                  )}
                </div>
                <div className="flex shrink-0 gap-3">
                  <button onClick={() => setEditingId(entry.id)} className="text-sm font-medium" style={{ color: "var(--text-accent)" }}>
                    Edit
                  </button>
                  <button onClick={() => handleDelete(entry.id)} className="text-sm font-medium" style={{ color: "var(--text-danger)" }}>
                    Remove
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      )}

      {adding ? (
        <EntryAddRow
          bookingId={booking.id}
          onCancel={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await refresh();
          }}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="text-sm font-medium"
          style={{ color: "var(--text-accent)" }}
        >
          + Add entry
        </button>
      )}
    </div>
  );
}

// Exported for other draft/staging editors to reuse the exact same inputs.
export function EntryFields({
  type,
  setType,
  amount,
  setAmount,
  note,
  setNote,
}: {
  type: BookingPaymentEntryType;
  setType: (t: BookingPaymentEntryType) => void;
  amount: string;
  setAmount: (v: string) => void;
  note: string;
  setNote: (v: string) => void;
}) {
  const amountInvalid = amount.trim() !== "" && !isValidAmount(amount);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <select
          className="rounded-md px-3 py-2 text-sm"
          style={inputStyle}
          value={type}
          onChange={(e) => setType(e.target.value as BookingPaymentEntryType)}
        >
          <option value="fee">Fee</option>
          <option value="advance_payment">Advance payment</option>
          <option value="other">Other</option>
        </select>
        <input
          className="rounded-md px-3 py-2 text-sm"
          style={inputStyle}
          placeholder="Amount (optional)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <input
          className="rounded-md px-3 py-2 text-sm"
          style={inputStyle}
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      {amountInvalid && (
        <p className="text-sm" style={{ color: "var(--text-danger)" }}>Amount must be a non-negative number.</p>
      )}
    </div>
  );
}

function EntryAddRow({
  bookingId,
  onCancel,
  onSaved,
}: {
  bookingId: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<BookingPaymentEntryType>("fee");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = (amount.trim().length > 0 || note.trim().length > 0) && isValidAmount(amount);

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await createBookingPaymentEntry({
        booking_id: bookingId,
        type,
        amount: amount.trim() || undefined,
        note: note.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md p-2.5" style={{ border: "0.5px dashed var(--border-strong)" }}>
      <EntryFields type={type} setType={setType} amount={amount} setAmount={setAmount} note={note} setNote={setNote} />
      {error && <p className="text-sm" style={{ color: "var(--text-danger)" }}>{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel} className="rounded-md px-3 py-1.5 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function EntryEditRow({
  entry,
  onCancel,
  onSaved,
}: {
  entry: BookingPaymentEntry;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<BookingPaymentEntryType>(entry.type);
  const [amount, setAmount] = useState(entry.amount ?? "");
  const [note, setNote] = useState(entry.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = (amount.trim().length > 0 || note.trim().length > 0) && isValidAmount(amount);

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await updateBookingPaymentEntry(entry.id, {
        type,
        amount: amount.trim() || undefined,
        note: note.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md p-2.5" style={{ border: "0.5px solid var(--border-strong)" }}>
      <EntryFields type={type} setType={setType} amount={amount} setAmount={setAmount} note={note} setNote={setNote} />
      {error && <p className="text-sm" style={{ color: "var(--text-danger)" }}>{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel} className="rounded-md px-3 py-1.5 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
