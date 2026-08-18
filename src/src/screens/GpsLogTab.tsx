import { useState } from "react";
import GpsLocationsTab from "./GpsLocationsTab";
import MileageTab from "./MileageTab";
import GpsLogSheetTab from "./GpsLogSheetTab";

type GpsSubtab = "locations" | "mileage" | "logsheet";

// ROP011 follow-up — GPS Log split into Locations (point-in-time pins) and
// Mileage (period-based figures, hand-copied from Traccar for now). Same
// nested-subtab pattern as EntriesScreen itself.
//
// Log sheet is a read-only third view over the same Locations data — the
// digitized "VEHICLES GPS LOG" paper sheet (Points/Time/Location/Park
// time/Estimated distance/Estimated speed), see lib/gpsLogSheet.ts. No new
// schema, no new writes — it's Locations' own entries, numbered and
// point-to-point calculated.
export default function GpsLogTab() {
  const [subtab, setSubtab] = useState<GpsSubtab>("locations");

  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-md p-1" style={{ background: "var(--surface-1)" }}>
        {(
          [
            { id: "locations", label: "Locations" },
            { id: "mileage", label: "Mileage" },
            { id: "logsheet", label: "Log sheet" },
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
      {subtab === "logsheet" && <GpsLogSheetTab />}
    </div>
  );
}
