import { useState } from "react";
import { correctBookingPayment } from "../lib/repo/bookings";
import { formatHoursAsHHMM } from "../lib/duration";
import { bookingRef } from "../lib/bookingRef";
import ConfirmDialog from "./ConfirmDialog";
import WaiveOvertimeButton from "./WaiveOvertimeButton";
import type { Booking } from "../lib/types";

const inputStyle: React.CSSProperties = {
  border: "0.5px solid var(--border-strong)",
  background: "var(--surface-2)",
  color: "var(--text-primary)",
};

function formatMoney(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

// The one place the overtime top-up gets corrected — same floor (can't drop
// below what's already recorded) and cap (never past the rate-formula
// expected amount) rules everywhere it's used: Settlements > Records' "Edit
// payment" and Customers > Outstanding's "Settle overtime" both render this
// exact component, so settling from either screen behaves identically and
// the other picks up the change on its next refresh (same bookings row,
// same correctBookingPayment call).
export default function OvertimeSettleForm({
  booking,
  overtimeExpected,
  overtimeHours,
  onCancel,
  onSaved,
}: {
  booking: Booking;
  overtimeExpected: number | null;
  overtimeHours: number;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const currentOvertime = booking.additional_payment ? Number(booking.additional_payment) : 0;
  const [overtimePayment, setOvertimePayment] = useState(String(overtimeExpected ?? currentOvertime));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // A separate confirm step so clicking Save never silently records money —
  // same ConfirmDialog pattern as the app's other irreversible-ish actions.
  const [confirming, setConfirming] = useState(false);

  const overtimeNum = Number(overtimePayment);
  const overtimeValid =
    overtimePayment.trim() !== "" &&
    !Number.isNaN(overtimeNum) &&
    overtimeNum >= currentOvertime &&
    (overtimeExpected == null || overtimeNum <= overtimeExpected);

  async function handleSave() {
    if (!overtimeValid) return;
    setSaveError(null);
    setSaving(true);
    try {
      await correctBookingPayment(booking.id, { additional_payment: String(overtimeNum) });
      setConfirming(false);
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 p-4" style={{ background: "var(--surface-1)" }}>
      {saveError && (
        <div
          className="flex items-start justify-between gap-4 rounded-md p-3 text-sm"
          style={{ background: "var(--bg-danger)", color: "var(--text-danger)" }}
        >
          <span>{saveError}</span>
          <button onClick={() => setSaveError(null)} className="shrink-0 font-medium">
            Dismiss
          </button>
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>
          Overtime collected ({formatHoursAsHHMM(overtimeHours)} overtime, currently {formatMoney(currentOvertime)}
          {overtimeExpected != null ? `, capped at ${formatMoney(overtimeExpected)}` : ""})
        </label>
        <input
          type="number"
          className="w-full max-w-xs rounded-md px-3 py-2.5 text-base"
          style={inputStyle}
          value={overtimePayment}
          onChange={(e) => setOvertimePayment(e.target.value)}
        />
        {!overtimeValid && overtimePayment.trim() !== "" && (
          <p className="mt-1 text-sm" style={{ color: "var(--text-danger)" }}>
            Must be at least {formatMoney(currentOvertime)}
            {overtimeExpected != null ? ` and at most ${formatMoney(overtimeExpected)}` : ""}.
          </p>
        )}
        <p className="mt-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
          Saving here records a partial or full payment but only clears Outstanding once it reaches the full
          amount. To close this out without collecting the rest, use Final settlement below instead.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-2">
          <button
            onClick={() => setConfirming(true)}
            disabled={saving || !overtimeValid}
            className="rounded-md px-4 py-2 text-base font-medium disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={onCancel} className="rounded-md px-4 py-2 text-base font-medium" style={{ color: "var(--text-secondary)" }}>
            Cancel
          </button>
        </div>
        <WaiveOvertimeButton
          booking={booking}
          pendingOvertimeAmount={Number.isNaN(overtimeNum) ? currentOvertime : overtimeNum}
          overtimeExpected={overtimeExpected}
          onWaived={onSaved}
        />
      </div>

      {confirming && (
        <ConfirmDialog
          title="Settle overtime?"
          description={
            <>
              Record <strong>{formatMoney(overtimeNum)}</strong> as collected for {formatHoursAsHHMM(overtimeHours)} overtime on{" "}
              <strong>{bookingRef(booking.id)}</strong>. This can be corrected upward later, but never lowered.
            </>
          }
          confirmLabel="Settle overtime"
          onConfirm={handleSave}
          onCancel={() => setConfirming(false)}
          busy={saving}
        />
      )}
    </div>
  );
}
