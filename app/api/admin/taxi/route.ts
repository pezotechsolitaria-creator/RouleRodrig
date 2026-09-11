import { NextRequest, NextResponse } from "next/server";
import { getPrivileged } from "@/lib/supabase/admin";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { audit } from "@/lib/admin/audit";
import { toE164National } from "@/lib/phone";

function auth(req: NextRequest): NextResponse | null {
  const ok = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

// Whitelist of settable columns — blocks mass-assignment.
//
// The second row is what makes a driver DISPATCHABLE rather than merely listed.
// They were added to taxi_drivers by the rides migration and then blocked here,
// which is the allowlist doing its job — and meant the owner could not set a
// seat count or a base location from anywhere, so every driver defaulted to 4
// seats and could never be ranked by distance. The counters are deliberately
// absent: rides_offered/accepted/completed are written by the dispatch functions
// and must not be settable from a form, or reliability becomes self-reported.
const ALLOWED = [
  "name", "phone", "whatsapp", "photo", "photos", "vehicle", "vehicle_type",
  "languages", "areas", "rate_from", "notes", "featured", "active",
  "base_lat", "base_lng", "base_label", "seats", "luggage_capacity",
  "handles_taxi", "handles_airport", "handles_transfer", "availability",
  // The credential that makes WhatsApp automatic. Settable (the owner has to
  // paste what the driver's opt-in reply gives them) but NEVER returned — see
  // the select list in GET below.
  "whatsapp_api_key", "notify_from_hour", "notify_to_hour",
] as const;

function pick(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of ALLOWED) if (k in body) out[k] = body[k];
  return out;
}

// ── THE FORM AND THE DATABASE DISAGREED ABOUT WHAT A NUMBER IS ─────────────
//
// M119 put E.164 on this table — phone must match ^\+[1-9][0-9]{6,15}$ — and
// nothing on the way in ever enforced it. pick() handed whatever was typed
// straight to Postgres, so editing a driver and writing their number the way
// anyone in Rodrigues writes it ("5806 6022", "+230 5806 6022") failed the
// constraint, and the owner was shown the raw database text:
//
//     new row for relation "taxi_drivers" violates check constraint
//     "taxi_drivers_phone_check"
//
// Two separate faults. The number was reasonable and we rejected it; and the
// rejection was addressed to a database administrator, not to the person who
// typed it. Both are fixed here rather than in the form, because the API is
// what the constraint actually guards — a second screen posting to it would
// otherwise reintroduce the same 500.
//
// WHATSAPP HAS THE OPPOSITE TRAP. Its constraint is `null or <regex>`, and a
// cleared field posts "" — which is not null and does not match, so emptying
// the box was ALSO a 500. Blank means null here, deliberately.

const NOT_A_NUMBER =
  "does not look like a phone number. Write it as 5806 6022, or with the " +
  "country code for a number outside Mauritius (+262 ... for Réunion).";

/**
 * Put both contact numbers into the shape the column requires, or say plainly
 * which one cannot be read. Mutates the object about to be written.
 *
 * Returns a human sentence on failure — never a constraint name.
 */
function normaliseContacts(out: Record<string, unknown>): string | null {
  if ("name" in out) {
    // btrim(name) <> '' is a check too, and failed the same illegible way.
    const name = String(out.name ?? "").trim();
    if (!name) return "A driver needs a name.";
    out.name = name;
  }

  if ("phone" in out) {
    const raw = String(out.phone ?? "").trim();
    if (!raw) return "A driver needs a phone number — it is how a ride reaches them.";
    const e164 = toE164National(raw);
    if (!e164) return `"${raw}" ${NOT_A_NUMBER}`;
    out.phone = e164;
  }

  if ("whatsapp" in out) {
    const raw = String(out.whatsapp ?? "").trim();
    if (!raw) {
      // Not "". The column says `null or matches`, and "" is neither.
      out.whatsapp = null;
    } else {
      const e164 = toE164National(raw);
      if (!e164) return `The WhatsApp number "${raw}" ${NOT_A_NUMBER}`;
      out.whatsapp = e164;
    }
  }

  return null;
}

/**
 * Anything Postgres still refuses, said in words.
 *
 * A constraint name is a fact about our schema; it tells the person reading it
 * nothing they can act on. This is the backstop for the checks normaliseContacts
 * does not know about, so a future constraint degrades to a readable sentence
 * instead of leaking the schema onto the owner's phone.
 */
function readableDbError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("taxi_drivers_phone_check")) return `That phone number ${NOT_A_NUMBER}`;
  if (m.includes("taxi_drivers_whatsapp_check")) return `That WhatsApp number ${NOT_A_NUMBER}`;
  if (m.includes("taxi_drivers_name_check")) return "A driver needs a name.";
  if (m.includes("duplicate key")) return "There is already a driver with those details.";
  return "That change could not be saved. Nothing was altered.";
}

/**
 * The number a driver's link is sent to. trim() before the fallback, not `??`.
 *
 * M119 forbids a blank in the column, but this builds the wa.me link that
 * carries the driver's access token — a blank number there opens WhatsApp's
 * contact CHOOSER with that token already composed, one mis-tap from the wrong
 * person. Belt and braces is cheap on that particular message, and it must not
 * drift between the "send his link" path and the "re-key him" path.
 */
function waNumber(whatsapp: string | null | undefined, phone: string): string {
  return ((whatsapp ?? "").trim() || phone).replace(/\D/g, "");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const denied = await auth(req);
  if (denied) return denied;
  const supabase = await getPrivileged();

  // ── ONE driver's personal link, on demand ────────────────────────────────
  // The token is deliberately absent from the list below: fifty of them in every
  // page load would put every driver's private page in a page source. But the
  // owner has to be able to SEND a driver their link, so it is fetched one at a
  // time, for the driver he actually asked about.
  const linkFor = new URL(req.url).searchParams.get("linkFor");
  if (linkFor) {
    const { data, error } = await supabase
      .from("taxi_drivers")
      .select("id, name, whatsapp, phone, driver_token")
      .eq("id", linkFor)
      .maybeSingle();
    if (error || !data) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const d = data as { name: string; whatsapp: string | null; phone: string; driver_token: string };
    return NextResponse.json({
      name: d.name,
      whatsapp: waNumber(d.whatsapp, d.phone),
      link: `/d/${d.driver_token}`,
    });
  }
  // EXPLICIT COLUMNS, not select("*"). Two of them must never reach a browser:
  //  · whatsapp_api_key is a bearer credential — anyone holding it can send
  //    WhatsApp as that number (see lib/notifications/whatsapp.ts, M43). The
  //    client gets a BOOLEAN instead, which is all a screen needs to say
  //    "this driver is not set up yet".
  //  · driver_token is the driver's permanent personal link. It is theirs, sent
  //    to them once; an admin list that echoed it into a bundle would put every
  //    driver's private page in a page source.
  // select("*") would have shipped both the moment they were added to the
  // allowlist above, which is exactly what happened before this comment existed.
  const { data, error } = await supabase
    .from("taxi_drivers")
    .select(
      "id, name, phone, whatsapp, photo, photos, vehicle, vehicle_type, languages, areas, " +
        "rate_from, notes, featured, active, created_at, " +
        "base_lat, base_lng, base_label, seats, luggage_capacity, " +
        "handles_taxi, handles_airport, handles_transfer, availability, " +
        "notify_from_hour, notify_to_hour, " +
        "rides_offered, rides_accepted, rides_completed, rides_declined, last_offered_at",
    )
    .order("featured", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("taxi driver list failed", error);
    return NextResponse.json({ error: "Could not load the drivers." }, { status: 500 });
  }

  // Whether automation will reach them, without revealing the credential.
  const [{ data: waReady }, { data: pushReady }] = await Promise.all([
    supabase.rpc("taxi_whatsapp_readiness"),
    supabase.rpc("taxi_push_readiness"),
  ]);
  const waMap = new Map(
    ((waReady ?? []) as { driver_id: string; whatsapp_ready: boolean }[]).map((r) => [r.driver_id, r.whatsapp_ready]),
  );
  const pushMap = new Map(
    ((pushReady ?? []) as { driver_id: string; push_ready: boolean }[]).map((r) => [r.driver_id, r.push_ready]),
  );
  return NextResponse.json(
    ((data ?? []) as unknown as Record<string, unknown>[]).map((d) => ({
      ...d,
      whatsapp_ready: waMap.get(String(d.id)) ?? false,
      push_ready: pushMap.get(String(d.id)) ?? false,
    })),
  );
}

export async function POST(req: NextRequest) {
  const denied = await auth(req);
  if (denied) return denied;
  const supabase = await getPrivileged();

  // ── GIVE ONE DRIVER A NEW LINK ───────────────────────────────────────────
  //
  // driver_token IS the driver's credential and it is deliberately NOT in
  // ALLOWED above — it stays out. A settable token field would let a typo
  // install a guessable credential, would accept "" or null (the column is
  // nullable and a UNIQUE btree permits many nulls, so a blank makes the driver
  // unreachable with no error anywhere), and would skip the prefix re-roll that
  // stops one driver's six-character code resolving to another driver's token.
  // Rotation is an ACTION, minted server-side, and this is the only way to do it.
  //
  // On POST rather than GET because it writes; on a query param rather than a
  // body field so the driver-create path below never has to inspect an action.
  const rotateFor = new URL(req.url).searchParams.get("rotate");
  if (rotateFor) {
    if (!UUID.test(rotateFor)) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const { data, error } = await supabase.rpc("admin_rotate_driver_token", { p_driver_id: rotateFor });
    if (error) {
      // RR090 is "no such driver" — the function refusing, not a crash, and its
      // message is written for a person. Anything else is a real fault, and its
      // text belongs in the log rather than on the owner's phone.
      if (error.code === "RR090") {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      console.error("admin_rotate_driver_token failed", { rotateFor, error });
      return NextResponse.json({ error: "Could not make a new link." }, { status: 500 });
    }
    const r = (data ?? {}) as {
      ok?: boolean; reason?: string; message?: string;
      name?: string; whatsapp?: string | null; phone?: string; link?: string;
    };
    // A soft refusal, not an error: the driver is mid-ride and re-keying him now
    // would leave him unable to press Completed.
    if (!r.ok || !r.link) {
      return NextResponse.json(
        { error: r.message ?? "Could not change that link." },
        { status: r.reason === "on_ride" ? 409 : 500 },
      );
    }
    // AFTER the write, never before, and never carrying a token — audit_logs is
    // append-only with no purge and /admin/audit prints the diff verbatim, so a
    // token logged here would outlive the rotation meant to retire it.
    await audit(supabase, {
      action: "taxi.rotate_token",
      entityType: "taxi_driver",
      entityId: rotateFor,
      diff: { driver: r.name },
    });
    // Byte-identical to the ?linkFor= response, so the desk can hand it straight
    // to the QR overlay it already uses — which is the point: rotating without
    // handing over is the failure mode.
    return NextResponse.json({
      name: r.name,
      whatsapp: waNumber(r.whatsapp, r.phone ?? ""),
      link: r.link,
    });
  }

  const body = await req.json();
  const row = pick(body);
  const bad = normaliseContacts(row);
  // 400, not 500: the request is wrong, not the server. A 500 tells the owner
  // the platform broke when in fact it read exactly what they typed.
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });

  const { data, error } = await supabase.from("taxi_drivers").insert([row]).select("id, name").single();
  if (error) {
    console.error("taxi driver insert failed", error);
    return NextResponse.json({ error: readableDbError(error.message) }, { status: 400 });
  }
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const denied = await auth(req);
  if (denied) return denied;
  const { id, ...patch } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const supabase = await getPrivileged();

  const row = pick(patch);
  const bad = normaliseContacts(row);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });

  const { data, error } = await supabase.from("taxi_drivers").update(row).eq("id", id).select("id, name").single();
  if (error) {
    console.error("taxi driver update failed", { id, error });
    return NextResponse.json({ error: readableDbError(error.message) }, { status: 400 });
  }
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const denied = await auth(req);
  if (denied) return denied;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const supabase = await getPrivileged();
  const { error } = await supabase.from("taxi_drivers").delete().eq("id", id);
  if (error) {
    // A driver with rides against them is refused by a foreign key, and that
    // refusal used to arrive as raw Postgres text too.
    console.error("taxi driver delete failed", { id, error });
    const inUse = error.message.toLowerCase().includes("foreign key");
    return NextResponse.json(
      {
        error: inUse
          ? "This driver has rides on record, so they cannot be deleted. Switch them off instead — they stop being offered work and the history stays."
          : readableDbError(error.message),
      },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
