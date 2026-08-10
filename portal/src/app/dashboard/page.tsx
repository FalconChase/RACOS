"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ensureSession, clearSession, type OwnerSession } from "@/lib/ownerAuth";
import { fetchOwnerVehicles, fetchOwnerBookings, type OwnerVehicle, type OwnerBooking } from "@/lib/ownerData";
import VehicleStatusTab from "@/components/VehicleStatusTab";
import ActivityLogTab from "@/components/ActivityLogTab";
import FinancialsTab from "@/components/FinancialsTab";

type Tab = "vehicles" | "activity" | "financials";

const TABS: { id: Tab; label: string }[] = [
  { id: "vehicles", label: "Vehicle status" },
  { id: "activity", label: "Activity log" },
  { id: "financials", label: "Financials" },
];

type DataState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; vehicles: OwnerVehicle[]; bookings: OwnerBooking[] };

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<OwnerSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<Tab>("vehicles");
  const [data, setData] = useState<DataState>({ status: "loading" });

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

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    Promise.all([fetchOwnerVehicles(session.token), fetchOwnerBookings(session.token)])
      .then(([vehicles, bookings]) => {
        if (cancelled) return;
        setData({ status: "ready", vehicles, bookings });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Failed to load your data. Please try again.";
        setData({ status: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

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

      <nav className="flex gap-1 border-b border-zinc-800 px-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-zinc-100 text-zinc-50"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="flex-1 px-6 py-6">
        {data.status === "loading" && <p className="text-sm text-zinc-500">Loading your fleet data…</p>}
        {data.status === "error" && <p className="text-sm text-red-400">{data.message}</p>}
        {data.status === "ready" && (
          <>
            {tab === "vehicles" && <VehicleStatusTab vehicles={data.vehicles} />}
            {tab === "activity" && <ActivityLogTab bookings={data.bookings} />}
            {tab === "financials" && <FinancialsTab bookings={data.bookings} />}
          </>
        )}
      </main>
    </div>
  );
}
