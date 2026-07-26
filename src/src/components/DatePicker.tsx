import { useState } from "react";
import { CalendarRangeIcon } from "./icons";
import { formatDate } from "../lib/dateFormat";
import type { AppSettings } from "../lib/types";

interface DatePickerProps {
  value: string; // "YYYY-MM-DD" or ""
  onChange: (value: string) => void;
  settings: AppSettings;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function parseValue(value: string): { year: number; month: number; day: number } | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { year: y, month: m - 1, day: d };
}

// Custom calendar popup instead of the native input[type=date] — gives a
// consistent picker across platforms rather than whatever the OS webview
// happens to render.
export default function DatePicker({ value, onChange, settings }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const parsed = parseValue(value);
  const [viewYear, setViewYear] = useState(parsed?.year ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.month ?? today.getMonth());

  function openPicker() {
    const p = parseValue(value);
    setViewYear(p?.year ?? today.getFullYear());
    setViewMonth(p?.month ?? today.getMonth());
    setOpen(true);
  }

  function selectDay(day: number) {
    onChange(`${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`);
    setOpen(false);
  }

  function shiftMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  }

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const displayValue = value ? formatDate(`${value}T00:00:00`, settings) : "";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-base"
        style={{
          border: "0.5px solid var(--border-strong)",
          background: "var(--surface-2)",
          color: value ? "var(--text-primary)" : "var(--text-muted)",
        }}
      >
        {displayValue || "Select date"}
        <CalendarRangeIcon size={17} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 top-full z-20 mt-1.5 w-72 rounded-md p-3"
            style={{ background: "var(--surface-1)", border: "0.5px solid var(--border-strong)" }}
          >
            <div className="mb-2 flex items-center justify-between text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              <button type="button" onClick={() => shiftMonth(-1)} className="rounded px-2 py-1" style={{ color: "var(--text-secondary)" }}>‹</button>
              <span>{MONTH_NAMES[viewMonth]} {viewYear}</span>
              <button type="button" onClick={() => shiftMonth(1)} className="rounded px-2 py-1" style={{ color: "var(--text-secondary)" }}>›</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs" style={{ color: "var(--text-muted)" }}>
              {WEEKDAYS.map((w) => (
                <div key={w} className="py-1">{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-sm">
              {cells.map((day, i) => {
                if (day === null) return <div key={i} />;
                const isSelected =
                  parsed && parsed.year === viewYear && parsed.month === viewMonth && parsed.day === day;
                const isToday =
                  today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day;
                return (
                  <button
                    type="button"
                    key={i}
                    onClick={() => selectDay(day)}
                    className="rounded-md py-1.5"
                    style={
                      isSelected
                        ? { background: "var(--fill-primary)", color: "var(--on-primary)" }
                        : isToday
                        ? { border: "0.5px solid var(--text-accent)", color: "var(--text-primary)" }
                        : { color: "var(--text-primary)" }
                    }
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
