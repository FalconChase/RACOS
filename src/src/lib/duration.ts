import type { DurationDisplay } from "./types";

// Descriptive-only whole-nights calculation, used by the "nights" and
// "daysNights" duration display options. NOT what pricing is based on — see
// halfDaysBetween below, which is the canonical billing unit.
export function nightsBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.round(ms / 86400000));
}

// Canonical half-day calculation — this is what pricing is always based on
// (a Rate Matrix / vehicle daily_rate cell is billed at rate/2 per half-day
// unit), regardless of how the Settings > Rental "duration display"
// preference chooses to describe the same span to staff. Rounds to the
// nearest 12-hour unit, e.g. 108 hours (4.5 days) -> 9 half-days exactly.
export function halfDaysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  const hours = ms / 3600000;
  return Math.max(1, Math.round(hours / 12));
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
