import { useEffect, useMemo, useState } from "react";
import {
  getBusinessProfile,
  listMunicipalities,
  listProvinces,
} from "../lib/repo/locations";
import {
  createSeatingBand,
  deleteCustomRate,
  deleteSeatingBand,
  listCustomRates,
  listRateMatrix,
  listSeatingBands,
  updateRateMatrixCell,
  upsertCustomRate,
} from "../lib/repo/rateMatrix";
import { computeTier } from "../lib/pricing";
import { useSettings } from "../lib/settingsContext";
import { isProvinceVisible } from "../lib/islandGroups";
import SearchableSelect from "../components/SearchableSelect";
import type {
  BusinessProfile,
  CustomRate,
  Municipality,
  Province,
  RateMatrixRow,
  SeatingBand,
  Tier,
} from "../lib/types";

const inputStyle: React.CSSProperties = {
  border: "0.5px solid var(--border-strong)",
  background: "var(--surface-2)",
  color: "var(--text-primary)",
};

const TIER_LABELS: Record<Tier, string> = {
  1: "Tier 1 — within province",
  2: "Tier 2 — within region",
  3: "Tier 3 — outside region",
};

export default function RateMatrixScreen() {
  const { settings } = useSettings();
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [bands, setBands] = useState<SeatingBand[]>([]);
  const [rows, setRows] = useState<RateMatrixRow[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [customRates, setCustomRates] = useState<CustomRate[]>([]);
  const [loading, setLoading] = useState(true);

  const [newLabel, setNewLabel] = useState("");
  const [newMin, setNewMin] = useState("");
  const [newMax, setNewMax] = useState("");

  const [newRateProvinceId, setNewRateProvinceId] = useState("");
  const [newRateCityId, setNewRateCityId] = useState("");
  const [newRateBandId, setNewRateBandId] = useState("");
  const [newRateValue, setNewRateValue] = useState("");

  async function refresh() {
    setLoading(true);
    const [p, prof, b, r, m, cr] = await Promise.all([
      listProvinces(),
      getBusinessProfile(),
      listSeatingBands(),
      listRateMatrix(),
      listMunicipalities(),
      listCustomRates(),
    ]);
    setProvinces(p);
    setProfile(prof);
    setBands(b);
    setRows(r);
    setMunicipalities(m);
    setCustomRates(cr);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  const provinceOptions = useMemo(
    () =>
      provinces
        .filter((p) => p.id === newRateProvinceId || isProvinceVisible(p, settings))
        .map((p) => ({ value: p.id, label: p.name, sublabel: p.region_name })),
    [provinces, settings, newRateProvinceId],
  );

  const hqProvince = provinces.find((p) => p.id === profile?.hq_province_id);

  const newRateMunicipalityOptions = useMemo(
    () =>
      municipalities
        .filter((m) => m.province_id === newRateProvinceId)
        .map((m) => ({ value: m.id, label: m.name })),
    [municipalities, newRateProvinceId],
  );

  async function handleAddBand(e: React.FormEvent) {
    e.preventDefault();
    const min = Number(newMin);
    if (!newLabel.trim() || !Number.isFinite(min)) return;
    const max = newMax.trim() ? Number(newMax) : undefined;
    await createSeatingBand({ label: newLabel.trim(), min_seats: min, max_seats: max });
    setNewLabel("");
    setNewMin("");
    setNewMax("");
    await refresh();
  }

  async function handleDeleteBand(id: string) {
    await deleteSeatingBand(id);
    await refresh();
  }

  function rateFor(bandId: string, tier: Tier): string {
    const row = rows.find((r) => r.seating_band_id === bandId);
    if (!row) return "";
    return (tier === 1 ? row.rate_tier1 : tier === 2 ? row.rate_tier2 : row.rate_tier3) ?? "";
  }

  async function handleRateChange(bandId: string, tier: Tier, value: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.seating_band_id === bandId
          ? { ...r, [tier === 1 ? "rate_tier1" : tier === 2 ? "rate_tier2" : "rate_tier3"]: value }
          : r,
      ),
    );
    await updateRateMatrixCell(bandId, tier, value);
  }

  async function handleAddCustomRate(e: React.FormEvent) {
    e.preventDefault();
    if (!newRateCityId || !newRateBandId || !newRateValue.trim()) return;
    await upsertCustomRate(newRateCityId, newRateBandId, newRateValue.trim());
    setNewRateProvinceId("");
    setNewRateCityId("");
    setNewRateBandId("");
    setNewRateValue("");
    await refresh();
  }

  async function handleDeleteCustomRate(id: string) {
    await deleteCustomRate(id);
    await refresh();
  }

  interface PlaceRow {
    id: string;
    name: string;
    region_name: string;
    tier: Tier | null;
  }

  const placeRows: PlaceRow[] = hqProvince
    ? provinces
        .filter((p) => isProvinceVisible(p, settings))
        .map((p): PlaceRow => ({
          id: p.id,
          name: p.name,
          region_name: p.region_name,
          tier: computeTier(p.id, hqProvince.id, provinces),
        }))
        .sort((a, b) => (a.tier ?? 9) - (b.tier ?? 9) || a.name.localeCompare(b.name))
    : [];

  if (loading) {
    return <p className="text-base" style={{ color: "var(--text-muted)" }}>Loading…</p>;
  }

  return (
    <div className="max-w-4xl space-y-6">
      {!hqProvince && (
        <div className="rounded-md p-4 text-sm" style={{ border: "0.5px solid var(--border)", color: "var(--text-muted)" }}>
          No business headquarters set yet — set it once in <strong>Settings</strong> to enable destination-tier pricing here.
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-base font-medium" style={{ color: "var(--text-primary)" }}>Standard rate matrix</h2>
        <div className="space-y-4 rounded-md p-5" style={{ border: "0.5px solid var(--border)" }}>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            The default rate card by seating capacity and destination tier — vehicles use these rates unless a custom rate applies, or no destination/seat count is set, in which case they fall back to their own daily rate.
          </p>

          {bands.length === 0 ? (
            <p className="text-base" style={{ color: "var(--text-muted)" }}>No seating bands yet — add one below.</p>
          ) : (
            <table className="w-full border-collapse text-left text-base">
              <thead>
                <tr style={{ background: "var(--surface-1)" }}>
                  <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Seating band</th>
                  {([1, 2, 3] as Tier[]).map((tier) => (
                    <th key={tier} className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>
                      {TIER_LABELS[tier]}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)" }}></th>
                </tr>
              </thead>
              <tbody>
                {bands.map((b) => (
                  <tr key={b.id}>
                    <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>
                      {b.label}
                      <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                        {b.min_seats}{b.max_seats != null ? `–${b.max_seats}` : "+"} seats
                      </div>
                    </td>
                    {([1, 2, 3] as Tier[]).map((tier) => (
                      <td key={tier} className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)" }}>
                        <input
                          className="w-28 rounded-md px-2.5 py-1.5 text-base"
                          style={inputStyle}
                          placeholder="—"
                          value={rateFor(b.id, tier)}
                          onChange={(e) => handleRateChange(b.id, tier, e.target.value)}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-right" style={{ border: "0.5px solid var(--border)" }}>
                      <button
                        onClick={() => handleDeleteBand(b.id)}
                        className="text-sm font-medium"
                        style={{ color: "var(--text-danger)" }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <form onSubmit={handleAddBand} className="flex flex-wrap items-end gap-3 pt-2" style={{ borderTop: "0.5px solid var(--border)" }}>
            <div>
              <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>Label</label>
              <input className="rounded-md px-3 py-2 text-base" style={inputStyle} placeholder="e.g. 8-12 seater" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>Min seats</label>
              <input className="w-24 rounded-md px-3 py-2 text-base" style={inputStyle} type="number" value={newMin} onChange={(e) => setNewMin(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>Max seats</label>
              <input className="w-24 rounded-md px-3 py-2 text-base" style={inputStyle} type="number" placeholder="open-ended" value={newMax} onChange={(e) => setNewMax(e.target.value)} />
            </div>
            <button type="submit" className="rounded-md px-4 py-2 text-base font-medium" style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}>
              Add band
            </button>
          </form>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-medium" style={{ color: "var(--text-primary)" }}>Custom rates</h2>
        <div className="space-y-4 rounded-md p-5" style={{ border: "0.5px solid var(--border)" }}>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Overrides the standard rate matrix whenever this exact city/municipality is selected as a booking's destination — for frequently-visited places that warrant their own rate, special or otherwise (including destinations where the standard tier rate would be impractical, e.g. an unusually long inter-region trip).
          </p>

          {customRates.length === 0 ? (
            <p className="text-base" style={{ color: "var(--text-muted)" }}>No custom rates yet.</p>
          ) : (
            <table className="w-full border-collapse text-left text-base">
              <thead>
                <tr style={{ background: "var(--surface-1)" }}>
                  <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>City / municipality</th>
                  <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Seating band</th>
                  <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Rate</th>
                  <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)" }}></th>
                </tr>
              </thead>
              <tbody>
                {customRates.map((cr) => {
                  const city = municipalities.find((m) => m.id === cr.city_id);
                  const band = bands.find((b) => b.id === cr.seating_band_id);
                  return (
                    <tr key={cr.id}>
                      <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>
                        {city?.name ?? "—"}
                        <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                          {provinces.find((p) => p.id === city?.province_id)?.name ?? ""}
                        </div>
                      </td>
                      <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>{band?.label ?? "—"}</td>
                      <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>{cr.rate}</td>
                      <td className="px-3 py-2.5 text-right" style={{ border: "0.5px solid var(--border)" }}>
                        <button onClick={() => handleDeleteCustomRate(cr.id)} className="text-sm font-medium" style={{ color: "var(--text-danger)" }}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <form onSubmit={handleAddCustomRate} className="flex flex-wrap items-end gap-3 pt-2" style={{ borderTop: "0.5px solid var(--border)" }}>
            <div className="max-w-xs flex-1">
              <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>Province</label>
              <SearchableSelect
                value={newRateProvinceId}
                onChange={(v) => {
                  setNewRateProvinceId(v);
                  setNewRateCityId("");
                }}
                options={provinceOptions}
                placeholder="Search for a province…"
              />
            </div>
            <div className="max-w-xs flex-1">
              <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>City / municipality</label>
              <SearchableSelect
                value={newRateCityId}
                onChange={setNewRateCityId}
                options={newRateMunicipalityOptions}
                placeholder={newRateProvinceId ? "Search for a city…" : "Pick a province first"}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>Seating band</label>
              <select className="rounded-md px-3 py-2 text-base" style={inputStyle} value={newRateBandId} onChange={(e) => setNewRateBandId(e.target.value)}>
                <option value="">Select…</option>
                {bands.map((b) => (
                  <option key={b.id} value={b.id}>{b.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>Rate</label>
              <input className="w-28 rounded-md px-3 py-2 text-base" style={inputStyle} value={newRateValue} onChange={(e) => setNewRateValue(e.target.value)} />
            </div>
            <button type="submit" className="rounded-md px-4 py-2 text-base font-medium" style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}>
              Save rate
            </button>
          </form>
        </div>
      </div>

      {hqProvince && (
        <div className="space-y-3">
          <h2 className="text-base font-medium" style={{ color: "var(--text-primary)" }}>Places the system recognizes</h2>
          <div className="max-h-72 overflow-y-auto rounded-md" style={{ border: "0.5px solid var(--border)" }}>
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr style={{ background: "var(--surface-1)" }}>
                  <th className="px-3 py-2 font-semibold" style={{ borderBottom: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Province</th>
                  <th className="px-3 py-2 font-semibold" style={{ borderBottom: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Region</th>
                  <th className="px-3 py-2 font-semibold" style={{ borderBottom: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Tier</th>
                </tr>
              </thead>
              <tbody>
                {placeRows.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-1.5" style={{ color: "var(--text-primary)" }}>{p.name}</td>
                    <td className="px-3 py-1.5" style={{ color: "var(--text-secondary)" }}>{p.region_name}</td>
                    <td className="px-3 py-1.5" style={{ color: "var(--text-secondary)" }}>{p.tier ? TIER_LABELS[p.tier] : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Every city/municipality within a province shares that province's tier automatically — no per-city breakdown needed. Add a custom rate above for any specific city/municipality that should override its standard tier rate.
          </p>
        </div>
      )}
    </div>
  );
}
