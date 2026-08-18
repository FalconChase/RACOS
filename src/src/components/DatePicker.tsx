import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarRangeIcon } from "./icons";
import { formatDate } from "../lib/dateFormat";
import type { AppSettings } from "../lib/types";

interface DatePickerProps {
  value: string; // "YYYY-MM-DD" or ""
  onChange: (value: string) => void;
  settings: AppSettings;
  // Dates ("YYYY-MM-DD") to tint light-yellow in the grid — e.g. days that
  // already have booking activity, so a range can be picked without having
  // to guess or cross-reference another screen first.
  highlightedDates?: Set<string>;
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
//
// The calendar grid is portaled to document.body and positioned from the
// anchor button's getBoundingClientRect, rather than laid out as a plain
// `absolute` child — this used to only ever open on a normal page (fine to
// overflow into document flow), but now can also open inside a capped-
// height, scrollable dialog (BookingsScreen's New rental wizard), where an
// `absolute` popup gets clipped by the dialog's own `overflow-y-auto`
// instead of rendering past it.
export default function DatePicker({ value, onChange, settings, highlightedDates }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const today = new Date();
  const parsed = parseValue(value);
  const [viewYear, setViewYear] = useState(parsed?.year ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.month ?? today.getMonth());

  // Roughly how tall the popup renders (header + weekday row + up to 6 week
  // rows + padding) — used only to decide whether it fits below the anchor,
  // not for exact layout.
  const ESTIMATED_HEIGHT = 340;
  const VIEWPORT_MARGIN = 8;

  function openPicker() {
    const p = parseValue(value);
    setViewYear(p?.year ?? today.getFullYear());
    setViewMonth(p?.month ?? today.getMonth());
    const rect = anchorRef.current?.getBoundingClientRect();
    if (rect) {
      // Flip upward when there isn't room below the anchor (e.g. a field
      // near the bottom of a tall popup dialog, like New rental's Summary
      // step) — otherwise the calendar's lower rows render past the bottom
      // of the window with nothing to scroll them into view.
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < ESTIMATED_HEIGHT && rect.top > ESTIMATED_HEIGHT;
      const top = openUpward
        ? Math.max(VIEWPORT_MARGIN, rect.top - ESTIMATED_HEIGHT)
        : rect.bottom;
      setPos({ top, left: rect.left });
    }
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
        ref={anchorRef}
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

      {open &&
        pos &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-50"
              onClick={() => setOpen(false)}
              onWheel={() => setOpen(false)}
            />
            <div
              className="fixed z-[60] mt-1.5 w-72 overflow-y-auto rounded-md p-3"
              style={{
                top: pos.top,
                left: pos.left,
                maxHeight: `calc(100vh - ${2 * VIEWPORT_MARGIN}px)`,
                background: "var(--surface-1)",
                border: "0.5px solid var(--border-strong)",
              }}
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
                  const dateStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
                  const isHighlighted = highlightedDates?.has(dateStr) ?? false;

                  let cellStyle: React.CSSProperties;
                  if (isSelected) {
                    cellStyle = { background: "var(--fill-primary)", color: "var(--on-primary)" };
                  } else {
                    cellStyle = { color: "var(--text-primary)" };
                    if (isHighlighted) {
                      cellStyle.background = "var(--bg-warning)";
                      cellStyle.color = "var(--text-warning)";
                    }
                    if (isToday) {
                      cellStyle.border = "0.5px solid var(--text-accent)";
                    }
                  }

                  return (
                    <button
                      type="button"
                      key={i}
                      onClick={() => selectDay(day)}
                      title={isHighlighted ? "Has booking activity" : undefined}
                      className="rounded-md py-1.5"
                      style={cellStyle}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
