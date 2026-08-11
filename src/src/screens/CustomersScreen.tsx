import { useEffect, useMemo, useState } from "react";
import { createCustomer, deleteCustomer, listCustomers, updateCustomerAddress } from "../lib/repo/customers";
import { listMunicipalities, listProvinces } from "../lib/repo/locations";
import { useSettings } from "../lib/settingsContext";
import { isProvinceVisible } from "../lib/islandGroups";
import SearchableSelect from "../components/SearchableSelect";
import type { Customer, Municipality, Province } from "../lib/types";

const inputStyle: React.CSSProperties = {
  border: "0.5px solid var(--border-strong)",
  background: "var(--surface-2)",
  color: "var(--text-primary)",
};

// Same shape as RegistryScreen's combineAddress — not shared across screens,
// same spirit as this app's other small per-screen formatting helpers.
function combineAddress(municipality: Municipality | undefined, province: Province | undefined, line: string) {
  return [line, municipality?.name, province?.name].filter(Boolean).join(", ");
}

export default function CustomersScreen() {
  const { settings } = useSettings();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [license, setLicense] = useState("");
  const [provinceId, setProvinceId] = useState("");
  const [municipalityId, setMunicipalityId] = useState("");
  const [addressLine, setAddressLine] = useState("");

  async function refresh() {
    setLoading(true);
    const [c, p, m] = await Promise.all([listCustomers(), listProvinces(), listMunicipalities()]);
    setCustomers(c);
    setProvinces(p);
    setMunicipalities(m);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return;
    await createCustomer({
      full_name: fullName.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      license_number: license.trim() || undefined,
      address_province_id: provinceId || undefined,
      address_municipality_id: municipalityId || undefined,
      address_line: addressLine.trim() || undefined,
    });
    setFullName("");
    setEmail("");
    setPhone("");
    setLicense("");
    setProvinceId("");
    setMunicipalityId("");
    setAddressLine("");
    setShowForm(false);
    await refresh();
  }

  async function handleDelete(id: string) {
    await deleteCustomer(id);
    await refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded px-5 py-2 text-base font-bold uppercase tracking-wide"
          style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
        >
          {showForm ? "Cancel" : "Record customer"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleAdd}
          className="space-y-3 rounded-md p-4"
          style={{ border: "0.5px solid var(--border)" }}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <input
              className="col-span-2 rounded-md px-3 py-2.5 text-base"
              style={inputStyle}
              placeholder="Full name *"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
            <input
              className="rounded-md px-3 py-2.5 text-base"
              style={inputStyle}
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="rounded-md px-3 py-2.5 text-base"
              style={inputStyle}
              placeholder="Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <input
              className="col-span-2 rounded-md px-3 py-2.5 text-base"
              style={inputStyle}
              placeholder="License number"
              value={license}
              onChange={(e) => setLicense(e.target.value)}
            />
          </div>

          <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            Address (optional — fill in now or edit later)
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex-1">
              <SearchableSelect
                value={provinceId}
                onChange={(v) => {
                  setProvinceId(v);
                  setMunicipalityId("");
                }}
                options={provinceOptions}
                placeholder="Province (optional)"
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
            placeholder="Street address"
            value={addressLine}
            onChange={(e) => setAddressLine(e.target.value)}
          />

          <button
            type="submit"
            className="w-full rounded-md px-3 py-1.5 text-base font-medium"
            style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
          >
            Save
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-base" style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : customers.length === 0 ? (
        <p className="text-base" style={{ color: "var(--text-muted)" }}>No customers yet.</p>
      ) : (
        <table className="w-full border-collapse text-left text-base">
          <thead>
            <tr style={{ background: "var(--surface-1)" }}>
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Name</th>
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Email</th>
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Phone</th>
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>License</th>
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>Address</th>
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)" }}></th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) =>
              editingId === c.id ? (
                <tr key={c.id}>
                  <td colSpan={6} className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)" }}>
                    <CustomerAddressEditRow
                      customer={c}
                      provinces={provinces}
                      municipalities={municipalities}
                      onCancel={() => setEditingId(null)}
                      onSaved={async () => {
                        setEditingId(null);
                        await refresh();
                      }}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={c.id}>
                  <td className="px-3 py-2.5 font-medium" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>{c.full_name}</td>
                  <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>{c.email ?? "—"}</td>
                  <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>{c.phone ?? "—"}</td>
                  <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>{c.license_number ?? "—"}</td>
                  <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>
                    {combineAddress(
                      municipalities.find((m) => m.id === c.address_municipality_id),
                      provinces.find((p) => p.id === c.address_province_id),
                      c.address_line ?? "",
                    ) || "No address on file"}
                  </td>
                  <td className="px-3 py-2.5 text-right" style={{ border: "0.5px solid var(--border)" }}>
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => setEditingId(c.id)}
                        className="text-sm font-medium"
                        style={{ color: "var(--text-accent)" }}
                      >
                        Edit address
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
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

// Address-only inline edit — same narrow scope as updateCustomerAddress
// itself (name/email/phone/license have no edit path yet).
function CustomerAddressEditRow({
  customer,
  provinces,
  municipalities,
  onCancel,
  onSaved,
}: {
  customer: Customer;
  provinces: Province[];
  municipalities: Municipality[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { settings } = useSettings();
  const [provinceId, setProvinceId] = useState(customer.address_province_id ?? "");
  const [municipalityId, setMunicipalityId] = useState(customer.address_municipality_id ?? "");
  const [addressLine, setAddressLine] = useState(customer.address_line ?? "");
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
      await updateCustomerAddress(customer.id, {
        address_province_id: provinceId || null,
        address_municipality_id: municipalityId || null,
        address_line: addressLine.trim() || null,
      });
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
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
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <SearchableSelect
            value={provinceId}
            onChange={(v) => {
              setProvinceId(v);
              setMunicipalityId("");
            }}
            options={provinceOptions}
            placeholder="Province (optional)"
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
        placeholder="Street address"
        value={addressLine}
        onChange={(e) => setAddressLine(e.target.value)}
      />
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
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
