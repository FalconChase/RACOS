import { useEffect, useState } from "react";
import { createCustomer, deleteCustomer, listCustomers } from "../lib/repo/customers";
import type { Customer } from "../lib/types";

const inputStyle: React.CSSProperties = {
  border: "0.5px solid var(--border-strong)",
  background: "var(--surface-2)",
  color: "var(--text-primary)",
};

export default function CustomersScreen() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [license, setLicense] = useState("");

  async function refresh() {
    setLoading(true);
    setCustomers(await listCustomers());
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return;
    await createCustomer({
      full_name: fullName.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      license_number: license.trim() || undefined,
    });
    setFullName("");
    setEmail("");
    setPhone("");
    setLicense("");
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
          className="grid grid-cols-2 gap-3 rounded-md p-4 sm:grid-cols-4"
          style={{ border: "0.5px solid var(--border)" }}
        >
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
          <button
            type="submit"
            className="col-span-2 rounded-md px-3 py-1.5 text-base font-medium sm:col-span-4"
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
              <th className="px-3 py-2.5 font-semibold" style={{ border: "0.5px solid var(--border)" }}></th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2.5 font-medium" style={{ border: "0.5px solid var(--border)", color: "var(--text-primary)" }}>{c.full_name}</td>
                <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>{c.email ?? "—"}</td>
                <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>{c.phone ?? "—"}</td>
                <td className="px-3 py-2.5" style={{ border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}>{c.license_number ?? "—"}</td>
                <td className="px-3 py-2.5 text-right" style={{ border: "0.5px solid var(--border)" }}>
                  <button
                    onClick={() => handleDelete(c.id)}
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
    </div>
  );
}
