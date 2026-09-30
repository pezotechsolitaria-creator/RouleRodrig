import { describe, it, expect, vi } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { UsefulContact } from "@/lib/defaults";
import { SITE_URL } from "@/lib/site";
import UsefulNumbers, { usableContacts } from "./UsefulNumbers";

// ── /emergency SHIPPED NONE OF ITS NUMBERS (SEO audit 2026-09-29 C7/T3) ─────
//
// The page promised "police, hospital, fire" and its HTML carried one number,
// the tourism office: UsefulNumbers was a closed client accordion that mounted
// the list only after a tap. These render the real component and the real page
// to markup — what a crawler and a no-JavaScript visitor receive — and read
// the tel: links back.
//
// The contacts are shaped like the live site_content.usefulContacts rows
// (read-only SELECT, 29 Sep 2026), plus the admin's "+230 5XXX XXXX" seed.

const CONTACTS: UsefulContact[] = [
  { id: "c1", category: "emergency", label: "Police", number: "999", note: "or 112" },
  { id: "c2", category: "emergency", label: "Ambulance (SAMU)", number: "114" },
  { id: "c3", category: "emergency", label: "Fire & Rescue", number: "995", note: "or 115" },
  { id: "c4", category: "other", label: "Queen Elizabeth Hospital", number: "+230 832 3661" },
  { id: "c5", category: "taxi", label: "Your taxi here", number: "+230 5XXX XXXX" },
];

vi.mock("@/lib/content", () => ({
  getContent: async () => ({ usefulContacts: CONTACTS }),
}));
// The header's image and world switcher are not what this page is about.
vi.mock("@/components/AppPageHeader", () => ({ default: () => null }));

const telLinks = (html: string) => [...html.matchAll(/href="tel:([^"]+)"/g)].map((m) => m[1]);

describe("the numbers are in the HTML where they are the page", () => {
  it("renders every usable number as a tel: link when alwaysOpen", () => {
    const html = renderToStaticMarkup(
      createElement(UsefulNumbers, { contacts: CONTACTS, alwaysOpen: true }),
    );
    expect(telLinks(html)).toEqual(["999", "114", "995", "+2308323661"]);
    expect(html).toContain("Queen Elizabeth Hospital");
    // Nothing to toggle, so no button pretending there is.
    expect(html).not.toContain("aria-expanded");
  });

  it("keeps the placeholder seed out, by the same filter the accordion uses", () => {
    expect(usableContacts(CONTACTS).map((c) => c.id)).toEqual(["c1", "c2", "c3", "c4"]);
    const html = renderToStaticMarkup(
      createElement(UsefulNumbers, { contacts: CONTACTS, alwaysOpen: true }),
    );
    expect(html).not.toMatch(/XXX/i);
  });

  it("leaves the collapsed accordion alone everywhere else", () => {
    const html = renderToStaticMarkup(createElement(UsefulNumbers, { contacts: CONTACTS }));
    expect(html).toContain('aria-expanded="false"');
    expect(telLinks(html)).toEqual([]);
  });
});

describe("the /emergency page", async () => {
  const mod = await import("@/app/emergency/page");
  const html = renderToStaticMarkup((await mod.default()) as ReactElement);

  it("server-renders police, ambulance, fire and the hospital as tap-to-call", () => {
    for (const n of ["999", "114", "995", "+2308323661"]) {
      expect(telLinks(html)).toContain(n);
    }
  });

  it("promises no coastguard, in the text or the snippet — there is no such number", () => {
    const text = html.replace(/<[^>]+>/g, " ");
    expect(text).not.toMatch(/coast\s*guard/i);
    expect(String(mod.metadata.description)).not.toMatch(/coast\s*guard/i);
  });

  it("carries a breadcrumb, under the schema.org vocabulary", () => {
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(m).not.toBeNull();
    const doc = JSON.parse(m![1]);
    expect(doc["@context"]).toBe("https://schema.org");
    const crumbs = JSON.stringify(doc);
    expect(crumbs).toContain("BreadcrumbList");
    expect(crumbs).toContain(`${SITE_URL}/emergency`);
  });
});
