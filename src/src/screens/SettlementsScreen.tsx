import { useState } from "react";
import RemittancesReport from "./RemittancesReport";
import CustomerOutstandingTab from "./CustomerOutstandingTab";

type Subtab = "remittances" | "outstanding";

// Records moved out to the top-level Logs tab (see LogsHubScreen.tsx).
// Outstanding moved in from Customers > Outstanding — same component, same
// logic, same look, just grouped here since it's payment-collection
// follow-up like Remittances rather than customer-record management.
export default function SettlementsScreen() {
  const [subtab, setSubtab] = useState<Subtab>("remittances");

  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-md p-1 print:hidden" style={{ background: "var(--surface-1)" }}>
        {(
          [
            { id: "remittances", label: "Remittances" },
            { id: "outstanding", label: "Outstanding" },
          ] as { id: Subtab; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setSubtab(t.id)}
            className="rounded px-4 py-1.5 text-sm font-medium"
            style={
              subtab === t.id
                ? { background: "var(--fill-primary)", color: "var(--on-primary)" }
                : { color: "var(--text-secondary)" }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {subtab === "remittances" && <RemittancesReport />}
      {subtab === "outstanding" && <CustomerOutstandingTab />}
    </div>
  );
}
