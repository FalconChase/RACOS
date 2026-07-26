import { getDb } from "../db";
import type Database from "@tauri-apps/plugin-sql";

export type OutboxTable = "vehicles" | "customers" | "bookings" | "payments" | "owners";
export type OutboxOp = "insert" | "update" | "delete";

// Feeds the "N pending sync" badge — count of mutations not yet pushed to Supabase.
export async function countPendingOutbox(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ count: number }[]>(
    "select count(*) as count from outbox where status in ('pending', 'failed')",
  );
  return rows[0]?.count ?? 0;
}

// Every write to a cache table also appends here — the outbox is the single
// queue the (future) sync engine drains to push mutations up to Supabase.
export async function queueOutbox(
  db: Database,
  table: OutboxTable,
  entityId: string,
  operation: OutboxOp,
  payload: Record<string, unknown> | null,
): Promise<void> {
  await db.execute(
    "insert into outbox (entity_table, entity_id, operation, payload) values (?, ?, ?, ?)",
    [table, entityId, operation, payload ? JSON.stringify(payload) : null],
  );
}
