import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { audit } from "@/lib/admin/audit";

// Creating and publishing events.
//
// Until M61 nothing in the product could create one — no RPC, no route, no
// screen — so /events and the homepage promo strip were permanently empty and
// the only event in the database had been inserted by hand during development.
//
// AUTH — the two-admin-identities rule (M25). /admin authenticates with a signed
// password cookie and has no Supabase user, so is_platform_admin() is never true
// for it; the cookie check below IS the boundary, and the service-role client is
// how the write lands. Every admin_* RPC additionally refuses a caller that DOES
// have a session but is not a platform admin, and none of them grant EXECUTE to
// `authenticated`.
//
// PUBLISHING IS NOT A FIELD. It is its own action, and the RPC refuses to
// publish an event that cannot sell — no active ticket package, or no payment
// method for the organiser. Both have been real dead ends in this codebase, so
// the refusal names what is missing rather than letting a customer discover it.
function isAuthed(req: NextRequest) {
  return verifySession(req.cookies.get(COOKIE_NAME)?.value);
}

function serviceRoleMissing() {
  return NextResponse.json(
    { error: "Admin backend is not configured on this environment (SUPABASE_SERVICE_ROLE_KEY is unset)." },
    { status: 503 },
  );
}

const createSchema = z.object({
  name: z.string().trim().min(1, "The event needs a name.").max(120),
  // ISO strings; the RPC re-validates that the end is after the start.
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  doorsOpenAt: z.string().datetime({ offset: true }).nullable().optional(),
  slug: z.string().trim().max(80).optional().or(z.literal("")),
  venueName: z.string().trim().max(160).optional().or(z.literal("")),
  venueAddress: z.string().trim().max(300).optional().or(z.literal("")),
  supportPhone: z.string().trim().max(40).optional().or(z.literal("")),
  terms: z.string().trim().max(2000).optional().or(z.literal("")),
  capacity: z.number().int().min(1).max(1_000_000).nullable().optional(),
  // Pre-launch fixtures must stay distinguishable from real events — the control
  // earned when a cleanup predicate nearly deleted a real order, and again when
  // a test event turned out to be live on the public site.
  isTest: z.boolean().optional(),
});

const publishSchema = z.object({
  action: z.literal("publish"),
  storeId: z.string().uuid(),
  publish: z.boolean(),
});

// The flag was write-once: set at creation, changeable by nothing afterwards.
// A test event can never be published and its public page 404s, so an event
// created with the box ticked was permanently stranded with no way back and no
// explanation on screen. See M73.
const testFlagSchema = z.object({
  action: z.literal("testFlag"),
  storeId: z.string().uuid(),
  isTest: z.boolean(),
});

const updateSchema = z.object({
  action: z.literal("update"),
  storeId: z.string().uuid(),
  name: z.string().trim().max(120).optional(),
  startsAt: z.string().datetime({ offset: true }).optional(),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  doorsOpenAt: z.string().datetime({ offset: true }).nullable().optional(),
  venueName: z.string().trim().max(160).optional(),
  venueAddress: z.string().trim().max(300).optional(),
  supportPhone: z.string().trim().max(40).optional(),
  terms: z.string().trim().max(2000).optional(),
  // The event's poster. Nothing in the repo ever wrote stores.cover_url, yet the
  // hero, the /events card, the homepage tile and the OpenGraph image all read
  // it — so every event shipped with a gradient placeholder and no way to fix it.
  coverUrl: z.string().trim().max(500).nullable().optional(),
  // Calling it off. events.cancelled_at has existed since M33 and is read
  // everywhere — event_phase() returns 'cancelled', the scan screen says every
  // ticket is void — but nothing ever wrote it, so an event could not be
  // cancelled at all.
  cancel: z.boolean().optional(),
  cancelReason: z.string().trim().max(300).optional(),
});

const patchSchema = z.discriminatedUnion("action", [publishSchema, testFlagSchema, updateSchema]);

function rpcError(error: { code?: string; message?: string }, fallback: string) {
  if (error.code === "RR003") return NextResponse.json({ error: "Not found." }, { status: 404 });
  // RR004/RR005 messages are written for the operator to read and act on.
  if (error.code === "RR004") return NextResponse.json({ error: error.message }, { status: 409 });
  if (error.code === "RR005") return NextResponse.json({ error: error.message }, { status: 400 });
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) return serviceRoleMissing();

  const supabase = await getPrivileged();
  const { data, error } = await supabase.rpc("admin_list_events");
  if (error) return rpcError(error, "Could not load events.");

  // admin_list_events answers "what is the state of my events"; the edit form
  // needs the fields it lets you change. Enriched here rather than by widening
  // the RPC — the shape the list screen depends on stays put.
  const rows = (data ?? []) as Record<string, unknown>[];
  const ids = rows.map((r) => String(r.storeId ?? r.store_id ?? ""));
  const details = new Map<string, Record<string, unknown>>();
  if (ids.length) {
    const [{ data: stores }, { data: evs }] = await Promise.all([
      supabase.from("stores").select("id, cover_url").in("id", ids),
      supabase.from("events").select("store_id, doors_open_at, venue_address, support_phone, terms").in("store_id", ids),
    ]);
    for (const st of (stores ?? []) as Record<string, unknown>[]) {
      details.set(String(st.id), { coverUrl: st.cover_url ?? null });
    }
    for (const ev of (evs ?? []) as Record<string, unknown>[]) {
      const key = String(ev.store_id);
      details.set(key, {
        ...(details.get(key) ?? {}),
        doorsOpenAt: ev.doors_open_at ?? null,
        venueAddress: ev.venue_address ?? null,
        supportPhone: ev.support_phone ?? null,
        terms: ev.terms ?? null,
      });
    }
  }

  return NextResponse.json({
    events: rows.map((r) => ({
      ...r,
      ...(details.get(String(r.storeId ?? r.store_id ?? "")) ?? {}),
    })),
  });
}

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) return serviceRoleMissing();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const p = parsed.data;

  const supabase = await getPrivileged();
  const { data, error } = await supabase.rpc("admin_create_event", {
    p_name: p.name,
    p_starts_at: p.startsAt,
    p_slug: p.slug?.trim() || null,
    p_ends_at: p.endsAt ?? null,
    p_doors_open_at: p.doorsOpenAt ?? null,
    p_venue_name: p.venueName?.trim() || null,
    p_venue_address: p.venueAddress?.trim() || null,
    p_timezone: "Indian/Mauritius",
    p_support_phone: p.supportPhone?.trim() || null,
    p_terms: p.terms?.trim() || null,
    p_capacity: p.capacity ?? null,
    p_is_test: p.isTest ?? false,
  });
  if (error) return rpcError(error, "Could not create that event.");
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) return serviceRoleMissing();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const p = parsed.data;
  const supabase = await getPrivileged();

  if (p.action === "testFlag") {
    const { data, error } = await supabase.rpc("admin_set_event_test_flag", {
      p_store_id: p.storeId,
      p_is_test: p.isTest,
    });
    if (error) return rpcError(error, "Could not change that.");
    return NextResponse.json(data);
  }

  if (p.action === "publish") {
    const { data, error } = await supabase.rpc("admin_publish_event", {
      p_store_id: p.storeId,
      p_publish: p.publish,
    });
    if (error) return rpcError(error, "Could not change that.");
    return NextResponse.json(data);
  }

  // Cover and cancellation are plain column writes on tables this route already
  // owns, so they do not need their own RPC — but they DO need the same audit
  // line, since "who cancelled the concert" is the question that gets asked.
  if (p.coverUrl !== undefined) {
    const { error: coverError } = await supabase
      .from("stores")
      .update({ cover_url: p.coverUrl || null })
      .eq("id", p.storeId);
    if (coverError) return rpcError(coverError, "Could not save that photo.");
    await audit(supabase, {
      action: "event.cover", entityType: "store", entityId: p.storeId,
      diff: { coverUrl: p.coverUrl || null },
    });
  }

  if (p.cancel !== undefined) {
    const { error: cancelError } = await supabase
      .from("events")
      .update(
        p.cancel
          ? { cancelled_at: new Date().toISOString(), cancelled_reason: p.cancelReason || null }
          : { cancelled_at: null, cancelled_reason: null },
      )
      .eq("store_id", p.storeId);
    if (cancelError) return rpcError(cancelError, "Could not change that.");
    // A cancelled event must also come off the site — event_phase() reports
    // 'cancelled' but the store's own status is what keeps it listed.
    if (p.cancel) {
      await supabase.from("stores").update({ status: "draft" }).eq("id", p.storeId);
    }
    await audit(supabase, {
      action: p.cancel ? "event.cancel" : "event.uncancel",
      entityType: "store", entityId: p.storeId,
      diff: { reason: p.cancelReason ?? null },
    });
    // Nothing left for admin_update_event to do when this was the only change.
    if (
      p.name === undefined && p.startsAt === undefined && p.endsAt === undefined &&
      p.doorsOpenAt === undefined && p.venueName === undefined &&
      p.venueAddress === undefined && p.supportPhone === undefined && p.terms === undefined
    ) {
      return NextResponse.json({ ok: true, cancelled: p.cancel });
    }
  }

  if (
    p.name === undefined && p.startsAt === undefined && p.endsAt === undefined &&
    p.doorsOpenAt === undefined && p.venueName === undefined &&
    p.venueAddress === undefined && p.supportPhone === undefined && p.terms === undefined
  ) {
    return NextResponse.json({ ok: true });
  }

  const { data, error } = await supabase.rpc("admin_update_event", {
    p_store_id: p.storeId,
    p_name: p.name?.trim() || null,
    p_starts_at: p.startsAt ?? null,
    p_ends_at: p.endsAt ?? null,
    p_doors_open_at: p.doorsOpenAt ?? null,
    p_venue_name: p.venueName?.trim() || null,
    p_venue_address: p.venueAddress?.trim() || null,
    p_support_phone: p.supportPhone?.trim() || null,
    p_terms: p.terms?.trim() || null,
  });
  if (error) return rpcError(error, "Could not save that.");
  return NextResponse.json(data);
}

/** Remove an event created by mistake. Refused once any order exists — that is
 *  a cancellation, not a deletion, and erasing it would rewrite history a
 *  customer holds a receipt for. */
export async function DELETE(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) return serviceRoleMissing();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = z.object({ storeId: z.string().uuid() }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  const supabase = await getPrivileged();
  const { data, error } = await supabase.rpc("admin_delete_event", { p_store_id: parsed.data.storeId });
  if (error) return rpcError(error, "Could not delete that event.");
  return NextResponse.json(data);
}
