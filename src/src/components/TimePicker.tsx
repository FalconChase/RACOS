import type { AppSettings } from "../lib/types";

interface TimePickerProps {
  value: string; // "HH:MM" in 24h, or ""
  onChange: (value: string) => void;
  settings: AppSettings;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function label(hour: number, minute: number, settings: AppSettings): string {
  if (settings.timeFormat === "24h") return `${pad(hour)}:${pad(minute)}`;
  const hour12 = hour % 12 || 12;
  const ampm = hour < 12 ? "AM" : "PM";
  return `${hour12}:${pad(minute)} ${ampm}`;
}

const SLOTS: { value: string; hour: number; minute: number }[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 30]) {
    SLOTS.push({ value: `${pad(h)}:${pad(m)}`, hour: h, minute: m });
  }
}

// Dropdown of half-hour time-of-day slots (HH:MM under the hood) rather than
// the native input[type=time], whose rendering varies a lot across webviews.
export default function TimePicker({ value, onChange, settings }: TimePickerProps) {
  return (
    <select
      className="w-full rounded-md px-3 py-2.5 text-base"
      style={{
        border: "0.5px solid var(--border-strong)",
        background: "var(--surface-2)",
        color: value ? "var(--text-primary)" : "var(--text-muted)",
      }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Select time…</option>
      {SLOTS.map((s) => (
        <option key={s.value} value={s.value}>
          {label(s.hour, s.minute, settings)}
        </option>
      ))}
    </select>
  );
}
