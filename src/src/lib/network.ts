// Shared "was this actually a connectivity failure" check — originally
// lived only in repo/sync.ts (the outbound sync worker), but ROP011's
// "Convert to location" (repo/gpsLocationLabels.ts) needs the exact same
// classification for its own direct network call to Nominatim, so it's
// pulled out here rather than duplicated.
export function isConnectivityError(err: unknown): boolean {
  if (err instanceof TypeError) return true; // fetch() throws TypeError when the network is unreachable
  const message = err instanceof Error ? err.message : String(err);
  return /fetch|network|ENOTFOUND|ECONNREFUSED|timed? ?out/i.test(message);
}
