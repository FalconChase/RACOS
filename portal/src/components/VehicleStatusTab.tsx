import type { OwnerVehicle } from "@/lib/ownerData";
import { VehicleStatusBadge } from "./StatusBadge";

export default function VehicleStatusTab({ vehicles }: { vehicles: OwnerVehicle[] }) {
  if (vehicles.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No vehicles are registered to you yet — check with your rental business if this looks wrong.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-4 py-3">Plate</th>
            <th className="px-4 py-3">Make / Model</th>
            <th className="px-4 py-3">Year</th>
            <th className="px-4 py-3">Seats</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {vehicles.map((v) => (
            <tr key={v.id} className="text-zinc-200">
              <td className="px-4 py-3 font-medium">{v.plate_number}</td>
              <td className="px-4 py-3 text-zinc-400">
                {[v.make, v.model].filter(Boolean).join(" ") || "—"}
              </td>
              <td className="px-4 py-3 text-zinc-400">{v.year ?? "—"}</td>
              <td className="px-4 py-3 text-zinc-400">{v.seats ?? "—"}</td>
              <td className="px-4 py-3">
                <VehicleStatusBadge status={v.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
