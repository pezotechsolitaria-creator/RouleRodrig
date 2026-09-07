import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { NOTIFICATION_CATEGORIES } from "@/lib/notifications/queue";

// ── Admin: dynamic WhatsApp recipient slots (M43) ───────────────────────────
//
// DELIBERATELY A SEPARATE PATH from /api/admin/notifications, which already
// exists and manages the ORIGINAL single-owner CallMeBot number in
// `app_secrets` (see lib/whatsapp.ts → sendOwnerWhatsApp). That endpoint and
// its admin screen are untouched and keep working; this one adds the many-
// recipient layer the owner asked for. Replacing the old route would have
// broken a shipped feature to build a new one.
//
// THE ONE RULE: api_key is WRITE-ONLY. It is never selected into a response and
// never rendered. The admin sees whether a key EXISTS, not what it is — a key
// in a JSON body would sit in the browser cache, in devtools history and in any
// screen recording, and it is a bearer credential for sending WhatsApp as that
// number.
// channel and target ARE returned, unlike api_key. api_key is a bearer
// credential that sends AS somebody else's WhatsApp number; a target is the
// owner's own address, and he has to be able to read the ntfy topic back in
// order to subscribe a phone to it. It is still sensitive — on public ntfy.sh
// the topic is the only secret there is — so it stays behind the admin session
// like everything else here.
const SAFE_COLUMNS =
  "id, name, role, phone, channel, target, is_active, categories, last_success_at, last_error, last_error_at, created_at";

function guard(req: NextRequest): NextResponse | null {
  if (!verifySession(req.cookies.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasServiceRole()) {
    // getPrivileged() falls back to the anon client without the key, which
    // would read as "no recipients" rather than a misconfiguration.
    return NextResponse.json(
      { error: "Admin backend is not configured (SUPABASE_SERVICE_ROLE_KEY is unset)." },
      { status: 503 },
    );
  }
  return null;
}

/** E.164. Stored normalised so the DB CHECK and CallMeBot agree on one shape. */
const phoneField = z
  .string()
  .trim()
  .transform((v) => {
    const cleaned = v.replace(/[^\d+]/g, "");
    return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
  })
  .refine((v) => /^\+[1-9][0-9]{6,15}$/.test(v), "Use the full international number, e.g. +23058355588.");

// ── ONE QUEUE, THREE DOORS (M166) ─────────────────────────────────────────
// A slot is a recipient plus the channel it is reached on. WhatsApp uses
// phone + api_key; ntfy and email use `target`. The database enforces the same
// rule (notification_slots_addressable) so a slot created any other way cannot
// be unaddressable either.
const createSchema = z
  .object({
    name: z.string().trim().min(1, "Give this recipient a name.").max(80),
    role: z.string().trim().max(80).nullable().optional(),
    channel: z.enum(["whatsapp", "ntfy", "email"]).default("whatsapp"),
    phone: phoneField.optional(),
    apiKey: z.string().trim().max(200).nullable().optional(),
    /** ntfy topic or full URL, or an email address. */
    target: z.string().trim().max(300).optional(),
    categories: z.array(z.enum(NOTIFICATION_CATEGORIES)).default([]),
    isActive: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.channel === "whatsapp" && !v.phone) {
      ctx.addIssue({ code: "custom", path: ["phone"], message: "A WhatsApp recipient needs a number." });
    }
    if (v.channel === "ntfy" && !v.target) {
      ctx.addIssue({ code: "custom", path: ["target"], message: "Give the ntfy topic, or the full URL of your own server." });
    }
    if (v.channel === "email") {
      if (!v.target || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.target)) {
        ctx.addIssue({ code: "custom", path: ["target"], message: "Give a valid email address." });
      }
    }
  });

export async function GET(req: NextRequest) {
  const denied = guard(req);
  if (denied) return denied;

  const admin = await getPrivileged();
  const { data, error } = await admin
    .from("notification_slots")
    .select(`${SAFE_COLUMNS}, api_key`)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("list notification slots failed", error);
    return NextResponse.json({ error: "Could not load recipients." }, { status: 500 });
  }

  // api_key is read here only to derive hasKey, then dropped. It never leaves.
  const slots = (data ?? []).map((row) => {
    const { api_key: key, ...rest } = row as Record<string, unknown> & { api_key: string | null };
    return { ...rest, hasKey: Boolean(key && String(key).trim()) };
  });

  const JOB_COLUMNS =
    "id, type, category, slot_id, status, attempts, error, sent_at, created_at, " +
    "suppressed_count, last_suppressed_at";

  // Recent attempts, for the "is this actually working?" question. Bounded.
  const { data: jobs } = await admin
    .from("notification_jobs")
    .select(JOB_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(25);

  // M118. A suppressed duplicate writes NO new row — it bumps a counter on the
  // row that already holds the key, which can be days older than these 25. The
  // M117 case is exactly that shape: an urgent second alert colliding with an
  // old one. Ordered by when it was last swallowed rather than when it was
  // created, or the very thing this exists to surface stays off the screen.
  const { data: suppressed } = await admin
    .from("notification_jobs")
    .select(JOB_COLUMNS)
    .gt("suppressed_count", 0)
    .order("last_suppressed_at", { ascending: false })
    .limit(10);

  return NextResponse.json({ slots, jobs: jobs ?? [], suppressed: suppressed ?? [] });
}

export async function POST(req: NextRequest) {
  const denied = guard(req);
  if (denied) return denied;

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
  const { name, role, channel, phone, apiKey, target, categories, isActive } = parsed.data;

  const admin = await getPrivileged();
  const { data, error } = await admin
    .from("notification_slots")
    .insert({
      name,
      role: role || null,
      channel,
      // Only the address its channel actually uses. A phone on an ntfy slot
      // would be a number nobody ever sends to, sitting under a UNIQUE index.
      phone: channel === "whatsapp" ? phone : null,
      api_key: channel === "whatsapp" ? apiKey || null : null,
      target: channel === "whatsapp" ? null : target,
      categories,
      is_active: isActive,
    })
    .select(SAFE_COLUMNS)
    .single();

  if (error) {
    // The unique phone constraint is a business rule, not a glitch: two slots
    // for one number means every alert arrives twice, which trains people to
    // ignore alerts.
    if (error.code === "23505") {
      return NextResponse.json({ error: "That number is already a recipient." }, { status: 409 });
    }
    console.error("create notification slot failed", error);
    return NextResponse.json({ error: "Could not add that recipient." }, { status: 500 });
  }

  return NextResponse.json({ slot: { ...data, hasKey: Boolean(apiKey) } }, { status: 201 });
}
