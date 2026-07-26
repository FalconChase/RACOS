import { getDb, currentBusinessId } from "../db";
import type { BusinessProfile, Municipality, Province } from "../types";

// Global reference list — same for every business, not scoped by business_id.
export async function listProvinces(): Promise<Province[]> {
  const db = await getDb();
  return db.select<Province[]>("select * from provinces order by name");
}

// Global reference list, PSGC-sourced — every Philippine city/municipality,
// seeded once via migration. Selectable everywhere, no admin registration
// step required (unlike the old business-scoped `cities` table it replaced).
export async function listMunicipalities(provinceId?: string): Promise<Municipality[]> {
  const db = await getDb();
  if (provinceId) {
    return db.select<Municipality[]>(
      "select * from municipalities where province_id = ? order by name",
      [provinceId],
    );
  }
  return db.select<Municipality[]>("select * from municipalities order by name");
}

export async function getBusinessProfile(): Promise<BusinessProfile | null> {
  const db = await getDb();
  const rows = await db.select<BusinessProfile[]>(
    "select * from business_profile where business_id = ?",
    [currentBusinessId()],
  );
  return rows[0] ?? null;
}

// Upsert — business_profile starts out with no row at all until HQ is set.
// Changing the province clears hq_city_id, since a previously-picked city
// belongs to whatever the old province was.
export async function setHqProvince(hqProvinceId: string): Promise<BusinessProfile> {
  const db = await getDb();
  const business_id = currentBusinessId();
  const now = new Date().toISOString();
  await db.execute(
    `insert into business_profile (business_id, hq_province_id, hq_city_id, updated_at)
     values (?, ?, null, ?)
     on conflict(business_id) do update set hq_province_id = excluded.hq_province_id, hq_city_id = null, updated_at = excluded.updated_at`,
    [business_id, hqProvinceId, now],
  );
  return { business_id, hq_province_id: hqProvinceId, hq_city_id: null, updated_at: now };
}

// Display-only refinement — assumes setHqProvince has already been called at
// least once (a business_profile row exists) since a city can't be chosen
// before its province is.
export async function setHqCity(hqCityId: string | null): Promise<BusinessProfile> {
  const db = await getDb();
  const business_id = currentBusinessId();
  const now = new Date().toISOString();
  await db.execute("update business_profile set hq_city_id = ?, updated_at = ? where business_id = ?", [
    hqCityId,
    now,
    business_id,
  ]);
  const rows = await db.select<BusinessProfile[]>("select * from business_profile where business_id = ?", [
    business_id,
  ]);
  if (!rows[0]) throw new Error("setHqCity called before an HQ province was set");
  return rows[0];
}

