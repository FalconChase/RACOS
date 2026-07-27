import { useEffect, useState } from "react";
import { listVehicles } from "../lib/repo/vehicles";
import { listCustomers } from "../lib/repo/customers";
import { listBookings } from "../lib/repo/bookings";
import { useSettings } from "../lib/settingsContext";
import { formatDateTime, formatTime } from "../lib/dateFormat";
import { formatHoursMinutes } from "../lib/duration";
import { bookingRef } from "../lib/bookingRef";
import type { Booking, Customer, Vehicle } from "../lib/types";
import type { Tab } from "../App";

interface HomeScreenProps {
  onNavigate: (tab: Tab) => void;
  onWalkInCheckout: () => void;
}

export default function HomeScreen({ onNavigate, onWalkInCheckout }: HomeScreenProps) {
  const { settings } = useSettings();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([listVehicles(), listCustomers(), listBookings()]).then(([v, c, b]) => {
      setVehicles(v);
      setCustomers(c);
      setBookings(b);
      setLoading(false);
    });
  }, []);

  // Live clock for the "Today" header — ticks every second so the displayed
  // time stays current without needing a page refresh.
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const onRent = vehicles.filter((v) => v.status === "rented").length;
  const available = vehicles.filter((v) => v.status === "available").length;
  const offFleet = vehicles.filter((v) => v.status === "maintenance" || v.status === "retired").length;
  const fleet = vehicles.length;

  // Every non-cancelled/non-completed booking — the Home table shows all of
  // them, not just ones tied to today. Overdue/departure-due detection lives
  // in isOverdueReturn/isDepartureDue below, next to statusCell.
  const active = bookings.filter((b) => b.status !== "cancelled" && b.status !== "completed");

  function vehicleLabel(id: string) {
    return vehicles.find((v) => v.id === id)?.plate_number ?? "—";
  }
  function customerLabel(id: string) {
    return customers.find((c) => c.id === id)?.full_name ?? "—";
  }

  const today = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // Home-only cosmetic terminology (Settings > Dashboard) — display-only,
  // never touches underlying field names or stored data. Every other screen
  // always keeps saying Vehicle/Customer/Start/End. Toggles relabel table
  // column headers (matches the original mockup annotation on headers, not
  // inline words) — cell values themselves stay plain.
  const unitHeader = settings.dashLabelUnit ? "Unit" : "Vehicle";
  const lesseeHeader = settings.dashLabelLessee ? "Lessee" : "Customer";
  const etdHeader = settings.dashLabelEtd ? "ETD" : "Start";
  const etaHeader = settings.dashLabelEta ? "ETA" : "End";

  function isSameDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  // Every non-cancelled/non-completed booking, not just ones tied to today —
  // overdue and departure-due bubble to the top since they need attention,
  // then bookings returning today, then everything else. Within each tier the
  // default sort is by arrival date (ETA / end_date) ascending, soonest first.
  function isOverdueReturn(b: Booking) {
    return b.status === "active" && new Date(b.end_date) < now;
  }
  function isDepartureDue(b: Booking) {
    return b.status === "pending" && new Date(b.start_date) <= now;
  }
  function isReturningToday(b: Booking) {
    return b.status === "active" && !isOverdueReturn(b) && isSameDay(new Date(b.end_date), now);
  }
  function rowPriority(b: Booking) {
    if (isOverdueReturn(b)) return 0;
    if (isDepartureDue(b)) return 1;
    if (isReturningToday(b)) return 2;
    return 3;
  }
  const homeRows = [...active].sort((a, b) => {
    const priorityDiff = rowPriority(a) - rowPriority(b);
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(a.end_date).getTime() - new Date(b.end_date).getTime();
  });

  // Plain-status pill colors match BookingsScreen's STATUS_STYLES exactly, so
  // an on-schedule booking looks identical here and on Rentals.
  const PLAIN_STATUS_STYLE: Record<string, { bg: string; color: string }> = {
    pending: { bg: "var(--bg-warning)", color: "var(--text-warning)" },
    confirmed: { bg: "var(--bg-accent)", color: "var(--text-accent)" },
    active: { bg: "var(--bg-success)", color: "var(--text-success)" },
  };

  // Status cell per booking — pill label + optional live counter subtext,
  // same visual convention BookingsScreen uses for overdue/departure-due.
  function statusCell(booking: Booking) {
    if (isOverdueReturn(booking)) {
      return {
        label: "overdue",
        bg: "var(--bg-danger)",
        color: "var(--text-danger)",
        sub: `${formatHoursMinutes(new Date(booking.end_date), now)} ${settings.dashLabelEta ? "past ETA" : "overdue"}`,
      };
    }
    if (isDepartureDue(booking)) {
      return {
        label: "departure due",
        bg: "var(--bg-warning)",
        color: "var(--text-warning)",
        sub: `${formatHoursMinutes(new Date(booking.start_date), now)} ${settings.dashLabelEtd ? "past ETD" : "since scheduled"}`,
      };
    }
    if (isReturningToday(booking)) {
      return {
        label: "returning today",
        bg: "var(--bg-accent)",
        color: "var(--text-accent)",
        sub: null as string | null,
      };
    }
    const style = PLAIN_STATUS_STYLE[booking.status] ?? { bg: "var(--surface-1)", color: "var(--text-muted)" };
    return { label: booking.status, bg: style.bg, color: style.color, sub: null as string | null };
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-4">
        <StatCard label="On rent" value={onRent} loading={loading} />
        <StatCard label="Available" value={available} loading={loading} />
        <StatCard label="Off fleet" value={offFleet} loading={loading} />
        <StatCard label="Fleet" value={fleet} loading={loading} />
      </div>

      <div>
        <div className="mb-2.5 text-base font-medium" style={{ color: "var(--text-secondary)" }}>
          Today — {today} · {formatTime(now.toISOString(), settings)}
        </div>
        {loading ? (
          <p className="text-base" style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : homeRows.length === 0 ? (
          <p className="text-base" style={{ color: "var(--text-muted)" }}>Nothing due today.</p>
        ) : (
          <table className="w-full border-collapse text-left text-base">
            <thead>
              <tr style={{ background: "var(--surface-1)" }}>
                <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Ref</th>
                <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>{unitHeader}</th>
                <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>{lesseeHeader}</th>
                <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>{etdHeader}</th>
                <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>{etaHeader}</th>
                <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {homeRows.map((booking) => {
                const status = statusCell(booking);
                return (
                  <tr key={booking.id}>
                    <td className="px-3 py-2.5 font-mono text-sm" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>{bookingRef(booking.id)}</td>
                    <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>{vehicleLabel(booking.vehicle_id)}</td>
                    <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>{customerLabel(booking.customer_id)}</td>
                    <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>{formatDateTime(booking.start_date, settings)}</td>
                    <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>{formatDateTime(booking.end_date, settings)}</td>
                    <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)" }}>
                      <span className="rounded-full px-3 py-1.5 text-sm font-medium" style={{ background: status.bg, color: status.color }}>
                        {status.label}
                      </span>
                      {status.sub && (
                        <div className="mt-1 text-sm" style={{ color: status.color }}>
                          {status.sub}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => onNavigate("bookings")}
          className="rounded-md px-4 py-2.5 text-base"
          style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
        >
          New rental
        </button>
        <button
          onClick={onWalkInCheckout}
          className="rounded-md px-4 py-2.5 text-base"
          style={{ border: "0.5px solid var(--border-strong)", color: "var(--text-primary)" }}
        >
          Walk-in check-out
        </button>
        <button
          disabled
          title="Coming soon"
          className="cursor-not-allowed rounded-md px-4 py-2.5 text-base"
          style={{ border: "0.5px solid var(--border)", color: "var(--text-muted)" }}
        >
          Start inspection
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <div className="flex-1 rounded-md px-4 py-3.5" style={{ background: "var(--surface-1)" }}>
      <div className="text-sm" style={{ color: "var(--text-secondary)" }}>{label}</div>
      <div className="text-3xl font-medium" style={{ color: "var(--text-primary)" }}>{loading ? "—" : value}</div>
    </div>
  );
}
