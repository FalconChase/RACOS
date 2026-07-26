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
  };
}

export async function getSettings(): Promise<AppSettings> {
  const db = await getDb();
  const rows = await db.select<SettingsRow[]>(
    `select date_format as dateFormat, time_format as timeFormat,
            duration_display as durationDisplay, show_expected_payment as showExpectedPayment,
            dash_label_unit as dashLabelUnit, dash_label_lessee as dashLabelLessee,
            dash_label_etd as dashLabelEtd, dash_label_eta as dashLabelEta
     from app_settings where id = 1`,
  );
  return rows[0] ? toAppSettings(rows[0]) : DEFAULT_SETTINGS;
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  const db = await getDb();
  await db.execute(
    `update app_settings
     set date_format = ?, time_format = ?, duration_display = ?, show_expected_payment = ?,
         dash_label_unit = ?, dash_label_lessee = ?, dash_label_etd = ?, dash_label_eta = ?
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
    ],
  );
  return next;
}
