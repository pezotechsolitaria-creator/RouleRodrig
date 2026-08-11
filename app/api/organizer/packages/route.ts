import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { guardShared } from "@/lib/rate-limit";
import { detectFileType } from "@/lib/file-signature";

// Ticket packages, written by the organiser who runs the event.
//
// AUTHORIZATION lives entirely in the database: every RPC below is gated by
// can_manage_event() (M43), which takes no organiser id and reads status live.
// This route runs as the SIGNED-IN USER, never the service role, so an
// organiser cannot reach an event they are not assigned to even if this file
// were wrong. That is deliberate — an events dashboard is exactly where an
// application-level permission check gets forgotten.
const MAX_BYTES = 4 * 1024 * 1024; // Under Vercel's ~4.5MB body limit.
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const packageSchema = z.object({
  storeId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1, "The package needs a name.").max(60),
  subtitle: z.string().trim().max(120).optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  // Capped so one package cannot render a wall of text on a phone.
  inclusions: z.array(z.string().trim().min(1).max(120)).max(12).optional(),
  imageUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
  // MINOR UNITS. Never a decimal on the wire — the client formats, the server
  // stores integers, and there is no place for a rounding disagreement.
  price: z.number().int().min(0).max(10_000_000),
  // TOTAL capacity, not remaining. The RPC works out what is already sold and
  // refuses to go below it.
  capacity: z.number().int().min(0).max(1_000_000),
  salesStart: z.string().datetime().nullable().optional(),
  salesEnd: z.string().datetime().nullable().optional(),
  minPerOrder: z.number().int().min(1).max(100).optional(),
  maxPerOrder: z.number().int().min(1).max(100).nullable().optional(),
  displayOrder: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

const visibilitySchema = z.object({
  storeId: z.string().uuid(),
  variantId: z.string().uuid(),
  isActive: z.boolean(),
});

function rpcError(error: { code?: string; message?: string }, fallback: string) {
  // RR005 messages are written for the organiser to read ("You have already
  // sold or reserved 6 of these"), so they are passed straight through.
  if (error.code === "RR005") return NextResponse.json({ error: error.message }, { status: 400 });
  if (error.code === "RR003") return NextResponse.json({ error: "Not found." }, { status: 404 });
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function POST(req: NextRequest) {
  const limited = await guardShared(req, "organizer-packages", 30, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = packageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const p = parsed.data;

  const { data, error } = await supabase.rpc("upsert_ticket_package", {
    p_store_id: p.storeId,
    p_variant_id: p.variantId ?? null,
    p_name: p.name,
    p_subtitle: p.subtitle?.trim() || null,
    p_description: p.description?.trim() || null,
    p_inclusions: p.inclusions ?? [],
    p_image_url: p.imageUrl?.trim() || null,
    p_price: p.price,
    p_capacity: p.capacity,
    p_sales_start: p.salesStart ?? null,
    p_sales_end: p.salesEnd ?? null,
    p_min_per_order: p.minPerOrder ?? 1,
    p_max_per_order: p.maxPerOrder ?? null,
    p_display_order: p.displayOrder ?? 0,
    p_is_active: p.isActive ?? true,
  });
  if (error) return rpcError(error, "Could not save that package.");
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const limited = await guardShared(req, "organizer-packages", 30, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = visibilitySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  const { data, error } = await supabase.rpc("set_ticket_package_active", {
    p_store_id: parsed.data.storeId,
    p_variant_id: parsed.data.variantId,
    p_active: parsed.data.isActive,
  });
  if (error) return rpcError(error, "Could not change that package.");
  return NextResponse.json(data);
}

// ── Package image upload ────────────────────────────────────────────────────
// PUT rather than a second route: it is the same resource, and the organiser
// gate is identical.
//
// The permission check is a REAL RPC call, not an assumption. An upload is a
// write to shared storage, so "can this person manage this event" has to be
// answered by the database before a byte is stored — otherwise any signed-in
// user could fill the bucket.
export async function PUT(req: NextRequest) {
  const limited = await guardShared(req, "organizer-package-image", 15, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const fd = await req.formData();
  const storeId = String(fd.get("storeId") ?? "");
  const file = fd.get("file") as File | null;

  if (!/^[0-9a-f-]{36}$/i.test(storeId)) {
    return NextResponse.json({ error: "Invalid event." }, { status: 400 });
  }
  const { data: allowed, error: gateError } = await supabase.rpc("can_manage_event", { p_store_id: storeId });
  if (gateError) {
    console.error("can_manage_event failed", gateError);
    return NextResponse.json({ error: "Could not verify access." }, { status: 500 });
  }
  if (!allowed) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (!file) return NextResponse.json({ error: "Choose an image." }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That image is too large (max 4 MB)." }, { status: 400 });
  }

  // Never trust the client-declared type — read the real file signature, and
  // use THAT as the stored contentType, so a spoofed part cannot cause the
  // object to be served back under an attacker-chosen type. Same rule as the
  // receipt upload.
  const detected = await detectFileType(file);
  if (!detected || !ALLOWED.has(detected)) {
    return NextResponse.json({ error: "Upload a JPG, PNG or WebP image." }, { status: 400 });
  }

  // Path is derived server-side and namespaced by event, so one organiser can
  // never overwrite another's image by choosing a filename.
  //
  // The STORE ID MUST BE THE FIRST SEGMENT. merchant-media's storage policies
  // authorize on `split_part(name,'/',1)::uuid` — an `events/<id>/…` prefix
  // fails both the UUID pattern and the ownership check, and the upload is
  // rejected by RLS with no useful error. M47b adds the organiser policy that
  // reads this same first segment.
  const path = `${storeId}/package-${Date.now()}.${EXT[detected]}`;
  const { error: uploadError } = await supabase.storage
    .from("merchant-media")
    .upload(path, file, { contentType: detected, upsert: false });

  if (uploadError) {
    console.error("package image upload failed", uploadError);
    return NextResponse.json({ error: "Could not upload that image." }, { status: 400 });
  }

  const { data: pub } = supabase.storage.from("merchant-media").getPublicUrl(path);
  return NextResponse.json({ url: pub.publicUrl });
}
