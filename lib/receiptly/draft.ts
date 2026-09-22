import {
  DOC_KINDS, CURRENCIES, type DocKind, type ReceiptlyDoc,
} from "./model";
import { HOUSE } from "./documents";

// ── DRAFTS, IN THE BROWSER ──────────────────────────────────────────────────
//
// Nothing here reaches a server. A half-typed document is the user's own
// business, and losing one to a refresh is the single most annoying thing a
// tool like this can do.
//
// Every read is defensive. localStorage can be unavailable (a private window,
// blocked site data), can hold a draft written by an older version of this
// file, or can hold something a person edited by hand. All three must produce
// a usable document rather than a blank screen, so the stored shape is merged
// over a known-good default and every field is checked.

const KEY = "receiptly.draft.v1";

export function blankDoc(today: string): ReceiptlyDoc {
  return {
    kind: "confirmation",
    // The same identity the automated documents carry. One constant, so a
    // booking confirmation the platform sends and one the owner types by hand
    // cannot come from two subtly different businesses.
    business: { ...HOUSE },
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    serviceName: "",
    details: [
      { label: "Guests", value: "" },
      { label: "Meeting point", value: "" },
      { label: "Meeting time", value: "" },
      { label: "Date", value: "" },
    ],
    lines: [{ description: "", qty: 1, unitMinor: 0 }],
    currencyCode: "MUR",
    depositPct: 50,
    depositFixedMinor: null,
    receivedMinor: 0,
    payMethod: "",
    payReference: "",
    reference: "",
    issuedOn: today,
    dueOn: "",
    notes: "",
    terms: "",
    footer: "",
  };
}

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const numOr = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

/** Everything a stored draft might get wrong, made safe. */
export function reviveDoc(raw: unknown, today: string): ReceiptlyDoc {
  const base = blankDoc(today);
  if (!raw || typeof raw !== "object") return base;
  const d = raw as Record<string, unknown>;
  const b = (d.business ?? {}) as Record<string, unknown>;

  const kind = DOC_KINDS.includes(d.kind as DocKind) ? (d.kind as DocKind) : base.kind;
  const currencyCode = CURRENCIES.some((c) => c.code === d.currencyCode)
    ? (d.currencyCode as string)
    : base.currencyCode;

  const lines = Array.isArray(d.lines) && d.lines.length
    ? (d.lines as Record<string, unknown>[]).slice(0, 12).map((l) => ({
        description: str(l?.description),
        qty: Math.max(0, numOr(l?.qty, 1)),
        unitMinor: Math.max(0, Math.round(numOr(l?.unitMinor, 0))),
      }))
    : base.lines;

  const details = Array.isArray(d.details)
    ? (d.details as Record<string, unknown>[]).slice(0, 8).map((r) => ({
        label: str(r?.label),
        value: str(r?.value),
      }))
    : base.details;

  const pct = d.depositPct;
  return {
    kind,
    business: {
      name: str(b.name, base.business.name),
      tagline: str(b.tagline, base.business.tagline),
      website: str(b.website, base.business.website),
      // JPEG data URLs ONLY, matching the column CHECK and what the PDF
      // embedder can decode. "data:" alone is too loose: this reviver also
      // sanitises the POST body, and an SVG data URL rendered into an <img>
      // is a script-execution surface, while anything that is not JPEG would
      // be dropped one layer later anyway and show a logo in the preview that
      // never appears on the document.
      logo:
        typeof b.logo === "string" && b.logo.startsWith("data:image/jpeg;base64,")
          ? b.logo
          : null,
      accent: /^#[0-9a-f]{3,8}$/i.test(str(b.accent)) ? str(b.accent) : base.business.accent,
    },
    customerName: str(d.customerName),
    customerEmail: str(d.customerEmail),
    customerPhone: str(d.customerPhone),
    serviceName: str(d.serviceName),
    details,
    lines,
    currencyCode,
    depositPct:
      pct === null ? null
      : typeof pct === "number" && pct >= 0 && pct <= 100 ? Math.round(pct)
      : base.depositPct,
    depositFixedMinor:
      typeof d.depositFixedMinor === "number" && d.depositFixedMinor >= 0
        ? Math.round(d.depositFixedMinor) : null,
    receivedMinor: Math.max(0, Math.round(numOr(d.receivedMinor, 0))),
    payMethod: str(d.payMethod),
    payReference: str(d.payReference),
    reference: str(d.reference),
    issuedOn: str(d.issuedOn, today),
    dueOn: str(d.dueOn),
    notes: str(d.notes),
    terms: str(d.terms),
    footer: str(d.footer),
  };
}

// ── A DRAFT REMEMBERS WHICH ROW IT IS ───────────────────────────────────────
//
// The draft used to be the document alone. Reload the page halfway through
// editing a SAVED document and the text came back but `savedId` did not, so
// the next Save posted with no id — and minted a second numbered document for
// one booking, out of a counter that is deliberately gap-free. Two documents,
// two numbers, one reservation, and the customer holding whichever arrived
// first.
//
// The envelope carries the identity alongside the text. An older draft, stored
// before this existed, is a bare document and still loads as one.

export type Draft = {
  doc: ReceiptlyDoc;
  savedId: string | null;
  savedNumber: string | null;
  placeBookingId: string | null;
};

const id = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

export function loadDraft(today: string): Draft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object") return null;
    // An envelope has `doc`; anything else is a draft from before it existed.
    const enveloped = "doc" in parsed;
    return {
      doc: reviveDoc(enveloped ? parsed.doc : parsed, today),
      savedId: enveloped ? id(parsed.savedId) : null,
      savedNumber: enveloped ? id(parsed.savedNumber) : null,
      placeBookingId: enveloped ? id(parsed.placeBookingId) : null,
    };
  } catch {
    return null;
  }
}

export function saveDraft(draft: Draft): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Storage full, or blocked. The document on screen is unaffected, which is
    // the thing that matters; the next keystroke tries again.
  }
}

// The trail of finished documents used to live here, in localStorage. It does
// not any more: saved documents are rows in receiptly_documents, which is what
// makes one findable next week, from another device, by somebody else. Two
// histories would have meant two answers to "what did I send him?".
