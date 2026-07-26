import { useEffect, useMemo, useState } from "react";
import { useSettings } from "../lib/settingsContext";
import { APP_VERSION } from "../lib/version";
import { getBusinessProfile, listMunicipalities, listProvinces, setHqCity, setHqProvince } from "../lib/repo/locations";
import SearchableSelect from "../components/SearchableSelect";
import type { BusinessProfile, DateFormat, DurationDisplay, Municipality, Province, TimeFormat } from "../lib/types";

const inputStyle: React.CSSProperties = {
  border: "0.5px solid var(--border-strong)",
  background: "var(--surface-2)",
  color: "var(--text-primary)",
};

function BusinessHeadquarters() {
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [loading, setLoading] = useState(true);
  // Editing is off by default once HQ is set — it's meant to be a one-time
  // setup step, not a routine setting. The "Change" link re-opens the form,
  // which is deliberately kept available (rather than hard-locked) so the
  // location/tier logic can still be exercised during this build phase.
  const [editing, setEditing] = useState(false);

  const [draftProvinceId, setDraftProvinceId] = useState("");
  const [draftCityId, setDraftCityId] = useState("");

  async function refresh() {
    setLoading(true);
    const [prof, p, m] = await Promise.all([getBusinessProfile(), listProvinces(), listMunicipalities()]);
    setProfile(prof);
    setProvinces(p);
    setMunicipalities(m);
    setDraftProvinceId(prof?.hq_province_id ?? "");
    setDraftCityId(prof?.hq_city_id ?? "");
    setEditing(!prof?.hq_province_id);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  const provinceOptions = useMemo(
    () => provinces.map((p) => ({ value: p.id, label: p.name, sublabel: p.region_name })),
    [provinces],
  );
  const cityOptions = useMemo(
    () =>
      municipalities
        .filter((m) => m.province_id === draftProvinceId)
        .map((m) => ({ value: m.id, label: m.name })),
    [municipalities, draftProvinceId],
  );

  const currentProvince = provinces.find((p) => p.id === profile?.hq_province_id);
  const currentCity = municipalities.find((m) => m.id === profile?.hq_city_id);

  async function handleSave() {
    if (!draftProvinceId) return;
    await setHqProvince(draftProvinceId);
    if (draftCityId) {
      await setHqCity(draftCityId);
    }
    await refresh();
  }

  function handleStartEdit() {
    setDraftProvinceId(profile?.hq_province_id ?? "");
    setDraftCityId(profile?.hq_city_id ?? "");
    setEditing(true);
  }

  if (loading) {
    return <p className="text-base" style={{ color: "var(--text-muted)" }}>Loading…</p>;
  }

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-base" style={{ color: "var(--text-primary)" }}>
            {currentCity ? `${currentCity.name}, ` : ""}
            {currentProvince?.name}
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            The reference point for destination-tier pricing in Rate Matrix: same province as HQ = Tier 1, same region = Tier 2, otherwise Tier 3.
          </p>
        </div>
        <button
          onClick={handleStartEdit}
          className="shrink-0 text-sm font-medium"
          style={{ color: "var(--text-accent)" }}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <div className="max-w-sm flex-1">
          <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>Province</label>
          <SearchableSelect
            value={draftProvinceId}
            onChange={(v) => {
              setDraftProvinceId(v);
              setDraftCityId("");
            }}
            options={provinceOptions}
            placeholder="Search for a province…"
          />
        </div>
        <div className="max-w-sm flex-1">
          <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>City / municipality (optional)</label>
          <SearchableSelect
            value={draftCityId}
            onChange={setDraftCityId}
            options={cityOptions}
            placeholder={draftProvinceId ? "Search for a city/municipality…" : "Pick a province first"}
          />
        </div>
      </div>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        The province is the reference point for computing a destination's tier. Set once — this is a one-time setup step, not a routine preference.
      </p>
      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={!draftProvinceId}
          className="rounded-md px-4 py-2 text-base font-medium disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
        >
          Save
        </button>
        {profile?.hq_province_id && (
          <button
            onClick={() => setEditing(false)}
            className="rounded-md px-4 py-2 text-base font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

export default function SettingsScreen() {
  const { settings, setSettings } = useSettings();

  return (
    <div className="max-w-xl space-y-6">
      <div className="space-y-3">
        <h2 className="text-base font-medium" style={{ color: "var(--text-primary)" }}>Business</h2>
        <div className="space-y-4 rounded-md p-5" style={{ border: "0.5px solid var(--border)" }}>
          <BusinessHeadquarters />
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-medium" style={{ color: "var(--text-primary)" }}>General</h2>
        <div className="space-y-4 rounded-md p-5" style={{ border: "0.5px solid var(--border)" }}>
          <div>
            <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>
              Date format
            </label>
            <select
              className="w-full rounded-md px-3 py-2.5 text-base"
              style={inputStyle}
              value={settings.dateFormat}
              onChange={(e) => setSettings({ dateFormat: e.target.value as DateFormat })}
            >
              <option value="MDY">MM/DD/YYYY — 07/25/2026</option>
              <option value="DMY">DD/MM/YYYY — 25/07/2026</option>
              <option value="ISO">YYYY-MM-DD — 2026-07-25</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>
              Time format
            </label>
            <select
              className="w-full rounded-md px-3 py-2.5 text-base"
              style={inputStyle}
              value={settings.timeFormat}
              onChange={(e) => setSettings({ timeFormat: e.target.value as TimeFormat })}
            >
              <option value="12h">12-hour — 1:30 PM</option>
              <option value="24h">24-hour — 13:30</option>
            </select>
          </div>

          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Applies to dates and times shown throughout RACOS — rentals, the home dashboard, and check-out. This is a per-device preference, not synced.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-medium" style={{ color: "var(--text-primary)" }}>Rental</h2>
        <div className="space-y-4 rounded-md p-5" style={{ border: "0.5px solid var(--border)" }}>
          <div>
            <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>
              Rental duration display
            </label>
            <select
              className="w-full rounded-md px-3 py-2.5 text-base"
              style={inputStyle}
              value={settings.durationDisplay}
              onChange={(e) => setSettings({ durationDisplay: e.target.value as DurationDisplay })}
            >
              <option value="nights">Nights — 2 nights</option>
              <option value="daysNights">Days &amp; nights — 3 days 2 nights</option>
              <option value="halfDays">Half-days — 4 half-days</option>
              <option value="hours">Hours — 48 hours</option>
            </select>
            <p className="mt-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
              How rental length is worded on the booking form and check-out. Pricing always uses half-days x half the daily rate underneath, no matter what's shown here.
            </p>
          </div>

          <div className="flex items-start justify-between gap-4 pt-1" style={{ borderTop: "0.5px solid var(--border)" }}>
            <div className="pt-3">
              <div className="text-base" style={{ color: "var(--text-primary)" }}>
                Display expected payment computation
              </div>
              <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                Shows the system's computed expected total (half-days x half the daily rate) on check-out, for reference against what staff actually recorded. Intended for the future Owners' portal. This never appears on the Home dashboard, regardless of this setting.
              </p>
            </div>
            <label className="mt-3 inline-flex shrink-0 cursor-pointer items-center">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={settings.showExpectedPayment}
                onChange={(e) => setSettings({ showExpectedPayment: e.target.checked })}
              />
            </label>
          </div>
        </div>
      </div>

      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        RACOS v{APP_VERSION}
      </p>
    </div>
  );
}
