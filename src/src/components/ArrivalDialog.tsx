import { useEffect, useState } from "react";
import DatePicker from "./DatePicker";
import TimePicker from "./TimePicker";
import { formatDateTime } from "../lib/dateFormat";
import { exactHoursBetween, formatHoursAsDaysHHMM, formatHoursAsHHMM, roundToNearestHalfHour } from "../lib/duration";
import { computeExpectedPayment } from "../lib/pricing";
import type { AppSettings } from "../lib/types";

// Anything beyond this, and the dialog stops trusting a single Confirm click
// — staff has to explicitly acknowledge it first. A week-plus overdue return
// (or a departure that lands a week+ off its scheduled ETD) is exactly the
// shape of a fat-fingered date, like typing this year instead of the actual
// rental month.
const ABSURD_HOURS_THRESHOLD = 24 * 7;

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
  // kind="arrival" only — when the vehicle actually left (falls back to the
  // scheduled ETD if it hasn't been separately recorded). Lets the dialog
  // show the *total* elapsed time (departure to the return time being
  // entered here), not just how far past due-back it is — the whole-span
  // number is what actually catches a fat-fingered date, the way a lone
  // "584:00 overtime" reading doesn't.
  departedAtIso?: string;
  settings: AppSettings;
  // The booking's resolved per-hour rate — only used for kind="arrival" +
  // mode="confirm" (Mark returned) to preview/bill overtime. Omitted or null
  // just means the overtime payment section never shows.
  rate?: number | null;
  onCancel: () => void;
  // null only ever passed in "create" mode, meaning "not resolved yet".
  // additionalPayment is only ever populated when the chosen time is later
  // than scheduledIso on a Mark-returned confirm (see showOvertime below).
  onConfirm: (actualIso: string | null, additionalPayment?: string) => void;
}

// Trims float noise from rate/hour math — same small helper BookingsScreen
// and SettlementsScreen each keep locally for the same reason.
function formatMoney(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
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

export default function ArrivalDialog({ kind, mode, scheduledIso, departedAtIso, settings, rate, onCancel, onConfirm }: ArrivalDialogProps) {
  const now = new Date();
  const [choice, setChoice] = useState<Choice>(mode === "create" ? "notResolved" : "now");
  const [customDate, setCustomDate] = useState(toDateInput(now));
  const [customTime, setCustomTime] = useState(toTimeInput(now));
  const [additionalPayment, setAdditionalPayment] = useState("");
  // Gates Confirm shut once the entered time crosses ABSURD_HOURS_THRESHOLD
  // — staff has to tick this after actually seeing the total, rather than
  // the normal single Confirm click going straight through.
  const [absurdAcknowledged, setAbsurdAcknowledged] = useState(false);

  const customDT = customDate && customTime ? new Date(`${customDate}T${customTime}`) : null;
  const customValid = customDT !== null && !Number.isNaN(customDT.getTime());
  const canConfirm = choice !== "custom" || customValid;

  // What actualIso would be if confirmed right now, given the current
  // choice — used only to preview whether this lands as overtime.
  const pendingDT: Date | null =
    choice === "notResolved"
      ? null
      : choice === "sameAsScheduled"
        ? new Date(scheduledIso)
        : choice === "now"
          ? now
          : customValid
            ? (customDT as Date)
            : null;

  // Overtime payment prompt only ever applies to Mark returned (an
  // already-recorded booking's return time, confirmed later than its
  // scheduled due-back) — never the departure side, and never at booking
  // creation.
  const scheduledDT = new Date(scheduledIso);
  const showOvertime =
    kind === "arrival" && mode === "confirm" && rate != null && pendingDT !== null && pendingDT.getTime() > scheduledDT.getTime();
  // Billed at the nearest half hour, not to the exact minute — an exact
  // "6h24m" overtime span would otherwise produce a messy non-round peso
  // amount once run through the rate.
  const overtimeHours = showOvertime && pendingDT ? roundToNearestHalfHour(exactHoursBetween(scheduledDT, pendingDT)) : 0;
  const expectedAdditional = showOvertime && rate != null ? computeExpectedPayment(rate, overtimeHours) : null;

  // Total-time confirmation summary — shown for any resolved arrival time
  // (on-time or not), since the whole point is staff actually seeing the
  // number before it's saved, not just when it happens to trip the overtime
  // section above. kind="departure" doesn't have a "total span" yet (no
  // return recorded), so it gets a simpler early/late-vs-ETD reading instead.
  const departedDT = departedAtIso ? new Date(departedAtIso) : null;
  const totalElapsedHours =
    kind === "arrival" && departedDT && pendingDT ? exactHoursBetween(departedDT, pendingDT) : null;
  // A return time can't land before the vehicle even left — that's not
  // "unusual," it's just wrong, and blocks Confirm outright rather than
  // asking for acknowledgment.
  const arrivalBeforeDeparture = kind === "arrival" && departedDT && pendingDT ? pendingDT.getTime() < departedDT.getTime() : false;

  const departureDeviationHours =
    kind === "departure" && pendingDT ? Math.abs(pendingDT.getTime() - scheduledDT.getTime()) / 3600000 : null;
  const departureDeviationLate = kind === "departure" && pendingDT ? pendingDT.getTime() > scheduledDT.getTime() : false;

  const guardHours = kind === "arrival" ? totalElapsedHours : departureDeviationHours;
  const isAbsurd = guardHours != null && guardHours > ABSURD_HOURS_THRESHOLD;

  // Re-require the checkbox whenever the entered time changes enough to
  // matter — ticking it once shouldn't silently carry over to a different
  // date the staff types next.
  useEffect(() => {
    setAbsurdAcknowledged(false);
  }, [Math.round(guardHours ?? 0)]);

  const canConfirmFinal = canConfirm && !arrivalBeforeDeparture && (!isAbsurd || absurdAcknowledged);

  function handleConfirm() {
    if (!canConfirmFinal) return;
    const extra = showOvertime ? additionalPayment.trim() || undefined : undefined;
    if (choice === "notResolved") {
      onConfirm(null);
    } else if (choice === "sameAsScheduled") {
      onConfirm(scheduledIso, extra);
    } else if (choice === "now") {
      onConfirm(new Date().toISOString(), extra);
    } else {
      onConfirm((customDT as Date).toISOString(), extra);
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

          {/* Total-time confirmation summary — the actual sanity check this
              whole feature is for. Shown for any resolved arrival time,
              regardless of whether it happens to be overtime, so the number
              is always visible right before Confirm. */}
          {kind === "arrival" && pendingDT && departedDT && (
            <div
              className="rounded-md p-3"
              style={{
                background: "var(--surface-2)",
                border: `0.5px solid ${isAbsurd ? "var(--text-danger)" : "var(--border)"}`,
              }}
            >
              {arrivalBeforeDeparture ? (
                <div className="text-sm font-medium" style={{ color: "var(--text-danger)" }}>
                  Return time can't be before the vehicle left ({formatDateTime(departedAtIso as string, settings)}).
                </div>
              ) : (
                <>
                  <div className="text-sm font-medium" style={{ color: isAbsurd ? "var(--text-danger)" : "var(--text-primary)" }}>
                    Total time: {formatHoursAsDaysHHMM(totalElapsedHours as number)}
                  </div>
                  {isAbsurd && (
                    <div className="mt-2 space-y-2">
                      <p className="text-sm" style={{ color: "var(--text-danger)" }}>
                        That's an unusually long span — double check the date/time entered above before continuing.
                      </p>
                      <label className="flex items-start gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4"
                          checked={absurdAcknowledged}
                          onChange={(e) => setAbsurdAcknowledged(e.target.checked)}
                        />
                        Yes, this is correct
                      </label>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {kind === "departure" && pendingDT && departureDeviationHours != null && departureDeviationHours > 0.1 && (
            <div
              className="rounded-md p-3"
              style={{
                background: "var(--surface-2)",
                border: `0.5px solid ${isAbsurd ? "var(--text-danger)" : "var(--border)"}`,
              }}
            >
              <div className="text-sm font-medium" style={{ color: isAbsurd ? "var(--text-danger)" : "var(--text-primary)" }}>
                {formatHoursAsDaysHHMM(departureDeviationHours)} {departureDeviationLate ? "later" : "earlier"} than scheduled ETD
              </div>
              {isAbsurd && (
                <div className="mt-2 space-y-2">
                  <p className="text-sm" style={{ color: "var(--text-danger)" }}>
                    That's an unusually large gap — double check the date/time entered above before continuing.
                  </p>
                  <label className="flex items-start gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4"
                      checked={absurdAcknowledged}
                      onChange={(e) => setAbsurdAcknowledged(e.target.checked)}
                    />
                    Yes, this is correct
                  </label>
                </div>
              )}
            </div>
          )}

          {showOvertime && (
            <div className="rounded-md p-3" style={{ background: "var(--surface-2)", border: "0.5px solid var(--border)" }}>
              <div className="text-sm font-medium" style={{ color: "var(--text-warning)" }}>
                {formatHoursAsHHMM(overtimeHours)} overtime
              </div>
              {expectedAdditional != null && (
                <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                  Expected additional payment: {formatMoney(expectedAdditional)}
                </p>
              )}
              <label className="mt-2 block text-sm" style={{ color: "var(--text-secondary)" }}>
                Amount collected now
                <input
                  className="mt-1 w-full rounded-md px-3 py-2 text-base"
                  style={{ border: "0.5px solid var(--border-strong)", background: "var(--surface-1)", color: "var(--text-primary)" }}
                  placeholder="Leave blank to leave it outstanding"
                  value={additionalPayment}
                  onChange={(e) => setAdditionalPayment(e.target.value)}
                />
              </label>
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
            disabled={!canConfirmFinal}
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
