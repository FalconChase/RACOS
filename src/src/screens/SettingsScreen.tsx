import { useEffect, useMemo, useState } from "react";
import { useSettings } from "../lib/settingsContext";
import { APP_VERSION } from "../lib/version";
import { getBusinessProfile, listMunicipalities, listProvinces, setBusinessContactNumber, setHqCity, setHqProvince } from "../lib/repo/locations";
import { getCurrentBusinessName, setCurrentBusinessName, getDb, currentBusinessId } from "../lib/db";
import { clearStaleBusinessData } from "../lib/repo/factoryReset";
import { listActionLogs } from "../lib/repo/actionLog";
import { countPendingOutbox } from "../lib/repo/outbox";
import { runOutboundSync, isSyncRunning } from "../lib/repo/sync";
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
// Editable: renaming only ever touches the name column, never businesses.id
// (an immutable uuid, unrelated to name) — every FK/RLS/sync reference in
// the app keys off business_id, never the display name, so there's no
// conflict risk in either direction.
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

// "Reset test data" was removed (this session) — same reasoning as Factory
// reset's removal, one step further: a button that lets an admin wipe real
// booking history (even just local history, even with an audit log entry
// recording that a wipe happened) works against RACOS's core transparency
// guarantees — append-only corrections, mandatory cancellation reasons, an
// Owners' Portal an owner is meant to trust. The original code even called
// this DEV-ONLY, meant to be removed once real customer data existed. The
// one legitimate use it covered — clearing demo bookings before a business
// goes live — is already handled by signing out and provisioning a fresh
// business (zero history from day one, no wipe tool needed). See
// BRAINS/RACOS.md ROD021 and BRAINS/SESSIONS.md for the full reasoning.

// ROT024 follow-up — targeted cleanup for local vehicles/customers/bookings/
// payments rows tied to a business_id other than the currently signed-in
// one (leftover from testing a different account on this device, per the
// SES013-flagged risk). These can never sync — Cloud RLS correctly rejects
// them since they don't belong to this session's business — so they sit
// permanently "failed", retrying forever. Narrower and safer than Factory
// reset below: never touches the current business's own data, and never
// touches owners/rate matrix/settings at all.
function ClearStaleData() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleClear() {
    setBusy(true);
    const summary = await clearStaleBusinessData();
    setBusy(false);
    setConfirming(false);
    const total = summary.vehicles + summary.customers + summary.bookings + summary.payments;
    setResult(
      total === 0
        ? "Nothing to clear — every local record already belongs to this business."
        : `Cleared ${total} stale record${total === 1 ? "" : "s"} (${summary.vehicles} vehicle${summary.vehicles === 1 ? "" : "s"}, ${summary.customers} customer${summary.customers === 1 ? "" : "s"}, ${summary.bookings} booking${summary.bookings === 1 ? "" : "s"}).`,
    );
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-base" style={{ color: "var(--text-primary)" }}>Clear stale test data</div>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Deletes local vehicles/customers/bookings left over from a different signed-in business on this device —
          the kind that shows up as permanently failed in the Sync section above. Never touches this business's own
          data. Cannot be undone.
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
          Clear stale data
        </button>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Clear stale test data?"
          description="This permanently deletes local vehicles, customers, bookings, and payments tied to a different business than the one you're currently signed into. Your current business's data is never touched. This cannot be undone."
          confirmLabel="Yes, clear stale data"
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={handleClear}
        />
      )}
    </div>
  );
}

// Factory reset was removed (this session) — an admin who wants a genuine
// clean slate now just signs out and provisions a fresh business under the
// same or a different email (bootstrapSession()'s "complete-profile" path),
// which achieves the same outcome without an in-app destructive tool that
// duplicated it. See BRAINS/SESSIONS.md for the reasoning.

function summarizeChanges(entry: ActionLogEntry): string {
  if (entry.action === "created") return "Registered.";
  if (entry.action === "completed") return "Marked returned.";
  if (entry.action === "cancelled") return "Cancelled.";
  if (entry.action === "departed") return "Marked departed.";
  if (!entry.changes || entry.changes.length === 0) {
    return entry.action === "reset" ? "Local data cleared." : "Updated.";
  }
  return entry.changes
    .map((c) => `${c.label}: ${c.old ?? "—"} → ${c.new ?? "—"}`)
    .join("; ");
}

// "registered"/"updated" cover owner/vehicle entries; "reset" is a
// business-wide system entry (see entityTypeLabel below); the rest are
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
    case "reset":
      return "reset (local only — Cloud data untouched)";
    case "updated":
    default:
      return "updated";
  }
}

function entityTypeLabel(entityType: ActionLogEntry["entity_type"]): string {
  if (entityType === "owner") return "Owner";
  if (entityType === "vehicle") return "Vehicle";
  if (entityType === "system") return "System";
  if (entityType === "customer") return "Customer";
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

// ROT024 — manual "Sync now" alongside the automatic hourly SyncRunner
// poller (App.tsx). The privilege of manual sync is immediacy, not a
// substitute for connectivity: this calls the exact same runOutboundSync()
// the background poller uses, so it still needs the device to actually be
// online to push anything — see its offline-result handling below.
function SyncSection() {
  const { settings } = useSettings();
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [offlineSince, setOfflineSince] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [backgroundSyncActive, setBackgroundSyncActive] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  // Watches the same in-process singleton flag runOutboundSync() itself
  // guards on (lib/repo/sync.ts) — so the button reflects (and disables
  // during) the hourly SyncRunner poll too, not just its own click. A
  // click that still somehow lands mid-poll is caught a second way, by
  // outcome.skipped below — belt and suspenders, not two different guards.
  useEffect(() => {
    const id = setInterval(() => setBackgroundSyncActive(isSyncRunning()), 1000);
    return () => clearInterval(id);
  }, []);

  async function refresh() {
    const db = await getDb();
    const rows = await db.select<{ last_synced_at: string | null; offline_since: string | null }[]>(
      "select last_synced_at, offline_since from sync_state where business_id = ?",
      [currentBusinessId()],
    );
    setLastSyncedAt(rows[0]?.last_synced_at ?? null);
    setOfflineSince(rows[0]?.offline_since ?? null);
    setPending(await countPendingOutbox());
  }

  useEffect(() => {
    refresh().catch(() => undefined);
  }, []);

  async function handleSyncNow() {
    setBusy(true);
    setResult(null);
    try {
      const outcome = await runOutboundSync();
      if (outcome.skipped) {
        setResult("A sync is already running in the background — try again in a moment.");
      } else if (outcome.offline) {
        setResult("Couldn't reach Supabase — check your connection and try again.");
      } else if (outcome.pushed === 0 && outcome.failed === 0) {
        setResult("Already up to date.");
      } else if (outcome.failed > 0) {
        // Surface the actual rejection reason (e.g. an RLS/permission
        // error) instead of just a count — a bare "X failed" gives no way
        // to tell a real, recurring problem apart from an ordinary
        // connectivity retry without opening dev tools.
        const db = await getDb();
        const sample = await db.select<{ entity_table: string; last_error: string | null }[]>(
          "select entity_table, last_error from outbox where status = 'failed' order by id desc limit 1",
        );
        const detail = sample[0]?.last_error ? ` (${sample[0].entity_table}: ${sample[0].last_error})` : "";
        setResult(
          `Synced ${outcome.pushed} record${outcome.pushed === 1 ? "" : "s"}, ${outcome.failed} failed — will retry.${detail}`,
        );
      } else {
        setResult(`Synced ${outcome.pushed} record${outcome.pushed === 1 ? "" : "s"}.`);
      }
      await refresh();
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {lastSyncedAt ? `Last synced ${formatDateTime(lastSyncedAt, settings)}` : "Not synced yet"}
        </p>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          {pending > 0 ? `${pending} record${pending === 1 ? "" : "s"} pending` : "Nothing pending"}
          {offlineSince ? " — offline since last attempt" : ""}
        </p>
        {result && (
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            {result}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={handleSyncNow}
        disabled={busy || backgroundSyncActive}
        className="rounded-md px-3.5 py-2 text-sm font-medium disabled:opacity-60"
        style={{ background: "var(--surface-2)", color: "var(--text-primary)", border: "0.5px solid var(--border-strong)" }}
      >
        {busy || backgroundSyncActive ? "Syncing…" : "Sync now"}
      </button>
    </div>
  );
}

export default function SettingsScreen({ onSignOut }: { onSignOut: () => void }) {
  const { settings, setSettings } = useSettings();

  return (
    <div className="max-w-xl space-y-6">
      <div className="space-y-3">
        <h2 className="text-base font-medium" style={{ color: "var(--text-primary)" }}>Account</h2>
        <div className="space-y-4 rounded-md p-5" style={{ border: "0.5px solid var(--border)" }}>
          <AccountSection onSignedOut={onSignOut} />
          <div className="pt-1" style={{ borderTop: "0.5px solid var(--border)" }}>
            <div className="pt-3">
              <SyncSection />
            </div>
          </div>
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

          <div className="pt-1" style={{ borderTop: "0.5px solid var(--border)" }}>
            <label className="mb-1.5 mt-3 block text-sm" style={{ color: "var(--text-secondary)" }}>
              Fuel level unit
            </label>
            <select
              className="w-full rounded-md px-3 py-2.5 text-base"
              style={inputStyle}
              value={settings.fuelUnit}
              onChange={(e) => setSettings({ fuelUnit: e.target.value as "bars" | "liters" })}
            >
              <option value="bars">Bars (gauge segments)</option>
              <option value="liters">Liters</option>
            </select>
            <p className="mt-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
              How Tools &gt; Entries &gt; Fuel Level logs readings for this fleet. Each logged entry keeps whichever unit was active when it was saved, so changing this later never misreads an old reading.
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

          <div className="flex items-center justify-between gap-4">
            <div className="text-base" style={{ color: "var(--text-primary)" }}>Actual payment color</div>
            <div className="flex shrink-0 items-center gap-2">
              <input
                type="color"
                className="h-8 w-12 cursor-pointer rounded border-0 bg-transparent p-0"
                value={settings.remittancePaymentColor}
                onChange={(e) => setSettings({ remittancePaymentColor: e.target.value })}
              />
              <span className="font-mono text-sm" style={{ color: "var(--text-muted)" }}>
                {settings.remittancePaymentColor}
              </span>
            </div>
          </div>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            The Payment figure on Settlements &gt; Remittances — the "expected: X" line underneath it always stays muted regardless of this. Blue by default.
          </p>

          <div className="flex items-center justify-between gap-4">
            <div className="text-base" style={{ color: "var(--text-primary)" }}>Expected/indicator text opacity</div>
            <div className="flex shrink-0 items-center gap-2">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                className="w-40"
                value={settings.remittanceExpectedOpacity}
                onChange={(e) => setSettings({ remittanceExpectedOpacity: Number(e.target.value) })}
              />
              <span className="w-10 text-right font-mono text-sm" style={{ color: "var(--text-muted)" }}>
                {settings.remittanceExpectedOpacity}%
              </span>
            </div>
          </div>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            How faint the "expected: X" line and the R[..]/O[..] summary row read on Settlements &gt; Remittances — both render in the normal text color at this opacity rather than a fixed grey, so they stay legible whether on screen or printed. 50% by default.
          </p>
        </div>
      </div>

      <ActionHistory />

      <div className="space-y-3">
        <h2 className="text-base font-medium" style={{ color: "var(--text-primary)" }}>Developer</h2>
        <div className="space-y-4 rounded-md p-5" style={{ border: "0.5px solid var(--border)" }}>
          <ClearStaleData />
        </div>
      </div>

      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        RACOS v{APP_VERSION}
      </p>
    </div>
  );
}
