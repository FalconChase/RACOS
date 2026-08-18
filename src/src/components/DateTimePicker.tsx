import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarRangeIcon } from "./icons";
import { formatDate } from "../lib/dateFormat";
import type { AppSettings } from "../lib/types";

interface DateTimePickerProps {
  dateValue: string; // "YYYY-MM-DD" or ""
  timeValue: string; // "HH:MM" 24h, or ""
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  settings: AppSettings;
  // Dates ("YYYY-MM-DD") to tint light-yellow in the calendar step — same
  // meaning as DatePicker's own prop.
  highlightedDates?: Set<string>;
}

type Step = "date" | "hour" | "minute";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function parseDate(value: string): { year: number; month: number; day: number } | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { year: y, month: m - 1, day: d };
}

function parseTime(value: string): { hour: number; minute: number } | null {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return { hour: h, minute: m };
}

function timeLabel(hour: number, minute: number, settings: AppSettings): string {
  if (settings.timeFormat === "24h") return `${pad(hour)}:${pad(minute)}`;
  const hour12 = hour % 12 || 12;
  const ampm = hour < 12 ? "AM" : "PM";
  return `${hour12}:${pad(minute)} ${ampm}`;
}

// A point on a circle of the given radius, centered in a `size`x`size` box,
// index i out of `count` total points arranged clockwise starting at the
// top (12 o'clock).
function dialPoint(i: number, count: number, radius: number, size: number): { x: number; y: number } {
  const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
  return {
    x: size / 2 + radius * Math.cos(angle),
    y: size / 2 + radius * Math.sin(angle),
  };
}

const DIAL_SIZE = 220;

function DialButton({
  x,
  y,
  label,
  selected,
  onClick,
  small,
}: {
  x: number;
  y: number;
  label: string;
  selected: boolean;
  onClick: () => void;
  small?: boolean;
}) {
  const dim = small ? 30 : 34;
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute flex items-center justify-center rounded-full text-sm font-medium"
      style={{
        left: x - dim / 2,
        top: y - dim / 2,
        width: dim,
        height: dim,
        background: selected ? "var(--fill-primary)" : "transparent",
        color: selected ? "var(--on-primary)" : "var(--text-primary)",
      }}
    >
      {label}
    </button>
  );
}

// Combined date + time popup: click the field, pick a day on the calendar,
// the same popup morphs into an hour dial, then a minute dial, then closes
// — a single continuous flow rather than two separate DatePicker/TimePicker
// fields side by side. Portaled to document.body and positioned from the
// anchor's getBoundingClientRect, same reasoning as DatePicker (escapes the
// New rental wizard dialog's overflow clipping — see DatePicker's own
// comment / bug RC017).
export default function DateTimePicker({
  dateValue,
  timeValue,
  onDateChange,
  onTimeChange,
  settings,
  highlightedDates,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("date");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const today = new Date();
  const parsedDate = parseDate(dateValue);
  const parsedTime = parseTime(timeValue);
  const [viewYear, setViewYear] = useState(parsedDate?.year ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsedDate?.month ?? today.getMonth());
  // Hour/minute build up across the hour -> minute steps before committing
  // a single onTimeChange call — never partially written mid-flow.
  const [pendingHour, setPendingHour] = useState<number | null>(parsedTime?.hour ?? null);
  const [ampm, setAmpm] = useState<"AM" | "PM">(parsedTime && parsedTime.hour >= 12 ? "PM" : "AM");

  const ESTIMATED_HEIGHT = 400;
  const VIEWPORT_MARGIN = 8;

  function openPicker() {
    const pd = parseDate(dateValue);
    const pt = parseTime(timeValue);
    setViewYear(pd?.year ?? today.getFullYear());
    setViewMonth(pd?.month ?? today.getMonth());
    setPendingHour(pt?.hour ?? null);
    setAmpm(pt && pt.hour >= 12 ? "PM" : "AM");
    setStep("date");
    const rect = anchorRef.current?.getBoundingClientRect();
    if (rect) {
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
    onDateChange(`${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`);
    setStep("hour");
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

  // 12h mode: single ring, 12/1/2…11 like a normal clock face, plus an
  // AM/PM toggle. 24h mode: two rings — outer 0-11, inner 12-23 — so every
  // hour of the day still reaches in one dial without 24 crowded marks.
  function selectHour12(hour12: number) {
    const h24 = ampm === "AM" ? hour12 % 12 : (hour12 % 12) + 12;
    setPendingHour(h24);
    setStep("minute");
  }

  function selectHour24(hour: number) {
    setPendingHour(hour);
    setStep("minute");
  }

  function selectMinute(minute: number) {
    if (pendingHour === null) return;
    onTimeChange(`${pad(pendingHour)}:${pad(minute)}`);
    setOpen(false);
  }

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // Minute dial mark count — one mark per configured step, but capped at 12
  // marks so the dial never gets overcrowded (a 1-minute step would
  // otherwise mean 60 clickable slots on a small circle). The effective
  // spacing shown is whichever of {step, 5} is coarser.
  const rawCount = 60 / settings.timeStepMinutes;
  const markCount = Math.max(2, Math.min(rawCount, 12));
  const dialStepMinutes = 60 / markCount;

  const displayDate = dateValue ? formatDate(`${dateValue}T00:00:00`, settings) : "";
  const displayTime = parsedTime ? timeLabel(parsedTime.hour, parsedTime.minute, settings) : "";
  const displayValue = [displayDate, displayTime].filter(Boolean).join(" · ");

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
          color: displayValue ? "var(--text-primary)" : "var(--text-muted)",
        }}
      >
        {displayValue || "Select date & time"}
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
              {/* Step indicator — quiet breadcrumb, not clickable back-nav;
                  the flow only ever moves forward (date -> hour -> minute). */}
              <div className="mb-2 flex items-center justify-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                <span style={{ color: step === "date" ? "var(--text-accent)" : undefined }}>Date</span>
                <span>›</span>
                <span style={{ color: step === "hour" ? "var(--text-accent)" : undefined }}>Hour</span>
                <span>›</span>
                <span style={{ color: step === "minute" ? "var(--text-accent)" : undefined }}>Minute</span>
              </div>

              {step === "date" && (
                <>
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
                        parsedDate && parsedDate.year === viewYear && parsedDate.month === viewMonth && parsedDate.day === day;
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
                </>
              )}

              {step === "hour" && (
                <div className="flex flex-col items-center gap-3 py-2">
                  <div className="relative" style={{ width: DIAL_SIZE, height: DIAL_SIZE }}>
                    <div
                      className="absolute rounded-full"
                      style={{
                        left: 4, top: 4, right: 4, bottom: 4,
                        border: "0.5px solid var(--border)",
                      }}
                    />
                    {settings.timeFormat === "24h" ? (
                      <>
                        {Array.from({ length: 12 }, (_, i) => {
                          const p = dialPoint(i, 12, DIAL_SIZE / 2 - 20, DIAL_SIZE);
                          return (
                            <DialButton
                              key={`outer-${i}`}
                              x={p.x}
                              y={p.y}
                              label={String(i)}
                              selected={pendingHour === i}
                              onClick={() => selectHour24(i)}
                            />
                          );
                        })}
                        {Array.from({ length: 12 }, (_, i) => {
                          const p = dialPoint(i, 12, DIAL_SIZE / 2 - 62, DIAL_SIZE);
                          const hour = i === 0 ? 12 : i + 12;
                          return (
                            <DialButton
                              key={`inner-${i}`}
                              x={p.x}
                              y={p.y}
                              label={String(hour)}
                              selected={pendingHour === hour}
                              onClick={() => selectHour24(hour)}
                              small
                            />
                          );
                        })}
                      </>
                    ) : (
                      Array.from({ length: 12 }, (_, i) => {
                        const p = dialPoint(i, 12, DIAL_SIZE / 2 - 20, DIAL_SIZE);
                        const hour12 = i === 0 ? 12 : i;
                        const selectedHour12 = pendingHour !== null ? (pendingHour % 12 || 12) : null;
                        return (
                          <DialButton
                            key={i}
                            x={p.x}
                            y={p.y}
                            label={String(hour12)}
                            selected={selectedHour12 === hour12}
                            onClick={() => selectHour12(hour12)}
                          />
                        );
                      })
                    )}
                  </div>
                  {settings.timeFormat === "12h" && (
                    <div className="flex gap-1.5">
                      {(["AM", "PM"] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setAmpm(v)}
                          className="rounded-md px-3 py-1.5 text-sm font-medium"
                          style={{
                            background: ampm === v ? "var(--fill-primary)" : "var(--surface-2)",
                            color: ampm === v ? "var(--on-primary)" : "var(--text-primary)",
                          }}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {step === "minute" && (
                <div className="flex flex-col items-center gap-2 py-2">
                  <div className="relative" style={{ width: DIAL_SIZE, height: DIAL_SIZE }}>
                    <div
                      className="absolute rounded-full"
                      style={{
                        left: 4, top: 4, right: 4, bottom: 4,
                        border: "0.5px solid var(--border)",
                      }}
                    />
                    {Array.from({ length: markCount }, (_, i) => {
                      const minute = Math.round(i * dialStepMinutes) % 60;
                      const p = dialPoint(i, markCount, DIAL_SIZE / 2 - 20, DIAL_SIZE);
                      return (
                        <DialButton
                          key={i}
                          x={p.x}
                          y={p.y}
                          label={pad(minute)}
                          selected={parsedTime !== null && pendingHour === parsedTime.hour && minute === parsedTime.minute}
                          onClick={() => selectMinute(minute)}
                        />
                      );
                    })}
                  </div>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {pendingHour !== null ? timeLabel(pendingHour, 0, settings).split(":")[0] : ""}
                    {settings.timeFormat === "12h" ? ` ${ampm}` : ""} — pick minutes
                  </p>
                </div>
              )}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
