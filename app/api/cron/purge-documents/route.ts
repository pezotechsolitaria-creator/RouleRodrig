import { NextRequest, NextResponse } from "next/server";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { authorizeCron } from "@/lib/cron-auth";

// GET /api/cron/purge-documents — deletes the documents this platform collects
// whose reason for existing has expired: the identity card checked at a cash
// door, and the bank slip photographed to prove a transfer.
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
// M193: the SAME argument applies to the transfer receipt, which had none of
// this. It is a photograph of a Mauritian bank slip carrying an account number
// and a name, and it was retained for ever by a platform whose own reasoning
// about the ID says it should not be. It gets a longer window — 90 days rather
// than 30 — because it answers a financial question somebody may reasonably
// ask months later, where the ID's question ends at the door.
//
// So: delivery_settings.id_document_retention_days / payment_proof_retention_days
// and this job. It deletes the OBJECT and then nulls the path, in that
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

  // The two documents differ only in four strings. Written once, so a change to
  // the delete-then-forget ordering cannot be applied to one and missed on the
  // other — which is exactly how the receipt came to have no purge at all.
  const KINDS = [
    {
      label: "identity",
      list: "expired_identity_documents",
      forget: "forget_identity_document",
      bucket: "delivery-identity",
    },
    {
      label: "payment",
      list: "expired_payment_proofs",
      forget: "forget_payment_proof",
      bucket: "delivery-payments",
    },
  ] as const;

  const report: Record<string, { considered: number; purged: number; failed: number }> = {};
  let anyListFailed = false;

  for (const kind of KINDS) {
    const { data, error } = await admin.rpc(kind.list, { p_limit: 200 });
    if (error) {
      // One kind failing must not stop the other: a receipt left undeleted
      // because the ID query broke is the same privacy problem in a new place.
      console.error(`${kind.list} failed`, error);
      anyListFailed = true;
      report[kind.label] = { considered: 0, purged: 0, failed: 0 };
      continue;
    }

    const rows = (data ?? []) as { delivery_id: string; storage_path: string }[];
    let purged = 0;
    let failed = 0;

    for (const row of rows) {
      const prefix = `${kind.bucket}/`;
      if (!row.storage_path?.startsWith(prefix)) {
        // A path we did not write. Forget the reference rather than reaching
        // for an object in a bucket this job has no business touching.
        await admin.rpc(kind.forget, { p_delivery_id: row.delivery_id });
        purged += 1;
        continue;
      }

      const { error: delErr } = await admin.storage
        .from(kind.bucket)
        .remove([row.storage_path.slice(prefix.length)]);

      if (delErr) {
        // Leave the row alone so the next run tries again. Nulling the path
        // here would strand the file permanently — the exact outcome this job
        // exists to prevent.
        console.error("purge-documents: delete failed", kind.label, row.delivery_id, delErr);
        failed += 1;
        continue;
      }

      const { error: forgetErr } = await admin.rpc(kind.forget, {
        p_delivery_id: row.delivery_id,
      });
      if (forgetErr) {
        console.error("purge-documents: forget failed", kind.label, row.delivery_id, forgetErr);
        failed += 1;
        continue;
      }
      purged += 1;
    }

    report[kind.label] = { considered: rows.length, purged, failed };
  }

  const considered = Object.values(report).reduce((n, r) => n + r.considered, 0);
  const purged = Object.values(report).reduce((n, r) => n + r.purged, 0);
  const failed = Object.values(report).reduce((n, r) => n + r.failed, 0);

  return NextResponse.json({
    ok: !anyListFailed,
    considered,
    purged,
    failed,
    // Per kind too, so "did the receipts actually start expiring?" is one look.
    byKind: report,
  });
}
