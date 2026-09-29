import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const GLOBALS = readFileSync(join(ROOT, "app", "globals.css"), "utf8");

/** Comments name the properties they explain; read declarations only. */
function css(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "");
}

function tsx(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

// ── A RULE THAT PROMISED READABLE WORDS MADE ONE UNREADABLE ─────────────────
//
// globals.css set `word-break: keep-all` and `overflow-wrap: normal` on every
// heading so that no word is ever split. For a word that fits, right. For a
// word that does not, it left the browser no legal break point, so the word
// did not wrap — it overflowed, and the first ancestor with overflow-hidden
// cut it off.
//
// Measured on /experiences at 375px: the two-up grid gives a card 128px of
// text, and "Plongée en apnée/Aquarium Rivière Banane" put "apnée/Aquarium" —
// one 147px token — on a line of its own. The reader got "apnée/Aquari".

describe("the heading wrap rule", () => {
  const block = css(GLOBALS).match(/h1,\s*h2,\s*h3,\s*h4\s*\{[^}]*\}/);

  it("still exists, and still refuses hyphenation", () => {
    expect(block).not.toBeNull();
    expect(block![0]).toContain("hyphens: none");
  });

  it("lets a word that cannot fit break rather than overflow", () => {
    expect(block![0]).toContain("overflow-wrap: break-word");
    expect(block![0]).not.toContain("overflow-wrap: normal");
  });

  it("does not suppress the ordinary break opportunities", () => {
    // keep-all is a CJK rule. On Latin text it mostly removed break points
    // and gave nothing back.
    expect(block![0]).not.toContain("keep-all");
  });

  it("is inside @layer base, so a utility on one heading can still win", () => {
    // Unlayered CSS beats every Tailwind v4 layer whatever the specificity.
    // As a raw top-level rule this silently defeated `break-words` on every
    // heading in the codebase: the class was in the markup, the computed
    // style said otherwise, and nothing said why.
    const layered = css(GLOBALS).match(/@layer base\s*\{[\s\S]*?\n\}/g) ?? [];
    expect(layered.some((b) => /h1,\s*h2,\s*h3,\s*h4/.test(b))).toBe(true);
  });
});

// ── THE PRICE FIELD IS ONE FREE-TEXT BOX ────────────────────────────────────
//
// The owner types the whole thing into it, and one experience carries
// "Rs 2,500 per person(Free transfer to starting point)". On /explore that is
// 318px of text in a 214px column, and it was `shrink-0` inside a card with
// overflow-hidden: cut mid-word, 163px gone, the free-transfer promise with
// it. Not priceParts() — that splitter keeps the number and free DELIVERY,
// which would drop the rest of what the owner wrote.

describe("the free-text price is never cut", () => {
  it("/explore lets it wrap, and drop to its own line", () => {
    const src = tsx("components/ExploreClient.tsx");
    expect(src).toContain("mt-auto flex flex-wrap items-center");
    expect(src).toContain("ml-auto min-w-0 break-words text-right");
    // shrink-0 was the whole defect: the column could not give ground.
    expect(src).not.toContain("ml-auto shrink-0 font-syne text-xs");
  });

  it("/experiences lets the price note break", () => {
    // Not a heading, so the rule above does not reach it — and "person(Free"
    // has no break opportunity of its own.
    expect(tsx("components/experiences/ExperiencesHub.tsx")).toContain(
      "break-words pt-3 font-dm text-xs font-semibold",
    );
  });

  it("/experiences/[type] gives it three lines beside the Book button", () => {
    // Measured: 540px of that string against a 227px column. On one line it
    // read "Rs 2,500 per person(" — the free transfer, which is the reason to
    // book, cut off. Two lines still hid the end; it needs 2.4.
    const src = tsx("components/experiences/ExperienceMarket.tsx");
    expect(src).toContain("line-clamp-3");
    expect(src).toContain("[overflow-wrap:anywhere]");
    expect(src).not.toContain("truncate font-syne text-sm font-extrabold text-yellow");
  });
});

// ── TRUNCATE CUT THE LABEL INSTEAD OF THE NAME ──────────────────────────────
//
// Two more places where the only flexible column carried a fixed label and a
// variable one under a single `truncate`, so the unshrinkable sibling pushed
// the cut back into the words that never change.

describe("the rating line on the home page", () => {
  it("wraps instead of truncating beside the rating pill", () => {
    // The pill is unshrinkable, so at 375px the caption got 84px for a line
    // needing 124: "from verified ri…" — the words that say the rating can be
    // trusted.
    const src = tsx("components/ReviewsContact.tsx");
    expect(src).toContain("mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2");
    expect(src).toContain('<span className="min-w-0 font-dm text-sm text-muted">');
    expect(src).not.toContain('<span className="font-dm text-sm text-muted truncate">');
  });
});

describe("the curated card's price line", () => {
  it("is the same free-text field, and gets the same three lines", () => {
    // 128px column on /curated against lines needing 204 and 285.
    const src = tsx("components/world-page/CurationCard.tsx");
    expect(src).toContain("mt-0.5 line-clamp-3 font-dm text-[11px] leading-snug [overflow-wrap:anywhere]");
    expect(src).not.toContain('className="mt-0.5 truncate font-dm text-[11px]"');
  });
});

describe("the marketplace cart pill", () => {
  const src = tsx("components/shop/ShopChrome.tsx");

  it("truncates the shop name, not the label", () => {
    // At 375px in French "Voir le panier · Rodrigues Repairs (TEST)" needs
    // 264px against the 176 it got, so the bar read "Voir le panier · Rodrig…".
    // Same construction that had to be fixed in FoodCartBar.
    expect(src).toContain('<span className="shrink-0">{copy.header.viewBag}</span>');
    expect(src).toContain("min-w-0 truncate font-medium opacity-70");
    expect(src).not.toContain('<span className="min-w-0 flex-1 truncate">');
  });
});

describe("the account line on /checkout", () => {
  const src = tsx("components/checkout/CheckoutForm.tsx");

  it("wraps the email instead of running it over the sign-out button", () => {
    // `truncate` sets overflow:hidden and text-overflow:ellipsis, and NEITHER
    // applies to an inline non-replaced box — only white-space:nowrap took
    // effect, so the address could neither wrap nor be clipped. Measured at
    // 375px with a 38-character address and the French labels: 121px past its
    // own paragraph, 111px past the left edge of the only control that fixes
    // a wrong account. After: three lines, 13px clear.
    expect(src).toContain('<span className="break-all font-medium text-offwhite">');
    expect(src).not.toContain('<span className="truncate font-medium text-offwhite">');
  });
});

describe("the answered place row on /taxi/book", () => {
  it("names the field short, the way /deliver already does", () => {
    // PlacePicker draws the answered row as `label: value` on one line under a
    // single truncate, so the label spends the width the place name needs.
    // Measured at 375px with "Port Mathurin — Terminal du Ferry": the row
    // gives 201px, "OÙ VOUS EMMENER:" took 166 and left 35 for the
    // destination — "Por…". English left 103. With the short label, 182.
    const src = tsx("app/taxi/book/BookRide.tsx");
    expect(src).toContain("shortLabel={c.step2.pickupShort}");
    expect(src).toContain("shortLabel={c.step2.dropoffShort}");
  });

  it("in all three languages", () => {
    const copy = readFileSync(join(ROOT, "lib", "rides", "copy.i18n.ts"), "utf8");
    // The words are the ones /deliver uses for the same control — see
    // lib/delivery/copy.i18n.ts fromShort/toShort — not new translations
    // invented here.
    const pairs = [
      ["pickupShort", "From"],
      ["dropoffShort", "To"],
      ["pickupShort", "De"],
      ["dropoffShort", "À"],
      ["pickupShort", "Depi"],
      ["dropoffShort", "Ver"],
    ];
    for (const [key, word] of pairs) {
      expect(copy, `${key}: ${word}`).toContain(`${key}: "${word}",`);
    }
  });
});

describe("the /shop delivery line", () => {
  const src = tsx("app/shop/page.tsx");

  it("wraps rather than being cut mid-word", () => {
    // `truncate` on a FLEX container cannot ellipsize — text-overflow applies
    // to the inline content of a block box, not to flex items — while its
    // nowrap inherits into every child. Measured with the real strings at the
    // real width: French needs 382px of 343, English 279. So the French line
    // ended "Payez la boutique directement, sa".
    expect(src).toContain("flex flex-wrap items-center gap-x-1.5 gap-y-0.5");
    expect(src).not.toContain("flex items-center gap-1.5 truncate font-dm text-[11px]");
  });
});
