import { useState } from "react";
import { signIn, signUpBusiness, provisionBusinessForUser } from "../lib/auth";
import { supabase } from "../lib/supabaseClient";

type Mode = "signin" | "signup" | "complete-profile";

const inputStyle = {
  border: "0.5px solid var(--border)",
  background: "var(--surface-1)",
  color: "var(--text-primary)",
} as const;

export default function LoginScreen({
  initialMode = "signin",
  onDone,
}: {
  initialMode?: Mode;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await signUpBusiness(email, password, businessName, fullName);
      if (result.needsEmailConfirmation) {
        setNotice("Account created — check your email to confirm, then sign in below.");
        setMode("signin");
      } else {
        onDone();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleCompleteProfile(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Not signed in");
      await provisionBusinessForUser(data.user.id, businessName, fullName);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      className="flex h-screen items-center justify-center"
      style={{ background: "var(--surface-2)" }}
    >
      <div
        className="w-full max-w-sm rounded-lg p-8"
        style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)" }}
      >
        <h1 className="mb-1 text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
          RACOS
        </h1>
        <p className="mb-6 text-sm" style={{ color: "var(--text-muted)" }}>
          {mode === "signin" && "Sign in to your business account"}
          {mode === "signup" && "Set up your business on RACOS"}
          {mode === "complete-profile" && "Almost done — name your business"}
        </p>

        {notice && (
          <p
            className="mb-4 rounded-md px-3 py-2 text-sm"
            style={{ background: "var(--bg-success)", color: "var(--text-success)" }}
          >
            {notice}
          </p>
        )}
        {error && (
          <p
            className="mb-4 rounded-md px-3 py-2 text-sm"
            style={{ background: "var(--bg-danger)", color: "var(--text-danger)" }}
          >
            {error}
          </p>
        )}

        {mode === "signin" && (
          <form className="flex flex-col gap-3" onSubmit={handleSignIn}>
            <input
              type="email"
              required
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
            <input
              type="password"
              required
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
            <button
              type="submit"
              disabled={busy}
              className="mt-1 rounded-md px-3 py-2 text-sm font-medium disabled:opacity-60"
              style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => { setError(null); setNotice(null); setMode("signup"); }}
              className="text-sm"
              style={{ color: "var(--text-accent)" }}
            >
              First time here? Set up your business
            </button>
          </form>
        )}

        {mode === "signup" && (
          <form className="flex flex-col gap-3" onSubmit={handleSignUp}>
            <input
              required
              placeholder="Business name"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="rounded-md px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
            <input
              required
              placeholder="Your full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="rounded-md px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
            <input
              type="email"
              required
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Password (min. 6 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
            <button
              type="submit"
              disabled={busy}
              className="mt-1 rounded-md px-3 py-2 text-sm font-medium disabled:opacity-60"
              style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
            >
              {busy ? "Creating…" : "Create business account"}
            </button>
            <button
              type="button"
              onClick={() => { setError(null); setNotice(null); setMode("signin"); }}
              className="text-sm"
              style={{ color: "var(--text-accent)" }}
            >
              Already set up? Sign in
            </button>
          </form>
        )}

        {mode === "complete-profile" && (
          <form className="flex flex-col gap-3" onSubmit={handleCompleteProfile}>
            <input
              required
              placeholder="Business name"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="rounded-md px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
            <input
              required
              placeholder="Your full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="rounded-md px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
            <button
              type="submit"
              disabled={busy}
              className="mt-1 rounded-md px-3 py-2 text-sm font-medium disabled:opacity-60"
              style={{ background: "var(--fill-primary)", color: "var(--on-primary)" }}
            >
              {busy ? "Saving…" : "Finish setup"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
