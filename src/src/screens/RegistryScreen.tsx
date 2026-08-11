import { useEffect, useMemo, useState } from "react";
import { createOwner, deleteOwner, generateOwnerLoginCode, listOwners, updateOwner } from "../lib/repo/owners";
import {
  createVehicle,
  deleteVehicle,
  listVehicles,
  updateVehicle,
  updateVehicleStatus,
} from "../lib/repo/vehicles";
import { listMunicipalities, listProvinces } from "../lib/repo/locations";
import { useSettings } from "../lib/settingsContext";
import { isProvinceVisible } from "../lib/islandGroups";
import FormQuestion from "../components/FormQuestion";
import SearchableSelect from "../components/SearchableSelect";
import type { Municipality, Owner, Province, Vehicle, VehicleImageFit, VehicleStatus } from "../lib/types";

const NEW_OWNER = "__new__";

// Fixed fuel-type choices for the Vehicles edit form's Fuel dropdown. This
// field predates it being a dropdown — kept as a plain text column (see
// migration 0021_vehicle_local_details.sql) rather than a CHECK-constrained
// enum, so a vehicle already carrying some other value (typed in before this
// list existed) still shows up as a selectable option instead of silently
// disappearing.
const FUEL_TYPE_OPTIONS = ["Gasoline", "Diesel", "Electric", "Hybrid", "Other"];

type Subtab = "vehicleOwner" | "owners" | "vehicles";

const inputStyle: React.CSSProperties = {
  border: "0.5px solid var(--border-strong)",
  background: "var(--surface-2)",
  color: "var(--text-primary)",
};

const labelStyle: React.CSSProperties = { color: "var(--text-secondary)" };

const STATUS_STYLES: Record<VehicleStatus, React.CSSProperties> = {
  available: { background: "var(--bg-success)", color: "var(--text-success)" },
  rented: { background: "var(--bg-warning)", color: "var(--text-warning)" },
  maintenance: { background: "var(--bg-danger)", color: "var(--text-danger)" },
  retired: { background: "var(--surface-1)", color: "var(--text-muted)" },
};

export default function RegistryScreen() {
  const [subtab, setSubtab] = useState<Subtab>("vehicleOwner");

  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-md p-1" style={{ background: "var(--surface-1)" }}>
        {(
          [
            { id: "vehicleOwner" as const, label: "Vehicle & Owner" },
            { id: "owners" as const, label: "Owners" },
            { id: "vehicles" as const, label: "Vehicles" },
          ]
        ).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setSubtab(id)}
            className="rounded px-4 py-1.5 text-sm font-medium"
            style={
              subtab === id
                ? { background: "var(--fill-primary)", color: "var(--on-primary)" }
                : { color: "var(--text-secondary)" }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {subtab === "vehicleOwner" && <VehicleOwnerForm />}
      {subtab === "owners" && <OwnersList />}
      {subtab === "vehicles" && <VehiclesList />}
    </div>
  );
}

// --- Vehicle & Owner: unified intake form ----------------------------------

function combineAddress(municipality: Municipality | undefined, province: Province | undefined, line: string) {
  return [line, municipality?.name, province?.name].filter(Boolean).join(", ");
}

function VehicleOwnerForm() {
  const { settings } = useSettings();
  const [owners, setOwners] = useState<Owner[]>([]);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [loading, setLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [ownerId, setOwnerId] = useState("");
  const [newOwnerName, setNewOwnerName] = useState("");
  const [newOwnerProvinceId, setNewOwnerProvinceId] = useState("");
  const [newOwnerMunicipalityId, setNewOwnerMunicipalityId] = useState("");
  const [newOwnerAddressLine, setNewOwnerAddressLine] = useState("");
  const [newOwnerContact, setNewOwnerContact] = useState("");

  const [plateNumber, setPlateNumber] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [seats, setSeats] = useState("");
  const [year, setYear] = useState("");
  const [chassisNumber, setChassisNumber] = useState("");
  const [engineNumber, setEngineNumber] = useState("");
  const [gpsDeviceId, setGpsDeviceId] = useState("");
  const [gpsProvider, setGpsProvider] = useState("");
  const [gpsNotes, setGpsNotes] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("");
  const [fuel, setFuel] = useState("");
  const [fuelCapacity, setFuelCapacity] = useState("");
  const [transmission, setTransmission] = useState("");
  const [notes, setNotes] = useState("");

  async function refresh() {
    setLoading(true);
    const [o, p, m] = await Promise.all([listOwners(), listProvinces(), listMunicipalities()]);
    setOwners(o);
    setProvinces(p);
    setMunicipalities(m);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  const isNewOwner = ownerId === NEW_OWNER;

  // Always keeps the already-selected province visible even if its island
  // group is toggled off, same reasoning as BookingsScreen's destination
  // picker.
  const provinceOptions = useMemo(
    () =>
      provinces
        .filter((p) => p.id === newOwnerProvinceId || isProvinceVisible(p, settings))
        .map((p) => ({ value: p.id, label: p.name, sublabel: p.region_name })),
    [provinces, settings, newOwnerProvinceId],
  );
  const municipalityOptions = useMemo(
    () =>
      municipalities
        .filter((m) => m.province_id === newOwnerProvinceId)
        .map((m) => ({ value: m.id, label: m.name })),
    [municipalities, newOwnerProvinceId],
  );

  function resetForm() {
    setOwnerId("");
    setNewOwnerName("");
    setNewOwnerProvinceId("");
    setNewOwnerMunicipalityId("");
    setNewOwnerAddressLine("");
    setNewOwnerContact("");
    setPlateNumber("");
    setMake("");
    setModel("");
    setSeats("");
    setYear("");
    setChassisNumber("");
    setEngineNumber("");
    setGpsDeviceId("");
    setGpsProvider("");
    setGpsNotes("");
    setDescription("");
    setColor("");
    setFuel("");
    setFuelCapacity("");
    setTransmission("");
    setNotes("");
  }

  const canSubmit =
    Boolean(plateNumber.trim()) &&
    Boolean(make.trim()) &&
    Boolean(model.trim()) &&
    Boolean(seats.trim()) &&
    (isNewOwner
      ? Boolean(newOwnerName.trim()) && Boolean(newOwnerProvinceId) && Boolean(newOwnerAddressLine.trim())
      : Boolean(ownerId));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitError(null);
    setSubmitting(true);
    try {
      let finalOwnerId = ownerId;
      if (isNewOwner) {
        const created = await createOwner({
          full_name: newOwnerName.trim(),
          address_province_id: newOwnerProvinceId,
          address_municipality_id: newOwnerMunicipalityId || undefined,
          address_line: newOwnerAddressLine.trim(),
          contact_number: newOwnerContact.trim() || undefined,
        });
        finalOwnerId = created.id;
      }

      await createVehicle({
        plate_number: plateNumber.trim(),
        make: make.trim(),
        model: model.trim(),
        seats: Number(seats),
        year: year.trim() ? Number(year) : undefined,
        owner_id: finalOwnerId,
        chassis_number: chassisNumber.trim() || undefined,
        engine_number: engineNumber.trim() || undefined,
        gps_device_id: gpsDeviceId.trim() || undefined,
        gps_provider: gpsProvider.trim() || undefined,
        gps_notes: gpsNotes.trim() || undefined,
        description: description.trim() || undefined,
        color: color.trim() || undefined,
        fuel: fuel || undefined,
        fuel_capacity: fuelCapacity.trim() || undefined,
        // Not collected here — defaults to 6 bars in createVehicle, only
        // ever adjusted afterward from the Registry Vehicles edit row.
        transmission: transmission.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      setSuccessMessage(`Registered ${plateNumber.trim()}${isNewOwner ? ` under new owner ${newOwnerName.trim()}` : ""}.`);
      resetForm();
      await refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="text-base" style={{ color: "var(--text-muted)" }}>Loading…</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-4">
      <div className="overflow-hidden rounded-lg" style={{ border: "0.5px solid var(--border)" }}>
        <div className="h-2" style={{ background: "var(--fill-primary)" }} />
        <div className="p-5" style={{ background: "var(--surface-1)" }}>
          <h3 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>Register vehicle &amp; owner</h3>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            One form for both — pick an existing owner or register a new one, then add the vehicle underneath.
          </p>
        </div>
      </div>

      {submitError && (
        <div
          className="flex items-start justify-between gap-4 rounded-md p-3 text-sm"
          style={{ background: "var(--bg-danger)", color: "var(--text-danger)" }}
        >
          <span>{submitError}</span>
          <button type="button" onClick={() => setSubmitError(null)} className="shrink-0 font-medium">
            Dismiss
          </button>
        </div>
      )}

      {successMessage && (
        <p className="text-sm" style={{ color: "var(--text-success)" }}>{successMessage}</p>
      )}

      <FormQuestion label="Owner *">
        <select
          className="w-full rounded-md px-3 py-2.5 text-base"
          style={inputStyle}
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
        >
          <option value="">Select an owner…</option>
          <option value={NEW_OWNER}>+ Register new owner</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>{o.full_name}</option>
          ))}
        </select>

        {isNewOwner && (
          <div className="mt-3 space-y-3 rounded-md p-3" style={{ background: "var(--surface-2)" }}>
            <input
              className="w-full rounded-md px-3 py-2.5 text-base"
              style={inputStyle}
              placeholder="Full name *"
              value={newOwnerName}
              onChange={(e) => setNewOwnerName(e.target.value)}
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex-1">
                <label className="mb-1.5 block text-sm" style={labelStyle}>Province *</label>
                <SearchableSelect
                  value={newOwnerProvinceId}
                  onChange={(v) => {
                    setNewOwnerProvinceId(v);
                    setNewOwnerMunicipalityId("");
                  }}
                  options={provinceOptions}
                  placeholder="Search for a province…"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1.5 block text-sm" style={labelStyle}>City/municipality (optional)</label>
                <SearchableSelect
                  value={newOwnerMunicipalityId}
                  onChange={setNewOwnerMunicipalityId}
                  options={municipalityOptions}
                  placeholder={newOwnerProvinceId ? "Search for a city/municipality…" : "Pick a province first"}
                />
              </div>
            </div>
            <input
              className="w-full rounded-md px-3 py-2.5 text-base"
              style={inputStyle}
              placeholder="Street address *"
              value={newOwnerAddressLine}
              onChange={(e) => setNewOwnerAddressLine(e.target.value)}
            />
            <input
              className="w-full rounded-md px-3 py-2.5 text-base sm:w-1/2"
              style={inputStyle}
              placeholder="Contact number (optional)"
              value={newOwnerContact}
              onChange={(e) => setNewOwnerContact(e.target.value)}
            />
          </div>
        )}
      </FormQuestion>

      <FormQuestion label="Vehicle">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <input
            className="rounded-md px-3 py-2.5 text-base"
            style={inputStyle}
            placeholder="Plate number *"
            value={plateNumber}
            onChange={(e) => setPlateNumber(e.target.value)}
          />
          <input
            className="rounded-md px-3 py-2.5 text-base"
            style={inputStyle}
            placeholder="Make *"
            value={make}
            onChange={(e) => setMake(e.target.value)}
          />
          <input
            className="rounded-md px-3 py-2.5 text-base"
            style={inputStyle}
            placeholder="Model *"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
          <input
            className="rounded-md px-3 py-2.5 text-base"
            style={inputStyle}
            placeholder="Seats *"
            type="number"
            min={1}
            value={seats}
            onChange={(e) => setSeats(e.target.value)}
          />
          <input
            className="rounded-md px-3 py-2.5 text-base"
            style={inputStyle}
            placeholder="Year"
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </div>

        <p className="mb-2 mt-4 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          Optional — fill in now or edit later from Fleet
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <input
            className="rounded-md px-3 py-2.5 text-base"
            style={inputStyle}
            placeholder="Chassis number"
            value={chassisNumber}
            onChange={(e) => setChassisNumber(e.target.value)}
          />
          <input
            className="rounded-md px-3 py-2.5 text-base"
            style={inputStyle}
            placeholder="Engine number"
            value={engineNumber}
            onChange={(e) => setEngineNumber(e.target.value)}
          />
          <input
            className="rounded-md px-3 py-2.5 text-base"
            style={inputStyle}
            placeholder="GPS device ID"
            value={gpsDeviceId}
            onChange={(e) => setGpsDeviceId(e.target.value)}
          />
          <input
            className="rounded-md px-3 py-2.5 text-base"
            style={inputStyle}
            placeholder="GPS provider"
            value={gpsProvider}
            onChange={(e) => setGpsProvider(e.target.value)}
          />
          <input
            className="rounded-md px-3 py-2.5 text-base"
            style={inputStyle}
            placeholder="GPS notes"
            value={gpsNotes}
            onChange={(e) => setGpsNotes(e.target.value)}
          />
          <input
            className="rounded-md px-3 py-2.5 text-base"
            style={inputStyle}
            placeholder="Description / variant (e.g. 1.3 XLE CVT)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <input
            className="rounded-md px-3 py-2.5 text-base"
            style={inputStyle}
            placeholder="Color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
          <select
            className="rounded-md px-3 py-2.5 text-base"
            style={inputStyle}
            value={fuel}
            onChange={(e) => setFuel(e.target.value)}
          >
            <option value="">Fuel</option>
            {FUEL_TYPE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          <input
            className="rounded-md px-3 py-2.5 text-base"
            style={inputStyle}
            placeholder="Fuel capacity"
            value={fuelCapacity}
            onChange={(e) => setFuelCapacity(e.target.value)}
          />
          <input
            className="rounded-md px-3 py-2.5 text-base"
            style={inputStyle}
            placeholder="Transmission"
            value={transmission}
            onChange={(e) => setTransmission(e.target.value)}
          />
          <input
            className="col-span-2 rounded-md px-3 py-2.5 text-base sm:col-span-3"
            style={inputStyle}
            placeholder="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </FormQuestion>

      <div className="flex justify-start">
        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className="rounded-md px-6 py-2.5 text-base font-medium disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
        >
          {submitting ? "Registering…" : "Register"}
        </button>
      </div>
    </form>
  );
}

// Owners' Portal login credential (ROD018) — never auto-generated; staff
// click to create it explicitly, since it requires a live Supabase round
// trip. Read-only once set, never editable.
function OwnerLoginCode({ owner, onGenerated }: { owner: Owner; onGenerated: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setBusy(true);
    setError(null);
    try {
      await generateOwnerLoginCode(owner);
      onGenerated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (owner.login_code) {
    return (
      <div className="text-sm" style={{ color: "var(--text-muted)" }}>
        Login code: <span className="font-mono font-semibold" style={{ color: "var(--text-primary)" }}>{owner.login_code}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleGenerate}
        disabled={busy}
        className="text-sm font-medium disabled:opacity-50"
        style={{ color: "var(--text-accent)" }}
      >
        {busy ? "Generating…" : "Generate login code"}
      </button>
      {error && <span className="text-sm" style={{ color: "var(--text-danger)" }}>{error}</span>}
    </div>
  );
}

// --- Owners: browse + edit existing owner profiles --------------------------

function OwnersList() {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const [o, p, m] = await Promise.all([listOwners(), listProvinces(), listMunicipalities()]);
    setOwners(o);
    setProvinces(p);
    setMunicipalities(m);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleDelete(id: string) {
    setDeleteError(null);
    try {
      await deleteOwner(id);
      await refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    }
  }

  if (loading) {
    return <p className="text-base" style={{ color: "var(--text-muted)" }}>Loading…</p>;
  }

  return (
    <div className="space-y-4">
      {deleteError && (
        <div
          className="flex items-start justify-between gap-4 rounded-md p-3 text-sm"
          style={{ background: "var(--bg-danger)", color: "var(--text-danger)" }}
        >
          <span>{deleteError}</span>
          <button onClick={() => setDeleteError(null)} className="shrink-0 font-medium">
            Dismiss
          </button>
        </div>
      )}

      {owners.length === 0 ? (
        <p className="text-base" style={{ color: "var(--text-muted)" }}>
          No owners yet — register one from the Vehicle &amp; Owner tab.
        </p>
      ) : (
        <div className="space-y-2">
          {owners.map((o) =>
            editingId === o.id ? (
              <OwnerEditRow
                key={o.id}
                owner={o}
                provinces={provinces}
                municipalities={municipalities}
                onCancel={() => setEditingId(null)}
                onSaved={async () => {
                  setEditingId(null);
                  await refresh();
                }}
              />
            ) : (
              <div
                key={o.id}
                className="flex items-center justify-between gap-4 rounded-md p-3"
                style={{ border: "0.5px solid var(--border)" }}
              >
                <div>
                  <div className="text-base font-medium" style={{ color: "var(--text-primary)" }}>{o.full_name}</div>
                  <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    {combineAddress(
                      municipalities.find((m) => m.id === o.address_municipality_id),
                      provinces.find((p) => p.id === o.address_province_id),
                      o.address_line ?? "",
                    ) || "No address on file"}
                  </div>
                  <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                    {o.contact_number ?? "No contact number"}
                  </div>
                  <div className="mt-1.5">
                    <OwnerLoginCode owner={o} onGenerated={refresh} />
                  </div>
                </div>
                <div className="flex shrink-0 gap-3">
                  <button
                    onClick={() => setEditingId(o.id)}
                    className="text-sm font-medium"
                    style={{ color: "var(--text-accent)" }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(o.id)}
                    className="text-sm font-medium"
                    style={{ color: "var(--text-danger)" }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function OwnerEditRow({
  owner,
  provinces,
  municipalities,
  onCancel,
  onSaved,
}: {
  owner: Owner;
  provinces: Province[];
  municipalities: Municipality[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { settings } = useSettings();
  const [fullName, setFullName] = useState(owner.full_name);
  const [provinceId, setProvinceId] = useState(owner.address_province_id ?? "");
  const [municipalityId, setMunicipalityId] = useState(owner.address_municipality_id ?? "");
  const [addressLine, setAddressLine] = useState(owner.address_line ?? "");
  const [contactNumber, setContactNumber] = useState(owner.contact_number ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const provinceOptions = useMemo(
    () =>
      provinces
        .filter((p) => p.id === provinceId || isProvinceVisible(p, settings))
        .map((p) => ({ value: p.id, label: p.name, sublabel: p.region_name })),
    [provinces, settings, provinceId],
  );
  const municipalityOptions = useMemo(
    () => municipalities.filter((m) => m.province_id === provinceId).map((m) => ({ value: m.id, label: m.name })),
    [municipalities, provinceId],
  );

  async function handleSave() {
    setSaveError(null);
    setSaving(true);
    try {
      await updateOwner(owner.id, {
        full_name: fullName.trim(),
        address_province_id: provinceId || undefined,
        address_municipality_id: municipalityId || null,
        address_line: addressLine.trim(),
        contact_number: contactNumber.trim() || null,
      });
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md p-4" style={{ border: "0.5px solid var(--border-strong)", background: "var(--surface-1)" }}>
      {saveError && (
        <div
          className="flex items-start justify-between gap-4 rounded-md p-3 text-sm"
          style={{ background: "var(--bg-danger)", color: "var(--text-danger)" }}
        >
          <span>{saveError}</span>
          <button onClick={() => setSaveError(null)} className="shrink-0 font-medium">
            Dismiss
          </button>
        </div>
      )}
      <input
        className="w-full rounded-md px-3 py-2.5 text-base"
        style={inputStyle}
        placeholder="Full name *"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <SearchableSelect
            value={provinceId}
            onChange={(v) => {
              setProvinceId(v);
              setMunicipalityId("");
            }}
            options={provinceOptions}
            placeholder="Search for a province…"
          />
        </div>
        <div className="flex-1">
          <SearchableSelect
            value={municipalityId}
            onChange={setMunicipalityId}
            options={municipalityOptions}
            placeholder={provinceId ? "City/municipality (optional)" : "Pick a province first"}
          />
        </div>
      </div>
      <input
        className="w-full rounded-md px-3 py-2.5 text-base"
        style={inputStyle}
        placeholder="Street address *"
        value={addressLine}
        onChange={(e) => setAddressLine(e.target.value)}
      />
      <input
        className="w-full rounded-md px-3 py-2.5 text-base sm:w-1/2"
        style={inputStyle}
        placeholder="Contact number"
        value={contactNumber}
        onChange={(e) => setContactNumber(e.target.value)}
      />
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving || !fullName.trim() || !provinceId || !addressLine.trim()}
          className="rounded-md px-4 py-2 text-base font-medium disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={onCancel}
          className="rounded-md px-4 py-2 text-base font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// --- Vehicles: full detail table with edit + delete -------------------------
//
// This is where vehicle editing and deletion actually live now. Fleet only
// shows a simplified read view (plate, make/model, status, current
// location) — full details (year, seats, owner, chassis/engine/GPS fields)
// and the edit/delete actions moved here so Fleet can stay focused on the
// day-to-day operational view.

function VehiclesList() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Separate from editingId (the full vehicle-details edit row below) — this
  // only ever swaps the Status pill for a dropdown, and only offers
  // available/maintenance/retired. "rented" is never a manual choice: it's
  // set automatically the moment a booking actually goes active (see
  // updateVehicleStatus calls in lib/repo/bookings.ts) and cleared the same
  // way on return, so there's nothing to hand-edit while a vehicle reads
  // "rented" — the edit affordance is hidden for that state entirely.
  const [statusEditId, setStatusEditId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const [v, o] = await Promise.all([listVehicles(), listOwners()]);
    setVehicles(v);
    setOwners(o);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  function ownerLabel(id: string | null) {
    if (!id) return "—";
    return owners.find((o) => o.id === id)?.full_name ?? "—";
  }

  async function handleStatusChange(id: string, status: VehicleStatus) {
    await updateVehicleStatus(id, status);
    await refresh();
  }

  async function handleDelete(id: string) {
    setDeleteError(null);
    try {
      await deleteVehicle(id);
      await refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    }
  }

  if (loading) {
    return <p className="text-base" style={{ color: "var(--text-muted)" }}>Loading…</p>;
  }

  return (
    <div className="space-y-4">
      {deleteError && (
        <div
          className="flex items-start justify-between gap-4 rounded-md p-3 text-sm"
          style={{ background: "var(--bg-danger)", color: "var(--text-danger)" }}
        >
          <span>{deleteError}</span>
          <button onClick={() => setDeleteError(null)} className="shrink-0 font-medium">
            Dismiss
          </button>
        </div>
      )}

      {vehicles.length === 0 ? (
        <p className="text-base" style={{ color: "var(--text-muted)" }}>
          No vehicles yet — register one from the Vehicle &amp; Owner tab.
        </p>
      ) : (
        <table className="w-full border-collapse text-left text-base">
          <thead>
            <tr style={{ background: "var(--surface-1)" }}>
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Plate</th>
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Make / model</th>
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Year</th>
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Seats</th>
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Owner</th>
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Status</th>
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)" }}></th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) =>
              editingId === v.id ? (
                <VehicleEditRow
                  key={v.id}
                  vehicle={v}
                  owners={owners}
                  onCancel={() => setEditingId(null)}
                  onSaved={async () => {
                    setEditingId(null);
                    await refresh();
                  }}
                />
              ) : (
                <tr key={v.id}>
                  <td className="px-3 py-2.5 font-medium" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>{v.plate_number}</td>
                  <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>
                    {[v.make, v.model].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>{v.year ?? "—"}</td>
                  <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>{v.seats ?? "—"}</td>
                  <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>{ownerLabel(v.owner_id)}</td>
                  <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)" }}>
                    {statusEditId === v.id ? (
                      <select
                        autoFocus
                        value={v.status}
                        onChange={async (e) => {
                          await handleStatusChange(v.id, e.target.value as VehicleStatus);
                          setStatusEditId(null);
                        }}
                        onBlur={() => setStatusEditId(null)}
                        className="rounded-full border-0 px-3 py-1.5 text-sm font-medium"
                        style={STATUS_STYLES[v.status]}
                      >
                        <option value="available">available</option>
                        <option value="maintenance">maintenance</option>
                        <option value="retired">retired</option>
                      </select>
                    ) : (
                      <div className="flex items-center gap-2.5">
                        <span className="rounded-full px-3 py-1.5 text-sm font-medium" style={STATUS_STYLES[v.status]}>
                          {v.status}
                        </span>
                        {v.status !== "rented" && (
                          <button
                            onClick={() => setStatusEditId(v.id)}
                            className="text-sm"
                            style={{ color: "var(--text-accent)" }}
                          >
                            Edit status
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right" style={{ border: "0.5px solid var(--border)" }}>
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => setEditingId(v.id)}
                        className="text-sm font-medium"
                        style={{ color: "var(--text-accent)" }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(v.id)}
                        className="text-sm font-medium"
                        style={{ color: "var(--text-danger)" }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function VehicleEditRow({
  vehicle,
  owners,
  onCancel,
  onSaved,
}: {
  vehicle: Vehicle;
  owners: Owner[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [plateNumber, setPlateNumber] = useState(vehicle.plate_number);
  const [make, setMake] = useState(vehicle.make ?? "");
  const [model, setModel] = useState(vehicle.model ?? "");
  const [year, setYear] = useState(vehicle.year != null ? String(vehicle.year) : "");
  const [seats, setSeats] = useState(vehicle.seats != null ? String(vehicle.seats) : "");
  // Fixed, not editable from this form — see the read-only Owner field
  // below. Reassigning a vehicle to a different owner isn't something this
  // form supports; it's set once at registration.
  const ownerLabel = owners.find((o) => o.id === vehicle.owner_id)?.full_name ?? "—";
  const [chassisNumber, setChassisNumber] = useState(vehicle.chassis_number ?? "");
  const [engineNumber, setEngineNumber] = useState(vehicle.engine_number ?? "");
  const [gpsDeviceId, setGpsDeviceId] = useState(vehicle.gps_device_id ?? "");
  const [gpsProvider, setGpsProvider] = useState(vehicle.gps_provider ?? "");
  const [gpsNotes, setGpsNotes] = useState(vehicle.gps_notes ?? "");
  const [fuel, setFuel] = useState(vehicle.fuel ?? "");
  const [fuelCapacity, setFuelCapacity] = useState(vehicle.fuel_capacity ?? "");
  // Ceiling for fuel level entries logged against this vehicle (bars on the
  // gauge, or liters if settings.fuelUnit is "liters") — caps the New
  // rental/Entries fuel level input so it can't be recorded as something
  // absurd like "65 bars".
  const [fuelMaxLevel, setFuelMaxLevel] = useState(vehicle.fuel_max_level != null ? String(vehicle.fuel_max_level) : "");
  const [transmission, setTransmission] = useState(vehicle.transmission ?? "");
  // Local-only — read once via a file picker and embedded as a base64 data
  // URL directly in the row (see migration 0021_vehicle_local_details.sql),
  // so it travels with the local racos.db file rather than a dangling path.
  const [carImage, setCarImage] = useState(vehicle.car_image ?? "");
  // How the image should sit in the (fixed-size) popup frame — "cover" crops
  // to fill it, "contain" shrinks to show the whole image. The preview box
  // below is the same size as the Fleet popup's frame, so what's previewed
  // here is exactly what shows there.
  const [carImageFit, setCarImageFit] = useState<VehicleImageFit>(vehicle.car_image_fit);
  const [notes, setNotes] = useState(vehicle.notes ?? "");
  const [color, setColor] = useState(vehicle.color ?? "");
  // Variant/trim, e.g. "1.3 XLE CVT" — distinct from Model ("Vios").
  const [description, setDescription] = useState(vehicle.description ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCarImage(String(reader.result));
    reader.readAsDataURL(file);
  }

  const canSave = useMemo(
    () => Boolean(plateNumber.trim()) && Boolean(make.trim()) && Boolean(model.trim()) && Boolean(seats.trim()) && Boolean(vehicle.owner_id),
    [plateNumber, make, model, seats, vehicle.owner_id],
  );

  async function handleSave() {
    if (!canSave) return;
    setSaveError(null);
    setSaving(true);
    try {
      await updateVehicle(vehicle.id, {
        plate_number: plateNumber.trim(),
        make: make.trim(),
        model: model.trim(),
        year: year.trim() ? Number(year) : null,
        seats: Number(seats),
        chassis_number: chassisNumber.trim() || null,
        engine_number: engineNumber.trim() || null,
        gps_device_id: gpsDeviceId.trim() || null,
        gps_provider: gpsProvider.trim() || null,
        gps_notes: gpsNotes.trim() || null,
        fuel: fuel.trim() || null,
        fuel_capacity: fuelCapacity.trim() || null,
        fuel_max_level: fuelMaxLevel.trim() ? Number(fuelMaxLevel) : null,
        transmission: transmission.trim() || null,
        car_image: carImage || null,
        car_image_fit: carImageFit,
        notes: notes.trim() || null,
        color: color.trim() || null,
        description: description.trim() || null,
      });
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td colSpan={7} className="p-0" style={{ border: "0.5px solid var(--border)" }}>
        <div className="space-y-3 p-4" style={{ background: "var(--surface-1)" }}>
          {saveError && (
            <div
              className="flex items-start justify-between gap-4 rounded-md p-3 text-sm"
              style={{ background: "var(--bg-danger)", color: "var(--text-danger)" }}
            >
              <span>{saveError}</span>
              <button onClick={() => setSaveError(null)} className="shrink-0 font-medium">
                Dismiss
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <input className="rounded-md px-3 py-2.5 text-base" style={inputStyle} placeholder="Plate number *" value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)} />
            <input className="rounded-md px-3 py-2.5 text-base" style={inputStyle} placeholder="Make *" value={make} onChange={(e) => setMake(e.target.value)} />
            <input className="rounded-md px-3 py-2.5 text-base" style={inputStyle} placeholder="Model *" value={model} onChange={(e) => setModel(e.target.value)} />
            <input className="rounded-md px-3 py-2.5 text-base" style={inputStyle} placeholder="Description / variant (e.g. 1.3 XLE CVT)" value={description} onChange={(e) => setDescription(e.target.value)} />
            <input className="rounded-md px-3 py-2.5 text-base" style={inputStyle} placeholder="Year" type="number" value={year} onChange={(e) => setYear(e.target.value)} />
            <input className="rounded-md px-3 py-2.5 text-base" style={inputStyle} placeholder="Color" value={color} onChange={(e) => setColor(e.target.value)} />
            <input className="rounded-md px-3 py-2.5 text-base" style={inputStyle} placeholder="Seats *" type="number" min={1} value={seats} onChange={(e) => setSeats(e.target.value)} />
            <div
              className="flex items-center rounded-md px-3 py-2.5 text-base"
              style={{ ...inputStyle, color: "var(--text-muted)", cursor: "not-allowed" }}
              title="Owner is fixed at registration and can't be reassigned here."
            >
              {ownerLabel}
            </div>
            <input className="rounded-md px-3 py-2.5 text-base" style={inputStyle} placeholder="Chassis number" value={chassisNumber} onChange={(e) => setChassisNumber(e.target.value)} />
            <input className="rounded-md px-3 py-2.5 text-base" style={inputStyle} placeholder="Engine number" value={engineNumber} onChange={(e) => setEngineNumber(e.target.value)} />
            <input className="rounded-md px-3 py-2.5 text-base" style={inputStyle} placeholder="GPS device ID" value={gpsDeviceId} onChange={(e) => setGpsDeviceId(e.target.value)} />
            <input className="rounded-md px-3 py-2.5 text-base" style={inputStyle} placeholder="GPS provider" value={gpsProvider} onChange={(e) => setGpsProvider(e.target.value)} />
            <input className="col-span-2 rounded-md px-3 py-2.5 text-base" style={inputStyle} placeholder="GPS notes" value={gpsNotes} onChange={(e) => setGpsNotes(e.target.value)} />
            <select className="rounded-md px-3 py-2.5 text-base" style={inputStyle} value={fuel} onChange={(e) => setFuel(e.target.value)}>
              <option value="">Fuel</option>
              {[...new Set([...FUEL_TYPE_OPTIONS, ...(fuel ? [fuel] : [])])].map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            <input className="rounded-md px-3 py-2.5 text-base" style={inputStyle} placeholder="Fuel capacity" value={fuelCapacity} onChange={(e) => setFuelCapacity(e.target.value)} />
            <input
              className="rounded-md px-3 py-2.5 text-base"
              style={inputStyle}
              placeholder="Max fuel level (e.g. 8 bars)"
              type="number"
              min={0}
              step="any"
              value={fuelMaxLevel}
              onChange={(e) => setFuelMaxLevel(e.target.value)}
            />
            <input className="rounded-md px-3 py-2.5 text-base" style={inputStyle} placeholder="Transmission" value={transmission} onChange={(e) => setTransmission(e.target.value)} />
            <input className="col-span-2 rounded-md px-3 py-2.5 text-base sm:col-span-4" style={inputStyle} placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex items-start gap-4">
            {/* Same frame size as the Fleet detail popup, so what's previewed
                here is exactly what shows there. */}
            {carImage ? (
              <img
                src={carImage}
                alt="Vehicle"
                className="h-72 w-72 shrink-0 rounded-md"
                style={{ border: "0.5px solid var(--border)", objectFit: carImageFit, background: "var(--surface-2)" }}
              />
            ) : (
              <div
                className="flex h-72 w-72 shrink-0 items-center justify-center rounded-md text-xs"
                style={{ border: "0.5px solid var(--border)", color: "var(--text-muted)" }}
              >
                No image
              </div>
            )}
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Car image (local only — not synced to the server)
                </label>
                <input type="file" accept="image/*" onChange={handleImageChange} className="text-sm" style={{ color: "var(--text-secondary)" }} />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  How it fits the frame
                </label>
                <div className="flex gap-2 rounded-md p-1" style={{ background: "var(--surface-2)", width: "fit-content" }}>
                  {(
                    [
                      { id: "cover" as const, label: "Fill frame" },
                      { id: "contain" as const, label: "Fit frame" },
                    ]
                  ).map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setCarImageFit(id)}
                      className="rounded px-3 py-1.5 text-sm font-medium"
                      style={
                        carImageFit === id
                          ? { background: "var(--fill-primary)", color: "var(--on-primary)" }
                          : { color: "var(--text-secondary)" }
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {carImage && (
                <button type="button" onClick={() => setCarImage("")} className="self-start text-sm font-medium" style={{ color: "var(--text-danger)" }}>
                  Remove image
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !canSave}
              className="rounded-md px-4 py-2 text-base font-medium disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={onCancel} className="rounded-md px-4 py-2 text-base font-medium" style={{ color: "var(--text-secondary)" }}>
              Cancel
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}
