"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ensureSession, clearSession, type OwnerSession } from "@/lib/ownerAuth";

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<OwnerSession | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    ensureSession().then((s) => {
      if (cancelled) return;
      if (!s) {
        router.replace("/login");
        return;
      }
      setSession(s);
      setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  function handleSignOut() {
    clearSession();
    router.replace("/login");
  }

  if (checking || !session) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-950">
        <p className="text-sm text-zinc-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-950">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">RACOS Owners&rsquo; Portal</p>
          <h1 className="text-lg font-semibold text-zinc-50">Welcome, {session.owner.full_name}</h1>
        </div>
        <button
          onClick={handleSignOut}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
        >
          Sign out
        </button>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <p className="max-w-md text-center text-sm text-zinc-500">
          Your fleet activity, financials, and vehicle status will appear here soon.
        </p>
      </main>
    </div>
  );
}
