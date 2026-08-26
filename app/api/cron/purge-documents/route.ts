import { NextRequest, NextResponse } from "next/server";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { authorizeCron } from "@/lib/cron-auth";

// GET /api/cron/purge-documents — deletes identity documents whose reason for
// existing has expired.
//
// ── WHY THIS ROUTE IS THE POINT ───────────────────────────────────────────
// An identity document that is collected and then simply kept is the failure
// mode this whole feature has. Nobody notices it, nothing breaks, and one day
// there is a bucket holding scans of several hundred Rodriguans' ID cards with
// no live purpose and no expiry.
//
// Under the Mauritius Data Protection Act 2017 storage limitation is not
// optional: personal data is kept no longer than is necessary for the purpose
// it was collected for. The purpose here is narrow and it ends at the door —
// the driver checks the card against the person, and then it is over.
//
// So: delivery_settings.id_document_retention_days (30 by default, the owner's
// to set) and this job. It deletes the OBJECT and then nulls the path, in that
// order, so a crash between the two leaves a row pointing at nothing rather
// than an orphaned file nobody knows about. A path with no file is a 404 the
// driver route already handles; a file with no path is invisible for ever.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = authorizeCron(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!hasServiceRole()) {
    console.error("purge-documents: SUPABASE_SERVICE_ROLE_KEY missing");
    return NextResponse.json({ error: "Unavailable." }, { status: 503 });
  }

  const admin = await getPrivileged();
  const { data, error } = await admin.rpc("expired_identity_documents", {
    p_limit: 200,
  });
  if (error) {
    console.error("expired_identity_documents failed", error);
    return NextResponse.json({ error: "Could not list." }, { status: 500 });
  }

  const rows = (data ?? []) as { delivery_id: string; storage_path: string }[];
  let purged = 0;
  let failed = 0;

  for (const row of rows) {
    const prefix = "delivery-identity/";
    if (!row.storage_path?.startsWith(prefix)) {
      // A path we did not write. Forget the reference rather than reaching for
      // an object in a bucket this job has no business touching.
      await admin.rpc("forget_identity_document", { p_delivery_id: row.delivery_id });
      purged += 1;
      continue;
    }

    const { error: delErr } = await admin.storage
      .from("delivery-identity")
      .remove([row.storage_path.slice(prefix.length)]);

    if (delErr) {
      // Leave the row alone so the next run tries again. Nulling the path here
      // would strand the file permanently — which is the exact outcome this
      // job exists to prevent.
      console.error("purge-documents: delete failed", row.delivery_id, delErr);
      failed += 1;
      continue;
    }

    const { error: forgetErr } = await admin.rpc("forget_identity_document", {
      p_delivery_id: row.delivery_id,
    });
    if (forgetErr) {
      console.error("purge-documents: forget failed", row.delivery_id, forgetErr);
      failed += 1;
      continue;
    }
    purged += 1;
  }

  return NextResponse.json({ ok: true, considered: rows.length, purged, failed });
}
