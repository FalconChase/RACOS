import { getDb } from "../db";
import type { AppSettings } from "../types";

const DEFAULT_SETTINGS: AppSettings = {
  dateFormat: "MDY",
  timeFormat: "12h",
  durationDisplay: "nights",
  showExpectedPayment: false,
  dashLabelUnit: false,
  dashLabelLessee: false,
  dashLabelEtd: false,
  dashLabelEta: false,
  showRemittanceSummary: true,
  remittancePaymentColor: "#3b82f6",
  remittanceExpectedOpacity: 50,
  timeStepMinutes: 5,
  fuelUnit: "bars",
  autoMarkDeparted: true,
  showLuzon: true,
  showVisayas: true,
  showMindanao: true,
};

interface SettingsRow {
  dateFormat: string;
  timeFormat: string;
  durationDisplay: string;
  showExpectedPayment: number;
  dashLabelUnit: number;
  dashLabelLessee: number;
  dashLabelEtd: number;
  dashLabelEta: number;
  showRemittanceSummary: number;
  remittancePaymentColor: string;
  remittanceExpectedOpacity: number;
  timeStepMinutes: number;
  fuelUnit: string;
  autoMarkDeparted: number;
  showLuzon: number;
  showVisayas: number;
  showMindanao: number;
}

function toAppSettings(row: SettingsRow): AppSettings {
  return {
    dateFormat: row.dateFormat as AppSettings["dateFormat"],
    timeFormat: row.timeFormat as AppSettings["timeFormat"],
    durationDisplay: row.durationDisplay as AppSettings["durationDisplay"],
    showExpectedPayment: row.showExpectedPayment === 1,
    dashLabelUnit: row.dashLabelUnit === 1,
    dashLabelLessee: row.dashLabelLessee === 1,
    dashLabelEtd: row.dashLabelEtd === 1,
    dashLabelEta: row.dashLabelEta === 1,
    showRemittanceSummary: row.showRemittanceSummary === 1,
    remittancePaymentColor: row.remittancePaymentColor,
    remittanceExpectedOpacity: row.remittanceExpectedOpacity,
    timeStepMinutes: row.timeStepMinutes,
    fuelUnit: row.fuelUnit as AppSettings["fuelUnit"],
    autoMarkDeparted: row.autoMarkDeparted === 1,
    showLuzon: row.showLuzon === 1,
    showVisayas: row.showVisayas === 1,
    showMindanao: row.showMindanao === 1,
  };
}

export async function getSettings(): Promise<AppSettings> {
  const db = await getDb();
  const rows = await db.select<SettingsRow[]>(
    `select date_format as dateFormat, time_format as timeFormat,
            duration_display as durationDisplay, show_expected_payment as showExpectedPayment,
            dash_label_unit as dashLabelUnit, dash_label_lessee as dashLabelLessee,
            dash_label_etd as dashLabelEtd, dash_label_eta as dashLabelEta,
            show_remittance_summary as showRemittanceSummary,
            remittance_payment_color as remittancePaymentColor,
            remittance_expected_opacity as remittanceExpectedOpacity,
            time_step_minutes as timeStepMinutes,
            fuel_unit as fuelUnit,
            auto_mark_departed as autoMarkDeparted,
            show_luzon as showLuzon, show_visayas as showVisayas, show_mindanao as showMindanao
     from app_settings where id = 1`,
  );
  return rows[0] ? toAppSettings(rows[0]) : DEFAULT_SETTINGS;
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next = { ...current, ...patch };

  // Defensive floor, same spirit as correctBookingPayment's never-decrease
  // guard — Settings > Locations already disables the last remaining
  // checkbox, but this makes the rule hold regardless of caller.
  if (!next.showLuzon && !next.showVisayas && !next.showMindanao) {
    throw new Error("At least one island group must stay visible.");
  }

  const db = await getDb();
  await db.execute(
    `update app_settings
     set date_format = ?, time_format = ?, duration_display = ?, show_expected_payment = ?,
         dash_label_unit = ?, dash_label_lessee = ?, dash_label_etd = ?, dash_label_eta = ?,
         show_remittance_summary = ?, remittance_payment_color = ?, remittance_expected_opacity = ?, time_step_minutes = ?, fuel_unit = ?,
         auto_mark_departed = ?, show_luzon = ?, show_visayas = ?, show_mindanao = ?
     where id = 1`,
    [
      next.dateFormat,
      next.timeFormat,
      next.durationDisplay,
      next.showExpectedPayment ? 1 : 0,
      next.dashLabelUnit ? 1 : 0,
      next.dashLabelLessee ? 1 : 0,
      next.dashLabelEtd ? 1 : 0,
      next.dashLabelEta ? 1 : 0,
      next.showRemittanceSummary ? 1 : 0,
      next.remittancePaymentColor,
      next.remittanceExpectedOpacity,
      next.timeStepMinutes,
      next.fuelUnit,
      next.autoMarkDeparted ? 1 : 0,
      next.showLuzon ? 1 : 0,
      next.showVisayas ? 1 : 0,
      next.showMindanao ? 1 : 0,
    ],
  );
  return next;
}
