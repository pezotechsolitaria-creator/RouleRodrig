import {
  DOC_KINDS, CURRENCIES, type DocKind, type ReceiptlyDoc,
} from "./model";

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
const HISTORY_KEY = "receiptly.history.v1";
const MAX_HISTORY = 10;

export function blankDoc(today: string): ReceiptlyDoc {
  return {
    kind: "confirmation",
    business: {
      name: "Roulé Rodrigues",
      tagline: "Take the long way",
      website: "roulerodrig.com",
      logo: null,
      accent: "#0a7d3b",
    },
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
      // A logo is a data: URL and can be large; anything else is dropped.
      logo: typeof b.logo === "string" && b.logo.startsWith("data:") ? b.logo : null,
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

export function loadDraft(today: string): ReceiptlyDoc | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return reviveDoc(JSON.parse(raw), today);
  } catch {
    return null;
  }
}

export function saveDraft(doc: ReceiptlyDoc): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(doc));
  } catch {
    // Storage full, or blocked. The document on screen is unaffected, which is
    // the thing that matters; the next keystroke tries again.
  }
}

export type HistoryEntry = { at: string; label: string; doc: ReceiptlyDoc };

/** A short trail of finished documents, so "the last one" is always reachable. */
export function pushHistory(entry: HistoryEntry): void {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    const arr = Array.isArray(list) ? list : [];
    localStorage.setItem(HISTORY_KEY, JSON.stringify([entry, ...arr].slice(0, MAX_HISTORY)));
  } catch {
    // Same reasoning as saveDraft.
  }
}

export function loadHistory(today: string): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list.slice(0, MAX_HISTORY).map((e) => {
      const r = (e ?? {}) as Record<string, unknown>;
      return {
        at: str(r.at),
        label: str(r.label, "Document"),
        doc: reviveDoc(r.doc, today),
      };
    });
  } catch {
    return [];
  }
}
