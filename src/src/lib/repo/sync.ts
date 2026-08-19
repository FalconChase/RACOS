// RACOS — ROP009: outbound sync worker. Drains the outbox (ROT003, ROD002)
// in FIFO order and pushes each mutation up to Supabase, so Cloud stops
// being permanently empty (see SCHEMA_LIBRARY.md "Dormant / unused tables" —
// this is the piece that was missing) and ROD004's free-tier threshold has
// real data to evaluate against.
//
// Cloud is a deliberately narrower mirror than Local for vehicles/bookings
// (ROD019) — this module is the one place that knows the exact narrowing:
// local-only fields (fuel/transmission/car_image/etc., destination_*_id FKs
// into the local-only geo tables) never leave the device; bookings push a
// single denormalized destination_label text instead.
//
// Idempotent by design (every push is an upsert on id) — safe to re-run a
// row that partially succeeded before a connectivity drop, and safe
// alongside lib/repo/owners.ts's own direct upsert in generateOwnerLoginCode
// (same table, same onConflict key).

import { getDb, currentBusinessId } from "../db";
import { supabase } from "../supabaseClient";
import type Database from "@tauri-apps/plugin-sql";
import { queueOutbox, type OutboxTable, type OutboxOp } from "./outbox";
import { isConnectivityError } from "../network";

interface OutboxRow {
  id: number;
  entity_table: OutboxTable;
  entity_id: string;
  operation: OutboxOp;
  payload: string | null;
  retry_count: number;
}

export interface SyncResult {
  pushed: number;
  failed: number;
  offline: boolean;
  // True when this call didn't actually run — another sync (the hourly
  // SyncRunner poll, or an overlapping manual click) was already draining
  // the outbox. Never two drains at once: same outbox rows would otherwise
  // get claimed by both ("update ... status = 'syncing'" isn't itself a
  // lock against a second in-process caller), so the singleton `syncing`
  // flag below is what actually prevents the conflict — this field just
  // lets a caller (Settings' "Sync now" button) tell a genuine no-op
  // ("nothing pending") apart from "something else is already syncing,
  // try again in a moment" instead of misreporting the latter as the former.
  skipped: boolean;
}

const BATCH_LIMIT = 25;

// Single-flight guard — SyncRunner polls hourly; if a batch is still in
// flight (slow connection, or the manual "Sync now" button firing mid-poll)
// the caller skips instead of overlapping. This is the actual conflict
// prevention; isSyncRunning() below just exposes it for UI feedback.
let syncing = false;

export function isSyncRunning(): boolean {
  return syncing;
}

export async function runOutboundSync(): Promise<SyncResult> {
  if (syncing) return { pushed: 0, failed: 0, offline: false, skipped: true };
  syncing = true;
  try {
    const result = await drainOutbox();
    return { ...result, skipped: false };
  } finally {
    syncing = false;
  }
}

async function drainOutbox(): Promise<Omit<SyncResult, "skipped">> {
  const db = await getDb();
  await ensureBackfilled(db);

  const rows = await db.select<OutboxRow[]>(
    `select id, entity_table, entity_id, operation, payload, retry_count
       from outbox
      where status in ('pending', 'failed')
      order by id asc
      limit ?`,
    [BATCH_LIMIT],
  );
  if (rows.length === 0) {
    return { pushed: 0, failed: 0, offline: false };
  }

  let pushed = 0;
  let failed = 0;
  let offline = false;

  for (const row of rows) {
    await db.execute("update outbox set status = 'syncing' where id = ?", [row.id]);
    try {
      await pushOne(db, row);
      await db.execute(
        "update outbox set status = 'synced', synced_at = ? where id = ?",
        [new Date().toISOString(), row.id],
      );
      pushed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.execute(
        "update outbox set status = 'failed', retry_count = ?, last_error = ? where id = ?",
        [row.retry_count + 1, message.slice(0, 500), row.id],
      );
      failed++;
      if (isConnectivityError(err)) {
        // The rest of the batch would just fail the same way one timeout at
        // a time — stop here and let the next poll tick retry from scratch.
        offline = true;
        break;
      }
    }
  }

  if (offline) {
    await markOffline(db);
  } else if (pushed > 0) {
    await markOnline(db);
  }

  return { pushed, failed, offline };
}

// ---------------------------------------------------------------------------
// One-time backfill (migration 0027, sync_state.backfilled_at) — the outbox
// only ever gained entries going forward from ROT003; any local row created
// or last touched before the sync worker existed (SES015) has no outbox
// history at all, so drainOutbox() above would otherwise never learn it
// needs pushing. Runs once per business: queues an 'insert' for every local
// row in the synced tables that has no outbox entry of its own yet, then
// marks backfilled_at so it never re-scans on every poll tick.
// ---------------------------------------------------------------------------

const BACKFILL_TABLES: OutboxTable[] = ["vehicles", "customers", "owners", "bookings"];

async function ensureBackfilled(db: Database): Promise<void> {
  const businessId = currentBusinessId();
  const rows = await db.select<{ backfilled_at: string | null }[]>(
    "select backfilled_at from sync_state where business_id = ?",
    [businessId],
  );
  if (rows[0]?.backfilled_at) return;

  for (const table of BACKFILL_TABLES) {
    const localRows = await db.select<Record<string, unknown>[]>(
      `select * from ${table}
        where business_id = ?
          and id not in (select entity_id from outbox where entity_table = ?)`,
      [businessId, table],
    );
    for (const row of localRows) {
      await queueOutbox(db, table, row.id as string, "insert", row);
    }
  }

  const now = new Date().toISOString();
  await db.execute(
    `insert into sync_state (business_id, backfilled_at) values (?, ?)
     on conflict(business_id) do update set backfilled_at = excluded.backfilled_at`,
    [businessId, now],
  );
}

async function pushOne(db: Database, row: OutboxRow): Promise<void> {
  if (row.operation === "delete") {
    const { error } = await supabase.from(row.entity_table).delete().eq("id", row.entity_id);
    if (error) throw new Error(error.message);
    return;
  }

  if (!row.payload) {
    throw new Error(`Outbox row ${row.id} (${row.entity_table}/${row.operation}) has no payload.`);
  }
  const local = JSON.parse(row.payload) as Record<string, unknown>;

  const cloudRow = await mapToCloudShape(db, row.entity_table, local);

  // vehicles.owner_id is a Cloud FK into owners(id) (ROP009 migration), but
  // Cloud owners rows are otherwise only created on demand when a login code
  // is generated (ROD018/ROD019) — most owners never get one. Mirror the
  // bare id/business_id/full_name first so the FK never blocks a vehicle
  // sync just because staff hasn't generated that owner's login code yet.
  // Never touches login_code — a plain upsert only writes the columns given.
  if (row.entity_table === "vehicles" && cloudRow.owner_id) {
    await ensureOwnerMirrored(db, cloudRow.owner_id as string);
  }

  const { error } = await supabase.from(row.entity_table).upsert(cloudRow, { onConflict: CONFLICT_KEY[row.entity_table] });
  if (error) throw new Error(error.message);
}

// Every synced table's Cloud primary key is "id" except
// gps_location_labels, which is keyed by the entry it resolves (a
// re-resolve should overwrite in place, not create a second row — see
// 20260810250000_gps_location_labels.sql).
const CONFLICT_KEY: Record<OutboxTable, string> = {
  vehicles: "id",
  customers: "id",
  bookings: "id",
  payments: "id",
  owners: "id",
  odometer_readings: "id",
  gps_location_entries: "id",
  mileage_entries: "id",
  gps_location_labels: "entry_id",
  fuel_level_entries: "id",
  booking_legs: "id",
  customer_contacts: "id",
  booking_payment_entries: "id",
};

async function ensureOwnerMirrored(db: Database, ownerId: string): Promise<void> {
  const rows = await db.select<{ id: string; business_id: string; full_name: string }[]>(
    "select id, business_id, full_name from owners where id = ?",
    [ownerId],
  );
  const owner = rows[0];
  if (!owner) return; // dangling local id (shouldn't happen) — let the vehicle FK fail loudly instead of guessing

  const { error } = await supabase
    .from("owners")
    .upsert({ id: owner.id, business_id: owner.business_id, full_name: owner.full_name }, { onConflict: "id" });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Local -> Cloud row shaping, one function per synced table. Only the four
// tables outbox.ts's OutboxTable type allows appear here; "payments" is
// dormant (see SCHEMA_LIBRARY.md) but mapped 1:1 for completeness in case it
// is ever written to.
// ---------------------------------------------------------------------------

async function mapToCloudShape(
  db: Database,
  table: OutboxTable,
  local: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  switch (table) {
    case "vehicles":
      return {
        id: local.id,
        business_id: local.business_id,
        plate_number: local.plate_number,
        make: local.make,
        model: local.model,
        year: local.year,
        status: local.status,
        daily_rate: local.daily_rate,
        seats: local.seats,
        owner_id: local.owner_id,
        chassis_number: local.chassis_number,
        engine_number: local.engine_number,
        gps_device_id: local.gps_device_id,
        gps_provider: local.gps_provider,
        gps_notes: local.gps_notes,
        created_at: local.created_at,
        updated_at: local.updated_at,
        // fuel/fuel_capacity/transmission/car_image/car_image_fit/notes/
        // color/description/fuel_max_level stay local-only by design
        // (ROD019) — never pushed.
      };

    case "customers":
      return {
        id: local.id,
        business_id: local.business_id,
        full_name: local.full_name,
        email: local.email,
        phone: local.phone,
        license_number: local.license_number,
        created_at: local.created_at,
        updated_at: local.updated_at,
      };

    case "owners":
      // Matches lib/repo/owners.ts's own upsert shape (generateOwnerLoginCode) —
      // login_code is whatever's on the local row (null until generated).
      return {
        id: local.id,
        business_id: local.business_id,
        full_name: local.full_name,
        login_code: local.login_code ?? null,
        created_at: local.created_at,
        updated_at: local.updated_at,
      };

    case "bookings": {
      const destination_label = await resolveDestinationLabel(
        db,
        local.destination_province_id as string | null,
        local.destination_city_id as string | null,
        local.destination_region_name as string | null,
      );
      return {
        id: local.id,
        business_id: local.business_id,
        vehicle_id: local.vehicle_id,
        customer_id: local.customer_id,
        start_date: local.start_date,
        end_date: local.end_date,
        status: local.status,
        destination_label,
        purpose: local.purpose,
        payment_amount: local.payment_amount,
        expected_payment: local.expected_payment,
        resolved_rate: local.resolved_rate,
        additional_payment: local.additional_payment,
        actual_return_at: local.actual_return_at,
        actual_departure_at: local.actual_departure_at,
        // ROT047 — lets the Owners' Portal tell an advance reservation apart
        // from a same-day one (see agreement_executed_at on the Booking type).
        agreement_executed_at: local.agreement_executed_at,
        created_by: local.created_by,
        created_at: local.created_at,
        updated_at: local.updated_at,
        // total_price is legacy/dormant (frozen at its original ROT002
        // shape) — deliberately left alone, never written by this worker.
      };
    }

    case "payments":
      return local;

    // ROP011 — append-only, so this is the only shape either table's rows
    // ever have; there's no update case to worry about diverging from this.
    case "odometer_readings":
      return {
        id: local.id,
        business_id: local.business_id,
        vehicle_id: local.vehicle_id,
        reading_km: local.reading_km,
        reading_at: local.reading_at,
        recorded_at: local.recorded_at,
        recorded_by_role: local.recorded_by_role,
        recorded_by_id: local.recorded_by_id,
        recorded_by_label: local.recorded_by_label,
        note: local.note,
      };

    case "gps_location_entries":
      return {
        id: local.id,
        business_id: local.business_id,
        vehicle_id: local.vehicle_id,
        location_text: local.location_text,
        latitude: local.latitude,
        longitude: local.longitude,
        duration_minutes: local.duration_minutes,
        reading_at: local.reading_at,
        recorded_at: local.recorded_at,
        recorded_by_role: local.recorded_by_role,
        recorded_by_id: local.recorded_by_id,
        recorded_by_label: local.recorded_by_label,
        note: local.note,
      };

    case "mileage_entries":
      return {
        id: local.id,
        business_id: local.business_id,
        vehicle_id: local.vehicle_id,
        mileage_km: local.mileage_km,
        period_start: local.period_start,
        period_end: local.period_end,
        recorded_at: local.recorded_at,
        recorded_by_role: local.recorded_by_role,
        recorded_by_id: local.recorded_by_id,
        recorded_by_label: local.recorded_by_label,
        note: local.note,
      };

    case "gps_location_labels":
      return {
        entry_id: local.entry_id,
        business_id: local.business_id,
        formatted_address: local.formatted_address,
        raw_response: local.raw_response ? JSON.parse(local.raw_response as string) : null,
        resolved_at: local.resolved_at,
      };

    // ROP011-style — same append-only shape as odometer_readings above.
    case "fuel_level_entries":
      return {
        id: local.id,
        business_id: local.business_id,
        vehicle_id: local.vehicle_id,
        level: local.level,
        unit: local.unit,
        reading_at: local.reading_at,
        recorded_at: local.recorded_at,
        recorded_by_role: local.recorded_by_role,
        recorded_by_id: local.recorded_by_id,
        recorded_by_label: local.recorded_by_label,
        note: local.note,
      };

    case "booking_legs":
      return {
        id: local.id,
        business_id: local.business_id,
        booking_id: local.booking_id,
        sequence: local.sequence,
        destination_province_id: local.destination_province_id,
        destination_city_id: local.destination_city_id,
        note: local.note,
        start_at: local.start_at,
        end_at: local.end_at,
        resolved_rate: local.resolved_rate,
        created_at: local.created_at,
      };

    case "customer_contacts":
      return {
        id: local.id,
        business_id: local.business_id,
        customer_id: local.customer_id,
        type: local.type,
        label: local.label,
        value: local.value,
        created_at: local.created_at,
        updated_at: local.updated_at,
      };

    case "booking_payment_entries":
      return {
        id: local.id,
        business_id: local.business_id,
        booking_id: local.booking_id,
        type: local.type,
        amount: local.amount,
        note: local.note,
        created_at: local.created_at,
        updated_at: local.updated_at,
      };
  }
}

async function resolveDestinationLabel(
  db: Database,
  provinceId: string | null | undefined,
  cityId: string | null | undefined,
  // ROT052 — a region-level pick has no provinceId at all; fall back to the
  // plain region name so the Owners' Portal Activity log still shows
  // something meaningful instead of a blank destination.
  regionName?: string | null,
): Promise<string | null> {
  if (!provinceId) return regionName ? `${regionName} (region)` : null;
  const provinceRows = await db.select<{ name: string }[]>(
    "select name from provinces where id = ?",
    [provinceId],
  );
  const provinceName = provinceRows[0]?.name ?? null;

  if (cityId) {
    const cityRows = await db.select<{ name: string }[]>(
      "select name from municipalities where id = ?",
      [cityId],
    );
    const cityName = cityRows[0]?.name ?? null;
    if (cityName) return provinceName ? `${cityName}, ${provinceName}` : cityName;
  }
  return provinceName;
}

// ---------------------------------------------------------------------------
// sync_state (ROD004 threshold tracking)
// ---------------------------------------------------------------------------

async function markOnline(db: Database): Promise<void> {
  const businessId = currentBusinessId();
  const now = new Date().toISOString();
  await db.execute(
    `insert into sync_state (business_id, last_synced_at, offline_since)
     values (?, ?, null)
     on conflict(business_id) do update set last_synced_at = excluded.last_synced_at, offline_since = null`,
    [businessId, now],
  );
}

async function markOffline(db: Database): Promise<void> {
  const businessId = currentBusinessId();
  const now = new Date().toISOString();
  await db.execute(
    `insert into sync_state (business_id, offline_since)
     values (?, ?)
     on conflict(business_id) do update set
       offline_since = coalesce(sync_state.offline_since, excluded.offline_since)`,
    [businessId, now],
  );
}

