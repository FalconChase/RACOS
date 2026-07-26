import Database from "@tauri-apps/plugin-sql";

let dbPromise: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:racos.db");
  }
  return dbPromise;
}

// ---------------------------------------------------------------------------
// DEV-ONLY placeholder tenant. Supabase Auth isn't wired up yet (that's the
// next ROT item), so there's no real signed-in business/profile to scope
// against. Seed one fixed business + owner profile on first run so every
// screen has a business_id to read/write. Delete this file's seed logic
// once auth exists and replace currentBusinessId()/currentProfileId() with
// the real signed-in session.
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

export function currentBusinessId(): string {
  return DEV_BUSINESS_ID;
}

export function currentProfileId(): string {
  return DEV_PROFILE_ID;
}
