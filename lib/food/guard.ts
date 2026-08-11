import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

// The gate every /api/admin/food/* route opens with.
//
// AUTH NOTE, worth repeating at the door rather than leaving in a design doc:
// /admin authenticates with a signed password cookie and has NO Supabase user,
// so is_platform_admin() can never be true for it and the `..._admin_write` RLS
// policies on the food tables are unreachable from here. The cookie check below
// IS the security boundary; the service-role client is merely how the write
// lands. Same arrangement as /api/admin/delivery-zones and
// /api/admin/subscriptions — see also M53, which exists entirely because
// update_order_status() assumed the other kind of admin.
//
// Extracted into one function because five routes repeating a security check is
// five chances to write it four times.

export type FoodAdminContext = { admin: SupabaseClient };

/**
 * Returns a NextResponse to send back when the caller is not allowed, or a
 * context holding the privileged client when they are.
 *
 * Call it as the FIRST statement of every handler:
 *
 *     const gate = await guardFoodAdmin(req);
 *     if (gate instanceof NextResponse) return gate;
 *     const { admin } = gate;
 */
export async function guardFoodAdmin(req: NextRequest): Promise<NextResponse | FoodAdminContext> {
  if (!verifySession(req.cookies.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasServiceRole()) {
    // Fail loudly rather than falling back to the anon client, which would hit
    // the unreachable admin policies and report a confusing "no rows" instead
    // of the real cause.
    return NextResponse.json(
      { error: "Food admin is not configured on this environment (SUPABASE_SERVICE_ROLE_KEY is unset)." },
      { status: 503 },
    );
  }
  return { admin: await getPrivileged() };
}

/** Parse a JSON body, or return the 400 to send back. */
export async function readJson(req: NextRequest): Promise<unknown | NextResponse> {
  try {
    return await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

/** Turn a thrown Error into the sentence the operator should read. */
export function failed(err: unknown, fallback: string): NextResponse {
  const message = err instanceof Error ? err.message : fallback;
  console.error(fallback, err);
  return NextResponse.json({ error: message || fallback }, { status: 500 });
}
