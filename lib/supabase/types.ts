export interface ContactSubmission {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  scooter: string | null;
  dates: string | null;
  message: string | null;
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
  days: number;
  total_price: string | null;
  total_amount: number | null;
  message: string | null;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  partner_code: string | null;
  created_at: string;
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

export interface MarketplaceListing {
  id: string;
  business_name: string;
  category: "restaurant" | "tour" | "activity" | "accommodation" | "shopping";
  description: string;
  offer: string;
  image_url: string | null;
  contact: string | null;
  website: string | null;
  active: boolean;
  featured: boolean;
  created_at: string;
}
