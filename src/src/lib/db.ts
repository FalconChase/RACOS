import Database from "@tauri-apps/plugin-sql";

let dbPromise: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:racos.db");
  }
  return dbPromise;
}

// ---------------------------------------------------------------------------
// DEV-ONLY placeholder tenant. Kept only as an opt-in helper for local
// development without touching Supabase — no longer called by App.tsx as of
// ROT007 (real Supabase Auth wiring). currentBusinessId()/currentProfileId()
// now read the real signed-in session (see setActiveSession() below), set
// once at app bootstrap in lib/auth.ts.
// ---------------------------------------------------------------------------

const DEV_BUSINESS_ID = "00000000-0000-4000-8000-000000000001";
const DEV_OWNER_ID = "00000000-0000-4000-8000-0000000000f1";
const DEV_PROFILE_ID = DEV_OWNER_ID;

export async function ensureDevBusiness(): Promise<void> {
  const db = await getDb();
  const existing = await db.select<{ id: string }[]>(
    "select id from businesses where id = ?",
    [DEV_BUSINESS_ID],
  );
  if (existing.length > 0) return;

  const now = new Date().toISOString();
  await db.execute(
    `insert into businesses (id, name, owner_id, plan, created_at, updated_at)
     values (?, ?, ?, 'trial', ?, ?)`,
    [DEV_BUSINESS_ID, "Dev Rental Co.", DEV_OWNER_ID, now, now],
  );
  await db.execute(
    `insert into profiles (id, business_id, role, full_name, created_at, updated_at)
     values (?, ?, 'owner', ?, ?, ?)`,
    [DEV_PROFILE_ID, DEV_BUSINESS_ID, "Dev Owner", now, now],
  );
}

// ---------------------------------------------------------------------------
// ROT007 — real session state. Set once at bootstrap (lib/auth.ts) after
// resolving the signed-in user's business_id/profile_id, either from
// Supabase (online) or from session_cache (offline restart). Kept as plain
// in-memory module state — deliberately not async — so the ~30 existing
// repo/*.ts call sites that call currentBusinessId()/currentProfileId()
// synchronously inline in SQL params don't all need touching.
// ---------------------------------------------------------------------------

let _businessId: string | null = null;
let _profileId: string | null = null;

export function setActiveSession(businessId: string, profileId: string): void {
  _businessId = businessId;
  _profileId = profileId;
}

export function clearActiveSession(): void {
  _businessId = null;
  _profileId = null;
}

export function hasActiveSession(): boolean {
  return _businessId !== null && _profileId !== null;
}

export function currentBusinessId(): string {
  if (!_businessId) {
    throw new Error("currentBusinessId() called before a session was established — see lib/auth.ts bootstrapSession()");
  }
  return _businessId;
}

export function currentProfileId(): string {
  if (!_profileId) {
    throw new Error("currentProfileId() called before a session was established — see lib/auth.ts bootstrapSession()");
  }
  return _profileId;
}

// Local mirror of the signed-in business + profile (see 0001_init_local_cache.sql —
// vehicles/customers/bookings/payments/profiles all FK-reference the local
// businesses(id) row, so it must exist locally before any of those tables
// can be written to). Upserted every time bootstrapSession() resolves online.
export type RemoteBusiness = {
  id: string;
  name: string;
  owner_id: string;
  plan: string;
  trial_ends_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RemoteProfile = {
  id: string;
  business_id: string;
  role: string;
  full_name: string | null;
  created_at: string;
  updated_at: string;
};

export async function ensureLocalBusinessAndProfile(
  business: RemoteBusiness,
  profile: RemoteProfile,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `insert into businesses (id, name, owner_id, plan, trial_ends_at, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?)
     on conflict (id) do update set
       name = excluded.name, plan = excluded.plan, trial_ends_at = excluded.trial_ends_at,
       updated_at = excluded.updated_at`,
    [business.id, business.name, business.owner_id, business.plan, business.trial_ends_at, business.created_at, business.updated_at],
  );
  await db.execute(
    `insert into profiles (id, business_id, role, full_name, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?)
     on conflict (id) do update set
       role = excluded.role, full_name = excluded.full_name, updated_at = excluded.updated_at`,
    [profile.id, profile.business_id, profile.role, profile.full_name, profile.created_at, profile.updated_at],
  );
}

// One-time cleanup for devices that were used before ROT007: re-parents any
// local rows still tied to the old DEV_BUSINESS_ID placeholder onto the real,
// signed-in business, so pre-auth test data (fleet, rate matrix, bookings,
// etc.) isn't orphaned/hidden once currentBusinessId() starts returning a
// real id. Idempotent — a no-op once nothing references DEV_BUSINESS_ID
// anymore, so it's safe to call on every bootstrap.
const MULTI_ROW_TENANT_TABLES = [
  "vehicles", "customers", "bookings", "payments",
  "owners", "action_logs", "seating_bands", "rate_matrix", "custom_rates",
] as const;

// Singleton-per-business tables — business_id is the primary key, so the
// reassignment is guarded against a real-id row already existing.
const SINGLETON_TENANT_TABLES = ["business_profile", "sync_state"] as const;

export async function reassignLegacyDevData(realBusinessId: string): Promise<void> {
  if (realBusinessId === DEV_BUSINESS_ID) return;
  const db = await getDb();

  const devBusinessExists = await db.select<{ id: string }[]>(
    "select id from businesses where id = ?",
    [DEV_BUSINESS_ID],
  );
  if (devBusinessExists.length === 0) return;

  for (const table of MULTI_ROW_TENANT_TABLES) {
    await db.execute(
      `update ${table} set business_id = ? where business_id = ?`,
      [realBusinessId, DEV_BUSINESS_ID],
    );
  }
  for (const table of SINGLETON_TENANT_TABLES) {
    await db.execute(
      `update ${table} set business_id = ?
       where business_id = ?
         and not exists (select 1 from ${table} where business_id = ?)`,
      [realBusinessId, DEV_BUSINESS_ID, realBusinessId],
    );
  }
}

// session_cache (0024_local_session_cache.sql) — lets a device that signed in
// online at least once resume straight into the app when later launched
// offline, without waiting on/needing a Supabase round-trip.
export async function cacheLocalSession(businessId: string, profileId: string, email: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "update session_cache set business_id = ?, profile_id = ?, email = ?, updated_at = ? where id = 1",
    [businessId, profileId, email, new Date().toISOString()],
  );
}

export async function loadCachedSession(): Promise<{ businessId: string; profileId: string; email: string } | null> {
  const db = await getDb();
  const rows = await db.select<{ business_id: string | null; profile_id: string | null; email: string | null }[]>(
    "select business_id, profile_id, email from session_cache where id = 1",
  );
  const row = rows[0];
  if (!row?.business_id || !row?.profile_id) return null;
  return { businessId: row.business_id, profileId: row.profile_id, email: row.email ?? "" };
}

export async function clearCachedSession(): Promise<void> {
  const db = await getDb();
  await db.execute(
    "update session_cache set business_id = null, profile_id = null, email = null, updated_at = ? where id = 1",
    [new Date().toISOString()],
  );
}

// Used for print/report headers (Settlements > Remittances) — the business's
// own display name, not tenant-scoped data from any other table.
export async function getCurrentBusinessName(): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ name: string }[]>(
    "select name from businesses where id = ?",
    [currentBusinessId()],
  );
  return rows[0]?.name ?? null;
}

// Editable from Settings > Business — this is what shows up on printed
// Remittance statements instead of the dev-seed "Dev Rental Co." placeholder.
export async function setCurrentBusinessName(name: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "update businesses set name = ?, updated_at = ? where id = ?",
    [name, new Date().toISOString(), currentBusinessId()],
  );
}
