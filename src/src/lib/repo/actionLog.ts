import { getDb, currentBusinessId, currentProfileId } from "../db";
import type { ActionLogChange, ActionLogEntry } from "../types";

interface RawActionLogRow {
  id: string;
  business_id: string;
  entity_type: "owner" | "vehicle" | "booking" | "system" | "customer";
  entity_id: string;
  entity_label: string;
  action: "created" | "updated" | "completed" | "cancelled" | "departed" | "reset";
  changes: string | null;
  performed_by: string | null;
  created_at: string;
}

function parseRow(row: RawActionLogRow): ActionLogEntry {
  return {
    ...row,
    changes: row.changes ? (JSON.parse(row.changes) as ActionLogChange[]) : null,
  };
}

// Newest first — this only ever feeds a read-only Settings view, capped by
// the caller (see limit) since it grows without bound over the life of the
// business.
export async function listActionLogs(limit = 100): Promise<ActionLogEntry[]> {
  const db = await getDb();
  const rows = await db.select<RawActionLogRow[]>(
    "select * from action_logs where business_id = ? order by created_at desc limit ?",
    [currentBusinessId(), limit],
  );
  return rows.map(parseRow);
}

// All logged edits for one entity type, newest first — used by Rentals to
// show each booking's own "edited ..." indicator without a separate query
// per row (grouped client-side by entity_id instead).
export async function listActionLogsByType(entityType: "owner" | "vehicle" | "booking" | "system" | "customer", limit = 500): Promise<ActionLogEntry[]> {
  const db = await getDb();
  const rows = await db.select<RawActionLogRow[]>(
    "select * from action_logs where business_id = ? and entity_type = ? order by created_at desc limit ?",
    [currentBusinessId(), entityType, limit],
  );
  return rows.map(parseRow);
}

// Appends one entry to the action history. Not queued through the outbox —
// this is a local-only audit trail for now, not yet part of the Supabase
// sync surface.
export async function logAction(params: {
  entityType: "owner" | "vehicle" | "booking" | "system" | "customer";
  entityId: string;
  entityLabel: string;
  action: "created" | "updated" | "completed" | "cancelled" | "departed" | "reset";
  changes?: ActionLogChange[];
}): Promise<void> {
  const db = await getDb();
  await db.execute(
    `insert into action_logs (id, business_id, entity_type, entity_id, entity_label, action, changes, performed_by, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      currentBusinessId(),
      params.entityType,
      params.entityId,
      params.entityLabel,
      params.action,
      params.changes && params.changes.length > 0 ? JSON.stringify(params.changes) : null,
      currentProfileId(),
      new Date().toISOString(),
    ],
  );
}

// Compares an old and new field value; returns a change record only if they
// actually differ (treats "" the same as null so clearing an optional field
// via an empty input still gets logged as null, not "").
export function diffField(field: string, label: string, oldValue: string | null, newValue: string | null): ActionLogChange | null {
  const normalizedOld = oldValue ?? null;
  const normalizedNew = newValue === "" ? null : newValue ?? null;
  if (normalizedOld === normalizedNew) return null;
  return { field, label, old: normalizedOld, new: normalizedNew };
}
