import { useState } from "react";
import { bookingRef } from "../lib/bookingRef";
import { CANCELLATION_REASON_LABELS, type CancellationReason } from "../lib/repo/bookings";
import type { Booking } from "../lib/types";

interface CancelBookingDialogProps {
  booking: Booking;
  onCancel: () => void;
  onConfirm: (reason: CancellationReason, otherDetail?: string) => void | Promise<void>;
  busy?: boolean;
}

const REASON_ORDER: CancellationReason[] = ["neverArrived", "returnedUnit", "other"];

// Replaces the old inline "Cancel this booking? Yes / No" row — cancelling
// now always requires picking a reason, permanently recorded with the
// cancellation for the audit trail (see cancelBooking). Modeled on
// ArrivalDialog/EditBookingTimesDialog's modal pattern rather than cramming
// a reason picker into the table row.
export default function CancelBookingDialog({ booking, onCancel, onConfirm, busy }: CancelBookingDialogProps) {
  const [reason, setReason] = useState<CancellationReason>("neverArrived");
  const [otherDetail, setOtherDetail] = useState("");

  const error = reason === "other" && otherDetail.trim().length === 0 ? "Please specify a reason." : null;

  function handleConfirm() {
    if (error || busy) return;
    onConfirm(reason, reason === "other" ? otherDetail.trim() : undefined);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0, 0, 0, 0.6)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg p-5"
        style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Cancel {bookingRef(booking.id)}?
        </h3>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          This can't be undone. Pick the reason closest to what happened — it's recorded permanently with this cancellation.
        </p>

        <div className="mt-4 space-y-2.5">
          {REASON_ORDER.map((key) => (
            <label key={key} className="flex cursor-pointer items-start gap-2.5">
              <input
                type="radio"
                name="cancellation-reason"
                className="mt-1 h-4 w-4"
                checked={reason === key}
                onChange={() => setReason(key)}
              />
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                {CANCELLATION_REASON_LABELS[key]}
              </span>
            </label>
          ))}
          {reason === "other" && (
            <input
              autoFocus
              type="text"
              className="w-full rounded-md px-3 py-2.5 text-base"
              style={{ border: "0.5px solid var(--border-strong)", background: "var(--surface-2)", color: "var(--text-primary)" }}
              value={otherDetail}
              onChange={(e) => setOtherDetail(e.target.value)}
              placeholder="Please specify…"
            />
          )}
          {error && <p className="text-sm" style={{ color: "var(--text-danger)" }}>{error}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-base font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            Never mind
          </button>
          <button
            onClick={handleConfirm}
            disabled={Boolean(error) || busy}
            className="rounded-md px-4 py-2 text-base font-medium disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: "var(--bg-danger)", color: "var(--text-danger)" }}
          >
            {busy ? "Cancelling…" : "Yes, cancel booking"}
          </button>
        </div>
      </div>
    </div>
  );
}
