import "server-only";
import { hasServiceRole } from "@/lib/supabase/admin";
import { paypalConfigured } from "@/lib/paypal";
import { activeProvider } from "./providers";

// Can the eSIM store take an order right now? Its own module, with no email
// import, so lib/email.ts can ask it (the cross-sell line in booking emails)
// without a circular import through lib/esim/service.ts.

export type StoreState = { selling: boolean; missing: ("provider" | "paypal" | "database")[] };

export function storeState(): StoreState {
  const missing: StoreState["missing"] = [];
  if (!activeProvider().configured()) missing.push("provider");
  if (!paypalConfigured()) missing.push("paypal");
  if (!hasServiceRole()) missing.push("database");
  return { selling: missing.length === 0, missing };
}
