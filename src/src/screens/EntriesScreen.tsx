import { useState } from "react";
import OdometerLogTab from "./OdometerLogTab";
import GpsLogTab from "./GpsLogTab";
import FuelLevelTab from "./FuelLevelTab";
import EntriesReportsTab from "./EntriesReportsTab";

type EntriesSubtab = "odometer" | "gps" | "fuel" | "reports";

// ROP011 — Tools > Entries. Same subtab-bar pattern as ToolsScreen itself
// (Car Activity/Logs) and Rentals/Settlements before it.
export default function EntriesScreen() {
  const [subtab, setSubtab] = useState<EntriesSubtab>("odometer");

  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-md p-1" style={{ background: "var(--surface-1)" }}>
        {(
          [
            { id: "odometer", label: "Odometer Log" },
            { id: "gps", label: "GPS Log" },
            { id: "fuel", label: "Fuel Level" },
            { id: "reports", label: "Reports" },
          ] as { id: EntriesSubtab; label: string }[]
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

      {subtab === "odometer" && <OdometerLogTab />}
      {subtab === "gps" && <GpsLogTab />}
      {subtab === "fuel" && <FuelLevelTab />}
      {subtab === "reports" && <EntriesReportsTab />}
    </div>
  );
}
