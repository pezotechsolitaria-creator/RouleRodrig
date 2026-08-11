import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/file-signature";
import { guard as rateGuard } from "@/lib/rate-limit";
import { sendWhatsApp } from "@/lib/notifications/whatsapp";
import { NOTIFICATION_CATEGORIES } from "@/lib/notifications/queue";

// Edit, delete, and test-send one recipient slot.
//
// api_key stays write-only here too: PATCH accepts a new key but nothing ever
// returns one. Omitting the field leaves the stored key untouched, so editing a
// name does not silently wipe the credential — a mistake that would be
// invisible until the next alert failed to arrive.
const SAFE_COLUMNS =
  "id, name, role, phone, is_active, categories, last_success_at, last_error, last_error_at, created_at";

function guard(req: NextRequest): NextResponse | null {
  if (!verifySession(req.cookies.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasServiceRole()) {
    return NextResponse.json(
      { error: "Admin backend is not configured (SUPABASE_SERVICE_ROLE_KEY is unset)." },
      { status: 503 },
    );
  }
  return null;
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  role: z.string().trim().max(80).nullable().optional(),
  phone: z
    .string()
    .trim()
    .transform((v) => {
      const digits = v.replace(/[^\d+]/g, "");
      return digits.startsWith("+") ? digits : `+${digits}`;
    })
    .refine((v) => /^\+[1-9][0-9]{6,15}$/.test(v), "Use the full international number.")
    .optional(),
  /** Omit to keep the existing key; empty string to clear it. */
  apiKey: z.string().trim().max(200).optional(),
  categories: z.array(z.enum(NOTIFICATION_CATEGORIES)).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = guard(req);
  if (denied) return denied;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

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

  const patch: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.role !== undefined) patch.role = parsed.data.role || null;
  if (parsed.data.phone !== undefined) patch.phone = parsed.data.phone;
  if (parsed.data.categories !== undefined) patch.categories = parsed.data.categories;
  if (parsed.data.isActive !== undefined) patch.is_active = parsed.data.isActive;
  // Only touch the key when the field was actually sent.
  if (parsed.data.apiKey !== undefined) patch.api_key = parsed.data.apiKey || null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const admin = await getPrivileged();
  const { data, error } = await admin
    .from("notification_slots")
    .update(patch)
    .eq("id", id)
    .select(SAFE_COLUMNS)
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "That number is already a recipient." }, { status: 409 });
    }
    console.error("update notification slot failed", error);
    return NextResponse.json({ error: "Could not save that recipient." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json({ slot: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = guard(req);
  if (denied) return denied;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const admin = await getPrivileged();
  // Queued jobs for this slot cascade away with it — a message addressed to a
  // recipient who no longer exists has nowhere to go.
  const { error } = await admin.from("notification_slots").delete().eq("id", id);
  if (error) {
    console.error("delete notification slot failed", error);
    return NextResponse.json({ error: "Could not remove that recipient." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * Test send — the answer to "is this actually working?".
 *
 * Deliberately synchronous and OUTSIDE the queue: the admin is standing there
 * waiting for a verdict, so they get the real provider error rather than a job
 * id to go and look up.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = guard(req);
  if (denied) return denied;

  // A test send is a real WhatsApp message. Rate limited so a stuck finger
  // cannot spam the owner's own phone or burn a free-tier quota.
  const limited = rateGuard(req, "admin-notification-test", 10, 60_000);
  if (limited) return limited;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const admin = await getPrivileged();
  const { data: slot, error } = await admin
    .from("notification_slots")
    .select("id, name, phone, api_key")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("load notification slot failed", error);
    return NextResponse.json({ error: "Could not load that recipient." }, { status: 500 });
  }
  if (!slot) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const result = await sendWhatsApp({
    phone: slot.phone as string,
    apiKey: (slot.api_key as string | null) ?? "",
    message:
      "Roulé Rodrigues — test message.\n\n" +
      `This confirms "${slot.name}" is connected and will receive alerts.`,
  });

  // Recorded either way, so the card reflects reality instead of the last
  // successful send from an hour ago.
  if (result.ok) {
    await admin
      .from("notification_slots")
      .update({ last_success_at: new Date().toISOString(), last_error: null, last_error_at: null })
      .eq("id", id);
    return NextResponse.json({ ok: true });
  }

  await admin
    .from("notification_slots")
    .update({ last_error: result.error, last_error_at: new Date().toISOString() })
    .eq("id", id);
  return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
}
