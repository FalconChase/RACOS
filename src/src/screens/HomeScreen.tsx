import { useEffect, useState } from "react";
import { AlertTriangleIcon, ArrowUpRightIcon, ArrowDownLeftIcon } from "../components/icons";
import { listVehicles } from "../lib/repo/vehicles";
import { listCustomers } from "../lib/repo/customers";
import { listBookings } from "../lib/repo/bookings";
import { useSettings } from "../lib/settingsContext";
import { formatTime } from "../lib/dateFormat";
import { formatHoursMinutes } from "../lib/duration";
import type { Booking, Customer, Vehicle } from "../lib/types";
import type { Tab } from "../App";

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

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

  const active = bookings.filter((b) => b.status !== "cancelled" && b.status !== "completed");

  // Overdue return: active, arrival unresolved, due-back already elapsed —
  // shown with a live "Xh Ym" counter, not a fixed timestamp, so it keeps
  // ticking until someone actually marks the vehicle back (Rentals > Mark
  // returned). Not restricted to "today" — a return can go overdue any day.
  const overdue = active
    .filter((b) => b.status === "active")
    .filter((b) => new Date(b.end_date) < now);

  // Departure due: still pending, scheduled ETD already elapsed and nobody's
  // confirmed it left yet (Rentals > Mark departed) — the mirror-image guard
  // of the above, also not restricted to "today".
  const departureDue = active
    .filter((b) => b.status === "pending")
    .filter((b) => new Date(b.start_date) <= now);

  // Plain upcoming reminders — only while they haven't tipped over into one of
  // the flagged states above yet.
  const departuresToday = active.filter(
    (b) => b.status === "pending" && isSameDay(new Date(b.start_date), now) && new Date(b.start_date) > now,
  );
  const returnsToday = active.filter(
    (b) => b.status === "active" && isSameDay(new Date(b.end_date), now) && new Date(b.end_date) > now,
  );

  function vehicleLabel(id: string) {
    return vehicles.find((v) => v.id === id)?.plate_number ?? "—";
  }
  function customerLabel(id: string) {
    return customers.find((c) => c.id === id)?.full_name ?? "—";
  }

  // Home-only cosmetic terminology (Settings > Dashboard) — display-only,
  // never touches underlying field names or stored data. Every other screen
  // always keeps saying Vehicle/Customer/Start/End.
  function unitText(id: string) {
    return `${settings.dashLabelUnit ? "Unit " : ""}${vehicleLabel(id)}`;
  }
  function lesseeText(id: string) {
    return `${settings.dashLabelLessee ? "Lessee " : ""}${customerLabel(id)}`;
  }

  const today = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const todayRows: { key: string; icon: React.ReactNode; text: string; meta: string; danger?: boolean; warning?: boolean }[] = [
    ...overdue.map((b) => ({
      key: b.id,
      icon: <AlertTriangleIcon size={20} />,
      text: `Overdue return — ${unitText(b.vehicle_id)} · ${lesseeText(b.customer_id)}`,
      meta: settings.dashLabelEta
        ? `${formatHoursMinutes(new Date(b.end_date), now)} past ETA`
        : `${formatHoursMinutes(new Date(b.end_date), now)} overdue`,
      danger: true,
    })),
    ...departureDue.map((b) => ({
      key: b.id,
      icon: <AlertTriangleIcon size={20} />,
      text: `Departure due — ${unitText(b.vehicle_id)} · ${lesseeText(b.customer_id)}`,
      meta: settings.dashLabelEtd
        ? `${formatHoursMinutes(new Date(b.start_date), now)} past ETD`
        : `${formatHoursMinutes(new Date(b.start_date), now)} since scheduled`,
      warning: true,
    })),
    ...departuresToday.map((b) => ({
      key: b.id,
      icon: <ArrowUpRightIcon size={20} />,
      text: `Departure — ${unitText(b.vehicle_id)} · ${lesseeText(b.customer_id)}`,
      meta: settings.dashLabelEtd ? `ETD ${formatTime(b.start_date, settings)}` : formatTime(b.start_date, settings),
    })),
    ...returnsToday.map((b) => ({
      key: b.id,
      icon: <ArrowDownLeftIcon size={20} />,
      text: `Return — ${unitText(b.vehicle_id)} · ${lesseeText(b.customer_id)}`,
      meta: settings.dashLabelEta ? `ETA ${formatTime(b.end_date, settings)}` : formatTime(b.end_date, settings),
    })),
  ];

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
        <div className="overflow-hidden rounded-md" style={{ border: "0.5px solid var(--border)" }}>
          {loading ? (
            <p className="p-4 text-base" style={{ color: "var(--text-muted)" }}>Loading…</p>
          ) : todayRows.length === 0 ? (
            <p className="p-4 text-base" style={{ color: "var(--text-muted)" }}>Nothing due today.</p>
          ) : (
            todayRows.map((row, i) => (
              <div
                key={row.key + row.text}
                className="flex items-center gap-3 px-4 py-3.5"
                style={{
                  borderBottom: i < todayRows.length - 1 ? "0.5px solid var(--border)" : undefined,
                  background: row.danger ? "var(--bg-danger)" : row.warning ? "var(--bg-warning)" : undefined,
                  color: row.danger ? "var(--text-danger)" : row.warning ? "var(--text-warning)" : "var(--text-secondary)",
                }}
              >
                {row.icon}
                <div
                  className="flex-1 text-base"
                  style={{
                    color: row.danger ? "var(--text-danger)" : row.warning ? "var(--text-warning)" : "var(--text-primary)",
                    fontWeight: row.danger || row.warning ? 500 : 400,
                  }}
                >
                  {row.text}
                </div>
                <div className="text-sm" style={{ color: row.danger ? "var(--text-danger)" : row.warning ? "var(--text-warning)" : "var(--text-muted)" }}>
                  {row.meta}
                </div>
              </div>
            ))
          )}
        </div>
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
