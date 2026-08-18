import { useState } from "react";
import SettlementsRecordsTab from "./SettlementsRecordsTab";
import LogsScreen from "./LogsScreen";

type Subtab = "records" | "logs";

// New top-level Logs tab — groups two screens that used to live in
// different places (Settlements > Records, Tools > Logs) purely for
// navigation convenience. Neither screen's own logic or look changed; this
// is just their new shared home, same nested-subtab pattern as
// Settlements/Rentals/Tools already use.
export default function LogsHubScreen() {
  const [subtab, setSubtab] = useState<Subtab>("records");

  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-md p-1 print:hidden" style={{ background: "var(--surface-1)" }}>
        {(
          [
            { id: "records", label: "Records" },
            { id: "logs", label: "Logs" },
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

      {subtab === "records" && <SettlementsRecordsTab />}
      {subtab === "logs" && <LogsScreen />}
    </div>
  );
}
