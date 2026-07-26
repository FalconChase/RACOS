import { useEffect, useState } from "react";
import { CloudUpIcon, SearchIcon } from "./components/icons";
import { ensureDevBusiness } from "./lib/db";
import { countPendingOutbox } from "./lib/repo/outbox";
import { ensureDefaultSeatingBands } from "./lib/repo/rateMatrix";
import { SettingsProvider } from "./lib/settingsContext";
import Sidebar from "./components/Sidebar";
import HomeScreen from "./screens/HomeScreen";
import VehiclesScreen from "./screens/VehiclesScreen";
import CustomersScreen from "./screens/CustomersScreen";
import BookingsScreen from "./screens/BookingsScreen";
import CheckoutScreen from "./screens/CheckoutScreen";
import SettingsScreen from "./screens/SettingsScreen";
import RateMatrixScreen from "./screens/RateMatrixScreen";
import RegistryScreen from "./screens/RegistryScreen";

export type Tab = "home" | "vehicles" | "customers" | "bookings" | "rateMatrix" | "registry" | "settings";

const TITLES: Record<Tab, string> = {
  home: "Home",
  vehicles: "Fleet",
  customers: "Customers",
  bookings: "Rentals",
  rateMatrix: "Rate Matrix",
  registry: "Registry",
  settings: "Settings",
};

function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [ready, setReady] = useState(false);
  const [pendingSync, setPendingSync] = useState(0);
  const [checkoutBookingId, setCheckoutBookingId] = useState<string | null>(null);

  useEffect(() => {
    ensureDevBusiness()
      .then(() => ensureDefaultSeatingBands())
      .then(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) return;
    countPendingOutbox().then(setPendingSync);
    // Cheap polling for now — the real sync engine (a future ROT item) will
    // push updates instead of this screen re-checking on an interval.
    const id = setInterval(() => countPendingOutbox().then(setPendingSync), 4000);
    return () => clearInterval(id);
  }, [ready, tab, checkoutBookingId]);

  function goToTab(next: Tab) {
    setCheckoutBookingId(null);
    setTab(next);
  }

  if (!ready) {
    return (
      <main className="flex h-screen items-center justify-center" style={{ background: "var(--surface-2)" }}>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Starting up…</p>
      </main>
    );
  }

  return (
    <SettingsProvider>
    <div className="flex h-screen" style={{ background: "var(--surface-2)", color: "var(--text-primary)" }}>
      <Sidebar active={tab} onSelect={goToTab} />

      <main className="flex-1 overflow-y-auto">
        <header
          className="flex items-center gap-3 px-6 py-4"
          style={{ borderBottom: "0.5px solid var(--border)" }}
        >
          <div
            className="flex flex-1 items-center gap-2.5 rounded-md px-4 py-2.5 text-base"
            style={{ border: "0.5px solid var(--border)", color: "var(--text-muted)" }}
          >
            <SearchIcon size={19} />
            Search vehicles, renters, rentals
          </div>
          {pendingSync > 0 && (
            <span
              className="flex items-center gap-2 whitespace-nowrap rounded-md px-3.5 py-1.5 text-sm"
              style={{ background: "var(--bg-warning)", color: "var(--text-warning)" }}
            >
              <CloudUpIcon size={17} />
              {pendingSync} pending sync
            </span>
          )}
        </header>

        <div
          className="px-6 py-2.5 text-sm"
          style={{ color: "var(--text-warning)" }}
        >
          Dev mode — placeholder business; Supabase Auth isn't wired up yet.
        </div>

        <section className="px-6 pb-6">
          {checkoutBookingId ? (
            <CheckoutScreen
              bookingId={checkoutBookingId}
              onBack={() => setCheckoutBookingId(null)}
            />
          ) : (
            <>
              <h1 className="mb-5 text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
                {TITLES[tab]}
              </h1>
              {tab === "home" && (
                <HomeScreen onNavigate={goToTab} onWalkInCheckout={() => goToTab("bookings")} />
              )}
              {tab === "vehicles" && <VehiclesScreen onNavigateToRegistry={() => goToTab("registry")} />}
              {tab === "customers" && <CustomersScreen />}
              {tab === "bookings" && (
                <BookingsScreen onCheckout={(id) => setCheckoutBookingId(id)} />
              )}
              {tab === "rateMatrix" && <RateMatrixScreen />}
              {tab === "registry" && <RegistryScreen />}
              {tab === "settings" && <SettingsScreen />}
            </>
          )}
        </section>
      </main>
    </div>
    </SettingsProvider>
  );
}

export default App;
