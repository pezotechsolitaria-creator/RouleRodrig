import type { BookingDocDetail } from "./pdf";

/** A saved booking document, as the admin surfaces see it. Money is cents. */
export type BookingDoc = {
  id: string;
  number: string;
  /** The owner's own reference, printed in the header. */
  reference: string;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  details: BookingDocDetail[];
  totalCents: number;
  depositPct: number | null;
  depositCents: number;
  receivedCents: number;
  payInstruction: string | null;
  note: string | null;
  placeBookingId: string | null;
  state: "open" | "cancelled";
  createdAt: string;
  updatedAt: string;
};

export type BookingDocLineRow = {
  id: string;
  position: number;
  description: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
};

/** A reservation the desk can start a document from. */
export type BookingDocPrefill = {
  placeBookingId: string;
  reference: string;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  placeName: string;
  startDate: string;
  endDate: string;
  guests: number | null;
  timeSlot: string | null;
  /** WHOLE RUPEES on place_bookings; converted at this edge, once. */
  totalCents: number;
};

type Row = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const nul = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0));

/**
 * One place a booking_documents row becomes a BookingDoc.
 *
 * The invoicing side learned this the hard way: four routes each spelled the
 * mapping out, one of them returned a raw snake_case row cast to the camelCase
 * type, and every money field on it was undefined while the compiler was
 * perfectly happy.
 */
export function toBookingDoc(r: Row): BookingDoc {
  return {
    id: str(r.id),
    number: str(r.number),
    reference: str(r.reference),
    guestName: str(r.guest_name),
    guestEmail: nul(r.guest_email),
    guestPhone: nul(r.guest_phone),
    details: Array.isArray(r.details) ? (r.details as BookingDocDetail[]) : [],
    totalCents: num(r.total_cents),
    depositPct: r.deposit_pct == null ? null : num(r.deposit_pct),
    depositCents: num(r.deposit_cents),
    receivedCents: num(r.received_cents),
    payInstruction: nul(r.pay_instruction),
    note: nul(r.note),
    placeBookingId: nul(r.place_booking_id),
    state: str(r.state) === "cancelled" ? "cancelled" : "open",
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

export function toBookingDocLine(r: Row): BookingDocLineRow {
  return {
    id: str(r.id),
    position: num(r.position),
    description: str(r.description),
    // numeric(12,3) arrives from PostgREST as a string.
    qty: num(r.qty),
    unitPriceCents: num(r.unit_price_cents),
    lineTotalCents: num(r.line_total_cents),
  };
}
