import { useEffect } from "react";
import { runOutboundSync } from "../lib/repo/sync";

// ROP009 — background poller draining the outbox up to Supabase, same
// "cheap polling for now" pattern AutoDepartureRunner already uses for
// auto-mark-departed. Runs once on mount (so a launch always attempts a
// sync immediately, in case mutations queued up while the app was closed)
// and then once an hour — silent, no user action required, matching this
// project's offline-first default (ROD002). A connectivity failure just
// leaves the batch as 'failed' for the next tick to retry, same as
// everything else in the outbox — no separate backoff needed since the
// hourly interval itself is the backoff. Settings > Account has a manual
// "Sync now" button (calls the same runOutboundSync()) for anyone who
// wants an immediate push instead of waiting for the next hourly tick.
const AUTO_SYNC_INTERVAL_MS = 60 * 60 * 1000;

export default function SyncRunner() {
  useEffect(() => {
    let stopped = false;
    async function run() {
      if (stopped) return;
      try {
        await runOutboundSync();
      } catch (err) {
        // Belt-and-suspenders — runOutboundSync() already catches per-row
        // failures internally; this only guards against something outside
        // that (e.g. getDb() itself failing).
        console.error("runOutboundSync failed:", err);
      }
    }
    run();
    const id = setInterval(run, AUTO_SYNC_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);

  return null;
}
