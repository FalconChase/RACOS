import type { DurationDisplay } from "./types";

// Descriptive-only whole-nights calculation, used by the "nights" and
// "daysNights" duration display options. Purely reference — pricing is
// always based on exactHoursBetween below, never on this.
export function nightsBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.round(ms / 86400000));
}

// Descriptive-only half-day calculation, used by the "halfDays" duration
// display option (and shown as a fixed reference next to Out/Due back on the
// booking form). Purely reference — pricing is always based on
// exactHoursBetween below, never on this. Rounds to the nearest 12-hour unit,
// e.g. 108 hours (4.5 days) -> 9 half-days exactly.
export function halfDaysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  const hours = ms / 3600000;
  return Math.max(1, Math.round(hours / 12));
}

// Exact, unrounded elapsed time between the two rental datetimes — the literal
// reading of what was typed into Out / Due back, formatted as "Xh Ym".
export function formatHoursMinutes(start: Date, end: Date): string {
  const ms = Math.max(0, end.getTime() - start.getTime());
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

// Canonical elapsed-hours calculation — this is what pricing is always based
// on (dailyRate / 24 x this value), regardless of how the Settings > Rental
// "duration display" preference describes the same span to staff. Rounded to
// the nearest minute first so it always agrees with formatHoursMinutes above
// (e.g. 81h 30m -> 81.5).
export function exactHoursBetween(start: Date, end: Date): number {
  const ms = Math.max(0, end.getTime() - start.getTime());
  const totalMinutes = Math.round(ms / 60000);
  return totalMinutes / 60;
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

// Purely descriptive — never affects the computed price, only how the
// rental's length is worded in the UI.
export function formatDuration(start: Date, end: Date, display: DurationDisplay): string {
  const ms = end.getTime() - start.getTime();
  const hours = ms / 3600000;

  switch (display) {
    case "hours": {
      const rounded = Math.round(hours * 10) / 10;
      return plural(rounded, "hour");
    }
    case "halfDays": {
      return plural(halfDaysBetween(start, end), "half-day");
    }
    case "daysNights": {
      const nights = nightsBetween(start, end);
      const days = nights + 1;
      return `${plural(days, "day")} ${plural(nights, "night")}`;
    }
    case "nights":
    default:
      return plural(nightsBetween(start, end), "night");
  }
}
