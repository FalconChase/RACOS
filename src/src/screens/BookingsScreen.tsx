import { useEffect, useMemo, useRef, useState } from "react";
import { cancelBooking, createBooking, getTopDestinations, listBookings, markBookingDeparted, markBookingReturned, updateAgreementExecutedAt, updateBookingTimes } from "../lib/repo/bookings";
import type { BookingTimeUpdate, CancellationReason, TopDestination } from "../lib/repo/bookings";
import { createFuelLevelEntry } from "../lib/repo/fuelLevelEntries";
import { createOdometerReading } from "../lib/repo/odometerReadings";
import { listVehicles } from "../lib/repo/vehicles";
import { createCustomer, listCustomers, updateCustomerAddress, updateCustomerPhone } from "../lib/repo/customers";
import { getBusinessProfile, listMunicipalities, listProvinces } from "../lib/repo/locations";
import { listCustomRates, listRateMatrix, listSeatingBands } from "../lib/repo/rateMatrix";
import { listActionLogsByType } from "../lib/repo/actionLog";
import { bookingRef } from "../lib/bookingRef";
import { useSettings } from "../lib/settingsContext";
import { formatDate, formatDateTime } from "../lib/dateFormat";
import { exactHoursBetween, formatDuration, formatHoursMinutes } from "../lib/duration";
import { computeTier, findSeatingBand, resolveBookingRate, resolveRate } from "../lib/pricing";
import { isProvinceVisible } from "../lib/islandGroups";
import DateTimePicker from "../components/DateTimePicker";
import SearchableSelect from "../components/SearchableSelect";
import ArrivalDialog from "../components/ArrivalDialog";
import EditBookingTimesDialog from "../components/EditBookingTimesDialog";
import EditAgreementDateDialog from "../components/EditAgreementDateDialog";
import CustomerContactsPanel from "../components/CustomerContactsPanel";
import DraftContactsEditor, { type DraftContact } from "../components/DraftContactsEditor";
import HybridLocationSearch from "../components/HybridLocationSearch";
import { createCustomerContact } from "../lib/repo/customerContacts";
import BookingPaymentEntriesDialog from "../components/BookingPaymentEntriesDialog";
import PaymentBreakdownGrid, { type ExtraPaymentRow } from "../components/PaymentBreakdownGrid";
import { createBookingPaymentEntry } from "../lib/repo/bookingPaymentEntries";
import CancelBookingDialog from "../components/CancelBookingDialog";
import ConfirmDialog from "../components/ConfirmDialog";
import type {
  ActionLogEntry,
  AppSettings,
  Booking,
  BookingPaymentEntryType,
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

// New rental's step wizard order — see the `step` state on BookingsScreen.
const STEPS = ["Profile", "Vehicle", "Destination", "Payment", "Summary"] as const;

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
  // Set when Home's "Record booking" shortcut sent us here specifically to
  // open the wizard, rather than just landing on the Rentals tab — skips
  // the extra click. Consumed once vehicles have loaded (so the disabled/
  // no-vehicles guard still applies) and cleared via onAutoOpenConsumed so
  // it doesn't re-fire on every re-render or a later visit to this tab.
  autoOpenForm?: boolean;
  onAutoOpenConsumed?: () => void;
}

// Trims float noise from hourly-rate math (e.g. 81.5h x rate/24) without
// forcing pesos-only display — keeps up to 2 decimals, drops them if unused.
function formatMoney(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function combineDateTime(date: string, time: string): Date | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// One extra destination leg being built on the form — mirrors what
// createBooking's `legs` input needs, minus the chained start (derived, see
// legDateTimes) and resolved_rate (derived, see legRates). Continuous by
// construction: a leg has no start picker of its own at all, only an end.
interface DraftLeg {
  destinationProvinceId: string;
  destinationCityId: string;
  note: string;
  endDate: string;
  endTime: string;
}

export default function BookingsScreen({ onCheckout, autoOpenForm, onAutoOpenConsumed }: BookingsScreenProps) {
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
  const [topDestinations, setTopDestinations] = useState<TopDestination[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  // New rental is a popup now — only the in-popup Cancel button (or a
  // successful save) closes it, never a backdrop click or Escape. If
  // anything's actually been entered, Cancel asks first instead of silently
  // wiping a half-filled booking.
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  // Ongoing (pending/confirmed/active) rentals is what staff almost always
  // want to see first when opening Rentals — completed/cancelled bookings
  // file into their own History subtab instead.
  const [subtab, setSubtab] = useState<Subtab>("ongoing");
  const [cancellingFor, setCancellingFor] = useState<Booking | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  // Shown at Save time when the entered due-back is already in the past — lets
  // staff resolve whether the vehicle already came back before the booking is
  // written at all. eta is the due-back ISO the dialog displays/offers as
  // "same as due-back".
  const [arrivalDialogEta, setArrivalDialogEta] = useState<string | null>(null);
  // The general "Mark returned" / "Mark departed" actions on an already-recorded
  // booking — same dialog component (different kind), reusing the same
  // underlying mechanism as the Save-time confirmation above.
  const [markReturnedFor, setMarkReturnedFor] = useState<Booking | null>(null);
  const [markDepartedFor, setMarkDepartedFor] = useState<Booking | null>(null);
  // Fixes a mistaken date/time already saved on a booking (Ongoing or
  // History) — separate from the Mark departed/returned actions above, which
  // only ever resolve a still-unset timestamp for the first time.
  const [editTimesFor, setEditTimesFor] = useState<Booking | null>(null);
  // Same idea, for a booking's agreement_executed_at (see
  // updateAgreementExecutedAt) — independent of Edit times, and available
  // on any booking rather than gated on actual_return_at being set.
  const [editAgreementFor, setEditAgreementFor] = useState<Booking | null>(null);
  // Feature 5 (ROT051) — row action opening BookingPaymentEntriesDialog for
  // an already-saved booking's fee/advance-payment/note breakdown.
  const [editPaymentEntriesFor, setEditPaymentEntriesFor] = useState<Booking | null>(null);
  const [bookingLogs, setBookingLogs] = useState<ActionLogEntry[]>([]);

  // Live clock driving the overdue-return / departure-due badges below —
  // ticks every second so their duration readouts stay current without a
  // manual refresh.
  const [nowTick, setNowTick] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNowTick(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const [vehicleId, setVehicleId] = useState("");
  // Optional — logs a fuel_level_entries row (same ROP011 append-only log
  // Entries > Fuel writes to) alongside the booking, so staff can note the
  // vehicle's fuel level right where they're already picking it rather than
  // switching screens. reading_at is always "now" (this form's save time),
  // never the (possibly future/backdated) rental start — same reasoning
  // FuelLevelTab's own picker guards against a future reading.
  const [fuelLevel, setFuelLevel] = useState("");
  // Same idea, logging to odometer_readings (Entries > Odometer) instead —
  // both stay optional (a booking can always be recorded with neither), but
  // having them on hand at pickup is the practical norm.
  const [odometerKm, setOdometerKm] = useState("");
  // New rental is a step wizard — Profile, Vehicle, Destination, Payment,
  // then a read-only Summary that actually submits. Strictly Next/Back, no
  // jumping ahead of an invalid step while filling it out for the first
  // time. Once a step has been reached, though, its tab becomes a shortcut
  // back to it for review — maxStepReached tracks the furthest point so far
  // (only ever grows within one form session) and gates which tabs the step
  // tracker will let you click directly.
  const [step, setStep] = useState(0);
  const [maxStepReached, setMaxStepReached] = useState(0);
  useEffect(() => {
    setMaxStepReached((m) => Math.max(m, step));
  }, [step]);
  // The Next button (Payment → Summary) and the Save booking button occupy
  // the same bottom-right spot, one swapped in for the other the instant
  // step changes. A fast double-click/tap on Next can land its second click
  // on Save the moment it appears there, submitting before the Summary is
  // even seen. Track when we entered a step and ignore a submit that lands
  // within a beat of that — long enough to eat a ghost click, short enough
  // that no deliberate click is ever held up.
  const stepEnteredAtRef = useRef(Date.now());
  useEffect(() => {
    stepEnteredAtRef.current = Date.now();
  }, [step]);
  const [destinationProvinceId, setDestinationProvinceId] = useState("");
  const [destinationCityId, setDestinationCityId] = useState("");
  // Optional free-text note on the primary destination — see
  // Booking.destination_note.
  const [destinationNote, setDestinationNote] = useState("");
  const [purpose, setPurpose] = useState(DEFAULT_PURPOSE);
  const [customerId, setCustomerId] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  // Phone doubles as "the customer's current phone as edited in this form" —
  // pre-filled from an existing customer's record when one is picked (see
  // the sync effect below), or typed fresh for a walk-in. Either way it's
  // editable, and on save it's written back to the actual Customer record if
  // it changed (see saveBooking) — bidirectional, not just used for this one
  // booking.
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  // Same bidirectional idea for address — structured the same way Customer's
  // own record is (province + municipality + free-text line).
  const [profileAddressProvinceId, setProfileAddressProvinceId] = useState("");
  const [profileAddressMunicipalityId, setProfileAddressMunicipalityId] = useState("");
  const [profileAddressLine, setProfileAddressLine] = useState("");

  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  // Manual field — staff fills in what was actually collected (or, when
  // notYetPaid is checked, what was agreed) . No auto-fill: the system's own
  // estimate is computed separately (expectedPayment below) and stays hidden
  // unless Settings > Rental reveals it.
  const [paymentAmount, setPaymentAmount] = useState("");
  // Rare — a known/trusted customer the booking is recorded for before
  // payment is actually in hand. Unchecked (the default) keeps today's
  // behavior: payment_status 'paid', same as every booking before this
  // existed.
  const [notYetPaid, setNotYetPaid] = useState(false);
  // Optional extra stops beyond the primary destination above — empty for
  // the overwhelmingly common single-destination case. See BookingLeg.
  const [legs, setLegs] = useState<DraftLeg[]>([]);
  // When the rental agreement is actually being executed/signed — left
  // blank ("no input"), defaults to the same date+time as Out (createBooking's
  // own fallback), never to today's real-world date, since that would make a
  // booking recorded well ahead of a future Out date look like an advance
  // agreement by default when nothing about it actually was. Editable on
  // the Summary step (DateTimePicker — date, then time) for a booking
  // genuinely signed early/late; guarded to never be after Out's *date*
  // (time-of-day doesn't factor into the guard). See Booking.agreement_executed_at.
  const [agreementExecutedDate, setAgreementExecutedDate] = useState("");
  const [agreementExecutedTime, setAgreementExecutedTime] = useState("");
  // Collapsed by default — keeps the Contact no. box's usual footprint on
  // Profile intact until staff actually wants to add more than the one
  // phone number. An existing customer's extra contacts are managed live
  // (CustomerContactsPanel, same as Customers' own Edit info); a new
  // walk-in customer doesn't have a customer_id yet, so its entries are
  // staged here and only created once saveBooking() has a real id (see
  // draftContacts below).
  const [showMoreContacts, setShowMoreContacts] = useState(false);
  const [draftContacts, setDraftContacts] = useState<DraftContact[]>([]);
  // Feature 5 (ROT051) — supplementary fee/advance-payment/note breakdown
  // for this booking, wholly separate from Payment amount/Expected/
  // Settlements (see PaymentBreakdownGrid). The booking doesn't exist yet
  // during this wizard, so these are staged and only created
  // (createBookingPaymentEntry) once saveBooking() has a real booking id.
  // Fee/Others are the grid's two always-shown fixed rows; extraPaymentRows
  // are additional rows added via "+" (each with its own type, e.g. Advance
  // payment).
  const [feeAmount, setFeeAmount] = useState("");
  const [feeNote, setFeeNote] = useState("");
  const [othersAmount, setOthersAmount] = useState("");
  const [othersNote, setOthersNote] = useState("");
  const [extraPaymentRows, setExtraPaymentRows] = useState<ExtraPaymentRow[]>([]);

  async function refresh() {
    setLoading(true);
    const [b, v, c, p, profile, bands, matrix, munis, customRts, logs, topDests] = await Promise.all([
      listBookings(),
      listVehicles(),
      listCustomers(),
      listProvinces(),
      getBusinessProfile(),
      listSeatingBands(),
      listRateMatrix(),
      listMunicipalities(),
      listCustomRates(),
      listActionLogsByType("booking"),
      getTopDestinations(),
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
    setBookingLogs(logs);
    setTopDestinations(topDests);
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

  // Same province+municipality label shape as lib/destinationLabel.ts, just
  // working off the draft form's camelCase province/city ids directly
  // instead of a saved Booking row.
  function provinceCityLabel(provinceId: string, cityId: string): string {
    const province = provinces.find((p) => p.id === provinceId);
    const municipality = municipalities.find((m) => m.id === cityId);
    if (municipality && province) return `${municipality.name}, ${province.name}`;
    if (province) return province.name;
    return "—";
  }

  const isNewCustomer = customerId === NEW_CUSTOMER;
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  // Picking an existing customer pre-fills the Profile step's phone/address
  // inputs from their record below — kept for the before/after comparison
  // saveBooking needs to know whether to write an edit back.
  const selectedCustomer = useMemo(
    () => (!isNewCustomer ? customers.find((c) => c.id === customerId) ?? null : null),
    [customers, customerId, isNewCustomer],
  );

  // Contact/Address are editable right in the wizard for both an existing
  // customer and a new walk-in — never just a read-only preview. Selecting a
  // different (or no) customer re-seeds these from that customer's own
  // record (blank for a new walk-in), same as any other "pick X, form fills
  // in" pattern; edits made here are still just local state until Save
  // actually writes them back (see saveBooking).
  useEffect(() => {
    setNewCustomerPhone(selectedCustomer?.phone ?? "");
    setProfileAddressProvinceId(selectedCustomer?.address_province_id ?? "");
    setProfileAddressMunicipalityId(selectedCustomer?.address_municipality_id ?? "");
    setProfileAddressLine(selectedCustomer?.address_line ?? "");
    // Draft contacts only ever apply to the walk-in customer being created
    // right now — switching to a different (or no) customer would otherwise
    // carry stale entries meant for someone else into whoever's picked next.
    setDraftContacts([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const startDT = useMemo(() => combineDateTime(startDate, startTime), [startDate, startTime]);
  const endDT = useMemo(() => combineDateTime(endDate, endTime), [endDate, endTime]);
  const dateOrderInvalid = Boolean(startDT && endDT && endDT.getTime() <= startDT.getTime());
  const durationText = useMemo(() => {
    if (!startDT || !endDT || dateOrderInvalid) return null;
    return formatDuration(startDT, endDT, settings.durationDisplay);
  }, [startDT, endDT, dateOrderInvalid, settings.durationDisplay]);

  // Exact, unrounded reading of the Out/Due back span — shown alongside
  // whatever duration wording Settings > Rental has picked (nights, half-days,
  // etc.), regardless of that choice. Purely informational.
  const exactDurationText = useMemo(() => {
    if (!startDT || !endDT || dateOrderInvalid) return null;
    return formatHoursMinutes(startDT, endDT);
  }, [startDT, endDT, dateOrderInvalid]);

  // Destination search is province-first: pick a province (required), then
  // optionally narrow down to a specific city/municipality within it. Every
  // municipality is selectable — no admin pre-registration or toggle needed.
  // Always keeps the already-selected province visible even if its island
  // group is toggled off — otherwise re-opening this form on an existing
  // booking would show a blank search box despite destinationProvinceId
  // still holding a real value.
  const provinceOptions = useMemo(
    () =>
      provinces
        .filter((p) => p.id === destinationProvinceId || isProvinceVisible(p, settings))
        .map((p) => ({ value: p.id, label: p.name, sublabel: p.region_name })),
    [provinces, settings, destinationProvinceId],
  );

  const destinationMunicipalityOptions = useMemo(
    () =>
      municipalities
        .filter((m) => m.province_id === destinationProvinceId)
        .map((m) => ({ value: m.id, label: m.name })),
    [municipalities, destinationProvinceId],
  );

  // Same province-first cascade as destination, for the Profile step's
  // address fields.
  const profileAddressMunicipalityOptions = useMemo(
    () =>
      municipalities
        .filter((m) => m.province_id === profileAddressProvinceId)
        .map((m) => ({ value: m.id, label: m.name })),
    [municipalities, profileAddressProvinceId],
  );

  // Top-10 most-picked destination cities, resolved to a name/province for
  // the quick-pick chips above the search fields — getTopDestinations()
  // already returns just the id/count ranking, ordered most-picked first.
  const topDestinationChips = useMemo(
    () =>
      topDestinations
        .map((td) => {
          const m = municipalities.find((x) => x.id === td.municipalityId);
          return m ? { municipality: m, count: td.count } : null;
        })
        .filter((x): x is { municipality: Municipality; count: number } => x !== null),
    [topDestinations, municipalities],
  );

  function selectTopDestination(m: Municipality) {
    setDestinationProvinceId(m.province_id);
    setDestinationCityId(m.id);
  }

  function handleDestinationProvinceChange(provinceId: string) {
    setDestinationProvinceId(provinceId);
    setDestinationCityId("");
  }

  // Computed silently in the background — exact hours x the resolved
  // per-hour rate (custom city rate first, then Rate Matrix, then vehicle's
  // own daily rate). Never written into the visible Payment field.
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

  // Billed on the exact Out/Due back span (dailyRate / 24 x exact hours) — no
  // half-day or nightly rounding at all. Rounded UP to the nearest 50 so the
  // per-hour math never surfaces messy decimals (e.g. 2041.67 -> 2050).
  const expectedPayment = useMemo(() => {
    if (!startDT || !endDT || dateOrderInvalid || !resolvedRate) return null;
    const rate = Number(resolvedRate.rate);
    if (!Number.isFinite(rate)) return null;
    const exactHours = exactHoursBetween(startDT, endDT);
    const raw = (rate / 24) * exactHours;
    return Math.ceil(raw / 50) * 50;
  }, [startDT, endDT, dateOrderInvalid, resolvedRate]);

  // Chained start/end per leg — leg 0 starts where the primary destination's
  // Due back ends, each leg after that starts where the previous one ended.
  // No leg has its own start picker; only its own end.
  const legDateTimes = useMemo(() => {
    const result: { startDT: Date | null; endDT: Date | null }[] = [];
    let prevEnd = endDT;
    for (const leg of legs) {
      const legEndDT = combineDateTime(leg.endDate, leg.endTime);
      result.push({ startDT: prevEnd, endDT: legEndDT });
      prevEnd = legEndDT;
    }
    return result;
  }, [legs, endDT]);

  // Each leg's own resolved rate, off its own destination — same
  // custom-rate/Rate-Matrix/vehicle-fallback priority as resolvedRate above.
  const legRates = useMemo(() => {
    if (!selectedVehicle) return legs.map(() => null);
    return legs.map((leg) =>
      resolveRate({
        vehicle: selectedVehicle,
        destinationProvinceId: leg.destinationProvinceId || null,
        destinationCityId: leg.destinationCityId || null,
        hqProvinceId: businessProfile?.hq_province_id ?? null,
        provinces,
        seatingBands,
        rateMatrix,
        customRates,
      }),
    );
  }, [legs, selectedVehicle, businessProfile, provinces, seatingBands, rateMatrix, customRates]);

  // Every leg needs a destination and a valid, forward-moving end time
  // before the booking can save — same floor dateOrderInvalid already
  // enforces for the primary destination.
  const legsValid = legs.every((leg, i) => {
    const dt = legDateTimes[i];
    return (
      Boolean(leg.destinationProvinceId) &&
      Boolean(dt.startDT) &&
      Boolean(dt.endDT) &&
      dt.endDT!.getTime() > dt.startDT!.getTime()
    );
  });

  // The booking's real overall due-back — the last leg's end once any exist,
  // otherwise just endDT. This, not endDT alone, is what actually gets saved
  // as end_date and what the backdated-arrival check below runs against.
  const overallEndDT = legs.length > 0 ? legDateTimes[legDateTimes.length - 1]?.endDT ?? null : endDT;

  // Sums expectedPayment (the primary destination's own share) with every
  // leg's own share, each at its own resolved rate — see
  // computeMultiLegExpectedPayment for the same math applied when
  // recomputing live later (Settlements, Remittances). null (never a
  // partial/short total) if anything's missing or unresolved.
  const combinedExpectedPayment = useMemo(() => {
    if (expectedPayment === null) return null;
    if (legs.length === 0) return expectedPayment;
    let total = expectedPayment;
    for (let i = 0; i < legs.length; i++) {
      const dt = legDateTimes[i];
      const rate = legRates[i];
      if (!dt.startDT || !dt.endDT || !rate) return null;
      const rateNum = Number(rate.rate);
      if (!Number.isFinite(rateNum)) return null;
      const hours = exactHoursBetween(dt.startDT, dt.endDT);
      total += Math.ceil(((rateNum / 24) * hours) / 50) * 50;
    }
    return total;
  }, [expectedPayment, legs, legDateTimes, legRates]);

  function addLeg() {
    setLegs((prev) => [...prev, { destinationProvinceId: "", destinationCityId: "", note: "", endDate: "", endTime: "" }]);
  }
  function removeLeg(index: number) {
    setLegs((prev) => prev.filter((_, i) => i !== index));
  }
  function updateLeg(index: number, patch: Partial<DraftLeg>) {
    setLegs((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

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

  // Rate for whichever booking is currently in the Mark-returned dialog —
  // feeds the Expected additional payment preview shown there when the
  // chosen return time lands as overtime.
  const markReturnedRate = useMemo(
    () =>
      markReturnedFor
        ? resolveBookingRate(markReturnedFor, vehicles, businessProfile, provinces, seatingBands, rateMatrix, customRates)
        : null,
    [markReturnedFor, vehicles, businessProfile, provinces, seatingBands, rateMatrix, customRates],
  );

  function resetForm() {
    setVehicleId("");
    setFuelLevel("");
    setOdometerKm("");
    setDestinationProvinceId("");
    setDestinationCityId("");
    setDestinationNote("");
    setPurpose(DEFAULT_PURPOSE);
    setCustomerId("");
    setNewCustomerName("");
    setNewCustomerPhone("");
    setProfileAddressProvinceId("");
    setProfileAddressMunicipalityId("");
    setProfileAddressLine("");
    setStartDate("");
    setStartTime("");
    setEndDate("");
    setEndTime("");
    setPaymentAmount("");
    setNotYetPaid(false);
    setLegs([]);
    setAgreementExecutedDate("");
    setAgreementExecutedTime("");
    setShowMoreContacts(false);
    setDraftContacts([]);
    setFeeAmount("");
    setFeeNote("");
    setOthersAmount("");
    setOthersNote("");
    setExtraPaymentRows([]);
    setStep(0);
    setMaxStepReached(0);
    setShowForm(false);
  }

  // Whether anything at all has actually been entered — drives whether
  // Cancel needs to confirm first. Deliberately loose (any of these having a
  // value counts), same spirit as canSubmit being strict about what's
  // actually required.
  const isDirty = Boolean(
    vehicleId ||
      fuelLevel.trim() ||
      odometerKm.trim() ||
      destinationProvinceId ||
      destinationCityId ||
      destinationNote.trim() ||
      customerId ||
      newCustomerName.trim() ||
      newCustomerPhone.trim() ||
      startDate ||
      startTime ||
      endDate ||
      endTime ||
      paymentAmount.trim() ||
      notYetPaid ||
      legs.length > 0 ||
      purpose !== DEFAULT_PURPOSE ||
      Boolean(agreementExecutedDate) ||
      Boolean(agreementExecutedTime) ||
      draftContacts.length > 0 ||
      feeAmount.trim() ||
      feeNote.trim() ||
      othersAmount.trim() ||
      othersNote.trim() ||
      extraPaymentRows.length > 0,
  );

  // The only way out of the popup — asks first if there's anything to lose,
  // otherwise just discards and closes right away.
  function requestCloseForm() {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      resetForm();
    }
  }

  // Guards against logging something like "65 bars" against an 8-bar gauge
  // — checked against the selected vehicle's optional Registry-set ceiling
  // (fuel_max_level), same cap FuelLevelTab/Entries enforces on its own
  // reading form.
  const fuelLevelExceedsMax =
    selectedVehicle?.fuel_max_level != null &&
    fuelLevel.trim() !== "" &&
    Number.isFinite(Number(fuelLevel)) &&
    Number(fuelLevel) > selectedVehicle.fuel_max_level;

  // Whether paid already or still receivable, staff must declare a figure —
  // an empty Paid/AR field used to slip through silently (ROD022).
  const paymentAmountValid = paymentAmount.trim() !== "" && Number.isFinite(Number(paymentAmount)) && Number(paymentAmount) >= 0;

  // Agreement executed can never be after the rental's Out date — blank
  // ("no input") is always valid, since it defaults to Out's own day.
  // String comparison works directly since both are "YYYY-MM-DD".
  const agreementDateValid = !agreementExecutedDate || !startDate || agreementExecutedDate <= startDate;

  // Per-step gate for the wizard's Next button — same underlying checks
  // canSubmit already does, just split per step so each one only unlocks
  // once its own fields are actually valid.
  const stepValid = [
    isNewCustomer ? newCustomerName.trim().length > 0 : Boolean(customerId),
    Boolean(vehicleId) && !fuelLevelExceedsMax,
    Boolean(destinationProvinceId) && Boolean(startDT) && Boolean(endDT) && !dateOrderInvalid && legsValid,
    paymentAmountValid,
  ];

  const canSubmit =
    Boolean(vehicleId) &&
    !fuelLevelExceedsMax &&
    Boolean(destinationProvinceId) &&
    Boolean(startDT) &&
    Boolean(endDT) &&
    !dateOrderInvalid &&
    legsValid &&
    paymentAmountValid &&
    agreementDateValid &&
    (isNewCustomer ? newCustomerName.trim().length > 0 : Boolean(customerId));

  // Does the actual save, once we know whether arrival needs to be resolved:
  // actualReturnAt is null for a normal save (not backdated, or staff picked
  // "not yet returned"), or an ISO timestamp when the confirmation dialog
  // resolved it as already back.
  async function saveBooking(actualReturnAt: string | null) {
    if (!startDT || !endDT || !overallEndDT) return;

    let finalCustomerId = customerId;
    if (isNewCustomer) {
      // Walk-in renter, not registered yet — create the customer record inline
      // instead of forcing the staff to leave this screen first. Phone/address
      // are both optional here, same as Customers' own intake form.
      const created = await createCustomer({
        full_name: newCustomerName.trim(),
        phone: newCustomerPhone.trim() || undefined,
        address_province_id: profileAddressProvinceId || undefined,
        address_municipality_id: profileAddressMunicipalityId || undefined,
        address_line: profileAddressLine.trim() || undefined,
      });
      finalCustomerId = created.id;
      // Any contacts staged on the Profile step (draftContacts) can only be
      // created now that there's a real customer_id to attach them to.
      for (const contact of draftContacts) {
        await createCustomerContact(
          { customer_id: created.id, type: contact.type, label: contact.label || undefined, value: contact.value },
          created.full_name,
        );
      }
    } else if (selectedCustomer) {
      // Bidirectional — an existing customer's phone/address can be filled
      // in or corrected right here, and it writes back to their actual
      // Customer record on save, same as editing it from Customers would.
      const nextPhone = newCustomerPhone.trim() || null;
      const nextProvince = profileAddressProvinceId || null;
      const nextMunicipality = profileAddressMunicipalityId || null;
      const nextLine = profileAddressLine.trim() || null;
      if (nextPhone !== selectedCustomer.phone) {
        await updateCustomerPhone(finalCustomerId, nextPhone);
      }
      if (
        nextProvince !== selectedCustomer.address_province_id ||
        nextMunicipality !== selectedCustomer.address_municipality_id ||
        nextLine !== selectedCustomer.address_line
      ) {
        await updateCustomerAddress(finalCustomerId, {
          address_province_id: nextProvince,
          address_municipality_id: nextMunicipality,
          address_line: nextLine,
        });
      }
    }

    const legsPayload = legs.map((leg, i) => ({
      destination_province_id: leg.destinationProvinceId || undefined,
      destination_city_id: leg.destinationCityId || undefined,
      note: leg.note.trim() || undefined,
      // legsValid already guaranteed both are non-null for every leg.
      start_at: legDateTimes[i].startDT!.toISOString(),
      end_at: legDateTimes[i].endDT!.toISOString(),
      resolved_rate: legRates[i]?.rate,
    }));

    const newBooking = await createBooking({
      vehicle_id: vehicleId,
      customer_id: finalCustomerId,
      destination_province_id: destinationProvinceId || undefined,
      destination_city_id: destinationCityId || undefined,
      destination_note: destinationNote.trim() || undefined,
      start_date: startDT.toISOString(),
      // The *overall* due-back — the last leg's end once any exist, not just
      // the primary destination's own end. See overallEndDT.
      end_date: overallEndDT.toISOString(),
      payment_amount: paymentAmount.trim() || undefined,
      expected_payment: combinedExpectedPayment !== null ? String(combinedExpectedPayment) : undefined,
      purpose: purpose.trim() || undefined,
      actual_return_at: actualReturnAt ?? undefined,
      resolved_rate: resolvedRate?.rate ?? undefined,
      payment_status: notYetPaid ? "receivable" : undefined,
      legs: legsPayload.length > 0 ? legsPayload : undefined,
      agreement_executed_at: agreementExecutedDate
        ? new Date(`${agreementExecutedDate}T${agreementExecutedTime || "00:00"}:00`).toISOString()
        : undefined,
    });

    // Feature 5 (ROT051) — the grid's Fee/Others fixed rows and any "+"
    // rows can only be created now that there's a real booking id to attach
    // them to. Purely informational, never touches payment_amount/
    // expected_payment above. Fixed rows are only saved if actually filled
    // in — an untouched Fee/Others row on the grid never creates a blank entry.
    const stagedEntries: { type: BookingPaymentEntryType; amount: string; note: string }[] = [];
    if (feeAmount.trim() || feeNote.trim()) {
      stagedEntries.push({ type: "fee", amount: feeAmount, note: feeNote });
    }
    if (othersAmount.trim() || othersNote.trim()) {
      stagedEntries.push({ type: "other", amount: othersAmount, note: othersNote });
    }
    for (const row of extraPaymentRows) {
      if (row.amount.trim() || row.note.trim()) {
        stagedEntries.push(row);
      }
    }
    for (const entry of stagedEntries) {
      await createBookingPaymentEntry({
        booking_id: newBooking.id,
        type: entry.type,
        amount: entry.amount.trim() || undefined,
        note: entry.note.trim() || undefined,
      });
    }

    const fuelLevelNum = Number(fuelLevel);
    if (fuelLevel.trim() && Number.isFinite(fuelLevelNum) && fuelLevelNum >= 0) {
      await createFuelLevelEntry({
        vehicle_id: vehicleId,
        level: fuelLevelNum,
        unit: settings.fuelUnit,
        reading_at: new Date().toISOString(),
      });
    }

    const odometerKmNum = Number(odometerKm);
    if (odometerKm.trim() && Number.isFinite(odometerKmNum) && odometerKmNum >= 0) {
      await createOdometerReading({
        vehicle_id: vehicleId,
        reading_km: odometerKmNum,
        reading_at: new Date().toISOString(),
      });
    }

    resetForm();
    setArrivalDialogEta(null);
    await refresh();
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    // Guards against the browser's own implicit form submission — pressing
    // Enter in a lone text field (e.g. the payment amount on step 3) submits
    // the form natively even though the visible control there is just the
    // "Next" button, which is type="button" and doesn't call this handler
    // itself. Only the actual Save step should ever reach the save/arrival
    // check below.
    if (step !== STEPS.length - 1) return;
    // Eats a ghost second-click landing on Save the instant it swaps in for
    // Next — see stepEnteredAtRef above.
    if (Date.now() - stepEnteredAtRef.current < 400) return;
    if (!canSubmit || !startDT || !endDT || !overallEndDT) return;

    // Due-back already elapsed — staff needs to say whether the vehicle is
    // already back (and when) before this gets written as a live rental.
    // Checked against the *overall* due-back (last leg's end, if any), not
    // just the primary destination's own end.
    if (overallEndDT.getTime() < Date.now()) {
      setArrivalDialogEta(overallEndDT.toISOString());
      return;
    }

    await saveBooking(null);
  }

  async function handleCancel(id: string, reason: CancellationReason, otherDetail?: string) {
    setCancelBusy(true);
    await cancelBooking(id, reason, otherDetail);
    setCancelBusy(false);
    setCancellingFor(null);
    await refresh();
  }

  // Grouped once per bookingLogs change, rather than filtering the whole log
  // list per row on every render — same idea as byVehicle in RemittancesReport.
  const logsByBooking = useMemo(() => {
    const map = new Map<string, ActionLogEntry[]>();
    for (const log of bookingLogs) {
      const list = map.get(log.entity_id) ?? [];
      list.push(log);
      map.set(log.entity_id, list);
    }
    return map;
  }, [bookingLogs]);

  const canShowForm = vehicles.length > 0;

  useEffect(() => {
    if (autoOpenForm && canShowForm) {
      setShowForm(true);
      onAutoOpenConsumed?.();
    }
  }, [autoOpenForm, canShowForm, onAutoOpenConsumed]);

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
                setCancellingFor(null);
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
          onClick={() => setShowForm(true)}
          disabled={!canShowForm || showForm}
          className="rounded px-5 py-2 text-base font-bold uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
        >
          Record booking
        </button>
      </div>

      {!canShowForm && (
        <p className="text-base" style={{ color: "var(--text-muted)" }}>
          Add at least one vehicle in Fleet before creating a booking.
        </p>
      )}

      {showForm && (
        // Popup wizard — no backdrop-click or Escape dismiss on purpose; the
        // in-popup Cancel button (see requestCloseForm) is the only way out,
        // and it confirms first if anything's actually been entered.
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0, 0, 0, 0.6)" }}
        >
          <div
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg"
            style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)" }}
          >
            <form onSubmit={handleAdd} className="w-full p-4">
              {/* Step wizard — Profile, Vehicle, Destination, Payment, then a
                  read-only Summary that's the only step with an actual submit.
                  Same bordered-table field styling as before, same
                  state/handlers throughout; only the step gating is new. */}
              <div className="overflow-hidden rounded-md" style={{ border: "0.5px solid var(--border-strong)" }}>
                <div
                  className="flex items-center justify-between px-3 py-2"
                  style={{ borderBottom: "0.5px solid var(--border-strong)" }}
                >
                  <h3 className="text-base font-bold uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>
                    Record rental
                  </h3>
                  <button
                    type="button"
                    onClick={requestCloseForm}
                    className="text-sm font-medium"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Cancel
                  </button>
                </div>

            <div className="flex" style={{ borderBottom: "0.5px solid var(--border-strong)" }}>
              {STEPS.map((label, i) => {
                // Reachable = already visited this form session, so it's a
                // review shortcut, not a way to skip ahead while still
                // filling the wizard out for the first time (that's still
                // strictly gated by stepValid on the Next button).
                const reachable = i <= maxStepReached && i !== step;
                return (
                  <button
                    key={label}
                    type="button"
                    disabled={!reachable}
                    onClick={reachable ? () => setStep(i) : undefined}
                    className="flex-1 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide disabled:cursor-default"
                    style={{
                      borderRight: i < STEPS.length - 1 ? "0.5px solid var(--border-strong)" : undefined,
                      background: i === step ? "var(--fill-primary)" : "var(--surface-2)",
                      color: i === step ? "var(--on-primary)" : reachable ? "var(--text-accent)" : "var(--text-muted)",
                      cursor: reachable ? "pointer" : "default",
                    }}
                  >
                    {i + 1}. {label}
                  </button>
                );
              })}
            </div>

            {step === 0 && (
              <>
                <div className="grid grid-cols-1 items-start sm:grid-cols-2" style={{ borderBottom: "0.5px solid var(--border-strong)" }}>
                  <div className="p-2.5" style={{ borderRight: "0.5px solid var(--border-strong)" }}>
                    <div className="mb-1 text-xs font-semibold uppercase" style={labelStyle}>Customer *</div>
                    {!isNewCustomer ? (
                      <select
                        className="w-full rounded-md px-3 py-2 text-base"
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
                      <div className="space-y-1">
                        <input
                          className="w-full rounded-md px-3 py-2 text-base"
                          style={inputStyle}
                          placeholder="Full name *"
                          value={newCustomerName}
                          onChange={(e) => setNewCustomerName(e.target.value)}
                        />
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
                  </div>
                  {/* Editable either way — existing customer or new walk-in.
                      Picking an existing customer pre-fills this from their
                      record (see the sync effect above); leaving it blank or
                      changing it here writes back to that same Customer
                      record on Save (see saveBooking) — bidirectional, not
                      just used for this one booking. */}
                  <div className="p-2.5">
                    <div className="mb-1 text-xs font-semibold uppercase" style={labelStyle}>Contact no. (optional)</div>
                    <input
                      className="w-full rounded-md px-3 py-2 text-base"
                      style={inputStyle}
                      placeholder="Phone (optional)"
                      value={newCustomerPhone}
                      onChange={(e) => setNewCustomerPhone(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowMoreContacts((s) => !s)}
                      className="mt-2 text-sm font-medium"
                      style={{ color: "var(--text-accent)" }}
                    >
                      {showMoreContacts ? "Hide additional contact information" : "See more contact information"}
                    </button>
                    {showMoreContacts && (
                      <div className="mt-2">
                        {/* An existing customer already has a customer_id —
                            manage their extra contacts live, right here,
                            same component and same immediate save Customers'
                            own Edit info uses. A new walk-in has no id yet,
                            so its entries are only staged (DraftContactsEditor)
                            until saveBooking() actually creates the customer. */}
                        {selectedCustomer ? (
                          <CustomerContactsPanel customer={selectedCustomer} hideHeader />
                        ) : (
                          <DraftContactsEditor contacts={draftContacts} setContacts={setDraftContacts} />
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="p-2.5">
                  <div className="mb-1 text-xs font-semibold uppercase" style={labelStyle}>Address (optional)</div>
                  <div className="mb-2">
                    <HybridLocationSearch
                      provinces={provinces}
                      municipalities={municipalities}
                      settings={settings}
                      onSelect={(provinceId, cityId) => {
                        setProfileAddressProvinceId(provinceId);
                        setProfileAddressMunicipalityId(cityId ?? "");
                      }}
                    />
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="flex-1">
                      <SearchableSelect
                        value={profileAddressProvinceId}
                        onChange={(v) => {
                          setProfileAddressProvinceId(v);
                          setProfileAddressMunicipalityId("");
                        }}
                        options={provinceOptions}
                        placeholder="Search for a province…"
                      />
                    </div>
                    <div className="flex-1">
                      <SearchableSelect
                        value={profileAddressMunicipalityId}
                        onChange={setProfileAddressMunicipalityId}
                        options={profileAddressMunicipalityOptions}
                        placeholder={profileAddressProvinceId ? "City/municipality (optional)" : "Pick a province first"}
                      />
                    </div>
                  </div>
                  <input
                    className="mt-2 w-full rounded-md px-3 py-2 text-base"
                    style={inputStyle}
                    placeholder="Street address (optional)"
                    value={profileAddressLine}
                    onChange={(e) => setProfileAddressLine(e.target.value)}
                  />
                </div>
              </>
            )}

            {step === 1 && (
              <div className="grid grid-cols-1 sm:grid-cols-3">
                <div className="p-2.5" style={{ borderRight: "0.5px solid var(--border-strong)" }}>
                  <div className="mb-1 text-xs font-semibold uppercase" style={labelStyle}>Vehicle *</div>
                  <select
                    className="w-full rounded-md px-3 py-2 text-base"
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
                </div>
                <div className="p-2.5" style={{ borderRight: "0.5px solid var(--border-strong)" }}>
                  <div className="mb-1 text-xs font-semibold uppercase" style={labelStyle}>
                    Fuel lvl ({settings.fuelUnit === "bars" ? "bars" : "L"})
                    {selectedVehicle?.fuel_max_level != null && (
                      <span className="normal-case" style={{ color: "var(--text-muted)" }}> · max {selectedVehicle.fuel_max_level}</span>
                    )}
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={selectedVehicle?.fuel_max_level ?? undefined}
                    step={settings.fuelUnit === "bars" ? 1 : 0.1}
                    className="w-full rounded-md px-3 py-2 text-base"
                    style={inputStyle}
                    placeholder={settings.fuelUnit === "bars" ? "6" : "42.5"}
                    value={fuelLevel}
                    onChange={(e) => setFuelLevel(e.target.value)}
                  />
                  {fuelLevelExceedsMax && (
                    <p className="mt-1 text-xs" style={{ color: "var(--text-danger)" }}>
                      Above this vehicle&rsquo;s max ({selectedVehicle?.fuel_max_level} {settings.fuelUnit === "bars" ? "bars" : "L"}).
                    </p>
                  )}
                </div>
                <div className="p-2.5">
                  <div className="mb-1 text-xs font-semibold uppercase" style={labelStyle}>Odometer (km)</div>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className="w-full rounded-md px-3 py-2 text-base"
                    style={inputStyle}
                    placeholder="12345"
                    value={odometerKm}
                    onChange={(e) => setOdometerKm(e.target.value)}
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <>
                {topDestinationChips.length > 0 && (
                  <div
                    className="flex flex-wrap gap-2 p-2.5"
                    style={{ borderBottom: "0.5px solid var(--border-strong)" }}
                  >
                    {topDestinationChips.map(({ municipality, count }) => (
                      <button
                        key={municipality.id}
                        type="button"
                        onClick={() => selectTopDestination(municipality)}
                        title={`Picked ${count} time${count === 1 ? "" : "s"} before`}
                        className="rounded-full px-3 py-1 text-sm"
                        style={
                          destinationCityId === municipality.id
                            ? { background: "var(--fill-primary)", color: "var(--on-primary)" }
                            : { background: "var(--surface-2)", color: "var(--text-secondary)" }
                        }
                      >
                        {municipality.name}
                      </button>
                    ))}
                  </div>
                )}

                {/* Destination / Out / Due back column header, like the mockup */}
                <div
                  className="grid grid-cols-[minmax(220px,1fr)_170px_170px] text-xs font-semibold uppercase"
                  style={{ background: "var(--surface-2)", borderBottom: "0.5px solid var(--border-strong)", color: "var(--text-secondary)" }}
                >
                  <div className="p-2" style={{ borderRight: "0.5px solid var(--border-strong)" }}>Destination</div>
                  <div className="p-2" style={{ borderRight: "0.5px solid var(--border-strong)" }}>Out</div>
                  <div className="p-2">Due back</div>
                </div>

                {/* Primary destination row — province first, then city */}
                <div
                  className="grid grid-cols-[minmax(220px,1fr)_170px_170px] items-start"
                  style={{ borderBottom: "0.5px solid var(--border-strong)" }}
                >
                  <div className="space-y-1.5 p-2" style={{ borderRight: "0.5px solid var(--border-strong)" }}>
                    <HybridLocationSearch
                      provinces={provinces}
                      municipalities={municipalities}
                      settings={settings}
                      onSelect={(provinceId, cityId) => {
                        setDestinationProvinceId(provinceId);
                        setDestinationCityId(cityId ?? "");
                      }}
                    />
                    <SearchableSelect
                      value={destinationProvinceId}
                      onChange={handleDestinationProvinceChange}
                      options={provinceOptions}
                      placeholder="Search for a province…"
                    />
                    <SearchableSelect
                      value={destinationCityId}
                      onChange={setDestinationCityId}
                      options={destinationMunicipalityOptions}
                      placeholder={destinationProvinceId ? "City/municipality (optional)" : "Pick a province first"}
                    />
                  </div>
                  <div className="space-y-1 p-2" style={{ borderRight: "0.5px solid var(--border-strong)" }}>
                    <DateTimePicker
                      dateValue={startDate}
                      timeValue={startTime}
                      onDateChange={setStartDate}
                      onTimeChange={setStartTime}
                      settings={settings}
                    />
                  </div>
                  <div className="space-y-1 p-2">
                    <DateTimePicker
                      dateValue={endDate}
                      timeValue={endTime}
                      onDateChange={setEndDate}
                      onTimeChange={setEndTime}
                      settings={settings}
                    />
                    {dateOrderInvalid ? (
                      <p className="text-xs" style={{ color: "var(--text-danger)" }}>Must be after Out.</p>
                    ) : durationText ? (
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {durationText}
                        {exactDurationText && ` · ${exactDurationText}`}
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* Extra stops, if any — each leg's Out is the previous
                    stop's Due back (read-only, muted), only its own Due
                    back is editable. */}
                {legs.map((leg, i) => {
                  const legMunicipalityOptions = municipalities
                    .filter((m) => m.province_id === leg.destinationProvinceId)
                    .map((m) => ({ value: m.id, label: m.name }));
                  const dt = legDateTimes[i];
                  const legInvalid = Boolean(dt.endDT && dt.startDT && dt.endDT.getTime() <= dt.startDT.getTime());
                  return (
                    <div
                      key={i}
                      className="grid grid-cols-[minmax(220px,1fr)_170px_170px] items-start"
                      style={{ borderBottom: "0.5px solid var(--border-strong)" }}
                    >
                      <div className="space-y-1.5 p-2" style={{ borderRight: "0.5px solid var(--border-strong)" }}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                            Destination {i + 2}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeLeg(i)}
                            className="text-xs"
                            style={{ color: "var(--text-danger)" }}
                          >
                            Remove
                          </button>
                        </div>
                        <HybridLocationSearch
                          provinces={provinces}
                          municipalities={municipalities}
                          settings={settings}
                          onSelect={(provinceId, cityId) =>
                            updateLeg(i, { destinationProvinceId: provinceId, destinationCityId: cityId ?? "" })
                          }
                        />
                        <SearchableSelect
                          value={leg.destinationProvinceId}
                          onChange={(v) => updateLeg(i, { destinationProvinceId: v, destinationCityId: "" })}
                          options={provinceOptions}
                          placeholder="Search for a province…"
                        />
                        <SearchableSelect
                          value={leg.destinationCityId}
                          onChange={(v) => updateLeg(i, { destinationCityId: v })}
                          options={legMunicipalityOptions}
                          placeholder={leg.destinationProvinceId ? "City/municipality (optional)" : "Pick a province first"}
                        />
                        <input
                          className="w-full rounded-md px-3 py-2 text-sm"
                          style={inputStyle}
                          placeholder="Note (optional)"
                          value={leg.note}
                          onChange={(e) => updateLeg(i, { note: e.target.value })}
                        />
                      </div>
                      <div className="p-2 text-sm" style={{ borderRight: "0.5px solid var(--border-strong)", color: "var(--text-muted)" }}>
                        {dt.startDT ? formatDateTime(dt.startDT.toISOString(), settings) : "—"}
                      </div>
                      <div className="space-y-1 p-2">
                        <DateTimePicker
                          dateValue={leg.endDate}
                          timeValue={leg.endTime}
                          onDateChange={(v) => updateLeg(i, { endDate: v })}
                          onTimeChange={(v) => updateLeg(i, { endTime: v })}
                          settings={settings}
                        />
                        {legInvalid && (
                          <p className="text-xs" style={{ color: "var(--text-danger)" }}>Must be after this stop's start.</p>
                        )}
                      </div>
                    </div>
                  );
                })}

                <div className="p-2.5" style={{ borderBottom: "0.5px solid var(--border-strong)" }}>
                  <div className="mb-1 text-xs font-semibold uppercase" style={labelStyle}>Note</div>
                  <input
                    className="w-full rounded-md px-3 py-2 text-base"
                    style={inputStyle}
                    placeholder="Optional — pickup point, gate code, contact, etc."
                    value={destinationNote}
                    onChange={(e) => setDestinationNote(e.target.value)}
                  />
                </div>

                <div className="flex justify-end p-2.5">
                  <button
                    type="button"
                    onClick={addLeg}
                    className="rounded-md px-4 py-2 text-sm font-bold uppercase tracking-wide"
                    style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
                  >
                    + Add destination
                  </button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2" style={{ borderBottom: "0.5px solid var(--border-strong)" }}>
                  <div className="p-2.5" style={{ borderRight: "0.5px solid var(--border-strong)" }}>
                    <PaymentBreakdownGrid
                      paymentAmount={paymentAmount}
                      setPaymentAmount={setPaymentAmount}
                      paymentAmountValid={paymentAmountValid}
                      notYetPaid={notYetPaid}
                      setNotYetPaid={setNotYetPaid}
                      feeAmount={feeAmount}
                      setFeeAmount={setFeeAmount}
                      feeNote={feeNote}
                      setFeeNote={setFeeNote}
                      othersAmount={othersAmount}
                      setOthersAmount={setOthersAmount}
                      othersNote={othersNote}
                      setOthersNote={setOthersNote}
                      extraRows={extraPaymentRows}
                      setExtraRows={setExtraPaymentRows}
                    />
                  </div>
                  <div className="p-2.5">
                    <div className="mb-1 text-xs font-semibold uppercase italic" style={labelStyle}>Expected</div>
                    {settings.showExpectedPayment && combinedExpectedPayment !== null ? (
                      <p className="text-base italic" style={{ color: "var(--text-primary)" }}>
                        {formatMoney(combinedExpectedPayment)}
                        {resolvedRate?.basis === "matrix"
                          ? ` (Tier ${resolvedRate.tier} · ${resolvedRate.band?.label})`
                          : ""}
                        {legs.length > 0 ? ` — ${legs.length + 1} destinations` : ""}
                      </p>
                    ) : (
                      <p className="text-base italic" style={{ color: "var(--text-muted)" }}>—</p>
                    )}
                    {resolvedRate?.basis === "custom" && (
                      <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                        Custom rate for this city ({resolvedRate.band?.label}): {resolvedRate.rate}
                      </p>
                    )}
                    {resolvedRate?.basis === "vehicle" && (
                      <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                        No Rate Matrix match — using this vehicle's own rate: {resolvedRate.rate}
                      </p>
                    )}
                    <div className="mt-1.5">
                      <RateMatrixPanel band={selectedBand} row={matrixRow} activeTier={activeTier} />
                    </div>
                  </div>
                </div>
                <div className="p-2.5">
                  <div className="mb-1 text-xs font-semibold uppercase" style={labelStyle}>Purpose</div>
                  <select
                    className="w-full rounded-md px-3 py-2 text-base sm:w-1/3"
                    style={inputStyle}
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                  >
                    {PURPOSE_OPTIONS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <div className="p-2.5" style={{ borderBottom: "0.5px solid var(--border-strong)" }}>
                  <div className="mb-1 text-xs font-semibold uppercase" style={labelStyle}>Vehicle</div>
                  <p className="text-base" style={{ color: "var(--text-primary)" }}>
                    {vehicleId ? vehicleLabel(vehicleId) : "—"}
                  </p>
                  {(fuelLevel.trim() || odometerKm.trim()) && (
                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                      {fuelLevel.trim() && `Fuel: ${fuelLevel} ${settings.fuelUnit === "bars" ? "bars" : "L"}`}
                      {fuelLevel.trim() && odometerKm.trim() && " · "}
                      {odometerKm.trim() && `Odometer: ${odometerKm} km`}
                    </p>
                  )}
                </div>

                <div className="p-2.5" style={{ borderBottom: "0.5px solid var(--border-strong)" }}>
                  <div className="mb-1 text-xs font-semibold uppercase" style={labelStyle}>Customer</div>
                  <p className="text-base" style={{ color: "var(--text-primary)" }}>
                    {isNewCustomer ? newCustomerName.trim() || "—" : customerLabel(customerId)}
                  </p>
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    {newCustomerPhone.trim() || "No phone on file"}
                    {profileAddressLine.trim() || profileAddressProvinceId
                      ? ` · ${[profileAddressLine.trim(), provinceCityLabel(profileAddressProvinceId, profileAddressMunicipalityId)]
                          .filter((part) => part && part !== "—")
                          .join(", ")}`
                      : ""}
                  </p>
                </div>

                <div className="p-2.5" style={{ borderBottom: "0.5px solid var(--border-strong)" }}>
                  <div className="mb-1 text-xs font-semibold uppercase" style={labelStyle}>Destination</div>
                  <p className="text-base" style={{ color: "var(--text-primary)" }}>
                    {provinceCityLabel(destinationProvinceId, destinationCityId)}
                    {startDT && endDT
                      ? ` — ${formatDateTime(startDT.toISOString(), settings)} to ${formatDateTime(endDT.toISOString(), settings)}`
                      : ""}
                  </p>
                  {destinationNote.trim() && (
                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>Note: {destinationNote}</p>
                  )}
                  {legs.map((leg, i) => {
                    const dt = legDateTimes[i];
                    return (
                      <p key={i} className="text-base" style={{ color: "var(--text-primary)" }}>
                        → {provinceCityLabel(leg.destinationProvinceId, leg.destinationCityId)}
                        {dt.endDT ? ` — until ${formatDateTime(dt.endDT.toISOString(), settings)}` : ""}
                      </p>
                    );
                  })}
                </div>

                <div className="p-2.5" style={{ borderBottom: "0.5px solid var(--border-strong)" }}>
                  <div className="mb-1 text-xs font-semibold uppercase" style={labelStyle}>Payment</div>
                  <p className="text-base" style={{ color: "var(--text-primary)" }}>
                    {notYetPaid ? "Receivable — not yet paid" : "Paid"}
                    {paymentAmount.trim() ? ` · ${paymentAmount}` : ""}
                  </p>
                  {settings.showExpectedPayment && combinedExpectedPayment !== null && (
                    <p className="text-sm italic" style={{ color: "var(--text-muted)" }}>
                      Expected: {formatMoney(combinedExpectedPayment)}
                    </p>
                  )}
                </div>

                <div className="p-2.5" style={{ borderBottom: "0.5px solid var(--border-strong)" }}>
                  <div className="mb-1 text-xs font-semibold uppercase" style={labelStyle}>Purpose</div>
                  <p className="text-base" style={{ color: "var(--text-primary)" }}>{purpose}</p>
                </div>

                <div className="p-2.5">
                  <div className="mb-1 text-xs font-semibold uppercase" style={labelStyle}>Agreement executed on</div>
                  <p className="mb-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
                    When the paperwork was actually signed — leave blank to default to the same date and time as Out. Can't be after Out's date; only change this if the booking is being recorded early or entered late.
                  </p>
                  <div className="max-w-[220px]">
                    <DateTimePicker
                      dateValue={agreementExecutedDate}
                      timeValue={agreementExecutedTime}
                      onDateChange={setAgreementExecutedDate}
                      onTimeChange={setAgreementExecutedTime}
                      settings={settings}
                    />
                  </div>
                  {!agreementDateValid && (
                    <p className="mt-1.5 text-sm" style={{ color: "var(--text-danger)" }}>
                      Can't be after the scheduled Out date ({formatDate(`${startDate}T00:00:00`, settings)}).
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="rounded-md px-5 py-2.5 text-base font-medium disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}
            >
              Back
            </button>
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                disabled={!stepValid[step]}
                className="rounded-md px-6 py-2.5 text-base font-bold uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
              >
                Next
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSubmit}
                className="rounded-md px-6 py-2.5 text-base font-bold uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
              >
                Save booking
              </button>
            )}
              </div>
            </form>
          </div>
        </div>
      )}

      {showDiscardConfirm && (
        <ConfirmDialog
          title="Discard this booking?"
          description="What you've entered so far — vehicle, customer, destination, everything — will be lost. This can't be undone."
          confirmLabel="Discard"
          onConfirm={() => {
            setShowDiscardConfirm(false);
            resetForm();
          }}
          onCancel={() => setShowDiscardConfirm(false)}
        />
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
            {visibleBookings.map((b) => {
              // Overdue return: active, arrival unresolved, due-back already
              // elapsed. Departure due: still pending, scheduled ETD already
              // elapsed and nobody's confirmed it left yet. Both are purely
              // computed for display — the stored status/columns are untouched
              // until staff actually act on Mark returned/Mark departed.
              const isOverdueReturn = b.status === "active" && new Date(b.end_date).getTime() < nowTick.getTime();
              const isDepartureDue = b.status === "pending" && new Date(b.start_date).getTime() <= nowTick.getTime();

              return (
                <tr key={b.id}>
                  <td className="px-3 py-2.5 font-mono text-sm" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>
                    {bookingRef(b.id)}
                    <EditHistoryBadge entries={logsByBooking.get(b.id) ?? []} settings={settings} />
                  </td>
                  <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>{vehicleLabel(b.vehicle_id)}</td>
                  <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>{customerLabel(b.customer_id)}</td>
                  <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>{formatDateTime(b.start_date, settings)}</td>
                  <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>{formatDateTime(b.end_date, settings)}</td>
                  <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)" }}>
                    {isOverdueReturn ? (
                      <>
                        <span className="rounded-full px-3 py-1.5 text-sm font-medium" style={{ background: "var(--bg-danger)", color: "var(--text-danger)" }}>
                          overdue
                        </span>
                        <div className="mt-1 text-sm" style={{ color: "var(--text-danger)" }}>
                          {formatHoursMinutes(new Date(b.end_date), nowTick)} overdue
                        </div>
                      </>
                    ) : isDepartureDue ? (
                      <>
                        <span className="rounded-full px-3 py-1.5 text-sm font-medium" style={{ background: "var(--bg-warning)", color: "var(--text-warning)" }}>
                          departure due
                        </span>
                        <div className="mt-1 text-sm" style={{ color: "var(--text-warning)" }}>
                          {formatHoursMinutes(new Date(b.start_date), nowTick)} since scheduled
                        </div>
                      </>
                    ) : (
                      <span className="rounded-full px-3 py-1.5 text-sm font-medium" style={STATUS_STYLES[b.status]}>
                        {b.status}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right" style={{ border: "0.5px solid var(--border)" }}>
                    <div className="flex justify-end gap-3">
                      {(b.status === "pending" || b.status === "confirmed") && (
                          <button
                            onClick={() => onCheckout(b.id)}
                            className="text-sm font-medium"
                            style={{ color: "var(--text-accent)" }}
                          >
                            Check-out
                          </button>
                        )}
                        {b.status === "pending" && (
                          <button
                            onClick={() => setMarkDepartedFor(b)}
                            className="text-sm font-medium"
                            style={{ color: "var(--text-success)" }}
                          >
                            Mark departed
                          </button>
                        )}
                        {b.status === "active" && (
                          <button
                            onClick={() => setMarkReturnedFor(b)}
                            className="text-sm font-medium"
                            style={{ color: "var(--text-success)" }}
                          >
                            Mark returned
                          </button>
                        )}
                        {b.status !== "cancelled" && b.status !== "completed" && (
                          <button
                            onClick={() => setCancellingFor(b)}
                            className="text-sm font-medium"
                            style={{ color: "var(--text-danger)" }}
                          >
                            Cancel
                          </button>
                        )}
                        {b.actual_return_at && (
                          <button
                            onClick={() => setEditTimesFor(b)}
                            className="text-sm font-medium"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            Edit times
                          </button>
                        )}
                        {b.status !== "cancelled" && (
                          <button
                            onClick={() => setEditAgreementFor(b)}
                            className="text-sm font-medium"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            Edit agreement date
                          </button>
                        )}
                        <button
                          onClick={() => setEditPaymentEntriesFor(b)}
                          className="text-sm font-medium"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Payment breakdown
                        </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {arrivalDialogEta && (
        <ArrivalDialog
          kind="arrival"
          mode="create"
          scheduledIso={arrivalDialogEta}
          departedAtIso={startDT ? startDT.toISOString() : undefined}
          settings={settings}
          onCancel={() => setArrivalDialogEta(null)}
          onConfirm={(actualReturnAt) => saveBooking(actualReturnAt)}
        />
      )}

      {markReturnedFor && (
        <ArrivalDialog
          kind="arrival"
          mode="confirm"
          scheduledIso={markReturnedFor.end_date}
          departedAtIso={markReturnedFor.actual_departure_at ?? markReturnedFor.start_date}
          settings={settings}
          rate={markReturnedRate}
          onCancel={() => setMarkReturnedFor(null)}
          onConfirm={async (actualReturnAt, additionalPayment) => {
            if (!actualReturnAt) return;
            await markBookingReturned(markReturnedFor.id, actualReturnAt, additionalPayment);
            setMarkReturnedFor(null);
            await refresh();
          }}
        />
      )}

      {markDepartedFor && (
        <ArrivalDialog
          kind="departure"
          mode="confirm"
          scheduledIso={markDepartedFor.start_date}
          settings={settings}
          onCancel={() => setMarkDepartedFor(null)}
          onConfirm={async (actualDepartureAt) => {
            if (!actualDepartureAt) return;
            await markBookingDeparted(markDepartedFor.id, actualDepartureAt);
            setMarkDepartedFor(null);
            await refresh();
          }}
        />
      )}

      {editTimesFor && (
        <EditBookingTimesDialog
          booking={editTimesFor}
          settings={settings}
          onCancel={() => setEditTimesFor(null)}
          onSave={async (updates: BookingTimeUpdate) => {
            await updateBookingTimes(editTimesFor.id, updates);
            setEditTimesFor(null);
            await refresh();
          }}
        />
      )}

      {editAgreementFor && (
        <EditAgreementDateDialog
          booking={editAgreementFor}
          settings={settings}
          onCancel={() => setEditAgreementFor(null)}
          onSave={async (agreementExecutedAt: string) => {
            await updateAgreementExecutedAt(editAgreementFor.id, agreementExecutedAt);
            setEditAgreementFor(null);
            await refresh();
          }}
        />
      )}

      {editPaymentEntriesFor && (
        <BookingPaymentEntriesDialog
          booking={editPaymentEntriesFor}
          onClose={() => setEditPaymentEntriesFor(null)}
        />
      )}

      {cancellingFor && (
        <CancelBookingDialog
          booking={cancellingFor}
          busy={cancelBusy}
          onCancel={() => setCancellingFor(null)}
          onConfirm={(reason: CancellationReason, otherDetail?: string) => handleCancel(cancellingFor.id, reason, otherDetail)}
        />
      )}
    </div>
  );
}

// Label for a single action_logs entry's badge/popover line — "updated" is
// the one action with a field diff (see updateBookingTimes); the others are
// bare markers logged by cancelBooking/markBookingReturned/markBookingDeparted
// (see lib/repo/bookings.ts) and just need to say what happened.
function actionLabel(action: ActionLogEntry["action"]): string {
  switch (action) {
    case "cancelled":
      return "Cancelled";
    case "completed":
      return "Marked returned";
    case "departed":
      return "Marked departed";
    case "created":
      return "Recorded";
    case "updated":
    default:
      return "Edited";
  }
}

// Small "<action> [date]" indicator shown once a booking has any logged
// action — time corrections (updateBookingTimes) as before, plus now
// cancelled/completed/departed. Clicking it toggles a popover with the full
// history (each entry's own action and, for edits, before/after values), so
// the record stays visible without cluttering every row that's never needed
// one. Newest entry (by created_at) drives the badge's own label/time.
function EditHistoryBadge({ entries, settings }: { entries: ActionLogEntry[]; settings: AppSettings }) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;
  const latest = entries[0];

  return (
    <div className="relative mt-1 inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-sm"
        style={{ color: "var(--text-muted)", textDecoration: "underline dotted" }}
      >
        {actionLabel(latest.action)} {formatDateTime(latest.created_at, settings)}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 top-full z-20 mt-1 w-72 rounded-md p-3 text-sm normal-case"
            style={{ background: "var(--surface-1)", border: "0.5px solid var(--border-strong)", boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}
          >
            <div className="space-y-2.5">
              {entries.map((entry, i) => (
                <div key={entry.id} className={i === 0 ? undefined : "pt-2.5"} style={i === 0 ? undefined : { borderTop: "0.5px solid var(--border)" }}>
                  <div style={{ color: "var(--text-muted)" }}>
                    {actionLabel(entry.action)} · {formatDateTime(entry.created_at, settings)}
                  </div>
                  {(entry.changes ?? []).map((c, j) => (
                    <div key={j} className="mt-0.5" style={{ color: "var(--text-secondary)" }}>
                      {c.label}: {c.old ? formatDateTime(c.old, settings) : "—"} → {c.new ? formatDateTime(c.new, settings) : "—"}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
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
    // No h-full/min-height here on purpose — this now sits stacked below the
    // Payment fields (not side-by-side with them), so it should only take up
    // as much room as its own one-line message needs, not reserve empty
    // space to match some other column's height.
    return (
      <div
        className="rounded-md p-2.5 text-sm"
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
