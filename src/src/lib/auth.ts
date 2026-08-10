import { supabase } from "./supabaseClient";
import {
  setActiveSession,
  clearActiveSession,
  ensureLocalBusinessAndProfile,
  reassignLegacyDevData,
  cacheLocalSession,
  loadCachedSession,
  clearCachedSession,
  type RemoteBusiness,
  type RemoteProfile,
} from "./db";

export type BootstrapResult =
  | { authenticated: true; offline: boolean }
  | { authenticated: false; reason: "no-session" | "offline-no-cache" | "profile-missing" };

// Called once at app launch. Resolves who's signed in and makes their
// business_id/profile_id available via currentBusinessId()/currentProfileId().
// Prefers a live Supabase fetch (so local mirror + cache stay current); falls
// back to the last-cached session if the device is offline (ROD002/ROD017).
export async function bootstrapSession(): Promise<BootstrapResult> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return { authenticated: false, reason: "no-session" };
  }

  const user = session.user;

  try {
    // maybeSingle(), not single() — a genuinely missing profile (first sign-in
    // right after email confirmation) resolves as {data: null, error: null},
    // distinct from a network/fetch failure, which throws or returns an error.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, business_id, role, full_name, created_at, updated_at")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return { authenticated: false, reason: "profile-missing" };

    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .select("id, name, owner_id, plan, trial_ends_at, created_at, updated_at")
      .eq("id", profile.business_id)
      .maybeSingle();
    if (businessError) throw businessError;
    if (!business) return { authenticated: false, reason: "profile-missing" };

    await ensureLocalBusinessAndProfile(business as RemoteBusiness, profile as RemoteProfile);
    await reassignLegacyDevData(profile.business_id);
    setActiveSession(profile.business_id, profile.id);
    await cacheLocalSession(profile.business_id, profile.id, user.email ?? "");
    return { authenticated: true, offline: false };
  } catch {
    // Network/fetch failure (offline) — fall back to whatever this device
    // last resolved successfully while online, if it matches this user.
    const cached = await loadCachedSession();
    if (cached && cached.profileId === user.id) {
      setActiveSession(cached.businessId, cached.profileId);
      return { authenticated: true, offline: true };
    }
    return { authenticated: false, reason: "offline-no-cache" };
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export type SignUpBusinessResult =
  | { needsEmailConfirmation: true }
  | { needsEmailConfirmation: false };

// First-time business signup: creates the auth user, then the businesses +
// profiles rows (owner role). If the project requires email confirmation,
// Supabase returns no session yet — the business/profile rows get created
// the first time the owner actually signs in and bootstrapSession() runs
// into "profile-missing" (see below), not here.
export async function signUpBusiness(
  email: string,
  password: string,
  businessName: string,
  fullName: string,
): Promise<SignUpBusinessResult> {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;

  if (!data.session || !data.user) {
    return { needsEmailConfirmation: true };
  }

  await provisionBusinessForUser(data.user.id, businessName, fullName);
  return { needsEmailConfirmation: false };
}

// Creates the businesses + profiles rows for a signed-in user that doesn't
// have a profile yet — covers both the no-email-confirmation signup path
// above, and a first sign-in after confirming email in the other path.
export async function provisionBusinessForUser(
  userId: string,
  businessName: string,
  fullName: string,
): Promise<void> {
  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .insert({ name: businessName, owner_id: userId })
    .select()
    .single();
  if (businessError || !business) throw businessError ?? new Error("business insert failed");

  const { error: profileError } = await supabase
    .from("profiles")
    .insert({ id: userId, business_id: business.id, role: "owner", full_name: fullName });
  if (profileError) throw profileError;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  clearActiveSession();
  await clearCachedSession();
}
