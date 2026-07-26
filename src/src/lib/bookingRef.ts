// Short human-facing reference derived from the booking's uuid. Not stored —
// computed the same way everywhere it's shown (Rentals list, Checkout screen).
export function bookingRef(id: string): string {
  return `RNT-${id.slice(0, 8).toUpperCase()}`;
}
