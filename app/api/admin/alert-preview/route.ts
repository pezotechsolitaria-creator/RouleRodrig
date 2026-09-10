import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { guard as rateGuard } from "@/lib/rate-limit";
import { enqueueNotification } from "@/lib/notifications/queue";
import { encodedLength, ALERT_LIMITS } from "@/lib/notifications/owner-alert";
import { ALERT_SAMPLES, sampleByKey } from "@/lib/notifications/samples";

// ── READ EVERY ALERT BEFORE A CUSTOMER EVER TRIGGERS ONE ────────────────────
//
// The owner asked to be sent a sample of every message so he can say what to
// change. The obvious way to do that is to make a booking, a request, an order
// — which puts fake work in front of real drivers and into the real counts.
// This project has already spent a session deleting one test job that got
// stuck doing exactly that.
//
// So nothing here reads or writes a business table. The facts are frozen
// fixtures in lib/notifications/samples.ts and the message is built by the
// REAL builders, which makes every preview a live check of the envelope: the
// character budget, the encoded length CallMeBot has to accept, the phone
// shape, and the link host.
//
// GET  -> render all of them, send nothing. Free, instant, and the way to
//         review wording.
// POST -> deliver ONE of them through the real queue, prefixed [SAMPLE].

export const dynamic = "force-dynamic";

function unauthorised(req: NextRequest): NextResponse | null {
  if (!verifySession(req.cookies.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Not permitted." }, { status: 401 });
  }
  return null;
}

/** What every sample reports, so a regression is visible before it is sent. */
function describe(key: string, when: string, message: string) {
  const encoded = encodedLength(message);
  const bytes = Buffer.byteLength(message, "utf8");
  return {
    key,
    when,
    message,
    chars: message.length,
    encodedChars: encoded,
    bytes,
    // The three ways a "more detail" change silently stops the message
    // arriving at all.
    withinWhatsApp: encoded <= ALERT_LIMITS.MAX_ENCODED_CHARS,
    withinNtfy: bytes <= ALERT_LIMITS.MAX_NTFY_BYTES,
    // ntfy strips the title to ASCII; an all-emoji headline arrives blank.
    titleSurvivesNtfy:
      message.split("\n")[0].replace(/[^\x20-\x7E]/g, "").trim().length > 0,
    // A relative link is dead text on all three channels.
    linksAreAbsolute: !/\n[A-Za-z ]+: \/(?!\/)/.test(message),
  };
}

export async function GET(req: NextRequest) {
  const no = unauthorised(req);
  if (no) return no;

  const samples = ALERT_SAMPLES.map((s) => describe(s.key, s.when, s.build()));
  return NextResponse.json({
    count: samples.length,
    // One glance at whether anything would fail to arrive.
    problems: samples.filter(
      (s) => !s.withinWhatsApp || !s.withinNtfy || !s.titleSurvivesNtfy || !s.linksAreAbsolute,
    ).length,
    samples,
  });
}

const Body = z.object({
  /** Which sample to send. Must be one of the fixtures. */
  key: z.string().min(1).max(80),
});

export async function POST(req: NextRequest) {
  const no = unauthorised(req);
  if (no) return no;

  // Sending costs real messages on a real number, so this is rate limited even
  // behind the admin cookie.
  const limited = rateGuard(req, "admin-alert-preview", 10, 60_000);
  if (limited) return limited;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Pick a sample to send." }, { status: 400 });
  }

  const sample = sampleByKey(parsed.data.key);
  if (!sample) {
    return NextResponse.json(
      { error: "Unknown sample.", available: ALERT_SAMPLES.map((s) => s.key) },
      { status: 404 },
    );
  }

  const built = sample.build();
  // Prefixed so nothing arriving on the owner's phone can be mistaken for a
  // real job. On the FIRST line, because that line is the whole message on a
  // lock screen and in an inbox list.
  const message = `[SAMPLE] ${built}`;

  const queued = await enqueueNotification({
    type: `admin.sample.${sample.key}`,
    category: "admin",
    message,
    // Minute-granular, so a double tap does not send twice.
    dedupeKey: `admin.sample:${sample.key}:${new Date().toISOString().slice(0, 16)}`,
    payload: { sample: sample.key },
  });

  return NextResponse.json({
    ...describe(sample.key, sample.when, message),
    queued,
    // -1 from the queue means no active slot takes this category, which is a
    // configuration answer rather than a failure to send.
    note:
      queued > 0
        ? `Queued for ${queued} recipient${queued === 1 ? "" : "s"}. It sends within a minute.`
        : queued === 0
          ? "Already queued this minute — nothing sent twice."
          : "No active notification slot accepts the admin category, so this reached nobody.",
  });
}
