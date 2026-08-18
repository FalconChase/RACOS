import { useState } from "react";
import DateTimePicker from "./DateTimePicker";
import { formatDateTime } from "../lib/dateFormat";
import type { AppSettings, Booking } from "../lib/types";

interface EditAgreementDateDialogProps {
  booking: Booking;
  settings: AppSettings;
  onCancel: () => void;
  onSave: (agreementExecutedAt: string) => void;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTimeInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const fieldLabelStyle: React.CSSProperties = { color: "var(--text-secondary)" };
const readOnlyBoxStyle: React.CSSProperties = { background: "var(--surface-2)", color: "var(--text-secondary)" };

// Corrects when a booking's rental agreement was actually executed/signed —
// e.g. staff entering the booking into the system later than the paperwork
// was actually signed. Deliberately its own narrow dialog (same spirit as
// EditBookingTimesDialog) rather than folded into a general edit path —
// vehicle, customer, payment, and the booking's actual timing are shown for
// context but never touched here. Every save is logged (see
// updateAgreementExecutedAt).
export default function EditAgreementDateDialog({ booking, settings, onCancel, onSave }: EditAgreementDateDialogProps) {
  const [date, setDate] = useState(toDateInput(booking.agreement_executed_at));
  const [time, setTime] = useState(toTimeInput(booking.agreement_executed_at));

  const parsed = date ? new Date(`${date}T${time || "00:00"}:00`) : null;
  const startDateOnly = toDateInput(booking.start_date);
  let error: string | null = null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    error = "Agreement executed date is required.";
  } else if (date > startDateOnly) {
    // Guard is date-only, same as createBooking/updateAgreementExecutedAt —
    // time-of-day never factors in.
    error = `Can't be after the scheduled Out date (${formatDateTime(booking.start_date, settings)}).`;
  }

  function handleSave() {
    if (error || !parsed) return;
    const next = parsed.toISOString();
    if (next === booking.agreement_executed_at) {
      onCancel();
      return;
    }
    onSave(next);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0, 0, 0, 0.6)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-lg p-5"
        style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Edit agreement date
        </h3>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Corrects when this rental agreement was actually executed/signed — separate from when it was scheduled to go out ({formatDateTime(booking.start_date, settings)}).
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1.5 block text-sm" style={fieldLabelStyle}>Agreement executed on</label>
            <DateTimePicker dateValue={date} timeValue={time} onDateChange={setDate} onTimeChange={setTime} settings={settings} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm" style={fieldLabelStyle}>Currently on file</label>
            <p className="rounded-md px-3 py-2.5 text-sm" style={readOnlyBoxStyle}>
              {booking.agreement_executed_at ? formatDateTime(booking.agreement_executed_at, settings) : "Not on file"}
            </p>
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
