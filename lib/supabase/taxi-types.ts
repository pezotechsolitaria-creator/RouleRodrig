export interface TaxiDriver {
  id: string;
  name: string;
  phone: string;
  whatsapp: string | null;
  photo: string | null;
  vehicle: string;
  vehicle_type: "car" | "minibus" | "van" | "scooter" | "other";
  languages: string[];
  areas: string;
  rate_from: string | null;
  notes: string | null;
  featured: boolean;
  active: boolean;
  created_at: string;
}
