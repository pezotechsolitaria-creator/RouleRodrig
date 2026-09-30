import "server-only";
import { hasServiceRole } from "@/lib/supabase/admin";
import { paypalConfigured } from "@/lib/paypal";
import { activeProvider } from "./providers";

// Can the eSIM store take an order right now? Its own module, with no email
// import, so lib/email.ts can ask it (the cross-sell line in booking emails)
// without a circular import through lib/esim/service.ts.

export type StoreState = { selling: boolean; missing: ("licence" | "provider" | "paypal" | "database")[] };

/** Sales stay CLOSED until the owner opens them (M229, owner 30 Sep 2026: "I
 *  need a license before doing it"). Working supplier keys must never be what
 *  opens a shop the owner cannot yet legally run, so this is a separate,
 *  deliberate switch: ESIM_SALES_OPEN=true in Vercel, once licensed. Until
 *  then every page says "Coming soon" and checkout refuses (service.ts). */
export function salesOpen(): boolean {
  return process.env.ESIM_SALES_OPEN === "true";
}

export function storeState(): StoreState {
  const missing: StoreState["missing"] = [];
  if (!salesOpen()) missing.push("licence");
  if (!activeProvider().configured()) missing.push("provider");
  if (!paypalConfigured()) missing.push("paypal");
  if (!hasServiceRole()) missing.push("database");
  return { selling: missing.length === 0, missing };
}
