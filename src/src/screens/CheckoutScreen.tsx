import { useEffect, useState } from "react";
import { getBookingById } from "../lib/repo/bookings";
import { getVehicleById } from "../lib/repo/vehicles";
import { getCustomerById } from "../lib/repo/customers";
import { getBusinessProfile, listMunicipalities, listProvinces } from "../lib/repo/locations";
import { listCustomRates, listRateMatrix, listSeatingBands } from "../lib/repo/rateMatrix";
import { ChevronRightIcon, CheckIcon, FileTextIcon, LockIcon } from "../components/icons";
import { bookingRef } from "../lib/bookingRef";
import { useSettings } from "../lib/settingsContext";
import { formatDateTime } from "../lib/dateFormat";
import { formatDuration, formatHoursMinutes } from "../lib/duration";
import { resolveRate, type ResolvedRate } from "../lib/pricing";
import type { AppSettings, Booking, Customer, Municipality, Province, Vehicle } from "../lib/types";

const STEPS = ["Details", "Contract", "Inspection", "Handover"] as const;

interface CheckoutScreenProps {
  bookingId: string;
  onBack: () => void;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export default function CheckoutScreen({ bookingId, onBack }: CheckoutScreenProps) {
  const { settings } = useSettings();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [destinationProvince, setDestinationProvince] = useState<Province | null>(null);
  const [destinationCity, setDestinationCity] = useState<Municipality | null>(null);
  const [resolvedRate, setResolvedRate] = useState<ResolvedRate | null>(null);
  const [loading, setLoading] = useState(true);
  // Details is treated as already complete — it's whatever was filled in on the
  // Rentals screen. This screen opens on Contract, matching the reference flow.
  const [step, setStep] = useState(1);

  useEffect(() => {
    getBookingById(bookingId).then(async (b) => {
      setBooking(b);
      if (b) {
        const [v, c, provinces, profile, bands, matrix, munis, customRates] = await Promise.all([
          getVehicleById(b.vehicle_id),
          getCustomerById(b.customer_id),
          listProvinces(),
          getBusinessProfile(),
          listSeatingBands(),
          listRateMatrix(),
          listMunicipalities(),
          listCustomRates(),
        ]);
        setVehicle(v);
        setCustomer(c);
        setDestinationProvince(provinces.find((p) => p.id === b.destination_province_id) ?? null);
        setDestinationCity(munis.find((m) => m.id === b.destination_city_id) ?? null);
        if (v) {
          setResolvedRate(
            resolveRate({
              vehicle: v,
              destinationProvinceId: b.destination_province_id,
              destinationCityId: b.destination_city_id,
              hqProvinceId: profile?.hq_province_id ?? null,
              provinces,
              seatingBands: bands,
              rateMatrix: matrix,
              customRates,
            }),
          );
        }
      }
      setLoading(false);
    });
  }, [bookingId]);

  if (loading) {
    return <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>;
  }
  if (!booking || !vehicle || !customer) {
    return <p className="text-sm" style={{ color: "var(--text-danger)" }}>Booking not found.</p>;
  }

  const exactDurationText = formatHoursMinutes(new Date(booking.start_date), new Date(booking.end_date));

  return (
    <div className="rounded-md" style={{ border: "0.5px solid var(--border)", background: "var(--surface-2)" }}>
      {/* Breadcrumb header */}
      <div className="flex items-center gap-3 px-5 py-3.5" style={{ borderBottom: "0.5px solid var(--border)" }}>
        <button onClick={onBack} className="text-base" style={{ color: "var(--text-muted)" }}>
          Rentals
        </button>
        <span style={{ color: "var(--text-muted)" }}>
          <ChevronRightIcon size={16} />
        </span>
        <span className="text-base font-medium" style={{ color: "var(--text-primary)" }}>
          Check-out — {bookingRef(booking.id)}
        </span>
        <span
          className="ml-auto flex items-center gap-2 rounded-md px-3 py-1.5 text-sm"
          style={{ color: "var(--text-success)", background: "var(--bg-success)" }}
        >
          <CheckIcon size={16} />
          Saved locally
        </span>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-0 px-5 py-4" style={{ borderBottom: "0.5px solid var(--border)" }}>
        {STEPS.map((label, i) => {
          const done = i < step;
          const current = i === step;
          return (
            <div key={label} className="flex flex-1 items-center gap-0 last:flex-none">
              <button
                onClick={() => setStep(i)}
                className="flex items-center gap-2 text-base"
                style={{
                  color: done ? "var(--text-success)" : current ? "var(--text-accent)" : "var(--text-muted)",
                  fontWeight: current ? 500 : 400,
                }}
              >
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full text-sm"
                  style={
                    done
                      ? { background: "var(--bg-success)", color: "var(--text-success)" }
                      : current
                      ? { background: "var(--bg-accent)", color: "var(--text-accent)" }
                      : { border: "0.5px solid var(--border-strong)" }
                  }
                >
                  {done ? <CheckIcon size={15} /> : i + 1}
                </span>
                {label}
              </button>
              {i < STEPS.length - 1 && (
                <div className="mx-3 h-px flex-1" style={{ background: "var(--border)" }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Body */}
      <div className="flex">
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-5" style={{ borderRight: "0.5px solid var(--border)" }}>
          {step === 0 && (
            <DetailsStep
              booking={booking}
              customer={customer}
              destinationProvince={destinationProvince}
              destinationCity={destinationCity}
              resolvedRate={resolvedRate}
              exactDurationText={exactDurationText}
              settings={settings}
              onNext={() => setStep(1)}
            />
          )}
          {step === 1 && <ComingSoonStep title="Contract" description="Printing the rental agreement, tracking reprints, and scanning the signed copy back in isn't built yet." onNext={() => setStep(2)} onBack={() => setStep(0)} />}
          {step === 2 && <ComingSoonStep title="Inspection" description="Photo-based vehicle condition capture at check-out isn't built yet." onNext={() => setStep(3)} onBack={() => setStep(1)} />}
          {step === 3 && <ComingSoonStep title="Handover" description="Final handover confirmation isn't built yet." onNext={onBack} onBack={() => setStep(2)} isLast />}
        </div>

        <div className="flex w-[280px] shrink-0 flex-col gap-4 p-4" style={{ background: "var(--surface-1)" }}>
          <div>
            <div className="mb-2 text-sm" style={{ color: "var(--text-secondary)" }}>Vehicle</div>
            <div className="text-base font-medium" style={{ color: "var(--text-primary)" }}>
              {[vehicle.make, vehicle.model].filter(Boolean).join(" ") || vehicle.plate_number}
            </div>
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {vehicle.plate_number}
              {vehicle.year ? ` · ${vehicle.year}` : ""}
            </div>
          </div>

          <div>
            <div className="mb-2.5 text-sm" style={{ color: "var(--text-secondary)" }}>Activity</div>
            <div className="flex flex-col gap-3 text-sm">
              <ActivityRow color="var(--fill-accent)" title="Booking created" meta={formatDateTime(booking.created_at, settings)} />
              <ActivityRow color="var(--fill-accent)" title={`Now at: ${STEPS[step]}`} meta="" last />
            </div>
          </div>

          <div
            className="flex items-center gap-2 pt-3 text-sm"
            style={{ borderTop: "0.5px solid var(--border)", color: "var(--text-secondary)" }}
          >
            <LockIcon size={16} />
            Local only — sync engine not built yet
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailsStep({
  booking,
  customer,
  destinationProvince,
  destinationCity,
  resolvedRate,
  exactDurationText,
  settings,
  onNext,
}: {
  booking: Booking;
  customer: Customer;
  destinationProvince: Province | null;
  destinationCity: Municipality | null;
  resolvedRate: ResolvedRate | null;
  exactDurationText: string;
  settings: AppSettings;
  onNext: () => void;
}) {
  return (
    <>
      <div>
        <div className="mb-2 text-base font-medium" style={{ color: "var(--text-primary)" }}>Renter</div>
        <div className="flex items-center gap-2.5 rounded-md px-3 py-2.5" style={{ background: "var(--surface-1)" }}>
          <div
            className="flex h-11 w-11 items-center justify-center rounded-full text-base font-medium"
            style={{ background: "var(--bg-accent)", color: "var(--text-accent)" }}
          >
            {initials(customer.full_name)}
          </div>
          <div className="flex-1">
            <div className="text-base font-medium" style={{ color: "var(--text-primary)" }}>{customer.full_name}</div>
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {customer.license_number || "No license on file"}
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-base font-medium" style={{ color: "var(--text-primary)" }}>Rental period and rate</div>
        <div className="overflow-hidden rounded-md text-base" style={{ border: "0.5px solid var(--border)" }}>
          <Row label="Destination" value={destinationCity ? `${destinationCity.name}, ${destinationProvince?.name ?? ""}` : destinationProvince?.name ?? "—"} />
          <Row label="Purpose" value={booking.purpose ?? "—"} />
          <Row label="Out" value={formatDateTime(booking.start_date, settings)} />
          <Row label="Due back" value={formatDateTime(booking.end_date, settings)} />
          <Row
            label="Duration"
            value={formatDuration(new Date(booking.start_date), new Date(booking.end_date), settings.durationDisplay)}
          />
          <Row
            label="Rate"
            value={
              resolvedRate
                ? `${exactDurationText} @ ${resolvedRate.rate}/day${
                    resolvedRate.basis === "custom"
                      ? ` (custom rate · ${resolvedRate.band?.label})`
                      : resolvedRate.basis === "matrix"
                      ? ` (Tier ${resolvedRate.tier} · ${resolvedRate.band?.label})`
                      : " (vehicle's own rate)"
                  }`
                : "—"
            }
          />
          {/* Computed expected total — hidden unless staff opted into it in
              Settings > Rental. Never shown on the Home dashboard. */}
          {settings.showExpectedPayment && (
            <Row label="Expected payment" value={booking.expected_payment ?? "—"} />
          )}
          <Row label="Payment" value={booking.payment_amount ?? "—"} last bold />
        </div>
      </div>

      <button
        onClick={onNext}
        className="mt-1 self-start rounded-md px-4 py-2.5 text-base"
        style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
      >
        Continue to contract
      </button>
    </>
  );
}

function ComingSoonStep({
  title,
  description,
  onNext,
  onBack,
  isLast,
}: {
  title: string;
  description: string;
  onNext: () => void;
  onBack: () => void;
  isLast?: boolean;
}) {
  return (
    <>
      <div>
        <div className="mb-2 text-base font-medium" style={{ color: "var(--text-primary)" }}>{title}</div>
        <div
          className="flex flex-col items-start gap-2.5 rounded-md p-4"
          style={{ border: "0.5px dashed var(--border-strong)" }}
        >
          <span style={{ color: "var(--text-muted)" }}>
            <FileTextIcon size={20} />
          </span>
          <p className="text-base" style={{ color: "var(--text-secondary)" }}>{description}</p>
        </div>
      </div>
      <div className="mt-1 flex gap-2">
        <button
          onClick={onNext}
          className="rounded-md px-4 py-2.5 text-base"
          style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
        >
          {isLast ? "Finish and return to Rentals" : "Skip for now"}
        </button>
        <button
          onClick={onBack}
          className="rounded-md px-4 py-2.5 text-base"
          style={{ border: "0.5px solid var(--border-strong)", color: "var(--text-primary)" }}
        >
          Back
        </button>
      </div>
    </>
  );
}

function Row({ label, value, last, bold }: { label: string; value: string; last?: boolean; bold?: boolean }) {
  return (
    <div
      className="flex justify-between px-3 py-2"
      style={{
        borderBottom: last ? undefined : "0.5px solid var(--border)",
        background: bold ? "var(--surface-1)" : undefined,
        fontWeight: bold ? 500 : 400,
      }}
    >
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

function ActivityRow({ color, title, meta, last }: { color: string; title: string; meta: string; last?: boolean }) {
  return (
    <div className="flex gap-2">
      <div className="flex flex-col items-center">
        <span className="mt-1 h-1.5 w-1.5 rounded-full" style={{ background: color }} />
        {!last && <span className="flex-1" style={{ width: "0.5px", background: "var(--border-strong)" }} />}
      </div>
      <div className={last ? "" : "pb-2.5"}>
        <div style={{ color: "var(--text-primary)" }}>{title}</div>
        {meta && <div style={{ color: "var(--text-muted)" }}>{meta}</div>}
      </div>
    </div>
  );
}
