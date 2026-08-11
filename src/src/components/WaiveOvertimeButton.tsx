import { useState } from "react";
import { waiveOvertimeBalance } from "../lib/repo/bookings";
import { bookingRef } from "../lib/bookingRef";
import ConfirmDialog from "./ConfirmDialog";
import type { Booking } from "../lib/types";

function formatMoney(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

// The "final settlement" action — writes off whatever's left of a booking's
// overtime top-up via waiveOvertimeBalance, closing it out as fully settled
// without ever touching additional_payment (the true collected figure).
// Shared by Settlements > Records' "Edit payment" and Customers >
// Outstanding's "Settle overtime", same as OvertimeSettleForm, so a write-off
// from either screen behaves identically — same typed-confirmation speed
// bump either way, since this discards money the expected-payment formula
// says was owed.
export default function WaiveOvertimeButton({
  booking,
  // The overtime amount about to be recorded (or already recorded, if the
  // caller isn't also changing it) — used only to describe what's being
  // written off, never to change the save logic here.
  pendingOvertimeAmount,
  overtimeExpected,
  onWaived,
}: {
  booking: Booking;
  pendingOvertimeAmount: number;
  overtimeExpected: number | null;
  onWaived: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = overtimeExpected != null ? Math.max(0, overtimeExpected - pendingOvertimeAmount) : null;

  async function handleConfirm() {
    setError(null);
    setBusy(true);
    try {
      await waiveOvertimeBalance(booking.id);
      setConfirming(false);
      onWaived();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        className="text-sm font-medium"
        style={{ color: "var(--text-warning)" }}
      >
        Final settlement (write off balance)
      </button>

      {confirming && (
        <ConfirmDialog
          title="Write off remaining overtime balance?"
          description={
            <>
              {error && (
                <p className="mb-2" style={{ color: "var(--text-danger)" }}>{error}</p>
              )}
              This permanently marks <strong>{bookingRef(booking.id)}</strong>&rsquo;s overtime as fully settled
              {remaining != null ? (
                <>
                  {" "}
                  and writes off <strong>{formatMoney(remaining)}</strong> that would otherwise still be owed
                  {overtimeExpected != null ? <> (out of {formatMoney(overtimeExpected)} expected)</> : null}.
                </>
              ) : (
                <> without collecting any more of it.</>
              )}{" "}
              It stays off Outstanding for good — there&rsquo;s no undo for this.
            </>
          }
          confirmLabel="Write off & settle"
          requireTypedConfirmation="WRITE OFF"
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(false)}
          busy={busy}
        />
      )}
    </>
  );
}
