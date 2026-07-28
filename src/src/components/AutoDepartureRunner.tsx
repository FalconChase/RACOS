import { useEffect } from "react";
import { autoMarkDepartedDueBookings } from "../lib/repo/bookings";
import { useSettings } from "../lib/settingsContext";

// No visible output — just a background poller for Settings > Rental >
// "Auto-mark departed". Runs once on mount (in case bookings are already
// overdue when the app opens) and then every minute, same "cheap polling for
// now" approach App.tsx already uses for the pending-sync count. Turning the
// setting off simply skips the check; nothing else needs to know it exists.
export default function AutoDepartureRunner() {
  const { settings } = useSettings();

  useEffect(() => {
    if (!settings.autoMarkDeparted) return;
    let stopped = false;
    async function run() {
      if (stopped) return;
      await autoMarkDepartedDueBookings();
    }
    run();
    const id = setInterval(run, 60000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [settings.autoMarkDeparted]);

  return null;
}
