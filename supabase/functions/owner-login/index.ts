// owner-login — ROT020. Public, unauthenticated endpoint (verify_jwt=false,
// same pattern as gps-ingest): the whole point is that an owner has no
// Supabase Auth account to bear a JWT with in the first place.
//
// Verifies a permanent 8-char login code (ROD018) against public.owners
// (service role — RLS would otherwise block an anonymous caller entirely,
// which is correct for every other path into this table) and, on a match,
// mints a custom-signed Supabase-compatible JWT carrying owner_id/business_id
// claims. From then on the Owners' Portal talks straight to PostgREST with
// that JWT as its bearer token, same as any real Supabase Auth session —
// RLS policies added for owner-readable tables key off auth.jwt()->>'owner_id'.
//
// Session model: custom signed JWT, not an opaque token + proxy table
// (decided explicitly over the alternative — see BRAINS/RACOS.md ROD020).
// Token is long-lived (365 days) since the login code itself never expires
// (ROD018) and there is no refresh endpoint yet; the portal should persist
// the code itself (not just the token) so it can silently re-call this
// function if a stored token is ever found expired.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { create as signJwt } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Must equal the project's real Auth JWT secret (Project Settings > API >
// JWT Settings > JWT Secret) — PostgREST verifies incoming bearer tokens
// against that same secret, so a token signed with anything else is
// accepted here but rejected by every subsequent RLS-gated read. Set via
// `supabase secrets set JWT_SECRET=...` — not settable through the MCP
// tools (no secrets-management tool exposed), so this is a manual step.
const JWT_SECRET = Deno.env.get("JWT_SECRET");

const TOKEN_LIFETIME_SECONDS = 60 * 60 * 24 * 365; // 365 days

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // tighten to owners.racos.app at deploy time
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

let cachedKey: CryptoKey | null = null;
async function getSigningKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  if (!JWT_SECRET) {
    throw new Error(
      "JWT_SECRET is not set for this function. Set it to the project's Auth JWT Secret via `supabase secrets set JWT_SECRET=...`.",
    );
  }
  cachedKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return cachedKey;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  let body: { code?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const rawCode = typeof body.code === "string" ? body.code : "";
  // Forgiving of stray whitespace/case — CODE_CHARS is already
  // all-uppercase with ambiguous characters excluded (see lib/repo/owners.ts).
  const code = rawCode.trim().toUpperCase();
  if (code.length === 0) {
    return json({ error: "Login code is required." }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: owner, error } = await admin
    .from("owners")
    .select("id, business_id, full_name")
    .eq("login_code", code)
    .maybeSingle();

  if (error) {
    console.error("owner-login lookup failed:", error.message);
    return json({ error: "Login failed. Please try again." }, 500);
  }
  if (!owner) {
    return json({ error: "That code doesn't match any owner. Double-check and try again." }, 401);
  }

  let key: CryptoKey;
  try {
    key = await getSigningKey();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    return json({ error: "Login is temporarily unavailable. Please try again shortly." }, 500);
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: `${SUPABASE_URL}/auth/v1`,
    aud: "authenticated",
    role: "authenticated",
    sub: owner.id,
    owner_id: owner.id,
    business_id: owner.business_id,
    full_name: owner.full_name,
    iat: now,
    exp: now + TOKEN_LIFETIME_SECONDS,
  };

  const token = await signJwt({ alg: "HS256", typ: "JWT" }, payload, key);

  return json({
    token,
    expires_at: new Date((now + TOKEN_LIFETIME_SECONDS) * 1000).toISOString(),
    owner: { id: owner.id, business_id: owner.business_id, full_name: owner.full_name },
  });
});
