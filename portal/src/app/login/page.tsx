"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { loginWithCode } from "@/lib/ownerAuth";

export default function LoginPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginWithCode(code);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-900 p-8">
        <h1 className="text-xl font-semibold text-zinc-50">RACOS Owners&rsquo; Portal</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Enter the login code your business gave you.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. RYJB9RF9"
            maxLength={8}
            autoFocus
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-center font-mono text-lg uppercase tracking-widest text-zinc-50 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
          />

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading || code.trim().length === 0}
            className="rounded-md bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Checking…" : "Log in"}
          </button>
        </form>
      </div>
    </div>
  );
}
