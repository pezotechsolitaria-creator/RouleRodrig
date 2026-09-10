import { SITE_URL } from "@/lib/site";
import { centsToDecimalString } from "@/lib/money";

// ── ONE ALERT, THREE CHANNELS, ONE SHAPE ────────────────────────────────────
//
// Every owner alert is a single string that has to survive three very
// different doors, and each door reads it differently:
//
//   WhatsApp (CallMeBot)  the whole string, inside a URL query parameter.
//                         Newlines become %0A and every accent 2-6 bytes, so
//                         the message is far bigger on the wire than on screen.
//   ntfy                  FIRST LINE becomes the Title header — stripped to
//                         ASCII and cut at 120 — and the rest becomes the body.
//                         A body over 4096 bytes becomes an attachment.
//   email                 FIRST LINE becomes the subject AND the heading; the
//                         remaining lines are rendered as a detail table.
//
// So the first line is not a label. It is the entire message on a locked phone
// screen and in an inbox list, and it has to stand alone there. Everything
// below it is what the owner reads once they have decided to look.
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────────
//
// The alerts said things like "1 delivery request expired with prices waiting /
// 1 closed, 1 prices withdrawn. Somebody was quoted and never booked. Worth
// asking why." Three numbers and a suggestion. It cannot say who, what, where,
// how much or how long — so "worth asking why" is advice the message itself
// makes impossible to follow. The owner's words: "give more details about
// that... rework entirely so it gives the max info possible".
//
// Max info is not max words. A message nobody finishes is worse than a short
// one, and M164 already had to delete a whole family of alerts the owner had
// learned to swipe away. The rule here: every line either names a FACT the
// owner would otherwise open a laptop to learn, or it is the ONE tap that acts
// on it. Nothing else earns a line.

/** A single named fact. Rendered "Label: value"; dropped when there is no value. */
export type AlertFact = { label: string; value: string | number | null | undefined };

/** Something the owner can tap. */
export type AlertAction =
  | { kind: "open"; label: string; path: string }
  | { kind: "chat"; label: string; phone: string };

// ── THE BUDGET ─────────────────────────────────────────────────────────────
//
// CallMeBot takes the message as a GET query parameter, so the real limit is
// the URL, not the text. A worst-case Rodrigues alert is mostly newlines and
// accented place names — "Baie aux Huîtres", "Rivière Cocos" — and each of
// those costs 3 bytes per newline and up to 6 per accented character once
// encodeURIComponent has run.
//
// Truncation is a CORRECTNESS concern, not tidiness: an over-long message does
// not arrive shortened, it fails to arrive, and ntfy silently turns a body over
// 4096 bytes into an attachment that expires. Both ceilings are enforced here,
// once, rather than trusted to whoever writes the next alert.
const MAX_MESSAGE_CHARS = 900;
const MAX_ENCODED_CHARS = 1400;
const MAX_NTFY_BYTES = 3500;
const MAX_HEADLINE_CHARS = 100;
const MAX_FACT_CHARS = 110;

/**
 * The host every alert link points at.
 *
 * NOT bare SITE_URL: that falls back to https://roule-rodrig.vercel.app when
 * NEXT_PUBLIC_SITE_URL is unset, and a notification is exactly the place where
 * a link to the wrong host gets discovered weeks later by whoever tapped it.
 */
export const ALERT_ORIGIN = (
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
  (SITE_URL.includes("vercel.app") ? "https://roulerodrig.com" : SITE_URL)
).replace(/\/+$/, "");

/** Trim to a length without cutting mid-word where that can be avoided. */
function clamp(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 3);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd() + "...";
}

/** Absolute, always. A relative path is dead text in WhatsApp and in email. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${ALERT_ORIGIN}/${path.replace(/^\/+/, "")}`;
}

/**
 * How the owner should SEE a phone number.
 *
 * Local digits, because that is what a person dials on this island, and because
 * WhatsApp linkifies a bare number on its own — a "tel:" wrapper adds nothing a
 * phone does not already do. It also keeps a raw "+230…" out of the body, which
 * every WhatsApp job that has ever failed contained and no job that succeeded
 * did. That correlation is not proof of cause, but the local form is the better
 * thing to print regardless, so there is no cost to being on its safe side.
 */
export function localDial(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/[^\d]/g, "");
  if (digits.length < 7) return null;
  const local = digits.startsWith("230") ? digits.slice(3) : digits;
  if (local.length === 8) return `${local.slice(0, 4)} ${local.slice(4)}`;
  return local;
}

/** A tap that opens WhatsApp on that person. Proven on this transport. */
export function chatLink(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/[^\d]/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return `https://wa.me/${digits}`;
}

/** Rs from MINOR UNITS. This platform has shipped rupees-for-cents twice. */
export function alertMoneyCents(cents: number | null | undefined): string | null {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return null;
  return `Rs ${centsToDecimalString(cents)}`;
}

/** Rs from WHOLE RUPEES — bookings store rupees, orders store cents. */
export function alertMoneyRupees(rupees: number | null | undefined): string | null {
  if (rupees === null || rupees === undefined || !Number.isFinite(rupees)) return null;
  return `Rs ${rupees.toLocaleString("en-GB")}`;
}

/** One clock for every alert, in the owner's own timezone. */
export function alertClock(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Indian/Mauritius",
  }).format(d);
}

/** "3 h", "2 days", "under an hour" — never a raw minute count. */
export function alertElapsed(hours: number | null | undefined): string | null {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return null;
  if (hours < 1) return "under an hour";
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} days`;
}

/**
 * ntfy strips the title to ASCII, so do it here — the title the owner reads
 * should be the title the code wrote, not whatever survives the header encoder.
 */
export function asciiTitle(raw: string): string {
  return raw
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/→/g, "->")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function renderAction(a: AlertAction): string | null {
  if (a.kind === "chat") {
    const link = chatLink(a.phone);
    return link ? `${a.label}: ${link}` : null;
  }
  return `${a.label}: ${absoluteUrl(a.path)}`;
}

/**
 * Build one owner alert.
 *
 * The headline is mandatory and carries the whole meaning on its own. Facts are
 * the things the owner would otherwise open the dashboard to find out. Actions
 * are taps, and they are never truncated away — a message that loses its link
 * costs more than one that loses its last fact.
 */
export function ownerAlert(opts: {
  /** Stands alone. Becomes the ntfy title and the email subject. */
  headline: string;
  /** "Label: value" lines. Null/blank values are dropped, not rendered empty. */
  facts?: AlertFact[];
  /** One sentence of interpretation — what this means, or what to do. */
  note?: string;
  /** Taps. Kept even when the facts have to be cut. */
  actions?: AlertAction[];
}): string {
  const headline = clamp(asciiTitle(opts.headline), MAX_HEADLINE_CHARS);

  const factLines = (opts.facts ?? [])
    .filter((f) => f.value !== null && f.value !== undefined && String(f.value).trim().length > 0)
    .map((f) => clamp(`${f.label}: ${String(f.value).trim().replace(/\s+/g, " ")}`, MAX_FACT_CHARS));

  const actionLines = (opts.actions ?? [])
    .map(renderAction)
    .filter((l): l is string => Boolean(l));

  const note = opts.note?.trim() ? clamp(opts.note.trim(), 180) : null;
  const tail = [note, actionLines.join("\n")].filter(Boolean).join("\n\n");

  const build = (facts: string[]) =>
    [headline, facts.join("\n"), tail].filter(Boolean).join("\n\n").trim();

  // Say so rather than stopping silently — an alert that quietly shows three of
  // nine jobs reads exactly like an alert about three jobs.
  const withMarker = (list: string[]) =>
    list.length < factLines.length
      ? [...list, `...and ${factLines.length - list.length} more, open the link`]
      : list;

  // Assemble tail-first so the budget is spent on the parts that cannot be
  // dropped, and the facts absorb whatever is left.
  const room = MAX_MESSAGE_CHARS - headline.length - (tail ? tail.length + 4 : 2);
  const kept: string[] = [];
  let used = 0;
  for (const line of factLines) {
    if (used + line.length + 1 > room) break;
    kept.push(line);
    used += line.length + 1;
  }

  let message = build(withMarker(kept));

  // The wire, not the screen. Both ceilings, on the real encodings.
  while (
    kept.length > 0 &&
    (encodeURIComponent(message).length > MAX_ENCODED_CHARS ||
      Buffer.byteLength(message, "utf8") > MAX_NTFY_BYTES)
  ) {
    kept.pop();
    message = build(withMarker(kept));
  }
  return message;
}

/** What the message costs on the wire, as CallMeBot will send it. Exported so a
 *  test can prove the budget on a worst-case accented message. */
export function encodedLength(message: string): number {
  return encodeURIComponent(message).length;
}

export const ALERT_LIMITS = {
  MAX_MESSAGE_CHARS,
  MAX_ENCODED_CHARS,
  MAX_NTFY_BYTES,
  MAX_HEADLINE_CHARS,
  MAX_FACT_CHARS,
} as const;
