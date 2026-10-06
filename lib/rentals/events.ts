// The event every "Reserve" in the app dispatches to open the booking sheet
// (components/BookingSection.tsx). `scooter` is a fleet row id; `unit` the
// card's key when a row holds several bikes (lib/rentals/units.ts).
export const OPEN_BOOKING_EVENT = "rr:open-booking";

export type OpenBookingDetail = { scooter?: string; unit?: string; days?: number };

export function openBooking(detail: OpenBookingDetail = {}): void {
  window.dispatchEvent(new CustomEvent(OPEN_BOOKING_EVENT, { detail }));
}
