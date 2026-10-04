import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SITE_URL } from "@/lib/site";

// ── /transfers CARRIES ITS TRAIL (architecture review 2026-09-30, item 4) ───
//
// About fifty routes publish a BreadcrumbList and the site's most citable
// price page did not. Rendered from the real page, with the price read faked:
// the trail must not depend on the fares being readable.

const fx = vi.hoisted(() => ({ airport: null as unknown }));

vi.mock("@/lib/rides/fares", () => ({
  readTransferFares: async () => ({ airport: fx.airport, ferry: null }),
}));
vi.mock("next/link", () => ({
  default: (p: { href: string; children?: ReactNode }) => createElement("a", { href: p.href }, p.children),
}));
vi.mock("@/components/AppPageHeader", () => ({ default: () => null }));
vi.mock("@/app/taxi/book/BookRide", () => ({ default: () => null }));
vi.mock("@/app/taxi/book/BookingHeading", () => ({ default: () => null }));

type Node = Record<string, unknown>;
const nodes = (html: string): Node[] =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => {
    const p = JSON.parse(m[1]) as Node;
    return (p["@graph"] as Node[] | undefined) ?? [p];
  });

async function render() {
  const { default: Page } = await import("@/app/transfers/page");
  return renderToStaticMarkup((await Page()) as ReactElement);
}

describe("/transfers", () => {
  it("publishes Home › Airport transfers, once", async () => {
    const crumbs = nodes(await render()).filter((n) => n["@type"] === "BreadcrumbList");
    expect(crumbs).toHaveLength(1);
    expect(crumbs[0].itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Airport transfers", item: `${SITE_URL}/transfers` },
    ]);
  });

  it("keeps its seller, service and FAQ beside it", async () => {
    const types = nodes(await render()).map((n) => n["@type"]);
    for (const t of ["AutoRental", "Service", "FAQPage"]) expect(types).toContain(t);
  });
});
