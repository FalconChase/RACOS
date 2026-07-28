import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { getSettings, updateSettings } from "./repo/settings";
import type { AppSettings } from "./types";

const DEFAULT_SETTINGS: AppSettings = {
  dateFormat: "MDY",
  timeFormat: "12h",
  durationDisplay: "nights",
  showExpectedPayment: false,
  dashLabelUnit: false,
  dashLabelLessee: false,
  dashLabelEtd: false,
  dashLabelEta: false,
  showRemittanceSummary: false,
  autoMarkDeparted: true,
};

interface SettingsContextValue {
  settings: AppSettings;
  setSettings: (patch: Partial<AppSettings>) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  setSettings: async () => {},
});

// Loaded once at startup and kept in context so every screen can read the
// current format synchronously during render instead of each doing its own
// async fetch of a single-row table.
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    getSettings().then(setSettingsState);
  }, []);

  async function setSettings(patch: Partial<AppSettings>) {
    const next = await updateSettings(patch);
    setSettingsState(next);
  }

  return (
    <SettingsContext.Provider value={{ settings, setSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
