import { getDb } from "../db";
import type { AppSettings } from "../types";

const DEFAULT_SETTINGS: AppSettings = {
  dateFormat: "MDY",
  timeFormat: "12h",
  durationDisplay: "nights",
  showExpectedPayment: false,
};

interface SettingsRow {
  dateFormat: string;
  timeFormat: string;
  durationDisplay: string;
  showExpectedPayment: number;
}

function toAppSettings(row: SettingsRow): AppSettings {
  return {
    dateFormat: row.dateFormat as AppSettings["dateFormat"],
    timeFormat: row.timeFormat as AppSettings["timeFormat"],
    durationDisplay: row.durationDisplay as AppSettings["durationDisplay"],
    showExpectedPayment: row.showExpectedPayment === 1,
  };
}

export async function getSettings(): Promise<AppSettings> {
  const db = await getDb();
  const rows = await db.select<SettingsRow[]>(
    `select date_format as dateFormat, time_format as timeFormat,
            duration_display as durationDisplay, show_expected_payment as showExpectedPayment
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
     set date_format = ?, time_format = ?, duration_display = ?, show_expected_payment = ?
     where id = 1`,
    [
      next.dateFormat,
      next.timeFormat,
      next.durationDisplay,
      next.showExpectedPayment ? 1 : 0,
    ],
  );
  return next;
}
