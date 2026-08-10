import { useEffect, useMemo, useState } from "react";
import { useSettings } from "../lib/settingsContext";
import { APP_VERSION } from "../lib/version";
import { getBusinessProfile, listMunicipalities, listProvinces, setBusinessContactNumber, setHqCity, setHqProvince } from "../lib/repo/locations";
import { getCurrentBusinessName, setCurrentBusinessName } from "../lib/db";
import { resetAllBookings } from "../lib/repo/bookings";
import { factoryReset } from "../lib/repo/factoryReset";
import { listActionLogs } from "../lib/repo/actionLog";
import { formatDateTime } from "../lib/dateFormat";
import { isProvinceVisible } from "../lib/islandGroups";
import { signOut } from "../lib/auth";
import { supabase } from "../lib/supabaseClient";
import SearchableSelect from "../components/SearchableSelect";
import ConfirmDialog from "../components/ConfirmDialog";
import type { ActionLogEntry, BusinessProfile, DateFormat, DurationDisplay, Municipality, Province, TimeFormat } from "../lib/types";

const inputStyle: React.CSSProperties = {
  border: "0.5px solid var(--border-strong)",
  background: "var(--surface-2)",
  color: "var(--text-primary)",
};

// The name shown on printed Remittance statements (RemittancesReport.tsx)
// and anywhere else the business identifies itself — separate from the HQ
// province/city below, which is pricing-tier reference data, not identity.
function BusinessName() {
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    getCurrentBusinessName()
      .then((name) => {
        setSaved(name);
        setDraft(name ?? "");
        setLoading(false);
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, []);

  const dirty = draft.trim() !== "" && draft.trim() !== (saved ?? "");

  async function handleSave() {
    const next = draft.trim();
    if (!next) return;
    setBusy(true);
    await setCurrentBusinessName(next);
    setSaved(next);
    setBusy(false);
  }

  if (loadError) {
    return <p className="text-base" style={{ color: "var(--text-danger)" }}>Couldn't load: {loadError}</p>;
  }
  if (loading) {
    return <p className="text-base" style={{ color: "var(--text-muted)" }}>Loading…</p>;
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>
        Business name
      </label>
      <div className="flex gap-3">
        <input
          type="text"
          className="w-full max-w-sm rounded-md px-3 py-2.5 text-base"
          style={inputStyle}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Your business name"
        />
        <button
          onClick={handleSave}
          disabled={!dirty || busy}
          className="shrink-0 rounded-md px-4 py-2 text-base font-medium disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
        >
          Save
        </button>
      </div>
      <p className="mt-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
        Shown on printed Remittance statements and other business-facing documents.
      </p>
    </div>
  );
}

function BusinessHeadquarters() {
  const { settings } = useSettings();
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Editing is off by default once HQ is set — it's meant to be a one-time
  // setup step, not a routine setting. The "Change" link re-opens the form,
  // which is deliberately kept available (rather than hard-locked) so the
  // location/tier logic can still be exercised during this build phase.
  const [editing, setEditing] = useState(false);

  const [draftProvinceId, setDraftProvinceId] = useState("");
  const [draftCityId, setDraftCityId] = useState("");

  async function refresh() {
    setLoading(true);
    try {
      const [prof, p, m] = await Promise.all([getBusinessProfile(), listProvinces(), listMunicipalities()]);
      setProfile(prof);
      setProvinces(p);
      setMunicipalities(m);
      setDraftProvinceId(prof?.hq_province_id ?? "");
      setDraftCityId(prof?.hq_city_id ?? "");
      setEditing(!prof?.hq_province_id);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const provinceOptions = useMemo(
    () =>
      provinces
        .filter((p) => p.id === draftProvinceId || isProvinceVisible(p, settings))
        .map((p) => ({ value: p.id, label: p.name, sublabel: p.region_name })),
    [provinces, settings, draftProvinceId],
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

  if (loadError) {
    return <p className="text-base" style={{ color: "var(--text-danger)" }}>Couldn't load: {loadError}</p>;
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

// Optional, editable any time (unlike HQ province/city above, which is meant
// to be a one-time setup step) — shown on the Home header once set, blank by
// default so it never blocks getting started.
function BusinessContactNumber() {
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    getBusinessProfile()
      .then((profile) => {
        setSaved(profile?.contact_number ?? null);
        setDraft(profile?.contact_number ?? "");
        setLoading(false);
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, []);

  const dirty = draft.trim() !== (saved ?? "");

  async function handleSave() {
    setBusy(true);
    const next = draft.trim() || null;
    await setBusinessContactNumber(next);
    setSaved(next);
    setBusy(false);
  }

  if (loadError) {
    return <p className="text-base" style={{ color: "var(--text-danger)" }}>Couldn't load: {loadError}</p>;
  }
  if (loading) {
    return <p className="text-base" style={{ color: "var(--text-muted)" }}>Loading…</p>;
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>
        Business contact number <span style={{ color: "var(--text-muted)" }}>(optional)</span>
      </label>
      <div className="flex gap-3">
        <input
          type="text"
          className="w-full max-w-sm rounded-md px-3 py-2.5 text-base"
          style={inputStyle}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. 0917 123 4567"
        />
        <button
          onClick={handleSave}
          disabled={!dirty || busy}
          className="rounded-md px-4 py-2.5 text-base font-medium disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      <p className="mt-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
        Shown on the Home header, alongside the business name and HQ address.
      </p>
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
  if (entry.action === "completed") return "Marked returned.";
  if (entry.action === "cancelled") return "Cancelled.";
  if (entry.action === "departed") return "Marked departed.";
  if (!entry.changes || entry.changes.length === 0) return "Updated.";
  return entry.changes
    .map((c) => `${c.label}: ${c.old ?? "—"} → ${c.new ?? "—"}`)
    .join("; ");
}

// "registered"/"updated" cover owner/vehicle entries; the rest are
// booking-only lifecycle events (see lib/repo/bookings.ts).
function actionVerb(action: ActionLogEntry["action"]): string {
  switch (action) {
    case "created":
      return "registered";
    case "completed":
      return "marked returned";
    case "cancelled":
      return "cancelled";
    case "departed":
      return "marked departed";
    case "updated":
    default:
      return "updated";
  }
}

function entityTypeLabel(entityType: ActionLogEntry["entity_type"]): string {
  if (entityType === "owner") return "Owner";
  if (entityType === "vehicle") return "Vehicle";
  return "Booking";
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
                    <span className="font-medium">{entityTypeLabel(entry.entity_type)}</span>
                    {" · "}
                    {entry.entity_label}
                    {" — "}
                    {actionVerb(entry.action)}
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

const ISLAND_GROUPS: { key: "showLuzon" | "showVisayas" | "showMindanao"; label: string }[] = [
  { key: "showLuzon", label: "Luzon" },
  { key: "showVisayas", label: "Visayas" },
  { key: "showMindanao", label: "Mindanao" },
];

// Which island groups' provinces show up in Rate Matrix, booking
// destinations, owner addresses, and HQ province — see lib/islandGroups.ts.
// At least one must always stay on; the checkbox for whichever one is
// currently the sole survivor gets disabled rather than letting the toggle
// (or the defensive check in updateSettings) reject the click after the fact.
function LocationVisibility() {
  const { settings, setSettings } = useSettings();
  const [error, setError] = useState<string | null>(null);
  const onCount = ISLAND_GROUPS.filter((g) => settings[g.key]).length;

  async function toggle(key: "showLuzon" | "showVisayas" | "showMindanao", value: boolean) {
    setError(null);
    try {
      await setSettings({ [key]: value });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div>
      {error && (
        <p className="mb-2 text-sm" style={{ color: "var(--text-danger)" }}>
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-4">
        {ISLAND_GROUPS.map(({ key, label }) => {
          const checked = settings[key];
          const isLastOn = checked && onCount === 1;
          return (
            <label
              key={key}
              className="flex items-center gap-2 text-base"
              style={{ color: isLastOn ? "var(--text-muted)" : "var(--text-primary)" }}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={isLastOn}
                onChange={(e) => toggle(key, e.target.checked)}
              />
              {label}
            </label>
          );
        })}
      </div>
      <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
        Only provinces from a toggled-on island group appear in Rate Matrix, booking destinations, owner
        addresses, and HQ province. At least one must stay on.
      </p>
    </div>
  );
}

// Signed-in account + sign out — lets Falcon switch between test accounts
// without reinstalling. Sign out clears both the Supabase session and the
// local session_cache, then hands control back to App.tsx to show the
// sign-in screen again.
function AccountSection({ onSignedOut }: { onSignedOut: () => void }) {
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function handleConfirmSignOut() {
    setBusy(true);
    await signOut();
    onSignedOut();
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Signed in as</p>
        <p className="text-base" style={{ color: "var(--text-primary)" }}>{email ?? "…"}</p>
      </div>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-md px-3.5 py-2 text-sm font-medium"
        style={{ background: "var(--bg-danger)", color: "var(--text-danger)" }}
      >
        Sign out
      </button>
      {confirming && (
        <ConfirmDialog
          title="Sign out?"
          description="You'll need to sign in again to use RACOS on this device."
          confirmLabel="Sign out"
          busy={busy}
          onConfirm={handleConfirmSignOut}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

export default function SettingsScreen({ onSignOut }: { onSignOut: () => void }) {
  const { settings, setSettings } = useSettings();

  return (
    <div className="max-w-xl space-y-6">
      <div className="space-y-3">
        <h2 className="text-base font-medium" style={{ color: "var(--text-primary)" }}>Account</h2>
        <div className="rounded-md p-5" style={{ border: "0.5px solid var(--border)" }}>
          <AccountSection onSignedOut={onSignOut} />
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-medium" style={{ color: "var(--text-primary)" }}>Business</h2>
        <div className="space-y-4 rounded-md p-5" style={{ border: "0.5px solid var(--border)" }}>
          <BusinessName />
          <div className="pt-1" style={{ borderTop: "0.5px solid var(--border)" }}>
            <div className="pt-3">
              <BusinessHeadquarters />
            </div>
          </div>
          <div className="pt-1" style={{ borderTop: "0.5px solid var(--border)" }}>
            <div className="pt-3">
              <BusinessContactNumber />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-medium" style={{ color: "var(--text-primary)" }}>Locations</h2>
        <div className="space-y-4 rounded-md p-5" style={{ border: "0.5px solid var(--border)" }}>
          <LocationVisibility />
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

          <div className="flex items-start justify-between gap-4 pt-1" style={{ borderTop: "0.5px solid var(--border)" }}>
            <div className="pt-3">
              <div className="text-base" style={{ color: "var(--text-primary)" }}>
                Auto-mark departed once ETD passes
              </div>
              <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                A still-pending booking is automatically confirmed as departed (same as picking "same as scheduled ETD" on Mark departed) the moment its scheduled start time passes, instead of waiting on staff. Turn this off to require staff to click Mark departed themselves for every booking. Logged in Tools &gt; Logs the same as a manual Mark departed, noted as automatic.
              </p>
            </div>
            <label className="mt-3 inline-flex shrink-0 cursor-pointer items-center">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={settings.autoMarkDeparted}
                onChange={(e) => setSettings({ autoMarkDeparted: e.target.checked })}
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

      <div className="space-y-3">
        <h2 className="text-base font-medium" style={{ color: "var(--text-primary)" }}>Settlements</h2>
        <div className="space-y-4 rounded-md p-5" style={{ border: "0.5px solid var(--border)" }}>
          <DashboardLabelToggle
            label='Show remittance summary (recorded/overtime breakdown) on screen'
            checked={settings.showRemittanceSummary}
            onChange={(v) => setSettings({ showRemittanceSummary: v })}
          />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            The compact R[..]/O[..] summary row on Settlements &gt; Remittances. Off by default — it's a staff/audit detail, not something an owner-facing screen needs by default. Always included when printing a statement, regardless of this setting.
          </p>
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
