import { NextRequest, NextResponse } from "next/server";
import { guardAdminApi } from "@/lib/admin/api-guard";
import { isUuid } from "@/lib/file-signature";

// ── THE OWNER TAKES A VEHICLE OUT ───────────────────────────────────────────
//
// The counterpart to lib/availability/blocks.ts. That file is how the three
// availability reads LEARN a vehicle is gone; this is how the owner TELLS them.
//
// It is the whole fix for the reported bug. The site was never showing stale
// data — every availability read hits live rows — it simply had no way to hear
// about a scooter lent to a friend, taken for a service, or rented over the
// counter. Now it does, and it hears about it the moment he taps save.

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Blocks from today onwards, newest range first. */
export async function GET(req: NextRequest) {
  const gate = await guardAdminApi(req, "Availability blocks");
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await admin
    .from("availability_blocks")
    .select("id, scooter, start_date, end_date, asset_id, reason, created_at")
    .gte("end_date", today)
    .order("start_date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ blocks: data ?? [] });
}

export async function POST(req: NextRequest) {
  const gate = await guardAdminApi(req, "Availability blocks");
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  let body: {
    scooter?: string;
    start_date?: string;
    end_date?: string;
    asset_id?: string | null;
    reason?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const scooter = (body.scooter ?? "").trim();
  const start = (body.start_date ?? "").trim();
  const end = (body.end_date ?? "").trim();

  if (!scooter) {
    return NextResponse.json({ error: "Pick a vehicle." }, { status: 400 });
  }
  if (!ISO_DATE.test(start) || !ISO_DATE.test(end)) {
    return NextResponse.json({ error: "Pick both dates." }, { status: 400 });
  }
  // Checked here as well as by the table constraint. The constraint is the
  // guarantee; this is the sentence the owner actually reads.
  if (end < start) {
    return NextResponse.json(
      { error: "The last day cannot be before the first day." },
      { status: 400 },
    );
  }

  const { data, error } = await admin
    .from("availability_blocks")
    .insert({
      scooter,
      start_date: start,
      end_date: end,
      asset_id: (body.asset_id ?? "").toString().trim() || null,
      // The owner's private note. Never shown to a customer — see the comment
      // in app/api/availability/route.ts.
      reason: (body.reason ?? "").toString().trim().slice(0, 200) || null,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: data?.id });
}

/** Give the dates back — the scooter returned, the service finished. */
export async function DELETE(req: NextRequest) {
  const gate = await guardAdminApi(req, "Availability blocks");
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { error } = await admin
    .from("availability_blocks")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
