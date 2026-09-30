import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_CONTENT } from "@/lib/defaults";
import { SHEET } from "@/test/transfer-sheet.fixture";
import { FR_PAGES } from "@/lib/nav/hubs";
import { taxiPriceAnswer } from "@/lib/taxi-faq";
import { buildLlmsFullTxt, buildLlmsTxt } from "@/lib/llms-txt";
import {
  moneyFr,
  passengersCovered,
  passengersCoveredFr,
  transferFaq,
  zoneFaresSentenceFr,
} from "./transfers-faq";

// ── /transfers AND THE SENTENCES IT SHARES (SEO audit 2026-09-29 C2, C13) ────
// Fixer pass of 30 Sept. Three things the review found on the uncommitted work:
//  - /transfers typed "one passenger" in its first FAQ answer, its Offer
//    descriptions and the note under the fare table, while /taxi and llms.txt
//    read included_passengers from the sheet;
//  - the French zone 2 read "Rs … de plus de 6 km", i.e. "Rs … more";
//  - the Related link to /fr/taxi-rodrigues was a bare "En français".
// The page is rendered for real, with the sheet faked and the client chrome
// stubbed, the way lib/airport-fares-pages.test.ts renders it.

const state = vi.hoisted(() => ({ included: 1 }));

vi.mock("@/lib/rides/fares", async () => {
  const { SHEET: sheet } = await import("@/test/transfer-sheet.fixture");
  return {
    readTransferFares: async () => ({
      airport: { ...sheet, includedPassengers: state.included },
      ferry: 99900,
    }),
  };
});
vi.mock("next/link", () => ({
  default: ({ href, children, className, hrefLang }: Record<string, unknown>) =>
    createElement("a", { href, className, hrefLang }, children as never),
}));
for (const m of [
  "@/components/AppPageHeader",
  "@/app/taxi/book/BookRide",
  "@/app/taxi/book/BookingHeading",
]) {
  vi.doMock(m, () => ({ default: () => null }));
}

const text = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

function nodes(html: string): Record<string, unknown>[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap(
    (m) => {
      const j = JSON.parse(m[1]) as Record<string, unknown>;
      return (j["@graph"] as Record<string, unknown>[] | undefined) ?? [j];
    },
  );
}

async function transfersPage(): Promise<string> {
  const mod = (await import("@/app/transfers/page")) as { default: () => Promise<React.ReactElement> };
  return renderToStaticMarkup(await mod.default());
}

type Offer = { description: string };
const offersOf = (html: string): Offer[] => {
  const service = nodes(html).find((n) => n["@type"] === "Service") as
    | { offers?: { offers?: Offer[] } }
    | undefined;
  return service?.offers?.offers ?? [];
};

const TWO = { ...SHEET, includedPassengers: 2 };

beforeEach(() => {
  state.included = 1;
});

describe("the passenger count is the sheet's, everywhere (C2)", () => {
  it("phrases the count from the sheet, in both languages", () => {
    expect(passengersCovered(SHEET)).toBe("one passenger");
    expect(passengersCovered(TWO)).toBe("2 passengers");
    expect(passengersCoveredFr(SHEET)).toBe("un passager");
    expect(passengersCoveredFr(TWO)).toBe("2 passagers");
  });

  it("answers both passenger questions from the sheet", () => {
    const faq = transferFaq({ airport: TWO, ferry: null });
    const all = faq.map((f) => f.a).join(" ");
    expect(faq[0].a).toContain("The fare covers 2 passengers and is fixed before you book");
    expect(faq.find((f) => f.q === "Do more passengers cost more?")?.a).toContain("The fare includes 2 passengers.");
    expect(all).not.toContain("one passenger");
    // Unchanged wording while the sheet says one.
    expect(transferFaq({ airport: SHEET, ferry: null })[0].a).toContain("The fare covers one passenger and is fixed");
  });

  it("renders the note under the fare table and every Offer from the sheet", async () => {
    state.included = 2;
    const html = await transfersPage();
    expect(text(html)).toContain("Fares include 2 passengers; each extra passenger adds Rs 123 per trip.");
    const offers = offersOf(html);
    expect(offers).toHaveLength(3);
    for (const o of offers) expect(o.description).toContain("by road, 2 passengers, daytime.");
    expect(html).not.toContain("one passenger");
  });

  it("still says one passenger while the sheet does", async () => {
    const html = await transfersPage();
    expect(text(html)).toContain("Fares include one passenger; each extra passenger adds Rs 123 per trip.");
    for (const o of offersOf(html)) expect(o.description).toContain("by road, one passenger, daytime.");
  });

  it("agrees with /taxi and llms.txt when the sheet changes", () => {
    expect(taxiPriceAnswer("en", TWO)).toContain("for 2 passengers; each extra passenger adds Rs 123.");
    expect(taxiPriceAnswer("fr", TWO)).toContain("pour 2 passagers");
    const data = {
      siteUrl: "https://roulerodrig.com",
      content: DEFAULT_CONTENT,
      fares: { airport: TWO, ferry: null },
      food: null,
      eventsOnSale: false,
    };
    expect(buildLlmsTxt(data)).toContain("The fare covers 2 passengers; each extra passenger adds Rs 123.");
    expect(buildLlmsFullTxt(data)).not.toContain("one passenger");
  });
});

describe("the French zone 2 fare is not read as a surcharge (C2)", () => {
  it("puts the middle zone between its two lines", () => {
    const fr = zoneFaresSentenceFr(SHEET);
    expect(fr).toContain(`${moneyFr(144400)} entre 6 et 13 km`);
    expect(fr).not.toContain("de plus");
  });

  it("keeps 'de plus' for the one real surcharge in the French taxi answer", () => {
    const answer = taxiPriceAnswer("fr", SHEET);
    expect(answer).toContain(`${moneyFr(144400)} entre 6 et 13 km`);
    // The evening band is a genuine "Rs … de plus par trajet"; nothing else is.
    expect(answer.replace(/de plus par trajet/g, "")).not.toContain("de plus");
  });
});

describe("the Related link says which French page it opens (C13)", () => {
  it("names the page by the title the /fr hub gives it", async () => {
    const html = await transfersPage();
    const related = html.slice(html.indexOf('aria-label="Related"'));
    const title = FR_PAGES.find((p) => p.href === "/fr/taxi-rodrigues")!.title;
    expect(related).toContain(`>${title}, en français</a>`);
    expect(related).not.toMatch(/>En français</);
    expect(related).toMatch(/<li lang="fr"><a href="\/fr\/taxi-rodrigues"[^>]*hrefLang="fr"/);
  });
});
