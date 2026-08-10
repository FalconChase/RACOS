const VEHICLE_STATUS_STYLES: Record<string, string> = {
  available: "bg-emerald-500/15 text-emerald-400",
  rented: "bg-amber-500/15 text-amber-400",
  maintenance: "bg-orange-500/15 text-orange-400",
  retired: "bg-zinc-700/40 text-zinc-400",
};

const BOOKING_STATUS_STYLES: Record<string, string> = {
  pending: "bg-sky-500/15 text-sky-400",
  confirmed: "bg-sky-500/15 text-sky-400",
  active: "bg-amber-500/15 text-amber-400",
  completed: "bg-emerald-500/15 text-emerald-400",
  cancelled: "bg-red-500/15 text-red-400",
};

export function VehicleStatusBadge({ status }: { status: string }) {
  const style = VEHICLE_STATUS_STYLES[status] ?? "bg-zinc-700/40 text-zinc-400";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${style}`}>
      {status}
    </span>
  );
}

export function BookingStatusBadge({ status }: { status: string }) {
  const style = BOOKING_STATUS_STYLES[status] ?? "bg-zinc-700/40 text-zinc-400";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${style}`}>
      {status}
    </span>
  );
}
