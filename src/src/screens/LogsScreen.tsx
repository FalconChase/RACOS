import { useEffect, useMemo, useState } from "react";
import { listBookings } from "../lib/repo/bookings";
import { listVehicles } from "../lib/repo/vehicles";
import { listCustomers } from "../lib/repo/customers";
import { listOwners } from "../lib/repo/owners";
import { listActionLogsByType } from "../lib/repo/actionLog";
import { getCurrentBusinessName } from "../lib/db";
import { useSettings } from "../lib/settingsContext";
import { formatDateTime } from "../lib/dateFormat";
import { formatHoursAsHHMM } from "../lib/duration";
import { bookingRef } from "../lib/bookingRef";
import { PrinterIcon } from "../components/icons";
import type { ActionLogEntry, Booking, BookingStatus, Customer, Owner, Vehicle } from "../lib/types";

const COLUMNS = ["Ref", "Date recorded", "ETD / Departed", "ETA / Actual", "Actions"];

const selectStyle: React.CSSProperties = {
  border: "0.5px solid var(--border-strong)",
  background: "var(--surface-2)",
  color: "var(--text-primary)",
};

// Sort options offered on Logs — "Date recorded" (default, matches the
// screen's own newest-first framing) plus ETD and Ref, each both
// directions, the same kind of helpful-but-not-endless list RemittancesReport
// offers for its own breakdown mode.
const SORT_MODES = [
  { id: "recordedDesc", label: "Date recorded — newest first" },
  { id: "recordedAsc", label: "Date recorded — oldest first" },
  { id: "etdDesc", label: "ETD — latest first" },
  { id: "etdAsc", label: "ETD — earliest first" },
  { id: "refAsc", label: "Ref — A–Z" },
] as const;
type SortMode = (typeof SORT_MODES)[number]["id"];

function compareBookings(a: Booking, b: Booking, mode: SortMode): number {
  switch (mode) {
    case "recordedAsc":
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    case "etdDesc":
      return new Date(b.start_date).getTime() - new Date(a.start_date).getTime();
    case "etdAsc":
      return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
    case "refAsc":
      return bookingRef(a.id).localeCompare(bookingRef(b.id));
    case "recordedDesc":
    default:
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  }
}

// Same ongoing/finished split as BookingsScreen's ONGOING_STATUSES — still
// out, not yet resolved either way.
const ONGOING_STATUSES: BookingStatus[] = ["pending", "confirmed", "active"];

// Ref color cue: red once cancelled, blue while still ongoing, default once
// completed (no cue needed — that's the expected end state).
function refColor(status: BookingStatus): string {
  if (status === "cancelled") return "var(--text-danger)";
  if (ONGOING_STATUSES.includes(status)) return "var(--text-accent)";
  return "var(--text-secondary)";
}

// Gap between when the booking was actually recorded (created_at) and its
// scheduled ETD (start_date) — shown under Date recorded as "V-HH:MM" so
// staff can spot backdated entries (recorded after the fact, i.e. after ETD
// already passed) at a glance. Red when recorded after ETD, blue when
// recorded before it (the normal, booked-ahead-of-time case).
function recordedVariance(booking: Booking): { label: string; color: string } {
  const recordedMs = new Date(booking.created_at).getTime();
  const etdMs = new Date(booking.start_date).getTime();
  const diffHours = Math.abs(recordedMs - etdMs) / 3600000;
  return {
    label: `V-${formatHoursAsHHMM(diffHours)}`,
    color: recordedMs > etdMs ? "var(--text-danger)" : "var(--text-accent)",
  };
}

// Pulls one named fact back out of a cancellation entry's changes[] — see
// cancelBooking, which snapshots both of these (the departure timestamp only
// when the vehicle had already left, the reason always) right at
// cancellation time.
function changeValue(entry: ActionLogEntry, field: string): string | null {
  return entry.changes?.find((c) => c.field === field)?.new ?? null;
}

// How long after (or before) actual departure the cancellation happened —
// the whole point being to monitor how long a cancellation took to occur
// relative to departure. Reads the snapshot taken at cancellation time
// (changeValue(entry, "actual_departure_at")), not the booking's live
// actual_departure_at, so this can never be skewed by a later Edit-times
// correction. No snapshot at all means the vehicle had never departed when
// it was cancelled — the ordinary, unremarkable case — shown blue with no
// numeric span since there's nothing to measure against.
function cancellationVariance(entry: ActionLogEntry): { label: string; color: string } {
  const departedAt = changeValue(entry, "actual_departure_at");
  if (!departedAt) {
    return { label: "before departure (never departed)", color: "var(--text-accent)" };
  }
  const cancelledMs = new Date(entry.created_at).getTime();
  const departedMs = new Date(departedAt).getTime();
  const diffHours = Math.abs(cancelledMs - departedMs) / 3600000;
  return {
    label: `V-${formatHoursAsHHMM(diffHours)} ${cancelledMs > departedMs ? "after departure" : "before departure"}`,
    color: cancelledMs > departedMs ? "var(--text-danger)" : "var(--text-accent)",
  };
}

// One-line label for any booking-lifecycle event other than "cancelled"
// (which gets its own richer treatment — see the Actions column render
// below, since it needs the variance/reason sub-lines a plain string can't
// carry). "updated" is the one action with a field diff (see
// updateBookingTimes); "completed"/"departed" are bare markers logged by
// markBookingReturned/markBookingDeparted.
function actionSummary(entry: ActionLogEntry): string {
  switch (entry.action) {
    case "completed":
      return "Marked returned";
    case "departed":
      return changeValue(entry, "trigger") ? "Marked departed (automatic)" : "Marked departed";
    case "updated": {
      if (!entry.changes || entry.changes.length === 0) return "Edited";
      return entry.changes.map((c) => `${c.label} edited`).join(", ");
    }
    case "cancelled":
    case "created":
    default:
      return "Recorded";
  }
}

// Every recorded rental reference, full history, most recent first — the
// flat counterpart to Car Activity's per-vehicle month view. Pulls straight
// from listBookings() + listActionLogsByType("booking") and joins them by
// entity_id, same pattern BookingsScreen already uses for its edit-history
// badge (see logsByBooking there).
export default function LogsScreen() {
  const { settings } = useSettings();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [logs, setLogs] = useState<ActionLogEntry[]>([]);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recordedDesc");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      listBookings(),
      listVehicles(),
      listCustomers(),
      listOwners(),
      listActionLogsByType("booking"),
      getCurrentBusinessName(),
    ]).then(([b, v, c, o, l, bizName]) => {
      setBookings(b);
      setVehicles(v);
      setCustomers(c);
      setOwners(o);
      setLogs(l);
      setBusinessName(bizName);
      setLoading(false);
    });
  }, []);

  function vehicleLabel(id: string): string {
    const v = vehicles.find((x) => x.id === id);
    return v ? v.plate_number : "—";
  }

  function customerLabel(id: string): string {
    return customers.find((c) => c.id === id)?.full_name ?? "—";
  }

  // Vehicles belonging to the selected owner — narrows the Vehicle filter's
  // own options the same way RemittancesReport's Unit select follows Owner.
  const ownerVehicles = useMemo(
    () => (ownerFilter ? vehicles.filter((v) => v.owner_id === ownerFilter) : vehicles),
    [vehicles, ownerFilter],
  );

  function handleOwnerFilterChange(nextOwnerId: string) {
    setOwnerFilter(nextOwnerId);
    setVehicleFilter("");
  }

  // Grouped once per logs change rather than filtering the whole log list
  // per row on every render — same idea as logsByBooking in BookingsScreen.
  const logsByBooking = useMemo(() => {
    const map = new Map<string, ActionLogEntry[]>();
    for (const log of logs) {
      const list = map.get(log.entity_id) ?? [];
      list.push(log);
      map.set(log.entity_id, list);
    }
    return map;
  }, [logs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const ownerVehicleIds = ownerFilter ? new Set(ownerVehicles.map((v) => v.id)) : null;
    const list = bookings.filter((b) => {
      if (ownerVehicleIds && !ownerVehicleIds.has(b.vehicle_id)) return false;
      if (vehicleFilter && b.vehicle_id !== vehicleFilter) return false;
      if (!q) return true;
      return (
        bookingRef(b.id).toLowerCase().includes(q) ||
        vehicleLabel(b.vehicle_id).toLowerCase().includes(q) ||
        customerLabel(b.customer_id).toLowerCase().includes(q)
      );
    });
    return list.sort((a, b) => compareBookings(a, b, sortMode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, ownerFilter, ownerVehicles, vehicleFilter, search, sortMode, vehicles, customers]);

  return (
    <div className="space-y-4">
      {/* Print-only — mirrors RemittancesReport's print header. Hidden on
          screen, switched on only inside @media print via print:block. */}
      <div className="hidden print:block">
        <div className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          {businessName ?? "RACOS"}
        </div>
        <div className="text-base font-medium" style={{ color: "var(--text-secondary)" }}>
          Booking Logs
        </div>
        <div className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Printed {formatDateTime(new Date().toISOString(), settings)}
        </div>
      </div>
      <div
        className="hidden print:block print:fixed print:inset-x-0 print:bottom-0 print:text-center print:text-sm"
        style={{ color: "var(--text-muted)" }}
      >
        Powered by RACOS
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>Search</label>
            <input
              type="text"
              className="w-64 rounded-md px-3 py-2.5 text-base"
              style={selectStyle}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ref, plate, or customer…"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>Owner</label>
            <select
              className="w-48 rounded-md px-3 py-2.5 text-base"
              style={selectStyle}
              value={ownerFilter}
              onChange={(e) => handleOwnerFilterChange(e.target.value)}
            >
              <option value="">All owners</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>{o.full_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>Vehicle</label>
            <select
              className="w-48 rounded-md px-3 py-2.5 text-base"
              style={selectStyle}
              value={vehicleFilter}
              onChange={(e) => setVehicleFilter(e.target.value)}
            >
              <option value="">All vehicles</option>
              {ownerVehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.plate_number}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>Sort by</label>
            <select
              className="w-56 rounded-md px-3 py-2.5 text-base"
              style={selectStyle}
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
            >
              {SORT_MODES.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            {filtered.length} of {bookings.length} bookings
          </span>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-md px-4 py-2.5 text-base"
            style={{ border: "0.5px solid var(--border-strong)", color: "var(--text-primary)" }}
          >
            <PrinterIcon size={18} />
            Print
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-base" style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : bookings.length === 0 ? (
        <p className="text-base" style={{ color: "var(--text-muted)" }}>No bookings recorded yet.</p>
      ) : filtered.length === 0 ? (
        <p className="text-base" style={{ color: "var(--text-muted)" }}>No bookings match "{search}".</p>
      ) : (
        <div className="overflow-hidden rounded-md" style={{ border: "0.5px solid var(--border)" }}>
          <table className="w-full border-collapse text-left text-base">
            <thead>
              <tr>
                {COLUMNS.map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-sm font-semibold"
                    style={{ background: "var(--surface-1)", color: "var(--text-secondary)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => {
                const late = Boolean(b.actual_return_at) && new Date(b.actual_return_at as string).getTime() > new Date(b.end_date).getTime();
                const entries = logsByBooking.get(b.id) ?? [];

                return (
                  <tr key={b.id} style={{ breakInside: "avoid" }}>
                    <td
                      className="px-3 py-2 font-mono text-sm"
                      style={{ borderTop: "0.5px solid var(--border)" }}
                    >
                      <span style={{ color: refColor(b.status) }}>{bookingRef(b.id)}</span>
                      <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                        {vehicleLabel(b.vehicle_id)} · {customerLabel(b.customer_id)}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-sm" style={{ borderTop: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>
                      {formatDateTime(b.created_at, settings)}
                      {(() => {
                        const rv = recordedVariance(b);
                        return (
                          <div
                            style={{ color: rv.color, fontSize: "0.8rem" }}
                            title={rv.color === "var(--text-danger)" ? "Recorded after ETD" : "Recorded before ETD"}
                          >
                            {rv.label}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2 text-sm" style={{ borderTop: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>
                      {formatDateTime(b.start_date, settings)}
                      {b.actual_departure_at && (
                        <div style={{ color: "var(--text-muted)" }}>departed: {formatDateTime(b.actual_departure_at, settings)}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm" style={{ borderTop: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>
                      {formatDateTime(b.end_date, settings)}
                      {b.actual_return_at && (
                        <div style={{ color: late ? "var(--text-danger)" : "var(--text-success)" }}>
                          actual: {formatDateTime(b.actual_return_at, settings)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm" style={{ borderTop: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>
                      {entries.length === 0 ? (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      ) : (
                        <div className="space-y-2">
                          {entries.map((entry) => {
                            if (entry.action !== "cancelled") {
                              return (
                                <div key={entry.id}>
                                  <span style={{ color: "var(--text-primary)" }}>{actionSummary(entry)}</span>{" "}
                                  <span style={{ color: "var(--text-muted)" }}>{formatDateTime(entry.created_at, settings)}</span>
                                </div>
                              );
                            }
                            // Cancelled gets the richer treatment — it's just
                            // one entry among the others here, not a column
                            // of its own, but it's the one action worth a
                            // second look so it carries its own variance
                            // (vs. the departure snapshot taken at
                            // cancellation time) and reason underneath.
                            const variance = cancellationVariance(entry);
                            const reason = changeValue(entry, "cancellation_reason");
                            const flagged = variance.color === "var(--text-danger)";
                            return (
                              <div key={entry.id}>
                                <span
                                  className={flagged ? "font-semibold" : undefined}
                                  style={{ color: flagged ? "var(--text-danger)" : "var(--text-primary)" }}
                                  title={flagged ? "Vehicle had already departed when this booking was cancelled — worth a second look." : undefined}
                                >
                                  {flagged ? "⚠ " : ""}Cancelled
                                </span>{" "}
                                <span style={{ color: "var(--text-muted)" }}>{formatDateTime(entry.created_at, settings)}</span>
                                <div style={{ color: variance.color, fontSize: "0.8rem" }}>{variance.label}</div>
                                {reason && (
                                  <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>reason: {reason}</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
