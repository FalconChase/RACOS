import { useEffect, useMemo, useState } from "react";
import { useSettings } from "../lib/settingsContext";
import { APP_VERSION } from "../lib/version";
import { getBusinessProfile, listMunicipalities, listProvinces, setHqCity, setHqProvince } from "../lib/repo/locations";
import { resetAllBookings } from "../lib/repo/bookings";
import { factoryReset } from "../lib/repo/factoryReset";
import { listActionLogs } from "../lib/repo/actionLog";
import { formatDateTime } from "../lib/dateFormat";
import SearchableSelect from "../components/SearchableSelect";
import ConfirmDialog from "../components/ConfirmDialog";
import type { ActionLogEntry, BusinessProfile, DateFormat, DurationDisplay, Municipality, Province, TimeFormat } from "../lib/types";

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

// DEV-ONLY: clears booking test data (ongoing + history) behind a real popup
// confirmation, since it's destructive. Remove this section once real
// customer data exists, same spirit as the DEV-ONLY seed logic in lib/db.ts.
function ResetTestData() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleReset() {
    setBusy(true);
    const { deletedCount } = await resetAllBookings();
    setBusy(false);
    setConfirming(false);
    setResult(`Cleared ${deletedCount} booking${deletedCount === 1 ? "" : "s"}.`);
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-base" style={{ color: "var(--text-primary)" }}>Reset booking test data</div>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Deletes every booking — ongoing and history — for this business. Vehicles, customers, and rate/location
          data are untouched. This also frees up vehicles that can't otherwise be deleted while a booking still
          references them. Cannot be undone.
        </p>
        {result && (
          <p className="mt-1 text-sm" style={{ color: "var(--text-success)" }}>{result}</p>
        )}
      </div>
      <div className="shrink-0">
        <button
          onClick={() => {
            setConfirming(true);
            setResult(null);
          }}
          className="rounded-md px-4 py-2 text-base font-medium"
          style={{ border: "0.5px solid var(--border-strong)", color: "var(--text-danger)" }}
        >
          Reset test data
        </button>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Delete all bookings?"
          description="This permanently deletes every booking — ongoing and history — for this business. Vehicles, customers, and rate/location data are untouched. This cannot be undone."
          confirmLabel="Yes, delete all bookings"
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={handleReset}
        />
      )}
    </div>
  );
}

// DEV-ONLY: full clean slate — vehicles, customers, bookings, payments, rate
// matrix, seating bands, custom rates, and the HQ province selection, all
// wiped for this business. Requires typing a confirmation phrase in the
// popup on top of the Cancel/Confirm buttons, since this is considerably
// more destructive than "Reset test data" above (that one only touches
// bookings). Provinces/municipalities (global reference data) and app
// settings (device UI prefs) are left alone — see factoryReset() for why.
function FactoryReset() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleReset() {
    setBusy(true);
    const summary = await factoryReset();
    setBusy(false);
    setConfirming(false);
    setResult(
      `Cleared ${summary.vehicles} vehicle${summary.vehicles === 1 ? "" : "s"}, ` +
        `${summary.owners} owner${summary.owners === 1 ? "" : "s"}, ` +
        `${summary.customers} customer${summary.customers === 1 ? "" : "s"}, and ` +
        `${summary.bookings} booking${summary.bookings === 1 ? "" : "s"}.`,
    );
  }

  return (
    <div className="flex items-start justify-between gap-4 pt-1" style={{ borderTop: "0.5px solid var(--border)" }}>
      <div className="pt-3">
        <div className="text-base" style={{ color: "var(--text-primary)" }}>Factory reset</div>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Wipes every vehicle, owner, customer, booking, seating band, rate matrix row, custom rate, and the HQ
          province setting for this business — a full clean slate for starting over from scratch.
          Provinces/municipalities (shared reference data) and device settings are left untouched. This cannot be
          undone.
        </p>
        {result && (
          <p className="mt-1 text-sm" style={{ color: "var(--text-success)" }}>{result}</p>
        )}
      </div>
      <div className="mt-3 shrink-0">
        <button
          onClick={() => {
            setConfirming(true);
            setResult(null);
          }}
          className="rounded-md px-4 py-2 text-base font-medium"
          style={{ background: "var(--bg-danger)", color: "var(--text-danger)" }}
        >
          Factory reset
        </button>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Factory reset — start from scratch?"
          description={
            <>
              This permanently deletes every vehicle, owner, customer, booking, seating band, rate matrix row, and
              custom rate for this business, and clears the HQ province setting. Provinces/municipalities and
              device settings are kept. There is no undo.
            </>
          }
          confirmLabel="Factory reset everything"
          requireTypedConfirmation="RESET"
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={handleReset}
        />
      )}
    </div>
  );
}

function summarizeChanges(entry: ActionLogEntry): string {
  if (entry.action === "created") return "Registered.";
  if (!entry.changes || entry.changes.length === 0) return "Updated.";
  return entry.changes
    .map((c) => `${c.label}: ${c.old ?? "—"} → ${c.new ?? "—"}`)
    .join("; ");
}

// Read-only audit trail — every create/edit made to an owner or vehicle
// record through Registry or Fleet is logged here for transparency (see
// lib/repo/actionLog.ts). Capped to the most recent entries since this table
// grows without bound.
function DashboardLabelToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="text-base" style={{ color: "var(--text-primary)" }}>{label}</div>
      <label className="inline-flex shrink-0 cursor-pointer items-center">
        <input
          type="checkbox"
          className="h-5 w-5"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
      </label>
    </div>
  );
}

function ActionHistory() {
  const { settings } = useSettings();
  const [entries, setEntries] = useState<ActionLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listActionLogs(50)
      .then(setEntries)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-3">
      <h2 className="text-base font-medium" style={{ color: "var(--text-primary)" }}>Action History</h2>
      <div className="rounded-md" style={{ border: "0.5px solid var(--border)" }}>
        {loading ? (
          <p className="p-5 text-base" style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : entries.length === 0 ? (
          <p className="p-5 text-base" style={{ color: "var(--text-muted)" }}>
            No edits recorded yet. Every change made to an owner or vehicle record will show up here.
          </p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {entries.map((entry, i) => (
              <div
                key={entry.id}
                className="flex items-start justify-between gap-4 p-3 text-sm"
                style={{ borderTop: i === 0 ? undefined : "0.5px solid var(--border)" }}
              >
                <div>
                  <div style={{ color: "var(--text-primary)" }}>
                    <span className="font-medium">{entry.entity_type === "owner" ? "Owner" : "Vehicle"}</span>
                    {" · "}
                    {entry.entity_label}
                    {" — "}
                    {entry.action === "created" ? "registered" : "updated"}
                  </div>
                  <div className="mt-0.5" style={{ color: "var(--text-muted)" }}>{summarizeChanges(entry)}</div>
                </div>
                <div className="shrink-0 whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                  {formatDateTime(entry.created_at, settings)}
                </div>
              </div>
            ))}
          </div>
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
              How rental length is worded on the booking form and check-out. Pricing always uses the exact elapsed hours x (daily rate / 24) underneath, rounded up to the nearest 50, no matter what's shown here.
            </p>
          </div>

          <div className="flex items-start justify-between gap-4 pt-1" style={{ borderTop: "0.5px solid var(--border)" }}>
            <div className="pt-3">
              <div className="text-base" style={{ color: "var(--text-primary)" }}>
                Display expected payment computation
              </div>
              <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                Shows the system's computed expected total (exact hours x daily rate / 24, rounded up to the nearest 50) on check-out, for reference against what staff actually recorded. Intended for the future Owners' portal. This never appears on the Home dashboard, regardless of this setting.
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

      <div className="space-y-3">
        <h2 className="text-base font-medium" style={{ color: "var(--text-primary)" }}>Dashboard</h2>
        <div className="space-y-4 rounded-md p-5" style={{ border: "0.5px solid var(--border)" }}>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Cosmetic terminology for the Home dashboard only — Rentals, the booking form, and Check-out always keep saying Vehicle/Customer/Start/End regardless of these. Purely display labels; nothing about the underlying data changes.
          </p>
          <DashboardLabelToggle
            label={'"Vehicle" → "Unit"'}
            checked={settings.dashLabelUnit}
            onChange={(v) => setSettings({ dashLabelUnit: v })}
          />
          <DashboardLabelToggle
            label={'"Customer" → "Lessee"'}
            checked={settings.dashLabelLessee}
            onChange={(v) => setSettings({ dashLabelLessee: v })}
          />
          <DashboardLabelToggle
            label={'"Start" → "ETD" (estimated time of departure)'}
            checked={settings.dashLabelEtd}
            onChange={(v) => setSettings({ dashLabelEtd: v })}
          />
          <DashboardLabelToggle
            label={'"End" → "ETA" (estimated time of arrival)'}
            checked={settings.dashLabelEta}
            onChange={(v) => setSettings({ dashLabelEta: v })}
          />
        </div>
      </div>

      <ActionHistory />

      <div className="space-y-3">
        <h2 className="text-base font-medium" style={{ color: "var(--text-primary)" }}>Developer</h2>
        <div className="space-y-4 rounded-md p-5" style={{ border: "0.5px solid var(--border)" }}>
          <ResetTestData />
          <FactoryReset />
        </div>
      </div>

      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        RACOS v{APP_VERSION}
      </p>
    </div>
  );
}
