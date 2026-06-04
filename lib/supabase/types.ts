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
  message: string | null;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  created_at: string;
}
