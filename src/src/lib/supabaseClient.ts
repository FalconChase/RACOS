import { createClient } from "@supabase/supabase-js";

// ROT007 — real Supabase Auth. URL/anon key come from .env.local (gitignored;
// see .env.example). The anon/publishable key is safe to ship client-side —
// it has no access beyond what RLS policies allow (see supabase/migrations).
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy .env.example to .env.local and fill in your project's values.",
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    // Persist the session in the Tauri webview's localStorage so a signed-in
    // business stays signed in across app restarts (no re-login each launch).
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
