import { useState } from "react";
import DatePicker from "./DatePicker";
import TimePicker from "./TimePicker";
import { formatDateTime } from "../lib/dateFormat";
import type { AppSettings } from "../lib/types";

type Choice = "notResolved" | "sameAsScheduled" | "now" | "custom";

interface ArrivalDialogProps {
  // "arrival" — the return/due-back side (end_date is the schedule reference).
  // "departure" — the departure/ETD side (start_date is the schedule reference).
  // Controls wording only; behavior is identical either way.
  kind: "arrival" | "departure";
  // "create" — shown right when saving a booking whose due-back is already in
  // the past; includes the "not resolved yet" option so staff can still
  // record it as still-out/susceptible to extension. Only ever used with
  // kind="arrival" (a backdated booking's start_date is always taken as given).
  // "confirm" — the general action on an already-recorded booking (Mark
  // returned / Mark departed); resolving it right now is the whole point, so
  // "not resolved yet" doesn't apply.
  mode: "create" | "confirm";
  // The scheduled reference time this dialog offers as "on time" — end_date
  // for arrival, start_date for departure.
  scheduledIso: string;
  settings: AppSettings;
  onCancel: () => void;
  // null only ever passed in "create" mode, meaning "not resolved yet".
  onConfirm: (actualIso: string | null) => void;
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

export default function ArrivalDialog({ kind, mode, scheduledIso, settings, onCancel, onConfirm }: ArrivalDialogProps) {
  const now = new Date();
  const [choice, setChoice] = useState<Choice>(mode === "create" ? "notResolved" : "now");
  const [customDate, setCustomDate] = useState(toDateInput(now));
  const [customTime, setCustomTime] = useState(toTimeInput(now));

  const customDT = customDate && customTime ? new Date(`${customDate}T${customTime}`) : null;
  const customValid = customDT !== null && !Number.isNaN(customDT.getTime());
  const canConfirm = choice !== "custom" || customValid;

  function handleConfirm() {
    if (!canConfirm) return;
    if (choice === "notResolved") {
      onConfirm(null);
    } else if (choice === "sameAsScheduled") {
      onConfirm(scheduledIso);
    } else if (choice === "now") {
      onConfirm(new Date().toISOString());
    } else {
      onConfirm((customDT as Date).toISOString());
    }
  }

  const radioLabelStyle: React.CSSProperties = { color: "var(--text-primary)" };
  const verb = kind === "arrival" ? "returned" : "departed";
  const scheduleLabel = kind === "arrival" ? "due-back" : "scheduled ETD";

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
          {mode === "create" ? "This booking already happened" : `Mark vehicle ${verb}`}
        </h3>
        <div className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          {mode === "create" ? (
            <>You're about to record a booking that was already expected to arrive at {formatDateTime(scheduledIso, settings)}.</>
          ) : kind === "arrival" ? (
            <>When did the vehicle actually come back? Due back was {formatDateTime(scheduledIso, settings)}.</>
          ) : (
            <>When did the vehicle actually leave? Scheduled ETD was {formatDateTime(scheduledIso, settings)}.</>
          )}
        </div>

        <div className="mt-4 space-y-2.5">
          {mode === "create" && (
            <label className="flex items-start gap-2.5 text-base" style={radioLabelStyle}>
              <input
                type="radio"
                className="mt-1"
                checked={choice === "notResolved"}
                onChange={() => setChoice("notResolved")}
              />
              <span>
                Not yet returned — keep it active
                <span className="block text-sm" style={{ color: "var(--text-muted)" }}>
                  Vehicle stays marked rented out, susceptible to a time extension until someone marks it back.
                </span>
              </span>
            </label>
          )}

          {mode === "confirm" && (
            <label className="flex items-start gap-2.5 text-base" style={radioLabelStyle}>
              <input type="radio" className="mt-1" checked={choice === "now"} onChange={() => setChoice("now")} />
              <span>Right now</span>
            </label>
          )}

          <label className="flex items-start gap-2.5 text-base" style={radioLabelStyle}>
            <input
              type="radio"
              className="mt-1"
              checked={choice === "sameAsScheduled"}
              onChange={() => setChoice("sameAsScheduled")}
            />
            <span>
              On time — same as {scheduleLabel}
              <span className="block text-sm" style={{ color: "var(--text-muted)" }}>
                {formatDateTime(scheduledIso, settings)}
                {kind === "arrival" ? ". Records it as arrived, bypassing any past inspection step." : "."}
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2.5 text-base" style={radioLabelStyle}>
            <input
              type="radio"
              className="mt-1"
              checked={choice === "custom"}
              onChange={() => setChoice("custom")}
            />
            <span>Different time — enter it</span>
          </label>

          {choice === "custom" && (
            <div className="ml-6 flex gap-2">
              <div className="w-1/2">
                <DatePicker value={customDate} onChange={setCustomDate} settings={settings} />
              </div>
              <div className="w-1/2">
                <TimePicker value={customTime} onChange={setCustomTime} settings={settings} />
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-base font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            {mode === "create" ? "Go back" : "Cancel"}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="rounded-md px-4 py-2 text-base font-medium disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
          >
            {mode === "create" ? "Confirm and save" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
