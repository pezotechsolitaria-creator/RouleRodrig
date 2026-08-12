export interface TaxiDriver {
  id: string;
  name: string;
  phone: string;
  whatsapp: string | null;
  photo: string | null;
  /** Extra photos (M72). `photo` remains the cover, as `image` does elsewhere. */
  photos?: string[];
  vehicle: string;
  vehicle_type: "car" | "minibus" | "van" | "scooter" | "other";
  languages: string[];
  areas: string;
  rate_from: string | null;
  notes: string | null;
  featured: boolean;
  active: boolean;
  created_at: string;
  // Aggregated from approved reviews (attached by /api/taxi)
  rating_avg?: number | null;
  rating_count?: number;
}

export interface TaxiDriverReview {
  id: string;
  driver_id: string | null;
  driver_name: string | null;
  name: string;
  origin: string | null;
  rating: number;
  text: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}
