import { NextRequest, NextResponse } from "next/server";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/file-signature";

// ── Hard-delete a shop and the account behind it (M31) ─────────────────────
//
// GET  → what would be destroyed, for the confirmation dialog.
// POST → destroy it.
//
// POST rather than DELETE because this carries a body (the force flag and the
// typed confirmation) and because the operation is not idempotent in the way a
// DELETE implies — the second call 404s, which is correct but is a different
// answer, and a proxy retrying a DELETE should not be treated as safe here.
//
// The order of operations matters and is split deliberately between SQL and
// this route:
//   1. admin_delete_shop() removes orders, the merchant, and everything that
//      cascades — in ONE transaction, with an audit_logs row written first.
//   2. Only then can the auth user go: merchants.owner_id is RESTRICT, so the
//      account is undeletable until step 1 commits.
//   3. Storage last. Files are the only part that can be orphaned without
//      corrupting anything, so they are cleaned up on a best-effort basis and
//      a failure there is reported, never fatal.
const NOT_FOUND = "RR003";
const ORDERS_IN_FLIGHT = "RR040";
// Platform infrastructure — the Events merchant and its event stores (M40).
// Not a "force" case: there is no confirmation strong enough to make deleting
// the events platform from the marketplace screen the right action.
const SYSTEM_OWNED = "RR041";

type Account = {
  userId: string;
  email: string | null;
  role: string;
  otherMerchants: number;
  ordersAsCustomer: number;
  isPlatformAdmin: boolean;
};

type Preview = {
  storeId: string;
  storeName: string;
  ownerId: string | null;
  ownerEmail: string | null;
  receiptPaths: string[];
  mediaPrefix: string;
  liveOrders: { orderNumber: string; status: string; total: number; customerEmail: string | null }[];
  accounts: Account[];
};

function guardAdmin(req: NextRequest): NextResponse | null {
  if (!verifySession(req.cookies.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasServiceRole()) {
    // Without the service-role key getPrivileged() silently falls back to the
    // anon client, so this would look like a clean "nothing to delete" instead
    // of a misconfiguration. Refuse loudly.
    return NextResponse.json(
      { error: "Admin backend is not configured on this environment (SUPABASE_SERVICE_ROLE_KEY is unset)." },
      { status: 503 },
    );
  }
  return null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = guardAdmin(req);
  if (denied) return denied;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const supabase = await getPrivileged();
  const { data, error } = await supabase.rpc("admin_store_deletion_preview", { p_store_id: id });
  if (error) {
    if (error.code === NOT_FOUND) return NextResponse.json({ error: "Not found." }, { status: 404 });
    console.error("admin_store_deletion_preview failed", error);
    return NextResponse.json({ error: "Could not read that shop." }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = guardAdmin(req);
  if (denied) return denied;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let body: { force?: boolean; confirmName?: string; note?: string; deleteAccounts?: string[] } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* an empty body is a plain, unforced delete */
  }

  const supabase = await getPrivileged();

  // Read the shop first so the typed confirmation can be checked against the
  // real name. This is the last line between "close the wrong tab" and a
  // permanent deletion, and it belongs on the server: a dialog that only
  // checks in the browser protects nobody calling the endpoint directly.
  const { data: previewData, error: previewError } = await supabase.rpc("admin_store_deletion_preview", {
    p_store_id: id,
  });
  if (previewError) {
    if (previewError.code === NOT_FOUND) return NextResponse.json({ error: "Not found." }, { status: 404 });
    console.error("admin_store_deletion_preview failed", previewError);
    return NextResponse.json({ error: "Could not read that shop." }, { status: 500 });
  }
  const preview = previewData as Preview;

  if ((body.confirmName ?? "").trim().toLowerCase() !== preview.storeName.trim().toLowerCase()) {
    return NextResponse.json(
      { error: `Type the shop's name exactly — "${preview.storeName}" — to confirm.` },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.rpc("admin_delete_shop", {
    p_store_id: id,
    p_force: Boolean(body.force),
    p_actor_note: body.note ?? "deleted from /admin",
  });

  if (error) {
    if (error.code === NOT_FOUND) return NextResponse.json({ error: "Not found." }, { status: 404 });
    // 403, and deliberately NOT needsForce: this one is never overridable.
    if (error.code === SYSTEM_OWNED) {
      return NextResponse.json({ error: error.message, systemOwned: true }, { status: 403 });
    }
    // 409: the admin has to look at the in-flight orders and decide again.
    // The preview rides along so the dialog can list them without a re-fetch.
    if (error.code === ORDERS_IN_FLIGHT) {
      return NextResponse.json({ error: error.message, needsForce: true, preview }, { status: 409 });
    }
    console.error("admin_delete_shop failed", error);
    return NextResponse.json({ error: "Could not delete that shop." }, { status: 500 });
  }

  // ── The logins. Only reachable now that merchants.owner_id is gone. ───────
  //
  // Every account the admin ticked, NOT just merchants.owner_id — those two
  // drift, and on the live database owner_id was a leftover E2E fixture while
  // the human's real Google login sat in merchant_staff (M32). Deleting the
  // wrong one leaves the shop gone and the person still able to sign in.
  //
  // Through the Auth Admin API rather than SQL: removing a row from auth.users
  // by hand leaves GoTrue's sessions, identities and refresh tokens behind, and
  // the whole point is that they must sign up again cleanly.
  //
  // Only ids that appeared in this shop's own preview are accepted, so a
  // crafted request cannot use this endpoint to delete an arbitrary user.
  const allowed = new Map((preview.accounts ?? []).map((a) => [a.userId, a]));
  const requested = Array.isArray(body.deleteAccounts) ? body.deleteAccounts : [];
  const accountResults: { userId: string; email: string | null; deleted: boolean; error?: string }[] = [];

  for (const userId of requested) {
    const account = allowed.get(userId);
    if (!account) {
      accountResults.push({ userId, email: null, deleted: false, error: "Not a login for this shop." });
      continue;
    }
    // A platform admin's own login is never collateral damage in a shop
    // deletion — losing it can lock the owner out of /admin entirely.
    if (account.isPlatformAdmin) {
      accountResults.push({
        userId,
        email: account.email,
        deleted: false,
        error: "This is a platform admin login and was left alone.",
      });
      continue;
    }
    const { error: authError } = await supabase.auth.admin.deleteUser(userId);
    if (authError) {
      console.error("admin delete auth user failed", { userId, authError });
      accountResults.push({ userId, email: account.email, deleted: false, error: authError.message });
    } else {
      accountResults.push({ userId, email: account.email, deleted: true });
    }
  }

  // ── Files. Best effort by design: an orphaned image costs storage, not
  // correctness, and failing the whole request after the rows are already gone
  // would be strictly worse than reporting it.
  let filesRemoved = 0;
  const fileErrors: string[] = [];
  try {
    // merchant-media is laid out as "<storeId>/logo/…" and "<storeId>/products/…".
    for (const folder of ["logo", "products"]) {
      const { data: listed, error: listError } = await supabase.storage
        .from("merchant-media")
        .list(`${preview.mediaPrefix}/${folder}`, { limit: 1000 });
      if (listError) {
        fileErrors.push(`list ${folder}: ${listError.message}`);
        continue;
      }
      const paths = (listed ?? []).map((f) => `${preview.mediaPrefix}/${folder}/${f.name}`);
      if (paths.length === 0) continue;
      const { error: rmError } = await supabase.storage.from("merchant-media").remove(paths);
      if (rmError) fileErrors.push(`remove ${folder}: ${rmError.message}`);
      else filesRemoved += paths.length;
    }
    const receipts = (preview.receiptPaths ?? []).filter(Boolean);
    if (receipts.length > 0) {
      const { error: rmError } = await supabase.storage.from("order-receipts").remove(receipts);
      if (rmError) fileErrors.push(`remove receipts: ${rmError.message}`);
      else filesRemoved += receipts.length;
    }
  } catch (err) {
    fileErrors.push(err instanceof Error ? err.message : "unknown storage error");
  }

  return NextResponse.json({
    ok: true,
    destroyed: (data as { destroyed?: unknown })?.destroyed ?? preview,
    accounts: accountResults,
    filesRemoved,
    fileErrors,
  });
}
