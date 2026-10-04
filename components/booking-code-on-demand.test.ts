import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getExampleNumber } from "libphonenumber-js";
import realExamples from "libphonenumber-js/examples.mobile.json";
import { clientGraph, staticGraph } from "@/test/import-graph";

// ── The booking form's extras load when they are used ───────────────────────
//
// Architecture review 2026-09-30, perf item 2. BookingSection imported the
// receipt PDF writer (and its embedded logo) statically, for a button that
// exists only after a booking is made, and PhoneInput imported libphonenumber's
// example numbers, used only for a placeholder. Both rode in the first
// download of /browse/car. The static import graph proves they left it; the
// runtime checks prove importing the form no longer evaluates the receipt code
// and that the phone field still shows the same example once it arrives.

const fx = vi.hoisted(() => ({ receiptEvaluations: 0 }));

vi.mock("@/lib/receipt", () => {
  fx.receiptEvaluations += 1;
  return { downloadReceipt: () => true };
});

const RECEIPT = ["lib/receipt.ts", "lib/receipt-pdf.ts", "lib/receipt-logo.ts"];
const EXAMPLES = "pkg:libphonenumber-js/examples.mobile.json";

describe("static imports", () => {
  it("BookingSection reaches the phone field but not the receipt code or the examples", () => {
    // A client component: everything it statically imports ships.
    const g = staticGraph("components/BookingSection.tsx");
    expect(g.has("components/PhoneInput.tsx")).toBe(true); // the walk is real
    expect(g.has("pkg:libphonenumber-js")).toBe(true); // validation stays eager
    expect(RECEIPT.filter((f) => g.has(f))).toEqual([]);
    expect(g.has(EXAMPLES)).toBe(false);
  });

  it("nothing else /browse/<category> ships drags them back in", () => {
    const g = clientGraph("app/browse/[category]/page.tsx");
    expect(g.has("components/BookingSection.tsx")).toBe(true);
    expect(RECEIPT.filter((f) => g.has(f))).toEqual([]);
    expect(g.has(EXAMPLES)).toBe(false);
  });
});

describe("at runtime", () => {
  it("importing the booking form does not evaluate the receipt module", async () => {
    await import("@/components/BookingSection");
    expect(fx.receiptEvaluations).toBe(0);
  });

  it("the phone placeholder is the same example as before, once the examples arrive", async () => {
    const { default: PhoneInput, loadPhoneExamples } = await import("@/components/PhoneInput");
    const render = () =>
      renderToStaticMarkup(createElement(PhoneInput, { value: "", onChange: () => {}, id: "bk-phone" }));
    const placeholder = (html: string) => /placeholder="([^"]*)"/.exec(html)?.[1];

    // Server HTML and the hydrating render: the field's existing fallback.
    expect(placeholder(render())).toBe("Your number");

    await loadPhoneExamples();
    // What the static import used to print for the default country (Mauritius),
    // computed from the package's own data rather than typed here.
    const expected = getExampleNumber("MU", realExamples)!
      .formatInternational()
      .replace(/^\+\d+\s*/, "");
    expect(expected).not.toBe("");
    expect(placeholder(render())).toBe(expected);
  });
});
