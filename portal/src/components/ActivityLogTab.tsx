import type { OwnerBooking } from "@/lib/ownerData";
import { BookingStatusBadge } from "./StatusBadge";

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
}

// Never shows renter identity (name/contact) — the sync worker/RLS never
// exposes customers to the Owners' Portal at all (privacy default, see
// ROP009 migration comment); this is vehicle/dates/status only.
export default function ActivityLogTab({ bookings }: { bookings: OwnerBooking[] }) {
  if (bookings.length === 0) {
    return <p className="text-sm text-zinc-500">No booking activity recorded yet for your vehicles.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-4 py-3">Vehicle</th>
            <th className="px-4 py-3">Out</th>
            <th className="px-4 py-3">Due back</th>
            <th className="px-4 py-3">Destination</th>
            <th className="px-4 py-3">Purpose</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {bookings.map((b) => (
            <tr key={b.id} className="text-zinc-200">
              <td className="px-4 py-3 font-medium">{b.vehicle?.plate_number ?? "—"}</td>
              <td className="px-4 py-3 text-zinc-400">{fmt(b.actual_departure_at ?? b.start_date)}</td>
              <td className="px-4 py-3 text-zinc-400">{fmt(b.actual_return_at ?? b.end_date)}</td>
              <td className="px-4 py-3 text-zinc-400">{b.destination_label ?? "—"}</td>
              <td className="px-4 py-3 text-zinc-400">{b.purpose ?? "—"}</td>
              <td className="px-4 py-3">
                <BookingStatusBadge status={b.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
