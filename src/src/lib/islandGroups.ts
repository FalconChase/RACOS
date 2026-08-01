import type { AppSettings, Province } from "./types";

export type IslandGroup = "Luzon" | "Visayas" | "Mindanao";

// Maps every provinces.region_name value seeded by
// 0005_locations_and_rate_matrix.sql to its island group, per standard PH
// convention — NIR (Negros Island Region) reads as Visayas and MIMAROPA as
// Luzon, even though both are island provinces in their own right.
const REGION_TO_ISLAND_GROUP: Record<string, IslandGroup> = {
  NCR: "Luzon",
  CAR: "Luzon",
  "Region I (Ilocos Region)": "Luzon",
  "Region II (Cagayan Valley)": "Luzon",
  "Region III (Central Luzon)": "Luzon",
  "Region IV-A (CALABARZON)": "Luzon",
  MIMAROPA: "Luzon",
  "Region V (Bicol Region)": "Luzon",
  "Region VI (Western Visayas)": "Visayas",
  "NIR (Negros Island Region)": "Visayas",
  "Region VII (Central Visayas)": "Visayas",
  "Region VIII (Eastern Visayas)": "Visayas",
  "Region IX (Zamboanga Peninsula)": "Mindanao",
  "Region X (Northern Mindanao)": "Mindanao",
  "Region XI (Davao Region)": "Mindanao",
  "Region XII (SOCCSKSARGEN)": "Mindanao",
  "Region XIII (Caraga)": "Mindanao",
  BARMM: "Mindanao",
};

export function islandGroupForRegion(regionName: string): IslandGroup | null {
  return REGION_TO_ISLAND_GROUP[regionName] ?? null;
}

// Whether a province should appear in a picker/reference list right now, per
// Settings > Locations. Only ever applied when *building picker options* —
// never to the raw provinces list itself, since that's also used to resolve
// already-recorded destination/HQ/address IDs back to a label, and a
// province toggled off after the fact must still resolve correctly there.
// Unrecognized region_name values default to visible, so a future region
// never silently vanishes from every picker just because this map lags
// behind.
export function isProvinceVisible(province: Province, settings: AppSettings): boolean {
  const group = islandGroupForRegion(province.region_name);
  if (group === "Luzon") return settings.showLuzon;
  if (group === "Visayas") return settings.showVisayas;
  if (group === "Mindanao") return settings.showMindanao;
  return true;
}
