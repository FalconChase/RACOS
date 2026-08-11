import { useEffect, useMemo, useState } from "react";
import { listBookings, markBookingPaid } from "../lib/repo/bookings";
import { listVehicles } from "../lib/repo/vehicles";
import { listCustomers } from "../lib/repo/customers";
import { getBusinessProfile, listMunicipalities, listProvinces } from "../lib/repo/locations";
import { listCustomRates, listRateMatrix, listSeatingBands } from "../lib/repo/rateMatrix";
import { useSettings } from "../lib/settingsContext";
import { formatDateTime } from "../lib/dateFormat";
import { formatHoursAsHHMM } from "../lib/duration";
import { computeOvertimeSettlement, isOvertimeUnsettled } from "../lib/overtimeSettlement";
import { bookingRef } from "../lib/bookingRef";
import OvertimeSettleForm from "../components/OvertimeSettleForm";
import ConfirmDialog from "../components/ConfirmDialog";
import type { Booking, BusinessProfile, CustomRate, Customer, Province, RateMatrixRow, SeatingBand, Vehicle } from "../lib/types";

function formatMoney(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

// One row per open item, not per booking — a booking with both unsettled
// overtime and a receivable base payment (rare, but possible) shows up
// twice, same spirit as Settlements > Records keeping the two figures
// visually distinct rather than merging them.
type OutstandingRow = {
  key: string;
  booking: Booking;
  kind: "overtime" | "receivable";
  since: string;
  amountOwed: number | null;
  overtimeExpected: number | null;
  overtimeHours: number;
};

export default function CustomerOutstandingTab() {
  const { settings } = useSettings();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [seatingBands, setSeatingBands] = useState<SeatingBand[]>([]);
  const [rateMatrix, setRateMatrix] = useState<RateMatrixRow[]>([]);
  const [customRates, setCustomRates] = useState<CustomRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [markPaidBusy, setMarkPaidBusy] = useState(false);

  async function refresh() {
    const [b, v, c, p, profile, bands, matrix, customRts] = await Promise.all([
      listBookings(),
      listVehicles(),
      listCustomers(),
      listProvinces(),
      getBusinessProfile(),
      listSeatingBands(),
      listRateMatrix(),
      listCustomRates(),
      listMunicipalities(),
    ]);
    setBookings(b);
    setVehicles(v);
    setCustomers(c);
    setProvinces(p);
    setBusinessProfile(profile);
    setSeatingBands(bands);
    setRateMatrix(matrix);
    setCustomRates(customRts);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  function vehicleLabel(id: string) {
    return vehicles.find((v) => v.id === id)?.plate_number ?? "—";
  }
  function customerLabel(id: string) {
    return customers.find((c) => c.id === id)?.full_name ?? "—";
  }

  const rows = useMemo<OutstandingRow[]>(() => {
    const out: OutstandingRow[] = [];

    for (const b of bookings) {
      // Unsettled overtime — same computeOvertimeSettlement Settlements >
      // Records uses for its Overtime column and payment caps, so the two
      // screens never disagree on a booking's numbers.
      const settlement = computeOvertimeSettlement(b, vehicles, businessProfile, provinces, seatingBands, rateMatrix, customRates);
      if (isOvertimeUnsettled(settlement)) {
        out.push({
          key: `${b.id}-overtime`,
          booking: b,
          kind: "overtime",
          since: b.actual_return_at as string,
          amountOwed: settlement.amountOwed,
          overtimeExpected: settlement.overtimeExpected,
          overtimeHours: settlement.overtimeHours,
        });
      }

      // Receivable: staff recorded the booking's base payment as "agreed,
      // not yet collected" — cleared once markBookingPaid runs (the same
      // function Settlements > Records' "Mark as paid" calls).
      if (b.payment_status === "receivable") {
        const amountOwed = b.payment_amount ? Number(b.payment_amount) : null;
        out.push({
          key: `${b.id}-receivable`,
          booking: b,
          kind: "receivable",
          since: b.created_at,
          amountOwed,
          overtimeExpected: null,
          overtimeHours: 0,
        });
      }
    }

    // Oldest open item first — the ones that have been sitting longest are
    // the ones most worth chasing.
    return out.sort((a, b) => new Date(a.since).getTime() - new Date(b.since).getTime());
  }, [bookings, vehicles, businessProfile, provinces, seatingBands, rateMatrix, customRates]);

  async function handleMarkPaid(id: string) {
    setMarkPaidBusy(true);
    try {
      await markBookingPaid(id);
      setMarkingPaidId(null);
      await refresh();
    } finally {
      setMarkPaidBusy(false);
    }
  }

  const markingPaidRow = rows.find((r) => r.booking.id === markingPaidId);

  return (
    <div className="space-y-4">
      {loading ? (
        <p className="text-base" style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-base" style={{ color: "var(--text-muted)" }}>Nothing outstanding — all overtime and receivables are settled.</p>
      ) : (
        <table className="w-full border-collapse text-left text-base">
          <thead>
            <tr style={{ background: "var(--surface-1)" }}>
              {["Customer", "Vehicle", "Type", "Since", "Amount owed", ""].map((h) => (
                <th key={h} className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) =>
              settlingId === row.key ? (
                <tr key={row.key}>
                  <td colSpan={6} className="p-0" style={{ border: "0.5px solid var(--border)" }}>
                    <OvertimeSettleForm
                      booking={row.booking}
                      overtimeExpected={row.overtimeExpected}
                      overtimeHours={row.overtimeHours}
                      onCancel={() => setSettlingId(null)}
                      onSaved={async () => {
                        setSettlingId(null);
                        await refresh();
                      }}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={row.key}>
                  <td className="px-3 py-2.5 font-medium" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>
                    {customerLabel(row.booking.customer_id)}
                  </td>
                  <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>
                    {vehicleLabel(row.booking.vehicle_id)}
                    <div className="mt-0.5 text-sm font-mono" style={{ color: "var(--text-muted)" }}>{bookingRef(row.booking.id)}</div>
                  </td>
                  <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)" }}>
                    <span
                      className="rounded-full px-3 py-1.5 text-sm font-medium"
                      style={
                        row.kind === "overtime"
                          ? { background: "var(--bg-danger)", color: "var(--text-danger)" }
                          : { background: "var(--bg-warning)", color: "var(--text-warning)" }
                      }
                    >
                      {row.kind === "overtime" ? `Overtime (${formatHoursAsHHMM(row.overtimeHours)})` : "Receivable"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>
                    {formatDateTime(row.since, settings)}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-sm" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>
                    {row.amountOwed != null ? formatMoney(row.amountOwed) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right" style={{ border: "0.5px solid var(--border)" }}>
                    {row.kind === "overtime" ? (
                      <button
                        onClick={() => setSettlingId(row.key)}
                        className="text-sm font-medium"
                        style={{ color: "var(--text-accent)" }}
                      >
                        Settle overtime
                      </button>
                    ) : (
                      <button
                        onClick={() => setMarkingPaidId(row.booking.id)}
                        className="text-sm font-medium"
                        style={{ color: "var(--text-success)" }}
                      >
                        Mark as paid
                      </button>
                    )}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}

      {markingPaidRow && (
        <ConfirmDialog
          title="Mark as paid?"
          description={
            <>
              Mark <strong>{bookingRef(markingPaidRow.booking.id)}</strong> for{" "}
              <strong>{customerLabel(markingPaidRow.booking.customer_id)}</strong> as paid
              {markingPaidRow.amountOwed != null ? <> ({formatMoney(markingPaidRow.amountOwed)})</> : null}. This clears its receivable
              status — undo it manually if this was a mistake.
            </>
          }
          confirmLabel="Mark as paid"
          onConfirm={() => handleMarkPaid(markingPaidRow.booking.id)}
          onCancel={() => setMarkingPaidId(null)}
          busy={markPaidBusy}
        />
      )}
    </div>
  );
}
