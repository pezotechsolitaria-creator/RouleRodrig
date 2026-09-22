import {
  DOC_KINDS, CURRENCIES, MAX_LINES,
  type DocKind, type ReceiptlyDoc, type ReceiptlyLine, type DetailRow,
} from "./model";

// ── ONE SEAM WHERE A ROW BECOMES A DOCUMENT ─────────────────────────────────
//
// The invoicing side learned this the hard way: four routes each spelled the
// mapping out, one returned a raw snake_case row cast to the camelCase type,
// and every money field on it was undefined while the compiler was perfectly
// happy. "Rs NaN still owed" reached a screen.
//
// So: one function in, one function out, and nothing else converts.

export type SavedDoc = ReceiptlyDoc & {
  id: string;
  number: string;
  state: "open" | "cancelled";
  createdAt: string;
  updatedAt: string;
  placeBookingId: string | null;
};

type Row = Record<string, unknown>;

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const nul = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export function toSavedDoc(r: Row, lines: Row[] = []): SavedDoc {
  const kind = DOC_KINDS.includes(str(r.kind) as DocKind)
    ? (str(r.kind) as DocKind)
    : "confirmation";
  const currencyCode = CURRENCIES.some((c) => c.code === str(r.currency_code))
    ? str(r.currency_code)
    : "MUR";

  return {
    id: str(r.id),
    number: str(r.number),
    state: str(r.state) === "cancelled" ? "cancelled" : "open",
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
    placeBookingId: nul(r.place_booking_id),

    kind,
    reference: str(r.reference),
    business: {
      name: str(r.biz_name),
      tagline: str(r.biz_tagline),
      website: str(r.biz_website),
      accent: str(r.biz_accent, "#0a7d3b"),
      logo: nul(r.biz_logo),
    },
    customerName: str(r.customer_name),
    customerEmail: str(r.customer_email),
    customerPhone: str(r.customer_phone),
    serviceName: str(r.service_name),
    details: Array.isArray(r.details)
      ? (r.details as Row[]).slice(0, 8).map((d): DetailRow => ({
          label: str(d?.label), value: str(d?.value),
        }))
      : [],
    lines: lines.slice(0, MAX_LINES).map((l): ReceiptlyLine => ({
      description: str(l.description),
      // numeric(12,3) arrives from PostgREST as a string.
      qty: num(l.qty, 1),
      unitMinor: num(l.unit_price_minor),
    })),
    currencyCode,
    depositPct: r.deposit_pct == null ? null : num(r.deposit_pct),
    depositFixedMinor: r.deposit_fixed_minor == null ? null : num(r.deposit_fixed_minor),
    receivedMinor: num(r.received_minor),
    payMethod: str(r.pay_method),
    payReference: str(r.pay_reference),
    issuedOn: str(r.issued_on).slice(0, 10),
    dueOn: str(r.due_on).slice(0, 10),
    notes: str(r.notes),
    terms: str(r.terms),
    footer: str(r.footer),
  };
}

/**
 * A document → the arguments receiptly_doc_save() takes.
 *
 * NOTE WHAT IS NOT HERE: no total, no deposit figure, no line totals. Those
 * are computed in SQL from the typed inputs, once. A total that travelled over
 * the wire is a total that can disagree with the page it is printed on.
 */
export function toSaveArgs(doc: ReceiptlyDoc, id: string | null, placeBookingId: string | null) {
  return {
    p_id: id,
    p_kind: doc.kind,
    p_reference: doc.reference.trim(),
    p_business: {
      name: doc.business.name.trim(),
      tagline: doc.business.tagline.trim(),
      website: doc.business.website.trim(),
      accent: doc.business.accent,
      logo: doc.business.logo,
    },
    p_customer: {
      name: doc.customerName.trim(),
      email: doc.customerEmail.trim(),
      phone: doc.customerPhone.trim(),
    },
    p_service_name: doc.serviceName.trim() || null,
    p_details: doc.details.filter((d) => d.value.trim() !== ""),
    p_lines: doc.lines
      .filter((l) => l.description.trim() !== "" && l.qty > 0)
      .slice(0, MAX_LINES)
      .map((l) => ({
        description: l.description.trim(),
        qty: l.qty,
        unitMinor: Math.round(l.unitMinor),
      })),
    p_currency_code: doc.currencyCode,
    // A percentage or a flat figure, never both — the database refuses both.
    p_deposit_pct: doc.depositFixedMinor == null ? doc.depositPct : null,
    p_deposit_fixed_minor: doc.depositFixedMinor,
    p_received_minor: Math.round(doc.receivedMinor),
    p_pay_method: doc.payMethod.trim() || null,
    p_pay_reference: doc.payReference.trim() || null,
    p_issued_on: doc.issuedOn || null,
    p_due_on: doc.dueOn || null,
    p_notes: doc.notes.trim() || null,
    p_terms: doc.terms.trim() || null,
    p_footer: doc.footer.trim() || null,
    p_place_booking_id: placeBookingId,
  };
}

// ── The business profile the studio starts a new document from ──────────────

export type BusinessProfile = {
  name: string;
  tagline: string;
  website: string;
  accent: string;
  logo: string | null;
  payMethod: string;
  payReference: string;
  terms: string;
  footer: string;
};

export const EMPTY_PROFILE: BusinessProfile = {
  name: "", tagline: "", website: "", accent: "#0a7d3b", logo: null,
  payMethod: "", payReference: "", terms: "", footer: "",
};

/** Defensive: the column is jsonb and has held whatever an older build wrote. */
export function toProfile(raw: unknown): BusinessProfile {
  if (!raw || typeof raw !== "object") return EMPTY_PROFILE;
  const p = raw as Row;
  const logo = str(p.logo);
  return {
    name: str(p.name),
    tagline: str(p.tagline),
    website: str(p.website),
    accent: /^#[0-9a-fA-F]{6}$/.test(str(p.accent)) ? str(p.accent) : "#0a7d3b",
    // Only a JPEG data URL, for the same reason the column has that CHECK:
    // an http:// logo would make the document fetch from somewhere on render.
    logo: logo.startsWith("data:image/jpeg;base64,") ? logo : null,
    payMethod: str(p.payMethod),
    payReference: str(p.payReference),
    terms: str(p.terms),
    footer: str(p.footer),
  };
}
