import type { OwnerBooking } from "@/lib/ownerData";
import { formatPeso, summarizeFinancials } from "@/lib/ownerData";

export default function FinancialsTab({ bookings }: { bookings: OwnerBooking[] }) {
  const summary = summarizeFinancials(bookings);

  if (bookings.length === 0) {
    return <p className="text-sm text-zinc-500">No financial activity recorded yet for your vehicles.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Collected to date" value={formatPeso(summary.totalCollected)} />
        <SummaryCard label="Expected (rate-formula)" value={formatPeso(summary.totalExpected)} />
        <SummaryCard label="Completed rentals" value={String(summary.completedCount)} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Rentals</th>
              <th className="px-4 py-3">Collected</th>
              <th className="px-4 py-3">Expected</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {summary.perVehicle.map((v) => (
              <tr key={v.vehicleId} className="text-zinc-200">
                <td className="px-4 py-3 font-medium">{v.label}</td>
                <td className="px-4 py-3 text-zinc-400">{v.count}</td>
                <td className="px-4 py-3 text-zinc-400">{formatPeso(v.collected)}</td>
                <td className="px-4 py-3 text-zinc-400">{formatPeso(v.expected)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-600">
        &ldquo;Expected&rdquo; is the rate-formula amount computed at booking time — actual collected amounts can
        run lower when a rental absorbed a shortfall (see your rental business for details on any specific booking).
      </p>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-zinc-50">{value}</p>
    </div>
  );
}
