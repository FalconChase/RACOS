// ROP011 — mirrors src/src/lib/variance.ts (desktop app). Kept as a
// duplicate rather than a shared package since the portal and the desktop
// app are two separate builds with no shared lib today.

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

// Day-granularity variant for mileage entries — mirrors
// src/src/lib/variance.ts computeDateVariance().
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
