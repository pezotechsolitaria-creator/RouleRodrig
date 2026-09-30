import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import JsonLd, { jsonLdPayload } from "./JsonLd";
import {
  breadcrumbLd,
  experienceLd,
  faqPageLd,
  itemListLd,
  sellerLd,
  stayLd,
} from "@/lib/schema";

// ── ELEVEN PAGES PUBLISHED NODES WITH NO VOCABULARY (SEO audit 2026-09-29 T1) ─
//
// A top-level JSON array gives every node its own scope. The helpers that
// carry "@context" were fine; experienceLd(), stayLd() and sellerLd() do not,
// and they were passed bare — so on every experience page the priced Service
// and the AutoRental seller, and on the French stays page every
// LodgingBusiness, resolved to a relative IRI. These render the component and
// read back what a crawler reads.

type Node = Record<string, unknown>;

function rendered(data: object | object[]): Node {
  const html = renderToStaticMarkup(createElement(JsonLd, { data }));
  const m = html.match(/^<script type="application\/ld\+json">([\s\S]*)<\/script>$/);
  expect(m, html).not.toBeNull();
  return JSON.parse(m![1]) as Node;
}

/** Every node a strict parser sees, each with the @context that governs it. */
function scopedNodes(doc: Node): { node: Node; context: unknown }[] {
  const graph = doc["@graph"];
  return Array.isArray(graph)
    ? (graph as Node[]).map((node) => ({ node, context: node["@context"] ?? doc["@context"] }))
    : [{ node: doc, context: doc["@context"] }];
}

const PAGE = "https://roulerodrig.com/experiences/boat";

describe("an array becomes one graph under one vocabulary", () => {
  it("wraps it, and leaves an object alone", () => {
    const arr = [sellerLd()];
    expect(jsonLdPayload(arr)).toEqual({ "@context": "https://schema.org", "@graph": arr });
    const obj = { "@context": "https://schema.org", "@graph": [sellerLd()] };
    expect(jsonLdPayload(obj)).toBe(obj);
  });

  it("the experience category page: every node resolves to schema.org", () => {
    // The shape app/experiences/[type]/page.tsx emits.
    const doc = rendered([
      breadcrumbLd([{ name: "Home", url: "https://roulerodrig.com" }]),
      itemListLd("Sea trips in Rodrigues", [{ name: "Balade en mer", url: `${PAGE}/x` }]),
      { "@context": "https://schema.org", ...sellerLd() },
      faqPageLd(PAGE, [{ question: "Q?", answer: "A." }]),
      experienceLd({ name: "Balade en mer", price: 700, url: `${PAGE}/x`, providerName: "Skipper Arnaud" }),
    ]);
    expect(doc["@context"]).toBe("https://schema.org");
    const nodes = scopedNodes(doc);
    expect(nodes).toHaveLength(5);
    for (const { node, context } of nodes) {
      expect(context, `${node["@type"]} has no vocabulary`).toBe("https://schema.org");
    }
    // The priced Service — the node that was unreadable — is inside the graph.
    const service = nodes.find((n) => n.node["@type"] === "Service")!.node;
    expect((service.offers as Node).price).toBe(700);
  });

  it("the experience detail page: the bare seller stub is covered too", () => {
    // PlaceDetail.tsx passes sellerLd() with no @context of its own.
    const doc = rendered([sellerLd(), { "@context": "https://schema.org", ...experienceLd({ name: "x", url: PAGE }) }]);
    const seller = scopedNodes(doc).find((n) => n.node["@type"] === "AutoRental")!;
    expect(seller.node["@context"]).toBeUndefined();
    expect(seller.context).toBe("https://schema.org");
  });

  it("the French stays page: bare LodgingBusiness nodes resolve", () => {
    const doc = rendered([stayLd({ name: "Cathartica", price: 2990, url: "u" }), stayLd({ name: "b", url: "u" })]);
    for (const { node, context } of scopedNodes(doc)) {
      expect(node["@type"]).toBe("LodgingBusiness");
      expect(context).toBe("https://schema.org");
    }
  });

  it("an object that already carries its own @graph is not wrapped twice", () => {
    // The homepage and /faq pass { @context, @graph } objects.
    const doc = rendered({ "@context": "https://schema.org", "@graph": [sellerLd()] });
    expect((doc["@graph"] as Node[])[0]["@type"]).toBe("AutoRental");
    expect(((doc["@graph"] as Node[])[0] as Node)["@graph"]).toBeUndefined();
  });

  it("still escapes '<' so owner text cannot close the script tag", () => {
    const html = renderToStaticMarkup(
      createElement(JsonLd, { data: [{ "@type": "Thing", name: "</script><b>x" }] }),
    );
    expect(html).not.toContain("</script><b>");
    expect(html).toContain("\\u003c/script>");
  });
});
