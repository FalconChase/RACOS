import type { AppSettings } from "./types";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatDate(iso: string, settings: AppSettings): string {
  const d = new Date(iso);
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  switch (settings.dateFormat) {
    case "DMY":
      return `${day}/${month}/${year}`;
    case "ISO":
      return `${year}-${month}-${day}`;
    case "MDY":
    default:
      return `${month}/${day}/${year}`;
  }
}

export function formatTime(iso: string, settings: AppSettings): string {
  const d = new Date(iso);
  if (settings.timeFormat === "24h") {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  const hours12 = d.getHours() % 12 || 12;
  const ampm = d.getHours() < 12 ? "AM" : "PM";
  return `${hours12}:${pad(d.getMinutes())} ${ampm}`;
}

export function formatDateTime(iso: string, settings: AppSettings): string {
  return `${formatDate(iso, settings)}, ${formatTime(iso, settings)}`;
}
