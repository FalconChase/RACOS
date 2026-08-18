import { useEffect, useState } from "react";
import {
  createCustomerContact,
  deleteCustomerContact,
  listCustomerContacts,
  updateCustomerContact,
} from "../lib/repo/customerContacts";
import type { Customer, CustomerContact, CustomerContactType } from "../lib/types";

const inputStyle: React.CSSProperties = {
  border: "0.5px solid var(--border-strong)",
  background: "var(--surface-2)",
  color: "var(--text-primary)",
};

const TYPE_LABELS: Record<CustomerContactType, string> = {
  phone: "Phone",
  email: "Email",
  other: "Other",
};

function displayLabel(contact: CustomerContact): string {
  if (contact.type === "other") return contact.label?.trim() || "Other";
  return contact.label?.trim() || TYPE_LABELS[contact.type];
}

// Optional extra contact entries beyond a customer's single phone/email
// fields (which this panel never touches) — add as many as needed, each
// with its own type (Phone/Email/Other — "Other" asks for a free-text
// description) and an optional descriptive label on top of that (e.g.
// "Work", "Emergency"). Every add/edit/remove is logged to action_logs
// (see lib/repo/customerContacts.ts) the same way other customer edits are.
// hideHeader/onClose are optional — set hideHeader when this is embedded
// inside a wrapper that already provides its own "Additional contacts for
// X" heading and show/hide toggle (e.g. New rental's Profile step, see
// BookingContactsSection), so the two headers/close affordances don't stack.
export default function CustomerContactsPanel({
  customer,
  onClose,
  hideHeader,
}: {
  customer: Customer;
  onClose?: () => void;
  hideHeader?: boolean;
}) {
  const [contacts, setContacts] = useState<CustomerContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setContacts(await listCustomerContacts(customer.id));
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.id]);

  async function handleDelete(id: string) {
    setError(null);
    try {
      await deleteCustomerContact(id, customer.full_name);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-3 rounded-md p-3" style={{ background: "var(--surface-2)" }}>
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Additional contacts for {customer.full_name}
          </p>
          {onClose && (
            <button onClick={onClose} className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Close
            </button>
          )}
        </div>
      )}

      {error && (
        <div
          className="flex items-start justify-between gap-4 rounded-md p-2.5 text-sm"
          style={{ background: "var(--bg-danger)", color: "var(--text-danger)" }}
        >
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 font-medium">Dismiss</button>
        </div>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : contacts.length === 0 && !adding ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          No additional contacts on file yet — the phone number above still applies.
        </p>
      ) : (
        <div className="space-y-1.5">
          {contacts.map((contact) =>
            editingId === contact.id ? (
              <ContactEditRow
                key={contact.id}
                contact={contact}
                customerLabel={customer.full_name}
                onCancel={() => setEditingId(null)}
                onSaved={async () => {
                  setEditingId(null);
                  await refresh();
                }}
              />
            ) : (
              <div
                key={contact.id}
                className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm"
                style={{ background: "var(--surface-1)" }}
              >
                <div>
                  <span className="font-medium" style={{ color: "var(--text-primary)" }}>{displayLabel(contact)}</span>
                  <span className="ml-2" style={{ color: "var(--text-secondary)" }}>{contact.value}</span>
                </div>
                <div className="flex shrink-0 gap-3">
                  <button onClick={() => setEditingId(contact.id)} className="text-sm font-medium" style={{ color: "var(--text-accent)" }}>
                    Edit
                  </button>
                  <button onClick={() => handleDelete(contact.id)} className="text-sm font-medium" style={{ color: "var(--text-danger)" }}>
                    Remove
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      )}

      {adding ? (
        <ContactAddRow
          customerId={customer.id}
          customerLabel={customer.full_name}
          onCancel={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await refresh();
          }}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="text-sm font-medium"
          style={{ color: "var(--text-accent)" }}
        >
          + Add contact
        </button>
      )}
    </div>
  );
}

// Exported for DraftContactsEditor (New rental's not-yet-created-customer
// case) to reuse the exact same type/label/value inputs.
export function ContactFields({
  type,
  setType,
  label,
  setLabel,
  value,
  setValue,
}: {
  type: CustomerContactType;
  setType: (t: CustomerContactType) => void;
  label: string;
  setLabel: (v: string) => void;
  value: string;
  setValue: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <select
        className="rounded-md px-3 py-2 text-sm"
        style={inputStyle}
        value={type}
        onChange={(e) => setType(e.target.value as CustomerContactType)}
      >
        <option value="phone">Phone</option>
        <option value="email">Email</option>
        <option value="other">Other</option>
      </select>
      <input
        className="rounded-md px-3 py-2 text-sm"
        style={inputStyle}
        placeholder={type === "other" ? "Please specify *" : "Label (optional)"}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <input
        className="col-span-2 rounded-md px-3 py-2 text-sm"
        style={inputStyle}
        placeholder={type === "email" ? "Email address *" : "Contact value *"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </div>
  );
}

function ContactAddRow({
  customerId,
  customerLabel,
  onCancel,
  onSaved,
}: {
  customerId: string;
  customerLabel: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<CustomerContactType>("phone");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = value.trim().length > 0 && (type !== "other" || label.trim().length > 0);

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await createCustomerContact({ customer_id: customerId, type, label: label.trim() || undefined, value: value.trim() }, customerLabel);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md p-2.5" style={{ border: "0.5px dashed var(--border-strong)" }}>
      <ContactFields type={type} setType={setType} label={label} setLabel={setLabel} value={value} setValue={setValue} />
      {error && <p className="text-sm" style={{ color: "var(--text-danger)" }}>{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel} className="rounded-md px-3 py-1.5 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function ContactEditRow({
  contact,
  customerLabel,
  onCancel,
  onSaved,
}: {
  contact: CustomerContact;
  customerLabel: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<CustomerContactType>(contact.type);
  const [label, setLabel] = useState(contact.label ?? "");
  const [value, setValue] = useState(contact.value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = value.trim().length > 0 && (type !== "other" || label.trim().length > 0);

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await updateCustomerContact(contact.id, { type, label: label.trim() || undefined, value: value.trim() }, customerLabel);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md p-2.5" style={{ border: "0.5px solid var(--border-strong)" }}>
      <ContactFields type={type} setType={setType} label={label} setLabel={setLabel} value={value} setValue={setValue} />
      {error && <p className="text-sm" style={{ color: "var(--text-danger)" }}>{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel} className="rounded-md px-3 py-1.5 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
