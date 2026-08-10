// Owner session handling — ROT020. Talks to the `owner-login` Edge Function
// (custom HS256 JWT, ROD020) and persists the result client-side.
//
// Two things are stored, not just the token: the token itself (used as the
// PostgREST bearer for RLS-scoped reads) and the raw login code. The code
// is what makes silent refresh possible — per ROD018 the code never
// expires, so if a stored token is ever found expired, ensureSession()
// re-calls the login endpoint with the saved code instead of forcing the
// owner to retype it.

export interface OwnerSession {
  token: string;
  code: string;
  expiresAt: string;
  owner: { id: string; business_id: string; full_name: string };
}

const STORAGE_KEY = "racos_owner_session";

function loginUrl(): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set — check .env.local.");
  }
  return `${base}/functions/v1/owner-login`;
}

export async function loginWithCode(rawCode: string): Promise<OwnerSession> {
  const code = rawCode.trim().toUpperCase();
  if (code.length === 0) {
    throw new Error("Login code is required.");
  }

  const res = await fetch(loginUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? "Login failed. Please try again.");
  }

  const session: OwnerSession = {
    token: data.token,
    code,
    expiresAt: data.expires_at,
    owner: data.owner,
  };
  persistSession(session);
  return session;
}

function persistSession(session: OwnerSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function getStoredSession(): OwnerSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OwnerSession;
  } catch {
    return null;
  }
}

export function isSessionExpired(session: OwnerSession): boolean {
  const expiresAt = new Date(session.expiresAt).getTime();
  return Number.isNaN(expiresAt) || expiresAt <= Date.now();
}

export function clearSession(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

// Silently re-mints a token from the stored code if the current one has
// expired. Returns null (caller should send the owner to /login) if there's
// no stored session at all, or if the stored code no longer resolves —
// e.g. staff regenerated this owner's code since the last visit.
export async function refreshSession(): Promise<OwnerSession | null> {
  const current = getStoredSession();
  if (!current) return null;
  try {
    return await loginWithCode(current.code);
  } catch {
    clearSession();
    return null;
  }
}

// The one function data-fetching screens should call: resolves a valid,
// non-expired session (refreshing transparently if needed), or null if the
// owner needs to log in again.
export async function ensureSession(): Promise<OwnerSession | null> {
  const current = getStoredSession();
  if (!current) return null;
  if (isSessionExpired(current)) {
    return refreshSession();
  }
  return current;
}
