import BookingPaymentEntriesPanel from "./BookingPaymentEntriesPanel";
import { bookingRef } from "../lib/bookingRef";
import type { Booking } from "../lib/types";

interface BookingPaymentEntriesDialogProps {
  booking: Booking;
  onClose: () => void;
}

// Modal shell around the live BookingPaymentEntriesPanel for an existing
// booking's row action ("Edit payment breakdown") — freely add/edit/remove,
// same as Customers' "Edit info" contacts, closed via Done rather than a
// single Save (there's nothing to commit-or-discard, every change writes
// immediately and is logged on its own).
export default function BookingPaymentEntriesDialog({ booking, onClose }: BookingPaymentEntriesDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0, 0, 0, 0.6)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg p-5"
        style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Payment breakdown — {bookingRef(booking.id)}
        </h3>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Supplementary fees, advance payments, and notes — never affects Payment amount, Expected payment, or any Settlements/Remittances/Outstanding computation.
        </p>

        <div className="mt-4">
          <BookingPaymentEntriesPanel booking={booking} hideHeader />
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-base font-medium"
            style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
