import type { ProductType } from "./policy";
import type { PaymentStatus, ReservationStatus } from "./status";

// What a guest's token returns (rsv_guest_view, M240b). Shared by the server
// and the booking page; never the phone, the email or the owner's notes.

export type GuestView = {
  reference: string;
  status: ReservationStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: string | null;
  paymentReportedAt: string | null;
  paymentReportedMethod: string | null;
  customerName: string;
  locale: "en" | "fr" | "cr";
  productId: string;
  productType: ProductType;
  product: {
    title: string;
    provider: string | null;
    image: string | null;
    unit_price_mur: number | null;
    per_person: boolean;
    child_price_mur: number | null;
    meeting_point: string | null;
    duration_minutes: number | null;
  };
  slot: { date: string; start_time: string | null; notes: string | null };
  party: { adults: number; children: number; babies: number };
  seats: number;
  slotDate: string;
  slotEndDate: string | null;
  amountMur: number | null;
  depositDueMur: number | null;
  balanceDueMur: number | null;
  amountPaidMur: number;
  paymentDeadlineAt: string | null;
  policy: { mode: string };
  declineReason: string | null;
  requestedAt: string;
  confirmedAt: string | null;
  paidAt: string | null;
  infoRequest: { fields: string[]; note: string | null; askedAt: string } | null;
  methods: { id: string; channel: "online" | "in_person"; label: Record<string, string>; instructions: Record<string, string> }[];
  events: { at: string; type: string }[];
  messages: { at: string; template: string; payload: Record<string, unknown> }[];
};
