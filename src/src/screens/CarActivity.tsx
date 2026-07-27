import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { listBookings } from "../lib/repo/bookings";
import { listVehicles } from "../lib/repo/vehicles";
import { listCustomers } from "../lib/repo/customers";
import { useSettings } from "../lib/settingsContext";
import { formatDateTime } from "../lib/dateFormat";
import { bookingRef } from "../lib/bookingRef";
import type { Booking, Customer, Vehicle } from "../lib/types";

const HOUR_MARKS = [0, 3, 6, 9, 12, 15, 18, 21, 24];
// Fallback/ceiling row height — the real per-row height is computed live
// (see rowHeight state below) so a whole month of rows fits the visible
// viewport with no scrolling. This is just what's used before that first
// measurement lands, and the upper cap for short months on tall screens.
const ROW_HEIGHT = 30;
const MIN_ROW_HEIGHT = 15;
// Space reserved below the grid card that isn't part of the card itself —
// mainly the page section's own bottom padding — plus a little safety
// margin, so the corrected height still lands just inside the viewport
// rather than flush against its very edge.
const BOTTOM_BREATHING_ROOM = 32;

const selectStyle: React.CSSProperties = {
  border: "0.5px solid var(--border-strong)",
  background: "var(--surface-2)",
  color: "var(--text-primary)",
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function daysInMonth(anchor: Date): number {
  return new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
}
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function hoursFromMidnight(d: Date): number {
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}
function monthLabel(anchor: Date): string {
  return anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
function weekdayShort(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

interface Segment {
  bookingId: string;
  kind: "scheduled" | "overtime";
  leftPct: number;
  widthPct: number;
}

// Where two different bookings' bars actually overlap in time on the same
// day — shouldn't normally happen (a vehicle can't really be out twice at
// once), but a backdated entry or a late-overtime bleeding into the next
// booking's ETD can produce one, and it's exactly the kind of thing this
// tool should make impossible to miss.
interface ConflictSegment {
  bookingIds: string[];
  leftPct: number;
  widthPct: number;
}

interface DayRow {
  date: Date;
  segments: Segment[];
  conflicts: ConflictSegment[];
}

interface TooltipState {
  x: number;
  y: number;
  booking: Booking | null;
  kind: "scheduled" | "overtime" | "conflict";
  conflictBookings?: Booking[];
}

// Vehicle-scoped, month-at-a-time timeline: rows are days, columns are the
// fixed 24-hour clock. Each booking draws a light-blue bar for its scheduled
// ETD-ETA span and (only when it actually ran late) an orange bar from ETA
// to whenever it was actually returned — clipped per day, since a rental
// spanning several days needs one bar segment on each day row it touches.
// An active, still-out booking that's currently overdue gets a live orange
// bar that grows up to "now" rather than waiting for Mark returned.
export default function CarActivity() {
  const { settings } = useSettings();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [monthAnchor, setMonthAnchor] = useState(() => startOfDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [hoveredBookingId, setHoveredBookingId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [rowHeight, setRowHeight] = useState(ROW_HEIGHT);
  const tooltipRef = useRef<HTMLDivElement>(null);
  // Measured, viewport-clamped position for the tooltip — the cursor offset
  // in `tooltip.x/y` is just a starting point; near the right or bottom
  // edge of the window it gets flipped to the other side of the cursor (or
  // clamped) so the card is always fully on-screen and never truncated.
  const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number } | null>(null);

  // Ticks once a minute so a still-open, currently-overdue booking's orange
  // bar keeps growing live instead of needing a manual refresh.
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    Promise.all([listVehicles(), listCustomers(), listBookings()]).then(([v, c, b]) => {
      setVehicles(v);
      setCustomers(c);
      setBookings(b);
      if (v.length > 0) setVehicleId((prev) => prev || v[0].id);
      setLoading(false);
    });
  }, []);

  function customerLabel(id: string) {
    return customers.find((c) => c.id === id)?.full_name ?? "—";
  }

  const vehicleBookings = useMemo(
    () => bookings.filter((b) => b.vehicle_id === vehicleId && b.status !== "cancelled"),
    [bookings, vehicleId],
  );

  const monthStart = monthAnchor;
  const monthEnd = addDays(addMonths(monthAnchor, 1), 0); // exclusive upper bound
  const totalDays = daysInMonth(monthAnchor);

  // Measures the space actually left below the grid card (to the bottom of
  // the viewport) and divides it evenly across the month's day rows, so the
  // whole month is visible with no scrolling instead of a fixed row height
  // running off the bottom of the screen.
  //
  // A pure budget calculation (available / totalDays) undershoots in
  // practice — each row's own bottom border and the hour-axis header add a
  // little real height that isn't reflected in `rowHeight * totalDays`, and
  // that per-row overhead accumulates across a whole month. So this reads
  // the card's *actual current* rendered height, works out what that
  // overhead really is, and corrects for it — self-stabilizing within one
  // extra pass (`rowHeight` is in the dependency list, and the effect bails
  // out once the computed value stops changing). Re-measures on window
  // resize and whenever the day count changes (28-31) or the loading/empty
  // state toggles the grid card in or out.
  useLayoutEffect(() => {
    function recompute() {
      const el = gridRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const available = window.innerHeight - top - BOTTOM_BREATHING_ROOM;
      const actualHeight = el.getBoundingClientRect().height;
      const overhead = Math.max(0, actualHeight - rowHeight * totalDays);
      const perRow = Math.floor((available - overhead) / totalDays);
      const next = Math.max(MIN_ROW_HEIGHT, Math.min(ROW_HEIGHT, perRow));
      setRowHeight((prev) => (prev === next ? prev : next));
    }
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [totalDays, loading, vehicles.length, rowHeight]);

  // Only the bookings whose span could plausibly touch the visible month —
  // trims the per-day scan below to a relevant handful even once a vehicle
  // has a long history.
  const relevantBookings = useMemo(() => {
    return vehicleBookings.filter((b) => {
      const start = new Date(b.start_date);
      const scheduledEnd = new Date(b.end_date);
      const actualEnd = b.actual_return_at ? new Date(b.actual_return_at) : b.status === "active" ? now : scheduledEnd;
      const effectiveEnd = actualEnd.getTime() > scheduledEnd.getTime() ? actualEnd : scheduledEnd;
      return start.getTime() < monthEnd.getTime() && effectiveEnd.getTime() >= monthStart.getTime();
    });
  }, [vehicleBookings, monthStart, monthEnd, now]);

  const dayRows: DayRow[] = useMemo(() => {
    const rows: DayRow[] = [];
    for (let i = 0; i < totalDays; i++) {
      const date = addDays(monthStart, i);
      const dayEnd = addDays(date, 1);
      const segments: Segment[] = [];
      // This day's occupied span per booking, in hours-from-midnight — the
      // scheduled and overtime portions merged into one range (they're
      // always contiguous), used below to find where two different
      // bookings' ranges actually overlap.
      const rangeByBooking = new Map<string, { start: number; end: number }>();

      function extendRange(bookingId: string, start: number, end: number) {
        const existing = rangeByBooking.get(bookingId);
        if (!existing) {
          rangeByBooking.set(bookingId, { start, end });
        } else {
          existing.start = Math.min(existing.start, start);
          existing.end = Math.max(existing.end, end);
        }
      }

      for (const b of relevantBookings) {
        const scheduledStart = new Date(b.start_date);
        const scheduledEnd = new Date(b.end_date);
        const rawActualEnd = b.actual_return_at ? new Date(b.actual_return_at) : b.status === "active" ? now : null;
        const lateEnd = rawActualEnd && rawActualEnd.getTime() > scheduledEnd.getTime() ? rawActualEnd : null;

        const schedOverlapStart = scheduledStart.getTime() > date.getTime() ? scheduledStart : date;
        const schedOverlapEnd = scheduledEnd.getTime() < dayEnd.getTime() ? scheduledEnd : dayEnd;
        if (schedOverlapStart.getTime() < schedOverlapEnd.getTime()) {
          const left = hoursFromMidnight(schedOverlapStart);
          const right = schedOverlapEnd.getTime() === dayEnd.getTime() ? 24 : hoursFromMidnight(schedOverlapEnd);
          segments.push({ bookingId: b.id, kind: "scheduled", leftPct: (left / 24) * 100, widthPct: ((right - left) / 24) * 100 });
          extendRange(b.id, left, right);
        }

        if (lateEnd) {
          const otOverlapStart = scheduledEnd.getTime() > date.getTime() ? scheduledEnd : date;
          const otOverlapEnd = lateEnd.getTime() < dayEnd.getTime() ? lateEnd : dayEnd;
          if (otOverlapStart.getTime() < otOverlapEnd.getTime()) {
            const left = hoursFromMidnight(otOverlapStart);
            const right = otOverlapEnd.getTime() === dayEnd.getTime() ? 24 : hoursFromMidnight(otOverlapEnd);
            segments.push({ bookingId: b.id, kind: "overtime", leftPct: (left / 24) * 100, widthPct: ((right - left) / 24) * 100 });
            extendRange(b.id, left, right);
          }
        }
      }

      // Pairwise overlap between every two *different* bookings' ranges —
      // there's rarely more than a couple of bookings touching the same day,
      // so an O(n²) scan is plenty cheap. Each overlap becomes its own red
      // segment on top of whatever's underneath.
      const conflicts: ConflictSegment[] = [];
      const entries = Array.from(rangeByBooking.entries());
      for (let a = 0; a < entries.length; a++) {
        for (let c = a + 1; c < entries.length; c++) {
          const [idA, rangeA] = entries[a];
          const [idB, rangeB] = entries[c];
          const overlapStart = Math.max(rangeA.start, rangeB.start);
          const overlapEnd = Math.min(rangeA.end, rangeB.end);
          if (overlapStart < overlapEnd) {
            conflicts.push({
              bookingIds: [idA, idB],
              leftPct: (overlapStart / 24) * 100,
              widthPct: ((overlapEnd - overlapStart) / 24) * 100,
            });
          }
        }
      }

      rows.push({ date, segments, conflicts });
    }
    return rows;
  }, [monthStart, totalDays, relevantBookings, now]);

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId) ?? null;

  function showTooltip(e: React.MouseEvent, bookingId: string, kind: "scheduled" | "overtime") {
    const b = bookings.find((x) => x.id === bookingId);
    if (!b) return;
    setHoveredBookingId(bookingId);
    setTooltip({ x: e.clientX, y: e.clientY, booking: b, kind });
  }
  function showConflictTooltip(e: React.MouseEvent, bookingIds: string[]) {
    const found = bookingIds.map((id) => bookings.find((x) => x.id === id)).filter((x): x is Booking => Boolean(x));
    if (found.length === 0) return;
    setHoveredBookingId(null);
    setTooltip({ x: e.clientX, y: e.clientY, booking: null, kind: "conflict", conflictBookings: found });
  }
  function hideTooltip() {
    setHoveredBookingId(null);
    setTooltip(null);
  }

  // Runs synchronously after every tooltip render (including each mousemove
  // update) — measures the card's actual size and flips/clamps it so it
  // never runs off the right or bottom edge of the window.
  useLayoutEffect(() => {
    if (!tooltip || !tooltipRef.current) {
      setTooltipPos(null);
      return;
    }
    const rect = tooltipRef.current.getBoundingClientRect();
    const margin = 10;
    const offset = 14;
    let left = tooltip.x + offset;
    let top = tooltip.y + offset;
    if (left + rect.width + margin > window.innerWidth) left = tooltip.x - rect.width - offset;
    if (top + rect.height + margin > window.innerHeight) top = tooltip.y - rect.height - offset;
    left = Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin));
    setTooltipPos({ left, top });
  }, [tooltip]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>
              Vehicle
            </label>
            <select
              className="w-56 rounded-md px-3 py-2.5 text-base"
              style={selectStyle}
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate_number}
                  {v.make ? ` — ${v.make} ${v.model ?? ""}`.trimEnd() : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1 rounded-md p-1" style={{ background: "var(--surface-1)" }}>
            <button
              onClick={() => setMonthAnchor((m) => addMonths(m, -1))}
              className="rounded px-3 py-1.5 text-sm font-medium"
              style={{ color: "var(--text-secondary)" }}
              title="Previous month"
            >
              ‹
            </button>
            <span className="min-w-[9.5rem] px-1 text-center text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              {monthLabel(monthAnchor)}
            </span>
            <button
              onClick={() => setMonthAnchor((m) => addMonths(m, 1))}
              className="rounded px-3 py-1.5 text-sm font-medium"
              style={{ color: "var(--text-secondary)" }}
              title="Next month"
            >
              ›
            </button>
            <button
              onClick={() => setMonthAnchor(startOfDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))}
              className="ml-1 rounded px-3 py-1.5 text-sm font-medium"
              style={{ color: "var(--text-accent)" }}
            >
              Today
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm" style={{ color: "var(--text-secondary)" }}>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: "var(--fill-accent)" }} />
            Scheduled (ETD–ETA)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: "var(--fill-warning)" }} />
            Overtime (ETA–Actual)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: "var(--text-danger)" }} />
            Overlapping bookings
          </span>
        </div>
      </div>

      {loading ? (
        <p className="text-base" style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : vehicles.length === 0 ? (
        <p className="text-base" style={{ color: "var(--text-muted)" }}>Add a vehicle in Fleet to see its activity here.</p>
      ) : (
        <div ref={gridRef} className="rounded-md" style={{ border: "0.5px solid var(--border)" }}>
          {/* Hour axis header — 0 to 24, fixed regardless of month/vehicle. */}
          <div className="flex" style={{ borderBottom: "0.5px solid var(--border)" }}>
            <div className="w-16 shrink-0" />
            <div className="relative flex-1" style={{ height: 24 }}>
              {HOUR_MARKS.map((h) => (
                <span
                  key={h}
                  className="absolute top-0 -translate-x-1/2 text-sm"
                  style={{ left: `${(h / 24) * 100}%`, color: "var(--text-muted)" }}
                >
                  {h}
                </span>
              ))}
            </div>
          </div>

          <div>
            {dayRows.map((row) => {
              const today = isSameDay(row.date, now);
              return (
                <div
                  key={row.date.toISOString()}
                  className="flex items-stretch"
                  style={{ borderBottom: "0.5px solid var(--border)", background: today ? "var(--bg-accent)" : undefined }}
                >
                  <div
                    className="flex w-16 shrink-0 flex-col justify-center px-2 text-sm"
                    style={{ color: today ? "var(--text-accent)" : "var(--text-secondary)", height: rowHeight }}
                  >
                    <span className="font-medium">{row.date.getDate()}</span>
                    {rowHeight >= 22 && (
                      <span style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>{weekdayShort(row.date)}</span>
                    )}
                  </div>
                  <div className="relative flex-1" style={{ height: rowHeight }}>
                    {/* Faint gridlines at the same marks as the hour axis. */}
                    {HOUR_MARKS.map((h) => (
                      <div
                        key={h}
                        className="absolute top-0 bottom-0"
                        style={{ left: `${(h / 24) * 100}%`, borderLeft: "0.5px solid var(--border)" }}
                      />
                    ))}
                    {today && (
                      <div
                        className="absolute top-0 bottom-0 z-10"
                        style={{ left: `${(hoursFromMidnight(now) / 24) * 100}%`, borderLeft: "1.5px solid var(--text-danger)" }}
                        title="Now"
                      />
                    )}
                    {row.segments.map((seg, i) => (
                      <div
                        key={`${seg.bookingId}-${seg.kind}-${i}`}
                        className="absolute rounded-sm"
                        style={{
                          left: `${seg.leftPct}%`,
                          width: `${Math.max(seg.widthPct, 0.5)}%`,
                          top: 4,
                          bottom: 4,
                          background: seg.kind === "scheduled" ? "var(--fill-accent)" : "var(--fill-warning)",
                          opacity: hoveredBookingId == null || hoveredBookingId === seg.bookingId ? 0.9 : 0.3,
                          cursor: "pointer",
                          transition: "opacity 0.1s ease",
                        }}
                        onMouseEnter={(e) => showTooltip(e, seg.bookingId, seg.kind)}
                        onMouseMove={(e) => setTooltip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t))}
                        onMouseLeave={hideTooltip}
                      />
                    ))}
                    {/* Conflicts render on top, full height, so a real
                        overlap is never masked by whichever booking's
                        blue/orange bar happens to be underneath. */}
                    {row.conflicts.map((conf, i) => (
                      <div
                        key={`conflict-${i}`}
                        className="absolute z-20 rounded-sm"
                        style={{
                          left: `${conf.leftPct}%`,
                          width: `${Math.max(conf.widthPct, 0.5)}%`,
                          top: 1,
                          bottom: 1,
                          background: "var(--text-danger)",
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => showConflictTooltip(e, conf.bookingIds)}
                        onMouseMove={(e) => setTooltip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t))}
                        onMouseLeave={hideTooltip}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tooltip && (
        <div
          ref={tooltipRef}
          className="pointer-events-none fixed z-50 max-w-xs rounded-md p-3 text-sm shadow-lg"
          style={{
            left: tooltipPos?.left ?? tooltip.x + 14,
            top: tooltipPos?.top ?? tooltip.y + 14,
            // Hidden until the first measurement lands so it never flashes
            // at the unclamped cursor-offset position before flipping.
            visibility: tooltipPos ? "visible" : "hidden",
            background: "var(--surface-1)",
            border: "0.5px solid var(--border-strong)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          {tooltip.kind === "conflict" ? (
            <>
              <div className="font-medium" style={{ color: "var(--text-danger)" }}>
                ⚠ Overlapping bookings
              </div>
              <div className="mt-1.5 space-y-2">
                {(tooltip.conflictBookings ?? []).map((cb) => (
                  <div key={cb.id}>
                    <div className="font-mono font-medium" style={{ color: "var(--text-primary)" }}>
                      {bookingRef(cb.id)}
                    </div>
                    <div style={{ color: "var(--text-secondary)" }}>{customerLabel(cb.customer_id)}</div>
                    <div style={{ color: "var(--text-muted)" }}>
                      {formatDateTime(cb.start_date, settings)} – {formatDateTime(cb.end_date, settings)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : tooltip.booking ? (
            <>
              <div className="font-mono font-medium" style={{ color: "var(--text-primary)" }}>
                {bookingRef(tooltip.booking.id)}
              </div>
              <div style={{ color: "var(--text-secondary)" }}>{customerLabel(tooltip.booking.customer_id)}</div>
              <div className="mt-1.5" style={{ color: "var(--text-muted)" }}>
                ETD {formatDateTime(tooltip.booking.start_date, settings)}
              </div>
              <div style={{ color: "var(--text-muted)" }}>
                ETA {formatDateTime(tooltip.booking.end_date, settings)}
              </div>
              {tooltip.booking.actual_return_at && (
                <div style={{ color: tooltip.kind === "overtime" ? "var(--text-warning)" : "var(--text-muted)" }}>
                  Actual {formatDateTime(tooltip.booking.actual_return_at, settings)}
                </div>
              )}
              {!tooltip.booking.actual_return_at && tooltip.kind === "overtime" && (
                <div style={{ color: "var(--text-warning)" }}>Still out — overdue as of now</div>
              )}
              <div className="mt-1.5 capitalize" style={{ color: "var(--text-secondary)" }}>
                {tooltip.booking.status}
              </div>
            </>
          ) : null}
        </div>
      )}

      {selectedVehicle && !loading && relevantBookings.length === 0 && (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          No activity recorded for {selectedVehicle.plate_number} in {monthLabel(monthAnchor)}.
        </p>
      )}
    </div>
  );
}
