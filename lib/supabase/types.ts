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
