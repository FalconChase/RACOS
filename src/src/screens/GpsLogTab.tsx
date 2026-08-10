import { useState } from "react";
import GpsLocationsTab from "./GpsLocationsTab";
import MileageTab from "./MileageTab";

type GpsSubtab = "locations" | "mileage";

// ROP011 follow-up — GPS Log split into Locations (point-in-time pins) and
// Mileage (period-based figures, hand-copied from Traccar for now). Same
// nested-subtab pattern as EntriesScreen itself.
export default function GpsLogTab() {
  const [subtab, setSubtab] = useState<GpsSubtab>("locations");

  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-md p-1" style={{ background: "var(--surface-1)" }}>
        {(
          [
            { id: "locations", label: "Locations" },
            { id: "mileage", label: "Mileage" },
          ] as { id: GpsSubtab; label: string }[]
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

      {subtab === "locations" && <GpsLocationsTab />}
      {subtab === "mileage" && <MileageTab />}
    </div>
  );
}
