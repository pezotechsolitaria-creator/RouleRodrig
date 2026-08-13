import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

// The gate every privileged /api/admin/* route opens with.
//
// AUTH NOTE, worth repeating at the door rather than leaving in a design doc:
// /admin authenticates with a signed password cookie and has NO Supabase user,
// so is_platform_admin() can never be true for it and the `..._admin_write` RLS
// policies are unreachable from here. The cookie check below IS the security
// boundary; the service-role client is merely how the write lands. See also
// M53, which exists entirely because update_order_status() assumed the other
// kind of admin.
//
// This started life as guardFoodAdmin in lib/food/guard.ts. It was never
// food-specific — the marketplace ops desk needs exactly the same door — so it
// lives here now and lib/food/guard.ts re-exports it. One implementation,
// because a security check written twice is a security check that will
// eventually differ.

export type AdminApiContext = { admin: SupabaseClient };

/**
 * Returns a NextResponse to send back when the caller is not allowed, or a
 * context holding the privileged client when they are.
 *
 * Call it as the FIRST statement of every handler:
 *
 *     const gate = await guardAdminApi(req);
 *     if (gate instanceof NextResponse) return gate;
 *     const { admin } = gate;
 */
export async function guardAdminApi(
  req: NextRequest,
  /** Named in the 503 so an unconfigured environment says which desk is down. */
  feature = "This admin area",
): Promise<NextResponse | AdminApiContext> {
  if (!verifySession(req.cookies.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasServiceRole()) {
    // Fail loudly rather than falling back to the anon client, which would hit
    // the unreachable admin policies and report a confusing "no rows" instead
    // of the real cause.
    return NextResponse.json(
      { error: `${feature} is not configured on this environment (SUPABASE_SERVICE_ROLE_KEY is unset).` },
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

/**
 * Turn a failure into the sentence the operator should read.
 *
 * THE `instanceof Error` CHECK WAS THROWING AWAY EVERY DATABASE MESSAGE. A
 * PostgrestError is a plain object — `{ message, details, hint, code }` — and
 * not an instance of Error, so every failed Supabase call fell through to the
 * generic fallback. The owner spent a day looking at "Failed to load orders"
 * while the real reason ("could not find a relationship…", "permission denied
 * for table…") existed and was discarded one line before it could be shown.
 *
 * A screen that names its own cause is the difference between a bug the owner
 * can report in one message and a bug that needs a debugging session.
 */
export function failed(err: unknown, fallback: string): NextResponse {
  console.error(fallback, err);

  const e = err as { message?: unknown; code?: unknown; hint?: unknown; details?: unknown } | null;
  const message = typeof e?.message === "string" && e.message.trim() ? e.message.trim() : fallback;
  const code = typeof e?.code === "string" && e.code ? e.code : undefined;
  // The hint is Postgres's own suggested fix and is often the whole answer.
  const hint = typeof e?.hint === "string" && e.hint.trim() ? e.hint.trim() : undefined;

  return NextResponse.json(
    {
      error: code ? `${message} (${code})` : message,
      ...(hint ? { hint } : {}),
    },
    { status: 500 },
  );
}
