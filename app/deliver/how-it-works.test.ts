import { describe, it, expect, vi } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import HowItWorks from "./HowItWorks";
import { DELIVER_COPY } from "@/lib/delivery/copy.i18n";
import { formatFee } from "@/lib/delivery/request-status";

// For the page test at the bottom: the settings read answers what `settings`
// holds, and the form's own client islands are not what is under test.
const db = vi.hoisted(() => ({
  settings: { data: null as unknown, error: null as unknown },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const q = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => db.settings,
    };
    return {
      auth: { getUser: async () => ({ data: { user: null } }) },
      from: (table: string) => {
        if (table !== "delivery_settings") throw new Error(`unexpected read: ${table}`);
        return q;
      },
    };
  },
}));
vi.mock("@/lib/content", () => ({
  getContent: async () => ({ contact: { phone: "+230 5835 5588", whatsappNumbers: [] } }),
}));
vi.mock("@/components/AppPageHeader", () => ({ default: () => null }));
vi.mock("./DeliverTitle", () => ({ default: () => null }));
vi.mock("./DeliverForm", () => ({ default: () => createElement("form", { id: "the-form" }) }));
vi.mock("./MyRequests", () => ({ default: () => null }));

// ── /deliver SAID NOTHING ABOUT WHAT IT IS (SEO audit 2026-09-29 C14) ───────
//
// 438 characters: a title and the first screen of a form. The explainer is a
// CLOSED <details> under the form, so it costs one row of scroll and is still
// in the server HTML. These render the real component and read back what a
// crawler gets — the three job types and the four promises from the form's
// own keys, and the cash limit from the settings row the page reads, never a
// number typed into the copy.

const text = (cashLimitCents: number | null) =>
  renderToStaticMarkup(createElement(HowItWorks, { cashLimitCents }))
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

describe("How Deliver Anything works", () => {
  it("is one closed <details> with a heading in its summary", () => {
    const html = renderToStaticMarkup(createElement(HowItWorks, { cashLimitCents: 300000 }));
    expect(html).toMatch(/^<details(?![^>]*\bopen\b)[^>]*>/);
    expect(html).toMatch(/<summary[^>]*>[\s\S]*<h2[^>]*>How Deliver Anything works<\/h2>/);
  });

  it("names the three kinds of job, in the form's own words", () => {
    const t = text(null);
    const k = DELIVER_COPY.en.what.kind;
    for (const kind of [k.package, k.shop, k.errand]) {
      expect(t).toContain(kind.title);
      expect(t).toContain(kind.body);
    }
  });

  it("repeats the review screen's four promises, not a paraphrase of them", () => {
    const t = text(null);
    expect(DELIVER_COPY.en.review.promises).toHaveLength(4);
    for (const p of DELIVER_COPY.en.review.promises) expect(t).toContain(p);
    expect(t).toContain("Drivers send their price — you choose.");
  });

  it("states the shopping-money rule: the driver fronts it, repaid in cash at the door", () => {
    const t = text(null);
    expect(t).toContain("the driver pays at the shop with their own cash");
    expect(t).toContain("in cash at the door");
  });

  it("quotes the cash limit from delivery_settings, formatted from cents", () => {
    // 300000 cents is the column default (M155); the explainer formats what
    // it is handed rather than knowing the figure, with formatFee() — the same
    // formatter the tracker's "cash is capped" line uses, so the two agree.
    expect(text(300000)).toContain(`Cash at the door covers up to ${formatFee(300000)}`);
    expect(text(300000)).toContain("Rs 3000");
    expect(text(450000)).toContain(`up to ${formatFee(450000)}`);
    // The fee goes by transfer above it; the shopping money never does.
    expect(text(300000)).toContain("the shopping money is still repaid in cash");
  });

  it("prints no figure at all when the settings could not be read", () => {
    const t = text(null);
    expect(t).not.toMatch(/Rs\s?\d/);
    expect(t).not.toContain("Cash at the door covers");
  });

  it("exists in French and Kreol too, each with a limit sentence that takes the figure", () => {
    for (const lang of ["fr", "cr"] as const) {
      const e = DELIVER_COPY[lang].explainer;
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.money).not.toBe(DELIVER_COPY.en.explainer.money);
      expect(e.cashLimit("Rs 3,000")).toContain("Rs 3,000");
    }
  });
});

describe("the /deliver page", () => {
  const render = async () => {
    const { default: DeliverPage } = await import("./page");
    return renderToStaticMarkup((await DeliverPage()) as ReactElement);
  };

  it("puts the explainer below the form, closed, with the limit the settings row holds", async () => {
    db.settings = { data: { cash_limit_cents: 250000 }, error: null };
    const html = await render();
    const form = html.indexOf('id="the-form"');
    const details = html.indexOf("<details");
    expect(form).toBeGreaterThan(-1);
    expect(details).toBeGreaterThan(form);
    expect(html).toContain(`Cash at the door covers up to ${formatFee(250000)}`);
  });

  it("still explains the service, without a figure, when the settings read fails", async () => {
    db.settings = { data: null, error: { message: "permission denied" } };
    const html = await render();
    expect(html).toContain("How Deliver Anything works");
    expect(html).not.toContain("Cash at the door covers");
  });
});
