import { useState } from "react";
import CarActivity from "./CarActivity";
import EntriesScreen from "./EntriesScreen";

type Subtab = "carActivity" | "entries";

// Rendered as a real subtab bar (same pattern as Rentals' Ongoing/History
// and Settlements' Records/Remittances) so further tools can land later
// without restructuring this screen.
//
// Logs moved out to the top-level Logs tab (see LogsHubScreen.tsx),
// alongside Settlements > Records, to cut sidebar/subtab clutter — same
// component (LogsScreen.tsx), same logic, same look, just a different home.
export default function ToolsScreen() {
  const [subtab, setSubtab] = useState<Subtab>("carActivity");

  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-md p-1" style={{ background: "var(--surface-1)" }}>
        {(
          [
            { id: "carActivity", label: "Car Activity" },
            { id: "entries", label: "Entries" },
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

      {subtab === "carActivity" && <CarActivity />}
      {subtab === "entries" && <EntriesScreen />}
    </div>
  );
}
