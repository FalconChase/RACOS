import { useState } from "react";
import { ContactFields } from "./CustomerContactsPanel";
import type { CustomerContactType } from "../lib/types";

// One not-yet-saved contact entry, staged on the New rental form for a
// walk-in customer who doesn't have a customer_id yet — see DraftContact
// usage in BookingsScreen.saveBooking(), which loops these through
// createCustomerContact() right after createCustomer() succeeds.
export interface DraftContact {
  type: CustomerContactType;
  label: string;
  value: string;
}

const TYPE_LABELS: Record<CustomerContactType, string> = { phone: "Phone", email: "Email", other: "Other" };

function displayLabel(c: DraftContact): string {
  if (c.type === "other") return c.label.trim() || "Other";
  return c.label.trim() || TYPE_LABELS[c.type];
}

// Lets staff stage extra contact entries for a brand-new walk-in customer
// before it has a real customer_id to attach them to — nothing here is
// persisted until the booking is actually saved. For an *existing* selected
// customer, BookingContactsSection uses live CustomerContactsPanel instead
// (that customer_id already exists, so there's no reason to defer).
export default function DraftContactsEditor({
  contacts,
  setContacts,
}: {
  contacts: DraftContact[];
  setContacts: (updater: (prev: DraftContact[]) => DraftContact[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<CustomerContactType>("phone");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");

  const canAdd = value.trim().length > 0 && (type !== "other" || label.trim().length > 0);

  function handleAdd() {
    if (!canAdd) return;
    setContacts((prev) => [...prev, { type, label: label.trim(), value: value.trim() }]);
    setType("phone");
    setLabel("");
    setValue("");
    setAdding(false);
  }

  function handleRemove(index: number) {
    setContacts((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      {contacts.length > 0 && (
        <div className="space-y-1.5">
          {contacts.map((c, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm"
              style={{ background: "var(--surface-2)" }}
            >
              <div>
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>{displayLabel(c)}</span>
                <span className="ml-2" style={{ color: "var(--text-secondary)" }}>{c.value}</span>
              </div>
              <button onClick={() => handleRemove(i)} className="text-sm font-medium" style={{ color: "var(--text-danger)" }}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div className="space-y-2 rounded-md p-2.5" style={{ border: "0.5px dashed var(--border-strong)" }}>
          <ContactFields type={type} setType={setType} label={label} setLabel={setLabel} value={value} setValue={setValue} />
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={!canAdd}
              className="rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
            >
              Add
            </button>
            <button onClick={() => setAdding(false)} className="rounded-md px-3 py-1.5 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="text-sm font-medium" style={{ color: "var(--text-accent)" }}>
          + Add contact
        </button>
      )}
    </div>
  );
}
