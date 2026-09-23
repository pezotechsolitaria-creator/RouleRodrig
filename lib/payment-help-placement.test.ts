import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { composePaymentHelpMessage, clampDetail, SECTION_TOPICS } from "./payment-help";

// ── "IT SHOULD BE FOUND IN ALL SECTIONS FOR PAYMENTS" ───────────────────────
//
// The owner's words. A requirement like that decays silently: the next person
// to rebuild a checkout step drops the card and nothing notices. So every
// customer payment surface is listed here, and losing the card fails the suite.
//
// Placed on 23 Sept 2026 by nine agents working on disjoint files, then each
// placement adversarially reviewed for units, tokens, duplicates and layout.

const read = (p: string) => readFileSync(p, "utf8");

/** Every screen where somebody pays, and the section it reports as. */
const SURFACES: [file: string, section: RegExp][] = [
  ["components/checkout/CheckoutForm.tsx", /section="checkout"/],
  ["components/orders/BankTransferPanel.tsx", /section="order"/],
  ["components/refunds/RefundPanel.tsx", /section="refund"/],
  ["app/deliver/[id]/RequestTracker.tsx", /section="delivery"/],
  ["app/manage-booking/page.tsx", /section=\{booking\.kind === "vehicle" \? "rental" : "booking"\}/],
  ["components/BookingSection.tsx", /section="rental"/],
  ["components/PlaceBookingModal.tsx", /section=\{isStay \? "stay" : "booking"\}/],
  ["components/events/EventCheckout.tsx", /section="event"/],
  ["app/taxi/book/BookRide.tsx", /section="ride"/],
  ["app/taxi/track/TrackRide.tsx", /section="ride"/],
  ["app/shop/[storeSlug]/[productSlug]/page.tsx", /section="product"/],
  ["app/track/TrackLookup.tsx", /<PaymentHelp/],
  ["components/merchant/PaymentSettingsForm.tsx", /section="shop-setup"/],
  ["components/merchant/home/CannotBePaid.tsx", /section="shop-setup"/],
];

describe("every payment screen carries the card", () => {
  for (const [file, section] of SURFACES) {
    it(file, () => {
      const src = read(file);
      expect(src, `${file} lost its payment-help card`).toContain("<PaymentHelp");
      expect(src).toMatch(section);
    });
  }
});

describe("no placement leaks a secret into a chat", () => {
  it("no reference is built from a URL token or search param", () => {
    for (const [file] of SURFACES) {
      const src = read(file);
      for (const m of src.matchAll(/<PaymentHelp\b[\s\S]*?\/>/g)) {
        const ref = /reference=\{([^}]*)\}/.exec(m[0])?.[1] ?? "";
        expect(ref, `${file}: reference={${ref}}`).not.toMatch(/token|searchParams|params\.|useSearchParams/i);
      }
    }
  });
});

describe("the gaps the review found stay closed", () => {
  it("a paid order cancelled before any refund exists still gets help", () => {
    const panel = read("components/refunds/RefundPanel.tsx");
    expect(panel).toContain("paidThenCancelled");
    // Not before the refunds have loaded, or it flashes and is swapped.
    expect(panel).toContain("refunds !== null && paidThenCancelled && paymentHelp");
    for (const page of ["app/orders/[id]/page.tsx", "app/orders/track/page.tsx"]) {
      expect(read(page), page).toMatch(/paidThenCancelled=\{[^}]*"cancelled"[^}]*receipt/);
    }
  });

  it("a delivery paid by transfer and then cancelled gets the refund card", () => {
    const t = read("app/deliver/[id]/RequestTracker.tsx");
    expect(t).toMatch(/view\.status !== "accepted" &&[\s\S]{0,200}paymentProofAt[\s\S]{0,300}section="refund"/);
  });

  it("a cancelled booking whose deposit was taken is not told 'you have not been charged'", () => {
    const m = read("app/manage-booking/page.tsx");
    expect(m).toMatch(/booking\.depositPaid \? \(\s*<PaymentHelp\s+section="refund"/);
  });

  it("an unpaid booking no longer shows 'Deposit to confirm: Rs 0'", () => {
    const m = read("app/manage-booking/page.tsx");
    expect(m).not.toContain("paidAmount ?? booking.deposit");
    expect(m).toContain("booking.depositPaid ? paidAmount : booking.deposit");
  });

  it("the stays modal uses the pill — it is a dialog capped at 90vh", () => {
    const modal = read("components/PlaceBookingModal.tsx");
    for (const m of modal.matchAll(/<PaymentHelp\b[\s\S]*?\/>/g)) {
      expect(m[0]).toContain('variant="compact"');
    }
  });

  it("checkout withholds the total while a new price is loading", () => {
    expect(read("components/checkout/CheckoutForm.tsx")).toContain("quote && !quoting ?");
  });
});

describe("the Shop and 'on my screen' lines", () => {
  it("names the shop on its own line, so Reference is only ever an order number", () => {
    const m = composePaymentHelpMessage({ lang: "en", section: "checkout", topic: "how_to_pay", shop: "Chez Banane" });
    expect(m).toContain("• Shop: Chez Banane");
    expect(m).not.toContain("Reference:");
  });

  it("carries the refusal the customer is reading", () => {
    const m = composePaymentHelpMessage({
      lang: "fr", section: "checkout", topic: "other", detail: "Cette boutique est fermée.",
    });
    expect(m).toContain('Sur mon écran: "Cette boutique est fermée."');
  });

  it("strips URLs from that text and keeps it to one bounded line", () => {
    expect(clampDetail("Failed, see https://x.io/a?token=abc now")).toBe("Failed, see now");
    expect(clampDetail("a\n\nb")).toBe("a b");
    expect((clampDetail("x".repeat(400)) ?? "").length).toBeLessThanOrEqual(160);
    expect(clampDetail("   ")).toBeNull();
  });

  it("checkout does not offer a receipt upload — no receipt exists yet", () => {
    expect(SECTION_TOPICS.checkout).not.toContain("upload_failed");
    expect(SECTION_TOPICS.product).not.toContain("transfer_not_showing");
    expect(SECTION_TOPICS.event[0]).toBe("how_to_pay");
  });
});

describe("the merchant cards name the shop", () => {
  it("both merchant pages pass the store name down", () => {
    expect(read("app/merchant/(app)/payments/page.tsx")).toContain("storeName={dashboard?.store?.name ?? null}");
    expect(read("app/merchant/(app)/page.tsx")).toContain("storeName={dashboard.store?.name ?? null}");
  });
});
