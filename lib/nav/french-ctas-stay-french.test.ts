import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

// ── THE BUTTON THAT CHANGED LANGUAGE MID-BOOKING ────────────────────────────
//
// /fr/taxi-rodrigues is French, its CTA goes to /taxi/book, and the booking
// form there is a client component reading LanguageContext. PageLanguage's
// claim is per-route and released on unmount by design, so the form opened in
// English — at the exact moment the visitor was being asked for their phone
// number, having just read three screens of French.
//
// Ten links out of the French pages led into the app that way. This asserts
// none of them goes back to being a plain <Link>.

const FR = join(ROOT, "app", "fr");

/** The transactional surfaces. /guide and /blog are English articles. */
const APP_ROUTE = /href="\/(browse|food|experiences|taxi)/;

function frenchPages(): { route: string; file: string }[] {
  return readdirSync(FR)
    .filter((e) => statSync(join(FR, e)).isDirectory())
    .map((e) => ({ route: `/fr/${e}`, file: join(FR, e, "page.tsx") }))
    .filter((p) => {
      try {
        return statSync(p.file).isFile();
      } catch {
        return false;
      }
    });
}

/** Comments here name the very component they explain; read code only. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("every French CTA into the app carries the page's language", () => {
  const pages = frenchPages().map((p) => ({ ...p, src: code(p.file) }));

  it("found the pages", () => {
    expect(pages.length).toBeGreaterThan(8);
  });

  it("uses LangLink, never a plain Link, for app routes", () => {
    const offenders: string[] = [];
    for (const p of pages) {
      // Each opening tag on its own, so a <Link> to an article and a
      // <LangLink> to the app can sit in the same file.
      for (const tag of p.src.match(/<Link\b[^>]*>/g) ?? []) {
        if (APP_ROUTE.test(tag)) offenders.push(`${p.route}: ${tag.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("and declares French, not the visitor's preference", () => {
    const used = pages.flatMap((p) =>
      (p.src.match(/<LangLink\b[^>]*>/g) ?? []).map((t) => ({ route: p.route, t })),
    );
    // A tripwire: if the swap is reverted wholesale, the assertion above still
    // passes — there would be no LangLink and no plain Link either.
    expect(used.length).toBeGreaterThanOrEqual(8);
    expect(used.filter((u) => !u.t.includes('lang="fr"')).map((u) => u.route)).toEqual([]);
  });

  it("imports it where it uses it", () => {
    const missing = pages
      .filter((p) => p.src.includes("<LangLink"))
      .filter((p) => !p.src.includes('from "@/components/nav/LangLink"'))
      .map((p) => p.route);
    expect(missing).toEqual([]);
  });
});

describe("it only speaks for a visitor who has not", () => {
  const src = code(join(ROOT, "components", "nav", "LangLink.tsx"));

  it("defers to an explicit choice", () => {
    // Without this guard the French pages — which rank, and which English
    // speakers also land on — would flip the whole site on one tap.
    expect(src).toContain("hasChosen");
    expect(src).toContain("if (!hasChosen) setLanguage(lang)");
  });

  it("is a client component, because the choice is a click", () => {
    expect(src.trimStart().startsWith('"use client"')).toBe(true);
  });

  it("does not reach for the URL, which would cost static rendering", () => {
    // useSearchParams() in a component this high opts the tree out of static
    // generation; app/fr/layout.tsx refused the same trade for one attribute.
    expect(src).not.toContain("useSearchParams");
    expect(src).not.toContain("?lang=");
  });
});
