// ROP011 — shared "how late was this logged" computation for odometer
// readings and manual GPS entries. reading_at is the claimed observation
// time, recorded_at is the system insert time; the gap is itself signal
// (Falcon's ROP011 design: 0 = logged live/most trustworthy, negative =
// late — flagged but common/expected, not an error — positive is blocked
// outright at both the DB check constraint and the form's max attribute, so
// it should never actually occur here).

export type VarianceTone = "live" | "late" | "future";

export interface VarianceInfo {
  minutes: number;
  label: string;
  tone: VarianceTone;
}

export function computeVariance(readingAt: string, recordedAt: string): VarianceInfo {
  const minutes = Math.round((new Date(readingAt).getTime() - new Date(recordedAt).getTime()) / 60000);

  if (minutes > 0) {
    return { minutes, label: "Future-dated", tone: "future" };
  }
  if (minutes === 0) {
    return { minutes, label: "Logged live", tone: "live" };
  }

  const lateMinutes = Math.abs(minutes);
  const label =
    lateMinutes < 60
      ? `Logged ${lateMinutes}m late`
      : lateMinutes < 24 * 60
        ? `Logged ${Math.round(lateMinutes / 60)}h late`
        : `Logged ${Math.round(lateMinutes / (24 * 60))}d late`;
  return { minutes, label, tone: "late" };
}

// Day-granularity variant for mileage_entries — period_end (a date, not a
// timestamp) can never be later than the date it was recorded on, but
// there's no meaningful "logged live" instant to compare against, so this
// reports in whole days rather than minutes/hours.
export function computeDateVariance(periodEnd: string, recordedAt: string): VarianceInfo {
  const endDate = new Date(`${periodEnd}T00:00:00`);
  const recordedDate = new Date(recordedAt);
  recordedDate.setHours(0, 0, 0, 0);
  const days = Math.round((endDate.getTime() - recordedDate.getTime()) / (24 * 60 * 60 * 1000));

  if (days > 0) {
    return { minutes: days * 24 * 60, label: "Future-dated", tone: "future" };
  }
  if (days === 0) {
    return { minutes: 0, label: "Logged same day", tone: "live" };
  }
  return { minutes: days * 24 * 60, label: `Logged ${Math.abs(days)}d late`, tone: "late" };
}
