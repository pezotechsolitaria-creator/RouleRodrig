import { isValidPhoneNumber } from "libphonenumber-js";

// Validates a full international phone number (e.g. "+230 5769 8834") against
// each country's real numbering rules (Mauritius = 8 digits, France = 9, …).
// Used both client-side (live feedback) and server-side (anti-spam enforcement).
export function isValidPhone(full: string | null | undefined): boolean {
  const v = (full ?? "").trim();
  if (!v) return false;
  try {
    return isValidPhoneNumber(v);
  } catch {
    return false;
  }
}

// Basic but solid email format check (used client + server).
export function isValidEmail(email: string | null | undefined): boolean {
  const v = (email ?? "").trim();
  if (!v || v.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}
