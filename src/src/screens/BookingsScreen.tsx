import { useEffect, useMemo, useState } from "react";
import { cancelBooking, createBooking, listBookings } from "../lib/repo/bookings";
import { listVehicles } from "../lib/repo/vehicles";
import { createCustomer, listCustomers } from "../lib/repo/customers";
import { getBusinessProfile, listMunicipalities, listProvinces } from "../lib/repo/locations";
import { listCustomRates, listRateMatrix, listSeatingBands } from "../lib/repo/rateMatrix";
import { bookingRef } from "../lib/bookingRef";
import { useSettings } from "../lib/settingsContext";
import { formatDateTime } from "../lib/dateFormat";
import { formatDuration, halfDaysBetween } from "../lib/duration";
import { computeTier, findSeatingBand, resolveRate } from "../lib/pricing";
import DatePicker from "../components/DatePicker";
import TimePicker from "../components/TimePicker";
import FormQuestion from "../components/FormQuestion";
import SearchableSelect from "../components/SearchableSelect";
import type {
  Booking,
  BookingStatus,
  BusinessProfile,
  Customer,
  CustomRate,
  Municipality,
  Province,
  RateMatrixRow,
  SeatingBand,
  Tier,
  Vehicle,
} from "../lib/types";

const NEW_CUSTOMER = "__new__";
const DEFAULT_PURPOSE = "Service";
const PURPOSE_OPTIONS = ["Service", "Events", "Vacation", "Personal Visit", "Other"];

type Subtab = "ongoing" | "history";
const ONGOING_STATUSES: BookingStatus[] = ["pending", "confirmed", "active"];
const HISTORY_STATUSES: BookingStatus[] = ["completed", "cancelled"];

const STATUS_STYLES: Record<BookingStatus, React.CSSProperties> = {
  pending: { background: "var(--bg-warning)", color: "var(--text-warning)" },
  confirmed: { background: "var(--bg-accent)", color: "var(--text-accent)" },
  active: { background: "var(--bg-success)", color: "var(--text-success)" },
  completed: { background: "var(--surface-1)", color: "var(--text-muted)" },
  cancelled: { background: "var(--bg-danger)", color: "var(--text-danger)" },
};

const inputStyle: React.CSSProperties = {
  border: "0.5px solid var(--border-strong)",
  background: "var(--surface-2)",
  color: "var(--text-primary)",
};

const labelStyle: React.CSSProperties = { color: "var(--text-secondary)" };

interface BookingsScreenProps {
  onCheckout: (bookingId: string) => void;
}

function combineDateTime(date: string, time: string): Date | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function BookingsScreen({ onCheckout }: BookingsScreenProps) {
  const { settings } = useSettings();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [seatingBands, setSeatingBands] = useState<SeatingBand[]>([]);
  const [rateMatrix, setRateMatrix] = useState<RateMatrixRow[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [customRates, setCustomRates] = useState<CustomRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  // Finished/cancelled rentals file themselves into History automatically —
  // staff land there by default since that's usually what they're checking
  // when they open Rentals; ongoing work-in-progress bookings get their own
  // subtab, and the Home dashboard only ever shows the ongoing set.
  const [subtab, setSubtab] = useState<Subtab>("history");
  const [confirmingCancelId, setConfirmingCancelId] = useState<string | null>(null);

  const [vehicleId, setVehicleId] = useState("");
  const [destinationProvinceId, setDestinationProvinceId] = useState("");
  const [destinationCityId, setDestinationCityId] = useState("");
  const [purpose, setPurpose] = useState(DEFAULT_PURPOSE);
  const [customerId, setCustomerId] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");

  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  // Manual field — staff fills in what was actually collected. No auto-fill:
  // the system's own estimate is computed separately (expectedPayment below)
  // and stays hidden unless Settings > Rental reveals it.
  const [paymentAmount, setPaymentAmount] = useState("");

  async function refresh() {
    setLoading(true);
    const [b, v, c, p, profile, bands, matrix, munis, customRts] = await Promise.all([
      listBookings(),
      listVehicles(),
      listCustomers(),
      listProvinces(),
      getBusinessProfile(),
      listSeatingBands(),
      listRateMatrix(),
      listMunicipalities(),
      listCustomRates(),
    ]);
    setBookings(b);
    setVehicles(v);
    setCustomers(c);
    setProvinces(p);
    setBusinessProfile(profile);
    setSeatingBands(bands);
    setRateMatrix(matrix);
    setMunicipalities(munis);
    setCustomRates(customRts);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  function vehicleLabel(id: string) {
    const v = vehicles.find((x) => x.id === id);
    return v ? `${v.plate_number}${v.make ? ` (${v.make} ${v.model ?? ""})`.trimEnd() : ""}` : "—";
  }

  function customerLabel(id: string) {
    return customers.find((x) => x.id === id)?.full_name ?? "—";
  }

  const isNewCustomer = customerId === NEW_CUSTOMER;
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const startDT = useMemo(() => combineDateTime(startDate, startTime), [startDate, startTime]);
  const endDT = useMemo(() => combineDateTime(endDate, endTime), [endDate, endTime]);
  const dateOrderInvalid = Boolean(startDT && endDT && endDT.getTime() <= startDT.getTime());
  const durationText = useMemo(() => {
    if (!startDT || !endDT || dateOrderInvalid) return null;
    return formatDuration(startDT, endDT, settings.durationDisplay);
  }, [startDT, endDT, dateOrderInvalid, settings.durationDisplay]);

  // Destination search is province-first: pick a province (required), then
  // optionally narrow down to a specific city/municipality within it. Every
  // municipality is selectable — no admin pre-registration or toggle needed.
  const provinceOptions = useMemo(
    () => provinces.map((p) => ({ value: p.id, label: p.name, sublabel: p.region_name })),
    [provinces],
  );

  const destinationMunicipalityOptions = useMemo(
    () =>
      municipalities
        .filter((m) => m.province_id === destinationProvinceId)
        .map((m) => ({ value: m.id, label: m.name })),
    [municipalities, destinationProvinceId],
  );

  function handleDestinationProvinceChange(provinceId: string) {
    setDestinationProvinceId(provinceId);
    setDestinationCityId("");
  }

  // Computed silently in the background — half-days x half the resolved rate
  // (custom city rate first, then Rate Matrix, then vehicle's own daily
  // rate). Never written into the visible Payment field.
  const resolvedRate = useMemo(() => {
    if (!selectedVehicle) return null;
    return resolveRate({
      vehicle: selectedVehicle,
      destinationProvinceId: destinationProvinceId || null,
      destinationCityId: destinationCityId || null,
      hqProvinceId: businessProfile?.hq_province_id ?? null,
      provinces,
      seatingBands,
      rateMatrix,
      customRates,
    });
  }, [selectedVehicle, destinationProvinceId, destinationCityId, businessProfile, provinces, seatingBands, rateMatrix, customRates]);

  const expectedPayment = useMemo(() => {
    if (!startDT || !endDT || dateOrderInvalid || !resolvedRate) return null;
    const rate = Number(resolvedRate.rate);
    if (!Number.isFinite(rate)) return null;
    // Billed per half-day, at half the resolved (daily) rate — matches the
    // half-day granularity already shown in the Rental period hint, instead
    // of rounding up to a full extra night.
    const halfDays = halfDaysBetween(startDT, endDT);
    return (rate / 2) * halfDays;
  }, [startDT, endDT, dateOrderInvalid, resolvedRate]);

  // Reference-only rate card for whatever seating band the selected vehicle
  // falls into — shown next to the Payment field so staff can see all three
  // destination tiers at a glance, with the tier matching the current
  // destination highlighted. Independent of resolvedRate/expectedPayment,
  // which only surface the single resolved cell (or a custom/vehicle fallback).
  const selectedBand = useMemo(
    () => (selectedVehicle?.seats != null ? findSeatingBand(selectedVehicle.seats, seatingBands) : null),
    [selectedVehicle, seatingBands],
  );
  const matrixRow = useMemo(
    () => (selectedBand ? rateMatrix.find((r) => r.seating_band_id === selectedBand.id) ?? null : null),
    [selectedBand, rateMatrix],
  );
  const activeTier = useMemo(
    () =>
      destinationProvinceId && businessProfile?.hq_province_id
        ? computeTier(destinationProvinceId, businessProfile.hq_province_id, provinces)
        : null,
    [destinationProvinceId, businessProfile, provinces],
  );

  function resetForm() {
    setVehicleId("");
    setDestinationProvinceId("");
    setDestinationCityId("");
    setPurpose(DEFAULT_PURPOSE);
    setCustomerId("");
    setNewCustomerName("");
    setNewCustomerPhone("");
    setStartDate("");
    setStartTime("");
    setEndDate("");
    setEndTime("");
    setPaymentAmount("");
    setShowForm(false);
  }

  const canSubmit =
    Boolean(vehicleId) &&
    Boolean(destinationProvinceId) &&
    Boolean(startDT) &&
    Boolean(endDT) &&
    !dateOrderInvalid &&
    (isNewCustomer ? newCustomerName.trim().length > 0 : Boolean(customerId));

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !startDT || !endDT) return;

    let finalCustomerId = customerId;
    if (isNewCustomer) {
      // Walk-in renter, not registered yet — create the customer record inline
      // instead of forcing the staff to leave this screen first.
      const created = await createCustomer({
        full_name: newCustomerName.trim(),
        phone: newCustomerPhone.trim() || undefined,
      });
      finalCustomerId = created.id;
    }

    await createBooking({
      vehicle_id: vehicleId,
      customer_id: finalCustomerId,
      destination_province_id: destinationProvinceId || undefined,
      destination_city_id: destinationCityId || undefined,
      start_date: startDT.toISOString(),
      end_date: endDT.toISOString(),
      payment_amount: paymentAmount.trim() || undefined,
      expected_payment: expectedPayment !== null ? String(expectedPayment) : undefined,
      purpose: purpose.trim() || undefined,
    });
    resetForm();
    await refresh();
  }

  async function handleCancel(id: string) {
    await cancelBooking(id);
    setConfirmingCancelId(null);
    await refresh();
  }

  const canShowForm = vehicles.length > 0;
  const visibleStatuses = subtab === "ongoing" ? ONGOING_STATUSES : HISTORY_STATUSES;
  const visibleBookings = bookings.filter((b) => visibleStatuses.includes(b.status));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2 rounded-md p-1" style={{ background: "var(--surface-1)" }}>
          {(["ongoing", "history"] as Subtab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setSubtab(tab);
                setConfirmingCancelId(null);
              }}
              className="rounded px-4 py-1.5 text-sm font-medium capitalize"
              style={
                subtab === tab
                  ? { background: "var(--fill-primary)", color: "var(--on-primary)" }
                  : { color: "var(--text-secondary)" }
              }
            >
              {tab}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowForm((s) => !s)}
          disabled={!canShowForm}
          className="rounded px-5 py-2 text-base font-bold uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
        >
          {showForm ? "Cancel" : "Record booking"}
        </button>
      </div>

      {!canShowForm && (
        <p className="text-base" style={{ color: "var(--text-muted)" }}>
          Add at least one vehicle in Fleet before creating a booking.
        </p>
      )}

      {showForm && (
        <form onSubmit={handleAdd} className="mx-auto max-w-2xl space-y-4">
          {/* Form header — Google Forms style colored accent bar + title card */}
          <div className="overflow-hidden rounded-lg" style={{ border: "0.5px solid var(--border)" }}>
            <div className="h-2" style={{ background: "var(--fill-primary)" }} />
            <div className="p-5" style={{ background: "var(--surface-1)" }}>
              <h3 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
                New rental
              </h3>
              <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                Record a walk-in or scheduled rental.
              </p>
            </div>
          </div>

          <FormQuestion label="Vehicle *">
            <select
              className="w-full rounded-md px-3 py-2.5 text-base"
              style={inputStyle}
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              required
            >
              <option value="">Select a vehicle…</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate_number}
                  {v.make ? ` — ${v.make} ${v.model ?? ""}`.trimEnd() : ""}
                  {v.status !== "available" ? ` (currently ${v.status})` : ""}
                </option>
              ))}
            </select>
          </FormQuestion>

          <FormQuestion label="Destination *">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex-1">
                <SearchableSelect
                  value={destinationProvinceId}
                  onChange={handleDestinationProvinceChange}
                  options={provinceOptions}
                  placeholder="Search for a province…"
                />
              </div>
              <div className="flex-1">
                <SearchableSelect
                  value={destinationCityId}
                  onChange={setDestinationCityId}
                  options={destinationMunicipalityOptions}
                  placeholder={destinationProvinceId ? "City/municipality (optional)" : "Pick a province first"}
                />
              </div>
            </div>
          </FormQuestion>

          <FormQuestion label="Customer *">
            {!isNewCustomer ? (
              <select
                className="w-full rounded-md px-3 py-2.5 text-base"
                style={inputStyle}
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">Select a customer…</option>
                <option value={NEW_CUSTOMER}>+ Add new customer (walk-in)</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
            ) : (
              <div className="space-y-2 rounded-md p-3" style={{ background: "var(--surface-2)" }}>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    className="flex-1 rounded-md px-3 py-2.5 text-base"
                    style={inputStyle}
                    placeholder="Full name *"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                  />
                  <input
                    className="flex-1 rounded-md px-3 py-2.5 text-base"
                    style={inputStyle}
                    placeholder="Phone (optional)"
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCustomerId("");
                    setNewCustomerName("");
                    setNewCustomerPhone("");
                  }}
                  className="text-sm"
                  style={{ color: "var(--text-accent)" }}
                >
                  Use an existing customer instead
                </button>
              </div>
            )}
          </FormQuestion>

          <FormQuestion
            label="Rental period *"
            hint={
              dateOrderInvalid ? (
                <span style={{ color: "var(--text-danger)" }}>Due back must be after the out date/time.</span>
              ) : durationText ? (
                <span>{durationText}</span>
              ) : null
            }
          >
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm" style={labelStyle}>Out</label>
                <div className="flex gap-2">
                  <div className="w-1/2">
                    <DatePicker value={startDate} onChange={setStartDate} settings={settings} />
                  </div>
                  <div className="w-1/2">
                    <TimePicker value={startTime} onChange={setStartTime} settings={settings} />
                  </div>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm" style={labelStyle}>Due back</label>
                <div className="flex gap-2">
                  <div className="w-1/2">
                    <DatePicker value={endDate} onChange={setEndDate} settings={settings} />
                  </div>
                  <div className="w-1/2">
                    <TimePicker value={endTime} onChange={setEndTime} settings={settings} />
                  </div>
                </div>
              </div>
            </div>
          </FormQuestion>

          <FormQuestion label="Payment">
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="sm:w-1/2">
                <input
                  className="w-full rounded-md px-3 py-2.5 text-base"
                  style={inputStyle}
                  placeholder="Amount collected"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                />
                {resolvedRate?.basis === "custom" && (
                  <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
                    Custom rate applies for this city ({resolvedRate.band?.label}): {resolvedRate.rate}
                  </p>
                )}
                {resolvedRate?.basis === "vehicle" && (
                  <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
                    No Rate Matrix match — using this vehicle's own rate: {resolvedRate.rate}
                  </p>
                )}
              </div>
              <div className="sm:w-1/2">
                <RateMatrixPanel band={selectedBand} row={matrixRow} activeTier={activeTier} />
              </div>
            </div>
          </FormQuestion>

          <FormQuestion label="Purpose (optional)">
            <select
              className="w-full rounded-md px-3 py-2.5 text-base sm:w-1/2"
              style={inputStyle}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            >
              {PURPOSE_OPTIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </FormQuestion>

          <div className="flex justify-start">
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-md px-6 py-2.5 text-base font-medium disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
            >
              Save booking
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-base" style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : visibleBookings.length === 0 ? (
        <p className="text-base" style={{ color: "var(--text-muted)" }}>
          {subtab === "ongoing" ? "No ongoing rentals." : "No history yet."}
        </p>
      ) : (
        <table className="w-full border-collapse text-left text-base">
          <thead>
            <tr style={{ background: "var(--surface-1)" }}>
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Ref</th>
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Vehicle</th>
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Customer</th>
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Start</th>
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>End</th>
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Status</th>
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)" }}></th>
            </tr>
          </thead>
          <tbody>
            {visibleBookings.map((b) => (
              <tr key={b.id}>
                <td className="px-3 py-2.5 font-mono text-sm" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>{bookingRef(b.id)}</td>
                <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>{vehicleLabel(b.vehicle_id)}</td>
                <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>{customerLabel(b.customer_id)}</td>
                <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>{formatDateTime(b.start_date, settings)}</td>
                <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>{formatDateTime(b.end_date, settings)}</td>
                <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)" }}>
                  <span className="rounded-full px-3 py-1.5 text-sm font-medium" style={STATUS_STYLES[b.status]}>
                    {b.status}
                  </span>
                  {b.pending_availability_check === 1 && (
                    <span className="ml-1 rounded-full px-3 py-1.5 text-sm font-medium" style={{ background: "var(--bg-warning)", color: "var(--text-warning)" }}>
                      awaiting availability check
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right" style={{ border: "0.5px solid var(--border)" }}>
                  <div className="flex justify-end gap-3">
                    {confirmingCancelId === b.id ? (
                      <>
                        <span className="text-sm" style={{ color: "var(--text-danger)" }}>Cancel this booking?</span>
                        <button
                          onClick={() => handleCancel(b.id)}
                          className="text-sm font-medium"
                          style={{ color: "var(--text-danger)" }}
                        >
                          Yes, cancel
                        </button>
                        <button
                          onClick={() => setConfirmingCancelId(null)}
                          className="text-sm font-medium"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          No
                        </button>
                      </>
                    ) : (
                      <>
                        {(b.status === "pending" || b.status === "confirmed") && (
                          <button
                            onClick={() => onCheckout(b.id)}
                            className="text-sm font-medium"
                            style={{ color: "var(--text-accent)" }}
                          >
                            Check-out
                          </button>
                        )}
                        {b.status !== "cancelled" && b.status !== "completed" && (
                          <button
                            onClick={() => setConfirmingCancelId(b.id)}
                            className="text-sm font-medium"
                            style={{ color: "var(--text-danger)" }}
                          >
                            Cancel
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Reference rate card for the selected vehicle's seating band — all three
// destination tiers at once, with whichever tier matches the currently
// selected destination highlighted. Purely informational: it never drives
// paymentAmount, and staff still type the actual collected amount by hand.
function RateMatrixPanel({
  band,
  row,
  activeTier,
}: {
  band: SeatingBand | null;
  row: RateMatrixRow | null;
  activeTier: Tier | null;
}) {
  if (!band) {
    return (
      <div
        className="flex h-full min-h-[7.5rem] items-center rounded-md p-3 text-sm"
        style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
      >
        Select a vehicle to see its rate matrix.
      </div>
    );
  }

  const tiers: { tier: Tier; label: string; rate: string | null }[] = [
    { tier: 1, label: "Tier 1 · HQ province", rate: row?.rate_tier1 ?? null },
    { tier: 2, label: "Tier 2 · same region", rate: row?.rate_tier2 ?? null },
    { tier: 3, label: "Tier 3 · other", rate: row?.rate_tier3 ?? null },
  ];

  return (
    <div className="overflow-hidden rounded-md text-sm" style={{ border: "0.5px solid var(--border)" }}>
      <div
        className="px-3 py-2 font-medium"
        style={{ background: "var(--surface-2)", color: "var(--text-primary)" }}
      >
        Rate matrix · {band.label}
      </div>
      {tiers.map(({ tier, label, rate }) => {
        const active = tier === activeTier;
        return (
          <div
            key={tier}
            className="flex justify-between px-3 py-2"
            style={{
              borderTop: "0.5px solid var(--border)",
              background: active ? "var(--bg-accent)" : undefined,
              color: active ? "var(--text-accent)" : "var(--text-secondary)",
              fontWeight: active ? 600 : 400,
            }}
          >
            <span>{label}</span>
            <span>{rate ?? "—"}</span>
          </div>
        );
      })}
    </div>
  );
}
