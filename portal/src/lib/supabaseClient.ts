// Not used by login itself (owner-login is a plain fetch, see
// lib/ownerAuth.ts) — this is for the data screens that come next.
//
// createOwnerClient() must be called with the owner's session token as the
// bearer on every request, so PostgREST/RLS resolves owner_id/business_id
// from the JWT's custom claims (ROD020). A bare createClient() with no
// token has no owner context and every RLS-gated table will simply return
// nothing.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function createOwnerClient(token: string): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set — check .env.local.",
    );
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
