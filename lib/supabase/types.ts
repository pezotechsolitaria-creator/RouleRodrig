export interface ContactSubmission {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  scooter: string | null;
  dates: string | null;
  message: string | null;
  handled: boolean;
  created_at: string;
}

export interface Booking {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  scooter: string;
  start_date: string;
  end_date: string;
  pickup_time: string | null;
  return_time: string | null;
  days: number;
  total_price: string | null;
  total_amount: number | null;
  message: string | null;
  /**
   * M91: "pending" now means "request in, availability not yet checked" and
   * holds nothing; "approved" means the owner confirmed with the partner and
   * RESERVES the vehicle until payment_due_by.
   */
  status: "pending" | "approved" | "confirmed" | "cancelled" | "completed";
  partner_code: string | null;
  asset_id: string | null;     // which physical unit was assigned
  asset_label: string | null;  // snapshot of its label at booking time
  created_at: string;
  /** M83 — the customer's bank-transfer slip, and when they said they'd sent
   *  it. Path into the private `booking-receipts` bucket; opened through
   *  /api/admin/booking-receipt, never addressable directly. */
  payment_receipt_path?: string | null;
  payment_reported_at?: string | null;
  /** M91 — set when the owner confirmed availability with the partner. */
  approved_at?: string | null;
  /** M91 — when an approved-but-unpaid reservation stops holding the vehicle. */
  payment_due_by?: string | null;
  /** M91 — why it could not happen, shown to the customer verbatim. */
  unavailable_note?: string | null;
  pickup_reminded?: boolean;
  return_reminded?: boolean;
  feedback_reminded?: boolean;

  // ── The money columns. WHOLE RUPEES, like total_amount (never cents). ──
  /** The online part-payment that confirms the booking (a % of the rental,
   *  deposit_pct). NOT the car's Rs 5,000 security deposit, which is FAQ text
   *  and never stored. */
  deposit_amount?: number | null;
  deposit_pct?: number | null;
  delivery_fee?: number | null;
  /** When the FIRST money arrived — online, or recorded by hand (M220). */
  deposit_paid_at?: string | null;
  /** Everything actually received so far; the running total of the
   *  booking_payments ledger once M220 records it. */
  amount_paid?: number | null;
  paypal_capture_id?: string | null;
  /** M220 — the owner confirmed it will be paid in person. A promise, never a
   *  payment: money received is amount_paid / booking_payments. */
  pay_in_person?: boolean;
  confirmed_at?: string | null;
  /** M220 — what the CUSTOMER asked for when booking; the owner still decides. */
  payment_preference?: "online" | "in_person" | null;
  /** M220 — they never came: status is 'cancelled', and this says why. */
  no_show_at?: string | null;
}

export interface PlaceBooking {
  id: string;
  place_id: string;
  place_name: string;
  category: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  start_date: string;
  end_date: string;
  guests: number | null;
  quantity: number;        // rooms (hotel) / covers (restaurant) / people (activity)
  time_slot: string | null; // restaurants & activities
  message: string | null;
  /**
   * M127 mirrors the vehicle lifecycle: "approved" RESERVES the slot until
   * payment_due_by; "unavailable" is the owner's no, with his note.
   */
  status: "pending" | "approved" | "confirmed" | "unavailable" | "cancelled" | "completed";
  created_at: string;
  /** M83 — the customer's bank-transfer slip, and when they said they'd sent
   *  it. Path into the private `booking-receipts` bucket; opened through
   *  /api/admin/booking-receipt, never addressable directly. */
  payment_receipt_path?: string | null;
  payment_reported_at?: string | null;
  reminded?: boolean;
  feedback_reminded?: boolean;

  // ── The money columns. WHOLE RUPEES (never cents). ──
  /** The WHOLE price of the booking (M210), despite its name. */
  deposit_amount?: number | null;
  /** When the first money arrived — online, or recorded by hand (M220). */
  deposit_paid_at?: string | null;
  /** Everything actually received so far (M220's ledger keeps it). */
  amount_paid?: number | null;
  paypal_capture_id?: string | null;
  /** M127 — when an approved-but-unpaid reservation stops holding the slot. */
  payment_due_by?: string | null;
  /** M127 — the owner's reason, emailed to the customer verbatim. */
  unavailable_note?: string | null;
  availability_checked_at?: string | null;
  /** M220 — confirmed to be paid in person. A promise, never a payment. */
  pay_in_person?: boolean;
  confirmed_at?: string | null;
  payment_preference?: "online" | "in_person" | null;
  no_show_at?: string | null;
}

export interface Partner {
  id: string;
  name: string;
  type: "hotel" | "guesthouse" | "travel_agency" | "other";
  email: string | null;
  phone: string | null;
  partner_code: string;
  commission_pct: number;
  active: boolean;
  notes: string | null;
  created_at: string;
}

export interface WaitlistEntry {
  id: string;
  email: string;
  name: string | null;
  source: string | null;
  created_at: string;
}

export interface ProductReview {
  id: string;
  scooter_id: string | null;
  scooter_name: string | null;
  name: string;
  origin: string | null;
  rating: number;
  text: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

export interface MarketplaceListing {
  id: string;
  business_name: string;
  category: "restaurant" | "tour" | "activity" | "accommodation" | "shopping";
  description: string;
  offer: string;
  image_url: string | null;     // legacy cover image (kept for backward compat)
  images: string[] | null;      // optional gallery — multiple photos
  contact: string | null;
  website: string | null;
  active: boolean;
  featured: boolean;
  delivery: boolean;
  pickup: boolean;
  dine_in: boolean;
  whatsapp: string | null;
  hours: string | null;
  maps_url: string | null;
  created_at: string;
}
