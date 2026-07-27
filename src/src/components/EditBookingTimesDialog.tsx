import { useState } from "react";
import DatePicker from "./DatePicker";
import TimePicker from "./TimePicker";
import { formatDateTime } from "../lib/dateFormat";
import type { AppSettings, Booking } from "../lib/types";
import type { BookingTimeUpdate } from "../lib/repo/bookings";

interface EditBookingTimesDialogProps {
  booking: Booking;
  settings: AppSettings;
  onCancel: () => void;
  onSave: (updates: BookingTimeUpdate) => void;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTimeInput(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function splitIso(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  return { date: toDateInput(d), time: toTimeInput(d) };
}

function combine(date: string, time: string): Date | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const fieldLabelStyle: React.CSSProperties = { color: "var(--text-secondary)" };
const readOnlyBoxStyle: React.CSSProperties = { background: "var(--surface-2)", color: "var(--text-secondary)" };

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm" style={fieldLabelStyle}>{label}</label>
      <p className="rounded-md px-3 py-2.5 text-sm" style={readOnlyBoxStyle}>{value}</p>
    </div>
  );
}

// Fixes a mistaken actual-return time on an already-recorded booking — the
// escape hatch for something like an actual return landing weeks off that
// wasn't caught by ArrivalDialog's own confirmation summary at record time.
// Out, Due back, and Actual departure are shown for context but deliberately
// locked: only Actual return is ever the wrong value in practice (it's the
// one typed by hand, under time pressure, at drop-off), and locking the rest
// keeps this from turning into a way to quietly rewrite a booking's whole
// timeline. Vehicle, customer, and payment aren't touched here either way.
// Every save is logged (see updateBookingTimes).
export default function EditBookingTimesDialog({ booking, settings, onCancel, onSave }: EditBookingTimesDialogProps) {
  const initialReturn = splitIso(booking.actual_return_at);

  const [returnDate, setReturnDate] = useState(initialReturn.date);
  const [returnTime, setReturnTime] = useState(initialReturn.time);

  const departureDT = booking.actual_departure_at ? new Date(booking.actual_departure_at) : null;
  const returnDT = booking.actual_return_at ? combine(returnDate, returnTime) : null;

  let error: string | null = null;
  if (!booking.actual_return_at) {
    error = "This booking hasn't been marked returned yet — use Mark returned instead.";
  } else if (!returnDT) {
    error = "Actual return needs a date and time.";
  } else if (departureDT && returnDT.getTime() < departureDT.getTime()) {
    error = "Actual return can't be before the actual departure.";
  }

  function handleSave() {
    if (error || !returnDT) return;

    const nextReturn = returnDT.toISOString();
    if (nextReturn === booking.actual_return_at) {
      onCancel();
      return;
    }
    onSave({ actual_return_at: nextReturn });
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
          Edit booking times
        </h3>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Corrects a mistaken actual return time. Out, Due back, and Actual departure are locked — vehicle, customer, and payment aren't touched here either.
        </p>

        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <ReadOnlyField label="Out" value={formatDateTime(booking.start_date, settings)} />
            <ReadOnlyField label="Due back" value={formatDateTime(booking.end_date, settings)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ReadOnlyField
              label="Actual departure"
              value={booking.actual_departure_at ? formatDateTime(booking.actual_departure_at, settings) : "Not yet departed"}
            />
            <div>
              <label className="mb-1.5 block text-sm" style={fieldLabelStyle}>Actual return</label>
              {booking.actual_return_at ? (
                <div className="flex gap-2">
                  <div className="w-1/2">
                    <DatePicker value={returnDate} onChange={setReturnDate} settings={settings} />
                  </div>
                  <div className="w-1/2">
                    <TimePicker value={returnTime} onChange={setReturnTime} settings={settings} />
                  </div>
                </div>
              ) : (
                <p className="rounded-md px-3 py-2.5 text-sm" style={readOnlyBoxStyle}>
                  Not yet returned
                </p>
              )}
            </div>
          </div>

          {error && (
            <p className="text-sm" style={{ color: "var(--text-danger)" }}>{error}</p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-base font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={Boolean(error)}
            className="rounded-md px-4 py-2 text-base font-medium disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
