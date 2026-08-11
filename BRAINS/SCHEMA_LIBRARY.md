# RACOS Schema Library

Reference doc for cross-checking what's actually in the app against what's actually in the database. Organized per tab/screen — the same table is listed again in full wherever it's used, rather than making you jump around. Local = SQLite (`src/src-tauri/migrations/`), Cloud = Supabase (`supabase/migrations/` + live project `nnsjqnxvpkercbbwvqjj`). Money fields are stored as exact decimal **text**, not numbers, to avoid float rounding.

Last compiled: 2026-08-11 (SES018), cross-checked directly against all local migration files through 0049 (not re-verified against live Supabase schema this pass — see fuel_level_entries/booking_legs Cloud migrations noted below; `destination_geocodes`/`overtime_waived_at` are local-only, ROD026, no Cloud counterpart planned).

---

## Home

**vehicles** (Local) — used for the On rent / Available / Off fleet / Fleet stat cards (counted by `status`).
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| status | text | `available` \| `rented` \| `maintenance` \| `retired` — On rent = rented, Off fleet = maintenance+retired, Fleet = all |

**bookings** (Local) — today's table (overdue / departure-due / returning-today, sorted by priority).
| Column | Type | Notes |
|---|---|---|
| id, vehicle_id, customer_id | text | |
| start_date, end_date | text (ISO) | scheduled ETD/ETA |
| status | text | pending/confirmed/active/completed/cancelled |
| actual_return_at, actual_departure_at | text \| null | drive the overdue/departure-due flags — see Formulas |

**business_profile** (Local) — HQ address subheader line.
| Column | Notes |
|---|---|
| hq_province_id, hq_city_id | resolved against `provinces`/`municipalities` for display |
| contact_number | shown alongside, if set |

**businesses** (Local) — business name header (`getCurrentBusinessName()`).
**auth.users** (Cloud, via Supabase Auth session) — signed-in account email, shown in the subheader line.
**app_settings** (Local) — `dash_label_unit/lessee/etd/eta` control the today-table's column headers only (cosmetic, Home-only).

---

## Rentals (Bookings)

**bookings** (Local) — full table.
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| business_id | text FK → businesses | |
| vehicle_id | text FK → vehicles | |
| customer_id | text FK → customers | |
| start_date | text (ISO) | scheduled ETD |
| end_date | text (ISO) | scheduled ETA — for a multi-leg booking, mirrors the *last* leg's end (`overallEndDT`), not the primary destination's own |
| status | text | pending / confirmed / active / completed / cancelled — **derived**, never set directly (ROD010) |
| destination_province_id | text \| null FK → provinces | primary destination, drives pricing tier |
| destination_city_id | text \| null FK → municipalities | optional, also matches custom rate overrides |
| destination_note | text \| null | per-destination free note (SES017, migration 0043) |
| purpose | text \| null | free-form, display-only, defaults "Service" |
| payment_status | text | `paid` \| `receivable` (SES017, migration 0039) — replaces the old free-text "not yet paid" note |
| payment_amount | text \| null | manually entered by staff, what was actually collected (base) |
| expected_payment | text \| null | system-computed, hidden by default (Settings > Rental toggle) |
| created_by | text \| null FK → profiles | |
| pending_availability_check | integer | local-only, ROD003 offline-hold flag, no server counterpart |
| actual_return_at | text \| null | null = still active/rented, even if past due |
| actual_departure_at | text \| null | null = still pending, even if past scheduled ETD |
| resolved_rate | text \| null | rate locked in at creation time (see Formulas) |
| additional_payment | text \| null | overtime collected, set only via Mark Returned when late (or via Outstanding/Settlements' settle actions, see Formulas — additive/capped, ROD014) |
| overtime_waived_at | text (ISO) \| null | SES018, migration 0048 — set only by the "Final settlement" write-off action (`waiveOvertimeBalance()`); marks overtime fully settled regardless of whether `additional_payment` ever reached the expected amount. Non-null = `isOvertimeUnsettled()` returns false (ROD027) |
| created_at, updated_at | text (ISO) | |

**booking_legs** (Local, SES017 migration 0042) — chained additional stops after the primary destination, for a multi-destination booking. Only ever created alongside the booking itself (`createBooking`) — no add/edit/remove path for an already-saved booking yet.
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| business_id, booking_id | text FK/FK | |
| sequence | integer | ordering; the primary destination is on `bookings` itself, not a row here |
| destination_province_id, destination_city_id | text FK/FK | each leg's own destination |
| start_at, end_at | text (ISO) | this leg's Out/Due-back — continuous with the one before (a leg's `start_at` is always the previous leg's `end_at`, or the booking's own `end_date` for the first extra leg), enforced by the booking form, not a DB constraint |
| resolved_rate | text \| null | mirrors `bookings.resolved_rate` — this leg's own destination's rate, locked in at creation time |
| note | text \| null | per-leg free note |

**vehicles**, **customers** — referenced for plate number / customer name display only (see their own tabs below for full columns).
**app_settings** — `duration_display`, `show_expected_payment`, `fuelUnit` (bars/liters) affect how this screen describes/reveals duration, expected payment, and the inline fuel entry field.

**New rental** (SES017 full rebuild) — opens as a popup dialog (not an inline form), exitable only via Cancel (confirms first if the form is dirty). A 5-step wizard, strictly Next/Back on first pass through: **Profile** (customer picker or new-customer inline; Contact No./Address always editable, bidirectionally writes back to the `customers` row — see Customers section above) → **Vehicle** (vehicle picker + optional inline Fuel level/Odometer, each capped by the selected vehicle's `fuel_max_level` and written to `fuel_level_entries`/`odometer_readings` at save time, `reading_at` = save time not the rental's own start) → **Destination** (province-then-city, quick-pick chips, primary + chained `booking_legs`) → **Payment** (`payment_status`, amount — **required**, never blank, SES018/ROD030 — Purpose) → **Summary** (read-only recap, the only step with the real Save button). Once a step has been reached in the current session, its tab becomes clickable/accent-colored for jumping straight back (or forward, within reached range) to review — unreached steps stay inert. The "This booking already happened" ArrivalDialog fires only from an actual Save click, never from Next navigation (RC015/RC016, FX015/FX016).

---

## Fleet

**vehicles** (Local) — simplified read-mostly view (Plate / Make-Model / Status / Current Location).
| Column shown | Source column |
|---|---|
| Plate | plate_number |
| Make/Model | make, model |
| Status | status (read-only here — auto-synced from booking lifecycle, ROD010) |
| Current Location | placeholder — no GPS pins wired into the desktop app's read side yet (ROT015 proven but not consumed here) |

Full vehicle admin lives in **Registry > Vehicles**, not here — see below. Clicking a row opens the car-detail popup (spec fields + Activity History, last 10 non-cancelled bookings).

---

## Registry — Vehicles

**vehicles** (Local) — full table.
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| business_id | text FK | |
| plate_number | text | required |
| make, model | text \| null | |
| year | integer \| null | |
| status | text | available/rented/maintenance/retired |
| daily_rate | text \| null | legacy fallback only — no longer collected on the intake form; Rate Matrix owns pricing now |
| seats | integer \| null | required — determines seating band / Rate Matrix row |
| owner_id | text \| null FK → owners | required going forward (ROD011) |
| chassis_number, engine_number | text \| null | optional at intake, editable later |
| gps_device_id, gps_provider, gps_notes | text \| null | ROT015 — gps_device_id is the match key against Supabase `vehicle_locations` |
| fuel | text \| null | **local-only** — dropdown (Gasoline/Diesel/Electric/Hybrid/Other), unioned with any pre-existing custom value so old free-text data is never dropped from the option list (SES017) |
| fuel_capacity | text \| null | **local-only**, free text (e.g. tank size) |
| fuel_max_level | real \| null | **local-only** (SES017, migration 0046) — ceiling for `fuel_level_entries`/booking-wizard fuel readings against this vehicle, read in whatever unit `settings.fuelUnit` currently is; defaults to 6 on every vehicle (migration 0047 backfill + `createVehicle` default), editable **only** from this Registry edit row, never at intake or from either fuel-entry form |
| transmission | text \| null | **local-only** |
| notes | text \| null | **local-only** (SES017, migration 0044) |
| color | text \| null | **local-only** (SES017, migration 0045), e.g. "White" |
| description | text \| null | **local-only** (SES017, migration 0045) — variant/trim, e.g. "1.3 XLE CVT", distinct from `model` ("Vios") |
| car_image | text \| null | **local-only**, base64 data URL, embedded in the row |
| car_image_fit | text | **local-only**, `cover` \| `contain`, default `cover` |
| created_at, updated_at | text (ISO) | |

`owner_id` is a read-only display on this edit row (prevents accidental reassignment, SES017) but stays a normal editable field on the "Register vehicle & owner" intake form, which also mirrors every optional field above (description/color/fuel/fuel_capacity/transmission/notes — not `fuel_max_level`, which is intake-silent and always defaults to 6) under "fill in now or edit later." Every optional-field edit is written to **action_logs** (see below).

---

## Registry — Owners

**owners** (Local) — full table.
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| business_id | text FK | |
| full_name | text | required |
| contact_number | text \| null | optional at intake, editable later |
| address_province_id, address_municipality_id | text \| null FK | structured address (same geo tables as booking destinations) |
| address_line | text \| null | free-text street-level detail |
| login_code | text \| null | ROD018 — Owners' Portal login credential, permanent 8-char code. Null until staff click "Generate login code"; never auto-assigned, never editable once set |
| created_at, updated_at | text (ISO) | |

**owners (Cloud, new as of SES013)** — minimal partial mirror (ROD019), created the moment a login code is first generated for that owner (not via a general sync worker):
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | same id as the local row |
| business_id | uuid FK → businesses | RLS-scoped |
| full_name | text | |
| login_code | text, unique | globally unique across every business — enforced by this constraint, not app logic |
| created_at, updated_at | timestamptz | |
No address/contact fields on Cloud — the portal doesn't need them for login/identity.

Every edit (and creation) is written to **action_logs**:
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| business_id | text FK | |
| entity_type | text | `owner` \| `vehicle` \| `booking` \| `system` (SES015 — business-wide admin actions, not one specific row) |
| entity_id | text | |
| entity_label | text | snapshot (plate/owner name) taken at log time, survives later deletion |
| action | text | `created` \| `updated` \| `completed` \| `cancelled` \| `departed` (booking-only) \| `reset` (SES015 — system-only, Settings > Developer bulk local wipes; see ROD021) |
| changes | text (JSON) \| null | array of `{field, label, old, new}`; null for `created` and the booking-lifecycle actions |
| performed_by | text \| null | |
| created_at | text (ISO) | |

---

## Customers

**customers** (Local) — full table (identical shape, Local and Cloud).
| Column | Type | Notes |
|---|---|---|
| id | text/uuid PK | |
| business_id | FK | |
| full_name | text | required |
| email, phone, license_number | text \| null | |
| address_province_id, address_municipality_id, address_line | text \| null FK/FK/text | structured address (SES017, migration 0038) — `updateCustomerAddress()` |
| created_at, updated_at | text/timestamptz | |

Contact No. and Address are also editable directly from the New rental wizard's Profile step (SES017) — auto-populated from the selected existing customer but always overwritable, or filled inline for a new one; an edit there writes back to this table via `updateCustomerPhone()`/`updateCustomerAddress()` at booking-save time (bidirectional, no separate trip to this tab required).

**Outstanding sub-tab** (SES018, `CustomerOutstandingTab.tsx`) — no new table; a flat, oldest-first list of every booking with an unsettled overtime balance (`isOvertimeUnsettled()`) or a `payment_status = 'receivable'` balance, drawn from the same `bookings`/`vehicles`/`business_profile`/rate-matrix tables as Settlements. "Settle overtime" and "Mark as paid" call the exact same shared logic as Settlements — `lib/overtimeSettlement.ts` (`computeOvertimeSettlement`) and `components/OvertimeSettleForm.tsx`/`WaiveOvertimeButton` — so the two screens can never disagree on what's still owed. Both actions require a `ConfirmDialog` confirmation before writing (SES018).

---

## Rate Matrix

**seating_bands** (Local) — admin-managed capacity categories.
| Column | Notes |
|---|---|
| id, business_id | |
| label | e.g. "3-5 seater" |
| min_seats, max_seats | max_seats null = open-ended (e.g. "12+") |
| sort_order | |
| created_at, updated_at | |

**rate_matrix** (Local) — standard rate card, one row per seating band.
| Column | Notes |
|---|---|
| id, business_id, seating_band_id | |
| rate_tier1 | same province as HQ |
| rate_tier2 | same region, different province |
| rate_tier3 | outside region / interisland |
| created_at, updated_at | |

**custom_rates** (Local) — per-municipality override, highest priority (see Formulas).
| Column | Notes |
|---|---|
| id, business_id | |
| city_id | FK → municipalities |
| seating_band_id | FK → seating_bands |
| rate | |
| created_at, updated_at | |
Unique on (city_id, seating_band_id).

**provinces** (Local, global reference, not business-scoped): `id`, `name`, `region_name`.
**municipalities** (Local, global reference, PSGC-sourced): `id`, `province_id`, `name`.
**business_profile.hq_province_id / hq_city_id** — the tier-computation reference point; whatever's set here is automatically Tier 1.

---

## Settlements — Records

Reads **bookings** (payment_amount, expected_payment, resolved_rate, additional_payment, overtime_waived_at, actual_return_at/actual_departure_at — see Rentals section for full shape) plus **vehicles**, **customers**, **owners** for display, and **rate_matrix/seating_bands/custom_rates/business_profile/provinces** to recompute a rate live for any booking created before `resolved_rate` existed. See Formulas for the payment-correction rule (ROD014) and the partial/final overtime settlement rule (ROD027). "Mark as paid" and Save (payment correction) both go through `ConfirmDialog` before writing (SES018). Shares its settle logic 1:1 with Customers > Outstanding (`overtimeSettlement.ts`).

---

## Settlements — Remittances

Same booking/vehicle/owner/rate-matrix tables as Records, sliced per-owner/per-vehicle into a payout report. Breakdown mode (Bucket vs Recorded split — see Formulas) and the Remittance period filter operate on the same `bookings` columns; nothing new is stored — this is a computed report, not its own table.

**app_settings.show_remittance_summary** — toggles the compact `R[..]/O[..]` line on-screen (always included when printing regardless).

---

## Tools — Car Activity

Reads **bookings** (start_date/end_date/actual_return_at/actual_departure_at/status) filtered to one vehicle at a time, plus **vehicles** for the dropdown. No dedicated table — a computed timeline view.

## Tools — Logs

Reads **action_logs** (full shape above) joined with **bookings** for the booking-history table; owner/vehicle filters join against **owners**/**vehicles**.

---

## Tools — Entries (ROP011, SES016)

A software-side tamper-defense layer alongside GPS (Traccar): odometer readings and manual GPS logging as corroborating signals, submitted independently by staff (admin app, Tools > Entries) and/or the vehicle's owner (Owners' Portal — the portal's first-ever write access, exception to ROD005). The three log tables below are immutable by RLS omission (select+insert policies only, no update/delete anywhere) and share a two-timestamp variance pattern: `reading_at`/period (claimed time, DB-checked to never be future-dated) vs `recorded_at` (system time) — `computeVariance()`/`computeDateVariance()` in `lib/variance.ts` (duplicated in `portal/src/lib/variance.ts`, no shared package between the two apps).

**odometer_readings** (Local + Cloud, same shape).
| Column | Type | Notes |
|---|---|---|
| id | uuid/text PK | |
| business_id, vehicle_id | FK | |
| reading_km | integer | >= 0 |
| reading_at | timestamptz | claimed observation time; check `reading_at <= recorded_at` |
| recorded_at | timestamptz | system time, default now() |
| recorded_by_role | text | `staff` \| `owner` |
| recorded_by_id, recorded_by_label | uuid/text, text | label is a name snapshot at write time |
| note | text \| null | |

**fuel_level_entries** (Local + Cloud, SES017 migration 0040) — same append-only/two-timestamp shape as odometer_readings above.
| Column | Type | Notes |
|---|---|---|
| id, business_id, vehicle_id | | |
| level | real | not capped at the DB level — capped in the UI against the vehicle's `fuel_max_level` (Registry — Vehicles) |
| unit | text | `bars` \| `liters`, **snapshotted per row** at write time (not read live off `settings.fuelUnit` at display time), so a later Settings change never misreads an old entry |
| reading_at, recorded_at, recorded_by_role/id/label, note | same shape as odometer_readings | |

Written from two places: Tools > Entries' own Fuel Level tab (`FuelLevelTab.tsx`), and optionally/inline from the New rental wizard's Vehicle step at booking-save time (`reading_at` = save time, not the rental's own start).

**gps_location_entries** (Local + Cloud) — point-in-time "vehicle was here."
| Column | Type | Notes |
|---|---|---|
| id, business_id, vehicle_id | | |
| location_text | text, required | free text, or a `"lat, lng"` string when written by Record through MAP |
| latitude, longitude | double precision \| null | set together or not at all (paired CHECK); populated by Record through MAP, null for plain manual entries |
| duration_minutes | integer \| null | optional "parked for" |
| reading_at, recorded_at, recorded_by_role/id/label, note | same shape as odometer_readings | |

**mileage_entries** (Local + Cloud) — a period-based figure (hand-copied from Traccar for now, no automatic ingestion yet).
| Column | Type | Notes |
|---|---|---|
| id, business_id, vehicle_id | | |
| mileage_km | integer | >= 0 |
| period_start, period_end | date | daily by default (equal dates), rangeable per row; check `period_end >= period_start` and `period_end <= recorded_at::date` |
| recorded_at, recorded_by_role/id/label, note | same shape | |

**gps_location_labels** (Local + Cloud) — reverse-geocoded ("Convert to location") display cache, deliberately NOT append-only.
| Column | Type | Notes |
|---|---|---|
| entry_id | uuid/text PK, FK → gps_location_entries | 1:1, on delete cascade |
| business_id | FK | |
| formatted_address | text | Nominatim's `display_name` — a friendly label only, not matched into the provinces/municipalities PSGC tables |
| raw_response | jsonb \| null | full Nominatim response, kept for reference |
| resolved_at | timestamptz | re-resolving overwrites in place (`on conflict(entry_id) do update`) |

**RLS** (odometer_readings/gps_location_entries/mileage_entries, identical shape on all three): staff select+insert scoped to `business_id = current_business_id()`, `recorded_by_role='staff'`, `recorded_by_id = auth.uid()`; owner select+insert scoped to `business_id = current_owner_business_id()` and `vehicle_id in (select id from vehicles where owner_id = current_owner_id())`, `recorded_by_role='owner'`. No update/delete policy exists on any of these three — that omission, not app code, is what makes a saved entry immutable. `gps_location_labels` is the one exception: staff get full CRUD (`for all`), since it's a display cache, not an audit record; owners get select-only via the same vehicle-ownership join.

**Odometer Log tab** — form + list per vehicle; every save (all three log types, all screens) goes through a `ConfirmDialog` before it's written.
**GPS Log tab** — Locations and Mileage sub-subtabs. Locations has a manual form plus **Record through MAP** (Leaflet click-to-drop numbered pins, held only as an in-memory draft until one Finalize batch-submits — `createGpsLocationEntriesBatch()` in `gpsLocationEntries.ts`, sequential single-row inserts since there's no real DB transaction available, partial-failure-aware) and **Convert to location** (on-demand Nominatim reverse geocode, admin-only, requires connectivity — `isConnectivityError()` in `lib/network.ts` gives a clear offline message instead of a raw fetch error). Clicking a coordinate in either the saved-entries list or a draft trail opens **MiniMapModal** (`components/MiniMapModal.tsx`) — an in-place map popup, not a tab jump, so the current screen/filters/scroll position aren't disturbed.
**Reports tab** — per-vehicle stats, a mileage cross-check (`buildSegments()` in `EntriesReportsTab.tsx`: flags "Odometer decreased" or a mismatch beyond `max(30km, 20%)` between the odometer delta and any overlapping `mileage_entries`), and a combined odometer/location/mileage timeline showing each entry's variance; location rows with coordinates are also clickable into MiniMapModal.

Owners' Portal (`portal/src/components/EntriesTab.tsx`) mirrors Odometer Log / GPS Log (Locations + Mileage) with the same ConfirmDialog-before-save pattern — no Record through MAP, Convert to location, lat/lng exposure, or map view on that side (admin-only, ROD023).

---

## Map

**vehicles** — dropdown, defaults to "All Vehicles" (no live pins — see `vehicle_locations` below).
**vehicle_locations** (**Cloud only** — not read by the desktop app's UI yet, despite existing and being populated by the live GPS pipeline):
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| business_id | uuid FK → businesses | RLS-scoped |
| vehicle_id | uuid FK → vehicles | matched via `vehicles.gps_device_id` upstream |
| latitude, longitude | float8 | |
| speed_kph, course | numeric \| null | |
| fix_time | timestamptz | when the GPS fix was taken |
| server_time | timestamptz | when gps-ingest received it |
| raw | jsonb \| null | catch-all for unnormalized fields |
| created_at | timestamptz | |
RLS: select-only via `business_id = current_business_id()` — no insert/update/delete for authenticated users; only the `gps-ingest` Edge Function (service key) writes here.

**gps_location_entries + gps_location_labels** (ROP011, SES016) — selecting one specific vehicle plots that vehicle's logged location history (see Tools > Entries above) as a numbered trail: markers + connecting polyline, sorted chronologically, popup per pin (time/location/logged by/parked duration), optional From/To date filter (defaults to full history). This is the manual/self-reported signal, entirely separate from `vehicle_locations`' live GPS feed above.

**destination_geocodes** (Local, SES018, migration 0049) — forward-geocode cache, PK `(business_id, location_key)` where `location_key` = `buildLocationKey(province_id, municipality_id)`. Local-only, never synced to Cloud (ROD026).
| Column | Type | Notes |
|---|---|---|
| business_id, location_key | text PK/PK | |
| province_id, municipality_id | text FK/FK \| null | |
| display_name | text | Nominatim's resolved label |
| latitude, longitude | real | |
| raw_response | text \| null | full Nominatim JSON, kept for debugging |
| resolved_at | text (ISO) | |

**Destination history** (Map toggle, SES018) — plots one purple teardrop pin per unique realized (active/completed) booking destination, sized/labelled by visit count; resolved lazily via `resolveDestinationGeocodes()` (paced ~1.1s/request against Nominatim, `countrycodes=ph`, progress UI while resolving). `lib/destinationHistory.ts` (`buildDestinationHistory`) does the aggregation, optionally scoped to one vehicle.

**HQ pin** (Map, SES018) — a permanent gold-star marker (always visible, independent of the Destination-history toggle) at `business_profile.hq_province_id/hq_city_id`'s geocoded location, resolved through the same `destination_geocodes` cache (ROD029, no separate precise-pin mechanism). `lib/hqDistance.ts` (`computeHqDisplacement`) appends a "N km from HQ (Tier X)" line to destination-history and booking-target popups, using `haversineKm` (`lib/geo.ts`) + the existing `computeTier` (Rate Matrix).

**Compare booking vs GPS Log** (Map dropdown, SES018) — pick one of the selected vehicle's bookings to see an orange bullseye pin at its (on-demand geocoded) destination plus green-circled highlights around GPS Log points that fall inside that booking's actual window; backed by `lib/bookingGpsCorroboration.ts` (see Formulas, ROD028).

---

## Analytics (SES018)

No new tables — a read-only, per-vehicle computed view (vehicle picker + date range) over data that already exists elsewhere.

**Summary/Revenue/Utilization/Overtime** (`lib/vehicleAnalytics.ts`, `buildVehicleAnalytics`) — reads **bookings** (payment_amount, expected_payment, additional_payment, overtime_waived_at, actual timestamps) filtered to the selected vehicle + date range: booking/realized-booking counts, total collected/expected, outstanding overtime/receivable, avg revenue per booking, total/avg rented hours, overtime rate + unsettled count, revenue and booking counts bucketed by month. Charted via the new hand-rolled `components/MiniChart.tsx` (`MiniLineChart`/`MiniBarChart`/`EmptyChart` — SVG, no charting-library dependency, same precedent as Tools > Car Activity's Gantt chart).

**Top destinations & distance from HQ** — reads **destination_geocodes** (resolved lazily the same as Map's Destination history) + `lib/hqDistance.ts` (`computeHqDisplacement`): per-destination booking count, distance from HQ (haversine), and Tier; plus avg/farthest summary stats.

**GPS corroboration** — reads **gps_location_entries**/**gps_location_labels** for the selected vehicle, runs every filtered booking through `lib/bookingGpsCorroboration.ts` (`buildBookingCorroboration`/`summarizeCorroboration`, see Formulas/ROD028): an aggregate unverified/corroborated/possible-mismatch summary plus a flagged-bookings list.

**GPS trail — distance & speed** — reads **gps_location_entries** for the selected vehicle/date range, `lib/gpsTrailMetrics.ts` (`buildTrailMetrics`, see Formulas): total/per-segment distance, avg/max speed, moving time — shown alongside the logged **mileage_entries** total for a side-by-side comparison (no automatic reconciliation between the two yet).

**Mileage log / Odometer readings** — reads **mileage_entries** / **odometer_readings** directly (same tables as Tools > Entries), charted by date.

---

## Settings

**businesses** — `name` (Business name field), edited via `setCurrentBusinessName`.
**business_profile** — `hq_province_id`, `hq_city_id` (one-time-feeling setup, re-editable via "Change"), `contact_number` (optional, freely editable).
**app_settings** (Local, single row, device-level, never synced) — full column list:
| Column | AppSettings field | Notes |
|---|---|---|
| date_format | dateFormat | MDY / DMY / ISO |
| time_format | timeFormat | 12h / 24h |
| duration_display | durationDisplay | nights / hours / halfDays / daysNights — display only, never affects pricing |
| show_expected_payment | showExpectedPayment | 0/1 |
| dash_label_unit/lessee/etd/eta | dashLabelUnit/Lessee/Etd/Eta | 0/1 each, Home-only cosmetic labels |
| show_remittance_summary | showRemittanceSummary | 0/1 |
| auto_mark_departed | autoMarkDeparted | 0/1, default 1 |
| show_luzon/visayas/mindanao | showLuzon/Visayas/Mindanao | 0/1 each, default 1, at least one must stay on (UI-enforced) |

**Account section (new, ROT007):** signed-in email (from Supabase Auth session, not stored locally as its own field) + Sign Out button.
**Location Visibility, Clear stale test data** — Location Visibility acts on provinces/municipalities visibility as described elsewhere. Clear stale test data (`clearStaleBusinessData()` in `factoryReset.ts` — file name predates SES015's removal of `factoryReset()` itself) only ever clears local vehicles/customers/bookings/payments rows tied to a business_id OTHER than the current one (cross-business leftovers, never this business's own data); local-only, never pushes a delete to Cloud, always logs a `system`/`reset` entry to `action_logs` (ROD021). Factory reset AND Reset test data were both removed SES015 — bulk-wiping a business's own real history undermines RACOS's transparency guarantees even when scoped to local data with an audit entry; sign-out + fresh business signup is now the only "start clean" path.

---

## Shared / cross-tab reference tables

| Table | Scope | Used by |
|---|---|---|
| provinces | Local, global | Rate Matrix, booking destination, owner address, HQ |
| municipalities | Local, global | same as above, finer-grained |
| outbox | Local, device | every write to vehicles/customers/bookings/payments/owners queues here; feeds the "N pending sync" badge. **Not scoped by business_id** — see caveat below. |
| sync_state | Local, one row per business | `last_synced_at`, `offline_since` — feeds the ROD004 free-tier threshold (5 days offline OR 50 unsynced records) |
| session_cache | Local, single row, device | ROT007 — cached `business_id`/`profile_id`/`email` so the app can boot offline after at least one real online sign-in |

**Caveat:** `outbox` has no `business_id` column. If you ever sign into a different business on the same device (logout/switch, per SES012's discussion), the pending-sync count mixes both businesses' unsynced writes together.

---

## Supabase (Cloud) schema — authoritative, live-checked

All tables RLS-enabled, scoped by `business_id = current_business_id()` except where noted.

**businesses**: id (uuid PK), name, owner_id (uuid → auth.users), plan (trial/free/paid), trial_ends_at, created_at, updated_at.
**profiles**: id (uuid PK → auth.users), business_id, role (owner/manager/staff), full_name, created_at, updated_at.
**vehicles**: id, business_id, plate_number, make, model, year, status, daily_rate, gps_device_id, gps_provider, gps_notes, created_at, updated_at, **seats, owner_id (uuid → owners, on delete set null), chassis_number, engine_number** (added SES015, ROP009 migration). *(Still narrower than local — fuel/fuel_capacity/transmission/car_image/car_image_fit stay local-only by design, ROD019.)*
**customers**: id, business_id, full_name, email, phone, license_number, created_at, updated_at. *(Full mirror — matches local exactly.)*
**bookings**: id, business_id, vehicle_id, customer_id, start_date, end_date, status, total_price, created_by, created_at, updated_at, **destination_label, purpose, payment_amount, expected_payment, resolved_rate, additional_payment, actual_return_at, actual_departure_at** (added SES015, ROP009 migration). `destination_label` is a denormalized text string (e.g. "Bacoor City, Cavite") resolved by the sync worker from the local provinces/municipalities tables at push time — Cloud has no geo reference tables to FK against. `total_price` stays frozen/dormant (its original ROT002 shape, unused by the app — see Dormant tables below); the new money columns are text (project-wide exact-decimal convention) rather than matching total_price's numeric type.
**payments**: id, business_id, booking_id, amount, method, status, paid_at, created_at. *(See "Dormant tables" below.)*
**vehicle_locations**: see Map section above.
**owners**: id, business_id, full_name, login_code (unique), created_at, updated_at — see Registry > Owners section above for full detail. A bare `{id, business_id, full_name}` row is now also auto-created by the sync worker (SES015) the first time it needs to push a vehicle with an `owner_id`, if login-code generation hasn't created one already — never touches `login_code`.
**odometer_readings / gps_location_entries / mileage_entries / gps_location_labels** (ROP011, SES016): see Tools > Entries section above for full column/RLS detail — append-only via RLS omission (no update/delete policy on the first three), `gps_location_entries` carries nullable paired `latitude`/`longitude`, `gps_location_labels` is the one upsertable (non-append-only) table in the set.

**Owner JWT claim helpers (SES015, ROP009 migration)**: `current_owner_id()` / `current_owner_business_id()` — plain SQL functions reading `auth.jwt() ->> 'owner_id'` / `'business_id'` (the custom claims `owner-login` mints, ROD020), fixed `search_path`, granted to `authenticated` only. Mirror `current_business_id()`'s role but for owner sessions, which have no `profiles` row to resolve through.

**Owner-scoped RLS (SES015, additive alongside the existing staff `..._all` policies — Postgres OR-combines permissive policies per command, so a staff session and an owner session each match only their own)**:
- `owner_read_own_vehicles` on `vehicles`, select-only: `owner_id = current_owner_id() and business_id = current_owner_business_id()`.
- `owner_read_own_bookings` on `bookings`, select-only: `business_id = current_owner_business_id() and vehicle_id in (select id from vehicles where owner_id = current_owner_id())`.
- No policy on `customers` — the Owners' Portal never reads renter identity (privacy default, not yet a formal RACOS.md decision).
- (ROP011, SES016) `*_owner_select` + `*_owner_insert` on `odometer_readings`/`gps_location_entries`/`mileage_entries`, and `gps_location_labels_owner_select` — the portal's first-ever WRITE grant, not just read (see Tools > Entries above); all still gated through the same `vehicle_id in (select id from vehicles where owner_id = current_owner_id())` ownership join.

---

## Owners' Portal (ROT020) — data screens

Next.js app at `/RACOS/portal`. `lib/ownerData.ts` is the one place that queries Supabase — every call goes through `createOwnerClient(token)` (the owner's session JWT as bearer), so RLS above is what actually scopes results; the queries themselves never filter by owner.

- **Vehicle status tab** — `vehicles` (plate/make/model/year/seats/status), owner-scoped by RLS.
- **Activity log tab** — `bookings` joined to `vehicles(plate_number, make, model)`, ordered by `start_date desc`. Shows dates/destination/purpose/status only, never the customer.
- **Financials tab** — same `bookings` rows, summed client-side (`summarizeFinancials()`): `payment_amount + additional_payment` = Collected, `expected_payment` = Expected, both overall and per-vehicle. Cancelled bookings excluded from sums.
- **Entries tab** (ROP011, SES016) — the portal's first-ever write access (exception to ROD005): Odometer Log and GPS Log (Locations + Mileage) sub-subtabs, same tables/RLS/ConfirmDialog pattern as the admin side's Tools > Entries — see that section above for full column/RLS detail. `lib/ownerData.ts` gained `fetchOwnerOdometerReadings`/`fetchOwnerGpsLocationEntries`/`fetchOwnerMileageEntries` + matching `createOwner*` writers, all via `createOwnerClient(token)`.

---

## Dormant / unused tables

**payments** — exists on both Local and Cloud (from the original ROT002/ROT003 mirror), but has no repo file, no screen reads or writes it. The app tracks payment via `bookings.payment_amount` / `expected_payment` / `additional_payment` / `resolved_rate` instead. Worth deciding whether to formally repurpose or drop this table before it's ever synced for real. The sync worker (SES015) maps it 1:1 for completeness but nothing ever queues an outbox entry for it.

**bookings.total_price (Cloud)** — frozen at its original ROT002 shape (see above); the sync worker never writes to it, `payment_amount`/`expected_payment`/etc. are the real figures going forward.

**businesses / profiles (Cloud)** — still just the real test account rows from SES012; the outbound sync worker (SES015, ROP009) only pushes vehicles/customers/bookings/owners, not businesses/profiles (those are written directly at signup/auth time, see lib/auth.ts).

---

## Formulas

**Pricing (ROD009)** — `lib/pricing.ts` / `lib/duration.ts`:
```
exactHours = round_to_nearest_minute(end - start) in hours
expected_payment = ceil( (rate / 24) * exactHours / 50 ) * 50
```
No half-day/nightly rounding is ever applied to billing — half-day/nights/days-nights displays (`duration_display`) are cosmetic only.

**Rate resolution priority** (`resolveRate`):
1. Custom rate — exact `(destination_city_id, seating_band)` match in `custom_rates`.
2. Standard Rate Matrix — `(seating_band, tier)` cell in `rate_matrix`, where tier = `computeTier(destination_province, hq_province)`: 1 = same province, 2 = same region, 3 = other.
3. Vehicle's own `daily_rate` — last-resort fallback.

`resolved_rate` locks in whichever rate applied at booking creation time, so later Rate Matrix edits don't retroactively change a past booking's numbers.

**Booking status (ROD010)** — never set directly, always derived:
- `pending` → `actual_departure_at` is null and start hasn't necessarily passed.
- `active` → `actual_departure_at` set, `actual_return_at` still null.
- `completed` → `actual_return_at` set.
- Vehicle `status` (rented/available) auto-syncs with this.

**Overdue / departure-due (Home, Rentals, Tools)**:
```
isOverdueReturn   = status == "active"  AND now > end_date
isDepartureDue    = status == "pending" AND now >= start_date
isReturningToday  = status == "active"  AND not overdue AND same_day(end_date, now)
```

**Remittances — Bucket split mode (ROD012)**: one shared cash bucket per booking (`payment_amount + additional_payment` combined). A time block bills the clean rate-formula amount only if it's genuinely full-length AND the bucket still covers it; otherwise it absorbs whatever's left and every later block in that booking gets 0.

**Remittances — Recorded split mode**: no shared bucket — each block's amount is a proportional slice of the actual recorded base/overtime payments, sliced by actual hours (base hours vs. overtime hours), so no single block can carry another block's shortfall.

**Payment correction (ROD014)**: a recorded `payment_amount`/`additional_payment` can only be corrected upward (never below its previous value), capped at that portion's expected rate-formula amount. `expected_payment` itself is never edited — it's always the fixed basis a correction is checked against.

**Overtime rounding**: overtime hours are rounded to the nearest 30 minutes (`roundToNearestHalfHour`) before billing, to avoid messy non-round peso amounts — the base scheduled duration is never rounded this way.

**Free-tier sync threshold (ROD004, tracked but not yet enforced)**: `sync_state.offline_since`/`last_synced_at` are now kept live by the sync worker (SES015) — `offline_since` is set the moment a push fails on a connectivity error and cleared on the next successful push. Intended trigger is 5 days offline OR 50 unsynced records in `outbox`, whichever comes first; no UI/gating reads this yet.

**Sync cadence (SES015 follow-up)**: automatic (`SyncRunner`, App.tsx) is hourly and silent — runs once on app launch, then every 60 minutes, no user action. Settings > Account also has a manual "Sync now" button for immediacy, calling the identical `runOutboundSync()`; both share a single in-process `syncing` flag (`isSyncRunning()`) so they can never run concurrently — an overlapping manual click while the hourly poll is mid-flight returns `{skipped: true}` instead of double-processing outbox rows, and the button itself polls `isSyncRunning()` to stay disabled for the whole window, not just its own click. Neither path works offline — a manual click while disconnected fails the same way the automatic poll does (marks `sync_state.offline_since`, leaves the batch `failed` for the next attempt).

**One-time backfill (migration 0027, `sync_state.backfilled_at`)**: the outbox only ever gained entries going forward from ROT003 — any local vehicles/customers/owners/bookings row created or last touched before the sync worker existed has no outbox history, so it would otherwise never be pushed. `ensureBackfilled()` runs at the start of every drain, per business, exactly once: queues an `insert` for every local row in those four tables with no existing outbox entry for its id, then sets `backfilled_at` so it never rescans.

**Booking reference**: `RNT-` + first 8 chars of the booking's uuid, uppercased. Computed on the fly everywhere it's shown, never stored.

**Entries variance (ROP011, SES016)** — `lib/variance.ts`:
```
computeVariance(reading_at, recorded_at)     // minute-granularity — odometer_readings, gps_location_entries
computeDateVariance(period_end, recorded_at) // day-granularity — mileage_entries (period-based, not a timestamp)
```
Both return a tone (`live` ~0 gap / `late` negative gap / `future`, DB-blocked but defensively handled) + a label ("Logged same day", "Logged Nd late", etc.) — never blocks a save, just surfaces the gap as visible signal.

**Mileage cross-check (ROP011, SES016, `EntriesReportsTab.buildSegments()`)**: for each consecutive pair of odometer readings on a vehicle, `odometerDeltaKm = toReading.reading_km - fromReading.reading_km`, compared against the sum of any `mileage_entries` whose period overlaps that window. Flagged "Odometer decreased" if the delta is negative; flagged "Mismatch" if `abs(odometerDeltaKm - mileageSum) > max(30, odometerDeltaKm * 0.2)` — whichever is larger of a flat 30km floor or 20% of the delta, since a fixed gap means very different things on a short trip vs. a long one.

**Overtime settlement, partial vs. final (SES018, ROD027, `lib/overtimeSettlement.ts`)**: `computeOvertimeSettlement()` returns `{settled, overtimeHours, overtimeExpected, currentOvertime, amountOwed, waived}` — `settled` is true when either `additional_payment >= overtimeExpected` (fully collected) OR `overtime_waived_at` is non-null (written off). Corrections to `additional_payment` stay additive-only/capped at `overtimeExpected` (ROD014, unchanged) via the normal settle form; the separate `WaiveOvertimeButton` (typed "WRITE OFF" confirmation) is the only path that sets `overtime_waived_at`, marking `settled = true`/`waived = true` without touching the real collected figure. `isOvertimeUnsettled(s) = !s.settled`.

**HQ displacement (SES018, ROD026/ROD029, `lib/hqDistance.ts`)**: `hqLocationKey(profile)` builds the same `location_key` shape as any other `destination_geocodes` row from `hq_province_id`/`hq_city_id` — no separate table. `computeHqDisplacement(hqGeocode, destinationGeocode, hqProvinceId, provinces)` returns `{distanceKm: haversineKm(...), tier: computeTier(destination_province_id, hqProvinceId, provinces)}` — the existing Tier formula (above) unchanged, distance is a new straight-line figure alongside it, not a replacement.

**GPS trail distance & speed (SES018, `lib/gpsTrailMetrics.ts`)**: for each consecutive pair of a vehicle's `gps_location_entries` (sorted by `reading_at`), `distanceKm = haversineKm(from, to)`; `elapsedMinutes = raw timestamp gap`; `movingMinutes = max(0, elapsedMinutes - from.duration_minutes)` (the earlier point's own logged parking time is excluded from travel time — a long gap is understood as a long parking stretch, computed regardless of how large it is, never discarded); `speedKmh = movingMinutes > 0 ? distanceKm / (movingMinutes/60) : null`.

**Booking vs GPS Log corroboration (SES018, ROD028, `lib/bookingGpsCorroboration.ts`)**: window = the booking's actual departure/return timestamps (falls back to scheduled start/end if actuals are null); matches any `gps_location_entries` for the same `vehicle_id` whose `reading_at` falls inside that window; status is `possible_mismatch` if a matched entry's resolved label text doesn't contain the booking's destination name, `corroborated` if at least one match's label does, `unverified` if no GPS entries fall in the window at all. Text-only — no distance/geocoding math in this check, since GPS Log entries carry no `booking_id` to begin with (ROD028).
