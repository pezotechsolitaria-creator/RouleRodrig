import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  SECTION_TOPICS,
  TOPIC_LABEL,
  SECTION_LABEL,
  UI_COPY,
  METHOD_LABEL,
  composePaymentHelpMessage,
  safeReference,
  defaultTopicFor,
  type PaymentSection,
} from "./payment-help";

// ── "NEED HELP WITH PAYMENT?" ───────────────────────────────────────────────
// The card appears on every payment screen, so its mistakes would too. These
// pin the three things it must never get wrong: the language, what is allowed
// into the message, and where the number comes from.

const LANGS = ["en", "fr", "cr"] as const;
const SECTIONS = Object.keys(SECTION_TOPICS) as PaymentSection[];

describe("every word exists in all three languages", () => {
  it("no copy is missing a language", () => {
    for (const table of [TOPIC_LABEL, SECTION_LABEL, METHOD_LABEL, UI_COPY] as Record<string, Record<string, string>>[]) {
      for (const [key, copy] of Object.entries(table)) {
        for (const l of LANGS) {
          expect(copy[l], `${key}.${l}`).toBeTruthy();
        }
      }
    }
  });

  it("the French and Creole messages are actually translated, not English", () => {
    const base = { section: "checkout" as const, topic: "how_to_pay" as const, reference: "RR-1042" };
    const en = composePaymentHelpMessage({ lang: "en", ...base });
    const fr = composePaymentHelpMessage({ lang: "fr", ...base });
    const cr = composePaymentHelpMessage({ lang: "cr", ...base });
    expect(fr).toContain("Bonjour");
    expect(cr).toContain("Bonzour");
    expect(new Set([en, fr, cr]).size).toBe(3);
  });
});

describe("the message the owner receives", () => {
  it("names the problem, the section, the reference, the amount and the method", () => {
    const m = composePaymentHelpMessage({
      lang: "en",
      section: "order",
      topic: "upload_failed",
      reference: "RR-1042",
      amount: "Rs 1,250",
      method: "bank_transfer",
    });
    expect(m).toContain("My receipt won't upload");
    expect(m).toContain("Order payment");
    expect(m).toContain("RR-1042");
    expect(m).toContain("Rs 1,250");
    expect(m).toContain("Bank transfer");
  });

  it("leaves out a fact it does not have, rather than printing an empty label", () => {
    const m = composePaymentHelpMessage({ lang: "en", section: "ride", topic: "other" });
    expect(m).not.toMatch(/Reference:\s*$/m);
    expect(m).not.toContain("Amount:");
    expect(m).not.toContain("Paying by:");
  });

  it("passes the amount through untouched — it never does money maths", () => {
    // The caller formats. A cents value handed in by mistake must arrive as
    // what it is, not be "helpfully" divided into a different wrong number.
    const m = composePaymentHelpMessage({ lang: "en", section: "order", topic: "amount", amount: "Rs 180,000" });
    expect(m).toContain("Rs 180,000");
    const src = readFileSync("lib/payment-help.ts", "utf8");
    expect(src).not.toMatch(/\/\s*100\b/);
  });

  it("never includes a URL", () => {
    // Pages like /manage-booking carry bearer tokens in the URL.
    for (const s of SECTIONS) {
      for (const tp of SECTION_TOPICS[s]) {
        for (const l of LANGS) {
          const m = composePaymentHelpMessage({ lang: l, section: s, topic: tp, reference: "RR-1", amount: "Rs 1" });
          expect(m, `${s}/${tp}/${l}`).not.toMatch(/https?:\/\//);
        }
      }
    }
  });
});

describe("references are safe to put in a chat", () => {
  it("shortens a database id to the RR- form the admin already uses", () => {
    expect(safeReference("c53a0163-b461-404e-9c1b-a8a9795406da")).toBe("RR-C53A01");
  });

  it("drops anything token-shaped", () => {
    expect(safeReference("a8Fk29dLq0ZxP4mN7vR2sT6wY1bC3eH5")).toBeNull();
    expect(safeReference("eyJhbGciOiJIUzI1NiJ9.payload.sig")).toBeNull();
  });

  it("keeps an ordinary human reference", () => {
    expect(safeReference("RR-1042")).toBe("RR-1042");
    expect(safeReference("RR-RCP-2026-000001")).toBe("RR-RCP-2026-000001");
  });

  it("treats nothing as nothing", () => {
    expect(safeReference(null)).toBeNull();
    expect(safeReference("   ")).toBeNull();
  });
});

describe("each section offers problems that fit it", () => {
  it("every section has a default and an 'other' escape hatch", () => {
    for (const s of SECTIONS) {
      expect(SECTION_TOPICS[s].length, s).toBeGreaterThan(0);
      expect(SECTION_TOPICS[s], s).toContain("other");
      expect(SECTION_TOPICS[s]).toContain(defaultTopicFor(s));
    }
  });

  it("a taxi, paid in cash to the driver, does not offer receipt uploads", () => {
    expect(SECTION_TOPICS.ride).not.toContain("upload_failed");
  });

  it("the shop-setup card talks to a merchant, not a customer", () => {
    expect(defaultTopicFor("shop-setup")).toBe("setup");
  });
});

describe("the safety line is there, in every language", () => {
  it("says we never ask for a card number, password or code", () => {
    expect(UI_COPY.safety.en).toMatch(/card number/);
    expect(UI_COPY.safety.fr).toMatch(/carte/);
    expect(UI_COPY.safety.cr).toMatch(/kart/);
  });
});

describe("one business number, one source", () => {
  it("the layout resolves it once and hands the same value to Ti Roulé and the provider", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).toContain("const supportWhatsapp =");
    expect(layout).toContain("whatsapp={supportWhatsapp}");
    expect(layout).toContain("<SupportContactProvider whatsapp={supportWhatsapp} email={supportEmail}>");
    // The fallback chain lives in exactly one place now.
    expect(layout.match(/content\.contact\.whatsappNumbers\?\.\[0\]\?\.number/g) ?? []).toHaveLength(1);
  });

  it("the card never hardcodes a phone number", () => {
    const card = readFileSync("components/payments/PaymentHelp.tsx", "utf8");
    expect(card).not.toMatch(/\+?230\s?\d{4}\s?\d{4}/);
    expect(card).toContain("useSupportContact()");
  });

  it("falls back to email rather than rendering a dead button", () => {
    const card = readFileSync("components/payments/PaymentHelp.tsx", "utf8");
    expect(card).toContain("mailto:");
  });
});

describe("taps are counted, through all three gates", () => {
  it("the API, the constraint and the policy all admit payment_help", () => {
    expect(readFileSync("app/api/leads/route.ts", "utf8")).toContain('"payment_help"');
    const mig = readFileSync("supabase/migrations/20260923120000_m200_payment_help_is_a_lead.sql", "utf8");
    expect(mig).toContain("lead_events_kind_check");
    expect(mig).toContain("lead_events_anon_insert");
    // And keeps every kind that was already there.
    for (const k of ["stay_eat_do", "taxi", "food_concierge", "tiroule_miss", "transfer"]) {
      expect(mig).toContain(`'${k}'`);
    }
  });
});
