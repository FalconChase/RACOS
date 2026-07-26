import { useEffect, useMemo, useState } from "react";
import { createOwner, deleteOwner, listOwners, updateOwner } from "../lib/repo/owners";
import { createVehicle } from "../lib/repo/vehicles";
import { listMunicipalities, listProvinces } from "../lib/repo/locations";
import FormQuestion from "../components/FormQuestion";
import SearchableSelect from "../components/SearchableSelect";
import type { Municipality, Owner, Province } from "../lib/types";

const NEW_OWNER = "__new__";

type Subtab = "vehicleOwner" | "owners";

const inputStyle: React.CSSProperties = {
  border: "0.5px solid var(--border-strong)",
  background: "var(--surface-2)",
  color: "var(--text-primary)",
};

const labelStyle: React.CSSProperties = { color: "var(--text-secondary)" };

export default function RegistryScreen() {
  const [subtab, setSubtab] = useState<Subtab>("vehicleOwner");

  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-md p-1" style={{ background: "var(--surface-1)" }}>
        {(
          [
            { id: "vehicleOwner" as const, label: "Vehicle & Owner" },
            { id: "owners" as const, label: "Owners" },
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

      {subtab === "vehicleOwner" ? <VehicleOwnerForm /> : <OwnersList />}
    </div>
  );
}

// --- Vehicle & Owner: unified intake form ----------------------------------

function combineAddress(municipality: Municipality | undefined, province: Province | undefined, line: string) {
  return [line, municipality?.name, province?.name].filter(Boolean).join(", ");
}

function VehicleOwnerForm() {
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

  const provinceOptions = useMemo(
    () => provinces.map((p) => ({ value: p.id, label: p.name, sublabel: p.region_name })),
    [provinces],
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
            className="col-span-2 rounded-md px-3 py-2.5 text-base sm:col-span-1"
            style={inputStyle}
            placeholder="GPS notes"
            value={gpsNotes}
            onChange={(e) => setGpsNotes(e.target.value)}
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
  const [fullName, setFullName] = useState(owner.full_name);
  const [provinceId, setProvinceId] = useState(owner.address_province_id ?? "");
  const [municipalityId, setMunicipalityId] = useState(owner.address_municipality_id ?? "");
  const [addressLine, setAddressLine] = useState(owner.address_line ?? "");
  const [contactNumber, setContactNumber] = useState(owner.contact_number ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const provinceOptions = useMemo(
    () => provinces.map((p) => ({ value: p.id, label: p.name, sublabel: p.region_name })),
    [provinces],
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
