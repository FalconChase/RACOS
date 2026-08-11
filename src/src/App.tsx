import { useEffect, useState } from "react";
import { bootstrapSession } from "./lib/auth";
import { countPendingOutbox } from "./lib/repo/outbox";
import { ensureDefaultSeatingBands } from "./lib/repo/rateMatrix";
import { SettingsProvider } from "./lib/settingsContext";
import AutoDepartureRunner from "./components/AutoDepartureRunner";
import SyncRunner from "./components/SyncRunner";
import LoginScreen from "./screens/LoginScreen";
import Sidebar from "./components/Sidebar";
import HomeScreen from "./screens/HomeScreen";
import VehiclesScreen from "./screens/VehiclesScreen";
import CustomersScreen from "./screens/CustomersScreen";
import BookingsScreen from "./screens/BookingsScreen";
import CheckoutScreen from "./screens/CheckoutScreen";
import SettingsScreen from "./screens/SettingsScreen";
import RateMatrixScreen from "./screens/RateMatrixScreen";
import RegistryScreen from "./screens/RegistryScreen";
import SettlementsScreen from "./screens/SettlementsScreen";
import ToolsScreen from "./screens/ToolsScreen";
import MapScreen from "./screens/MapScreen";
import AnalyticsScreen from "./screens/AnalyticsScreen";

export type Tab = "home" | "vehicles" | "customers" | "bookings" | "rateMatrix" | "registry" | "settlements" | "tools" | "map" | "analytics" | "settings";

type AuthState =
  | { status: "checking" }
  | { status: "signin" }
  | { status: "complete-profile" }
  | { status: "authenticated"; offline: boolean };

function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [ready, setReady] = useState(false);
  const [pendingSync, setPendingSync] = useState(0);
  const [checkoutBookingId, setCheckoutBookingId] = useState<string | null>(null);
  const [autoOpenBooking, setAutoOpenBooking] = useState(false);
  const [auth, setAuth] = useState<AuthState>({ status: "checking" });

  async function runBootstrap() {
    setReady(false);
    try {
      const result = await bootstrapSession();
      if (result.authenticated) {
        setAuth({ status: "authenticated", offline: result.offline });
        await ensureDefaultSeatingBands();
        setReady(true);
        return;
      }
      setAuth({ status: result.reason === "profile-missing" ? "complete-profile" : "signin" });
    } catch (err) {
      // Surface as a normal sign-in screen rather than leaving the UI stuck —
      // an unexpected error here shouldn't silently freeze the app.
      console.error("bootstrapSession failed:", err);
      setAuth({ status: "signin" });
    }
  }

  useEffect(() => {
    runBootstrap();
  }, []);

  function handleSignedOut() {
    setTab("home");
    setCheckoutBookingId(null);
    setAuth({ status: "signin" });
  }

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

  // Home's "Record booking" shortcut — jumps straight to Rentals with the
  // New rental wizard already open, instead of landing on the tab and
  // requiring a second click there.
  function openNewRental() {
    setCheckoutBookingId(null);
    setTab("bookings");
    setAutoOpenBooking(true);
  }

  if (auth.status === "checking") {
    return (
      <main className="flex h-screen items-center justify-center" style={{ background: "var(--surface-2)" }}>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Starting up…</p>
      </main>
    );
  }

  if (auth.status === "signin" || auth.status === "complete-profile") {
    return (
      <LoginScreen
        key={auth.status}
        initialMode={auth.status === "complete-profile" ? "complete-profile" : "signin"}
        onDone={runBootstrap}
      />
    );
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
    <AutoDepartureRunner />
    <SyncRunner />
    <div className="flex h-screen print:h-auto print:block" style={{ background: "var(--surface-2)", color: "var(--text-primary)" }}>
      <Sidebar active={tab} onSelect={goToTab} pendingSync={pendingSync} />

      <main className="flex-1 overflow-y-auto print:overflow-visible">
        {auth.status === "authenticated" && auth.offline && (
          <div
            className="px-6 py-2.5 text-sm print:hidden"
            style={{ color: "var(--text-warning)" }}
          >
            Offline — showing data as of your last sign-in. Reconnect to sync.
          </div>
        )}

        <section className="px-6 py-6">
          {checkoutBookingId ? (
            <CheckoutScreen
              bookingId={checkoutBookingId}
              onBack={() => setCheckoutBookingId(null)}
            />
          ) : (
            <>
              {tab === "home" && <HomeScreen onRecordBooking={openNewRental} />}
              {tab === "vehicles" && (
                <VehiclesScreen
                  onNavigateToRegistry={() => goToTab("registry")}
                  onNavigateToMap={() => goToTab("map")}
                />
              )}
              {tab === "customers" && <CustomersScreen />}
              {tab === "bookings" && (
                <BookingsScreen
                  onCheckout={(id) => setCheckoutBookingId(id)}
                  autoOpenForm={autoOpenBooking}
                  onAutoOpenConsumed={() => setAutoOpenBooking(false)}
                />
              )}
              {tab === "rateMatrix" && <RateMatrixScreen />}
              {tab === "registry" && <RegistryScreen />}
              {tab === "settlements" && <SettlementsScreen />}
              {tab === "tools" && <ToolsScreen />}
              {tab === "map" && <MapScreen />}
              {tab === "analytics" && <AnalyticsScreen />}
              {tab === "settings" && <SettingsScreen onSignOut={handleSignedOut} />}
            </>
          )}
        </section>
      </main>
    </div>
    </SettingsProvider>
  );
}

export default App;
