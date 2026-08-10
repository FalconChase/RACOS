// Mirrors the local SQLite cache schema (src-tauri/migrations/0001_init_local_cache.sql),
// which in turn mirrors the Supabase schema from ROT002. Money fields are exact decimal
// strings (not numbers) to avoid float-rounding — see ROT003 rationale.

export type VehicleStatus = "available" | "rented" | "maintenance" | "retired";

// How car_image fits its display frame — see Vehicle.car_image_fit below.
export type VehicleImageFit = "cover" | "contain";

export interface Vehicle {
  id: string;
  business_id: string;
  plate_number: string;
  make: string | null;
  model: string | null;
  year: number | null;
  status: VehicleStatus;
  // Fallback rate only — used when a booking has no destination yet, or when
  // seats/destination don't resolve to a Rate Matrix cell. Otherwise pricing
  // comes from the Rate Matrix (seating band x destination tier). No longer
  // collected on the vehicle registration form (rate matrix owns pricing
  // now) — stays null for every vehicle created going forward.
  daily_rate: string | null;
  // Seating capacity — determines which seating band (and therefore which
  // Rate Matrix row) this vehicle prices against. Required by the vehicle
  // form going forward.
  seats: number | null;
  // Which registered owner this vehicle belongs to. Required by the vehicle
  // form going forward (see NewVehicleInput in lib/repo/vehicles.ts) —
  // nullable at the DB level for safe rows created before this existed, same
  // pattern as bookings.destination_province_id.
  owner_id: string | null;
  // Everything below is optional at intake on the Registry form and
  // editable later — any edit is written to action_logs (see lib/repo/actionLog.ts).
  chassis_number: string | null;
  engine_number: string | null;
  gps_device_id: string | null;
  gps_provider: string | null;
  gps_notes: string | null;
  // Local-only detail fields for the Fleet car-detail popup — no Supabase
  // counterpart, never synced (see migration 0021_vehicle_local_details.sql).
  // car_image is a base64 data URL, embedded in the row itself.
  fuel: string | null;
  fuel_capacity: string | null;
  transmission: string | null;
  car_image: string | null;
  // How car_image fits the popup's square frame — "cover" crops to fill,
  // "contain" shrinks to show the whole image, letterboxed if needed. Set
  // alongside car_image on the Registry Vehicles edit form (see migration
  // 0022_vehicle_image_fit.sql). Defaults to "cover" at the DB level.
  car_image_fit: VehicleImageFit;
  created_at: string;
  updated_at: string;
}

// A vehicle owner/investor registered against this business. Every vehicle
// must be tied to one going forward — see Vehicle.owner_id.
export interface Owner {
  id: string;
  business_id: string;
  full_name: string;
  // Address — required by the Registry form going forward, nullable at the
  // DB level for owner rows created before this existed. Structured as
  // province + municipality (the same shared geo reference tables bookings
  // use for destinations) plus a free-text street-level line.
  address_province_id: string | null;
  address_municipality_id: string | null;
  address_line: string | null;
  // Optional at intake, editable later.
  contact_number: string | null;
  // Owners' Portal login credential (ROD018) — permanent 8-char code, null
  // until staff explicitly click "Generate login code" (Registry > Owners).
  // Generating one is what creates this owner's row on Supabase; there's no
  // separate sync step. Read-only in the app once set — never editable.
  login_code: string | null;
  created_at: string;
  updated_at: string;
}

// One entry in the action history (Settings > Action History) — logged for
// every edit made to an owner or vehicle record, for transparency. Creation
// is logged too (with changes: null) so the history shows the full timeline.
// entity_label is a snapshot taken at log time (plate number / owner full
// name) so history still reads sensibly if the record is later deleted.
export interface ActionLogChange {
  field: string;
  label: string;
  old: string | null;
  new: string | null;
}

export interface ActionLogEntry {
  id: string;
  business_id: string;
  // "system" covers business-wide admin actions that aren't about one
  // specific owner/vehicle/booking row — currently just Clear stale test
  // data (Settings > Developer). "Reset test data" and Factory reset were
  // both removed (see BRAINS/RACOS.md ROD021): a tool letting an admin
  // bulk-wipe this business's own real history undermines RACOS's
  // transparency guarantees, even scoped to local data with an audit entry.
  entity_type: "owner" | "vehicle" | "booking" | "system";
  entity_id: string;
  entity_label: string;
  // "completed"/"cancelled"/"departed" are booking-only (cancelBooking,
  // markBookingReturned, markBookingDeparted) — owner/vehicle records only
  // ever produce "created"/"updated". "reset" is system-only (see
  // entity_type above) — a bulk local-data wipe, always logged, never
  // silent, and never pushed to Cloud as a delete (see
  // clearStaleBusinessData — Cloud data a business already synced is
  // untouched by this tool on principle, since it only ever clears rows
  // that never belonged to this business's own Cloud data in the first place).
  action: "created" | "updated" | "completed" | "cancelled" | "departed" | "reset";
  // Stored as JSON text in SQLite; parsed to ActionLogChange[] by the repo
  // layer before reaching the UI. Always null for the booking lifecycle
  // actions above — the action type itself says what happened, same as
  // "created" already does for owner/vehicle.
  changes: ActionLogChange[] | null;
  performed_by: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  business_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  license_number: string | null;
  created_at: string;
  updated_at: string;
}

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "active"
  | "completed"
  | "cancelled";

export interface Booking {
  id: string;
  business_id: string;
  vehicle_id: string;
  customer_id: string;
  start_date: string;
  end_date: string;
  status: BookingStatus;
  // Destination — drives the pricing tier (see provinces table). Required by
  // the booking form going forward, nullable at the DB level for safe rows
  // created before this existed.
  destination_province_id: string | null;
  // Optional finer-grained destination — a specific registered city/municipality
  // within destination_province_id. Also what a custom rate override matches on.
  destination_city_id: string | null;
  // Free-form, display-only reason for the rental (e.g. Service, Events,
  // Vacation). Defaults to "Service" in the booking form. Never drives pricing
  // or any other logic — purely informational.
  purpose: string | null;
  // What staff actually entered as collected/agreed — a plain manual field,
  // not auto-computed. Renamed from total_price.
  payment_amount: string | null;
  // System-computed expected total at booking time — exact elapsed hours x
  // (resolved Rate Matrix rate for the vehicle's seating band and the
  // destination's tier / 24), or the same against vehicle.daily_rate as a
  // fallback, rounded up to the nearest 50. Stored for the future Owners'
  // portal reconciliation. Hidden from the UI by default — only ever shown
  // via Settings > Rental "Display expected payment computation", and NEVER
  // on the Home dashboard regardless of that toggle (UI-layer rule).
  expected_payment: string | null;
  created_by: string | null;
  // Local-only column, no server counterpart. 1 while the offline-created hold
  // still needs a live availability check (ROD003); cleared by the sync engine.
  pending_availability_check: number;
  // Actual arrival/return timestamp — distinct from end_date (the ETA staff
  // entered). Null means the vehicle hasn't been marked back yet: the booking
  // reads as "active" and the vehicle stays "rented" even past its due-back
  // time, so it's still trackable for a time extension. Once set, status
  // becomes "completed" and the vehicle goes back to "available". Set either
  // at booking creation (for a backdated recording) or later via "Mark
  // returned" on an ongoing booking.
  actual_return_at: string | null;
  // Actual departure timestamp — mirrors actual_return_at for the other end
  // of the rental, distinct from start_date (the scheduled ETD). Null means
  // the booking is still "pending" and hasn't been confirmed as departed yet,
  // even once its scheduled ETD has already passed (surfaced as a live
  // "departure due" flag). Set either at booking creation (when the rental had
  // already begun by save time) or later via "Mark departed".
  actual_departure_at: string | null;
  // Per-hour rate resolved (custom rate / Rate Matrix cell / vehicle
  // daily_rate fallback — see resolveRate) at the exact moment this booking
  // was recorded. Same figure already used to compute expected_payment, just
  // persisted on its own too, so Settlements > Records can show a booking's
  // true historical rate even if the Rate Matrix changes later. Null for rows
  // created before this column existed.
  resolved_rate: string | null;
  // What staff collected specifically for overtime, kept separate from
  // payment_amount (the base rental payment). Only ever set via "Mark
  // returned" when the confirmed arrival lands after end_date — null for
  // every on-time/early return.
  additional_payment: string | null;
  created_at: string;
  updated_at: string;
}

// Device-level preference (app_settings table), not tenant data — not synced.
export type DateFormat = "MDY" | "DMY" | "ISO";
export type TimeFormat = "12h" | "24h";
// How rental length is described to staff: nightly, hourly, half-day units,
// or hotel-style "X days Y nights". Purely a display choice — how many nights
// a booking spans (used for the actual price computation) is unaffected.
export type DurationDisplay = "nights" | "hours" | "halfDays" | "daysNights";

export interface AppSettings {
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
  durationDisplay: DurationDisplay;
  showExpectedPayment: boolean;
  // Home dashboard-only cosmetic terminology swaps — display labels, never
  // touching underlying field names or stored data. Each toggles
  // independently; every other screen always keeps the standard wording.
  dashLabelUnit: boolean; // "Vehicle" -> "Unit"
  dashLabelLessee: boolean; // "Customer" -> "Lessee"
  dashLabelEtd: boolean; // "Start"/"Out" -> "ETD"
  dashLabelEta: boolean; // "End"/"Due back" -> "ETA"
  // Settlements > Remittances' compact R[..]/O[..] summary row — off by
  // default on screen (a staff/audit detail), but always included when
  // printing regardless of this setting (see RemittancesReport.tsx).
  showRemittanceSummary: boolean;
  // On by default — a still-"pending" booking gets auto-confirmed as
  // departed (see AutoDepartureRunner) once its scheduled start_date
  // passes, instead of waiting on staff to click Mark departed. Turning
  // this off makes departure confirmation fully manual again.
  autoMarkDeparted: boolean;
  // Which island groups' provinces show up in pickers/reference lists (Rate
  // Matrix, booking destination, owner address, HQ province) — see
  // lib/islandGroups.ts. All on by default; at least one must always stay on
  // (enforced in Settings > Locations, not at the DB level).
  showLuzon: boolean;
  showVisayas: boolean;
  showMindanao: boolean;
}

// --- Rate Matrix: destination-tier x seating-capacity pricing --------------

// Global geographic reference (not business-scoped) — Philippine provinces
// plus NCR. Tier is computed relative to the business's HQ province:
//   1 = same province as HQ, 2 = same region different province, 3 = other.
export interface Province {
  id: string;
  name: string;
  region_name: string;
}

export type Tier = 1 | 2 | 3;

// Tenant data — the business's home base, used as the reference point for
// computing a destination's tier. One row per business. hq_city_id is purely
// a display refinement ("Bacoor City, Cavite" vs just "Cavite") — tier math
// always runs off hq_province_id. Whatever municipality/city (and therefore
// province) is set here is automatically Tier 1 — no separate toggle needed.
export interface BusinessProfile {
  business_id: string;
  hq_province_id: string | null;
  hq_city_id: string | null;
  contact_number: string | null;
  updated_at: string;
}

// Global geographic reference (not business-scoped) — every Philippine
// city/municipality, PSGC-sourced, seeded once via migration (see
// 0007_municipalities.sql). Selectable everywhere without any admin
// pre-registration step, same as provinces.
export interface Municipality {
  id: string;
  province_id: string;
  name: string;
}

// --- ROP011: odometer + manual GPS logs -----------------------------------
// Both tables are append-only — no update/delete anywhere in the app or the
// RLS layer (see supabase/migrations/20260810210000_odometer_gps_manual_entries.sql).
// Either staff or the vehicle's owner can log an entry, independently of the
// other; reading_at is the claimed observation time (staff/owner-picked,
// can't be in the future), recorded_at is the system-generated insert time —
// the gap between them is itself signal (see lib/variance.ts).

export type RecordedByRole = "staff" | "owner";

export interface OdometerReading {
  id: string;
  business_id: string;
  vehicle_id: string;
  reading_km: number;
  reading_at: string;
  recorded_at: string;
  recorded_by_role: RecordedByRole;
  recorded_by_id: string;
  recorded_by_label: string;
  note: string | null;
}

// A self-reported "vehicle was here at this time" pin — point-in-time, same
// reading_at/recorded_at lock rule as OdometerReading.
export interface GpsLocationEntry {
  id: string;
  business_id: string;
  vehicle_id: string;
  location_text: string;
  // Real structured coordinates, kept separate from location_text so a
  // future location-processing feature has clean numeric data to work
  // with. Null for manually typed entries; both set together (never one
  // without the other) for entries recorded through the map trail tool.
  latitude: number | null;
  longitude: number | null;
  duration_minutes: number | null;
  reading_at: string;
  recorded_at: string;
  recorded_by_role: RecordedByRole;
  recorded_by_id: string;
  recorded_by_label: string;
  note: string | null;
}

// "Convert to location" — a reverse-geocoded (Nominatim) display label for
// a GpsLocationEntry that has coordinates. A 1:1 cache keyed by the entry
// it resolves, not another append-only log: gps_location_entries itself
// stays untouched (nothing is ever written back onto it), but this row can
// be re-resolved/overwritten since it's a display convenience, not an
// audit record. Deliberately just a formatted string — not an attempt to
// match into the provinces/municipalities PSGC tables (different naming
// conventions, real fuzzy-matching problem, out of scope for now).
export interface GpsLocationLabel {
  entry_id: string;
  business_id: string;
  formatted_address: string;
  raw_response: unknown | null;
  resolved_at: string;
}

// A mileage figure (hand-copied from Traccar for now — real API auto-sync
// is a later ROT) covering a period rather than an instant. Daily by
// default at the form level (period_start === period_end) but any row can
// span a wider range. period_end can never be later than the date it was
// recorded on — same "can't claim the future" rule as everything else here,
// just at day granularity instead of minute granularity (see
// lib/variance.ts computeDateVariance).
export interface MileageEntry {
  id: string;
  business_id: string;
  vehicle_id: string;
  mileage_km: number;
  period_start: string; // YYYY-MM-DD
  period_end: string; // YYYY-MM-DD
  recorded_at: string;
  recorded_by_role: RecordedByRole;
  recorded_by_id: string;
  recorded_by_label: string;
  note: string | null;
}

// A specific municipality's rate, overriding the standard tier-based
// RateMatrixRow whenever that exact municipality is selected as a booking's
// destination. One row per (municipality, seating band) combination.
export interface CustomRate {
  id: string;
  business_id: string;
  city_id: string;
  seating_band_id: string;
  rate: string;
  created_at: string;
  updated_at: string;
}

// Admin-managed seating capacity category, e.g. "3-5 seater". Extensible —
// staff can add more as their fleet mix grows.
export interface SeatingBand {
  id: string;
  business_id: string;
  label: string;
  min_seats: number;
  max_seats: number | null; // null = open-ended (e.g. "12+ seater")
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// The standard rate card — one row per seating band, with a standard rate for
// each of the 3 destination tiers. Acts as the default/published schedule;
// vehicles fall back to their own daily_rate only when no band/tier match.
export interface RateMatrixRow {
  id: string;
  business_id: string;
  seating_band_id: string;
  rate_tier1: string | null;
  rate_tier2: string | null;
  rate_tier3: string | null;
  created_at: string;
  updated_at: string;
}
