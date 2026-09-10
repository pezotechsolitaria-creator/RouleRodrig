import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

// ── THE FILE AI ASSISTANTS READ FIRST (M150) ────────────────────────────────
//
// public/llms.txt is the one document written specifically for the engines
// that answer "how do I get around Rodrigues" without sending anyone to a
// website. Everything in it is quoted with our name attached, so a wrong line
// here is worse than a wrong line anywhere else on the site: it is repeated
// confidently, to someone who will never see the page that would correct it.
//
// It shipped claiming /browse/activities offers "kitesurfing, snorkelling,
// hiking, island tours". Checked against site_content: that page holds ONE
// listing, a spa treatment. There is no kitesurfing anywhere on the site, and
// snorkelling and island tours are /browse/tours. An assistant repeating that
// sends a traveller to book a kitesurfing lesson that does not exist.

const ROOT = join(__dirname, "..");
const TXT = readFileSync(join(ROOT, "public", "llms.txt"), "utf8");

/** Every route the app can serve, as segment lists. A "[slug]" segment is a
 *  wildcard. Compared segment-by-segment rather than by building a RegExp, so
 *  there is no escaping to get wrong. */
const ROUTES: string[][] = (function walk(dir: string, acc: string[][] = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (!statSync(full).isDirectory()) continue;
    if (name.startsWith("_") || name === "api") continue;
    for (const f of ["page.tsx", "page.ts", "route.ts"]) {
      try {
        statSync(join(full, f));
        acc.push(
          relative(join(ROOT, "app"), full)
            .split(sep)
            .filter((seg) => !seg.startsWith("(")),
        );
        break;
      } catch {
        /* no page file at this level */
      }
    }
    walk(full, acc);
  }
  return acc;
})(join(ROOT, "app"));

const matches = (path: string) => {
  const want = path.split("/").filter(Boolean);
  return ROUTES.some(
    (route) =>
      route.length === want.length &&
      route.every((seg, i) => seg.startsWith("[") || seg === want[i]),
  );
};

const urls = [...TXT.matchAll(/\((https:\/\/roulerodrig\.com[^)]*)\)/g)].map((m) => m[1]);

describe("llms.txt points only at pages that exist", () => {
  it("lists a useful number of links", () => {
    expect(urls.length).toBeGreaterThan(15);
  });

  it("every link resolves to a real route", () => {
    const missing = urls.filter((u) => {
      const path = new URL(u).pathname.replace(/\/$/, "") || "/";
      if (path === "/") return false;
      return !matches(path);
    });
    expect(missing, `not routes: ${missing.join(", ")}`).toEqual([]);
  });

  it("uses the canonical host, never the retired vercel.app one", () => {
    expect(TXT).not.toMatch(/vercel\.app/);
    expect(TXT).not.toMatch(/http:\/\//);
  });
});

describe("llms.txt does not describe listings the site does not have", () => {
  it("no longer advertises kitesurfing, which exists nowhere on the site", () => {
    expect(TXT.toLowerCase()).not.toContain("kitesurf");
  });

  it("describes /browse/activities by what the page does, not by a fixed menu", () => {
    // Enumerating activities there goes stale the moment the owner adds or
    // removes one, and the page has held a single listing for weeks.
    const line = TXT.split("\n").find((l) => l.includes("/browse/activities")) ?? "";
    expect(line).toMatch(/price per person/);
    expect(line).not.toMatch(/snorkelling|hiking|island tours/);
  });

  it("keeps the tours line to excursions that are actually listed", () => {
    const line = TXT.split("\n").find((l) => l.includes("/browse/tours")) ?? "";
    for (const real of ["Cocos", "Banane", "fishing", "lagoon"]) {
      expect(line).toContain(real);
    }
  });
});

describe("llms.txt keeps the shape the spec asks for", () => {
  it("opens with an H1 and a blockquote summary", () => {
    const lines = TXT.split("\n");
    expect(lines[0]).toMatch(/^# /);
    expect(lines.slice(1, 12).some((l) => l.startsWith(">"))).toBe(true);
  });

  it("groups the links under H2 sections", () => {
    expect((TXT.match(/^## /gm) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("gives a contact route that matches the site's own", () => {
    expect(TXT).toContain("bookings@roulerodrig.com");
    expect(TXT).toContain("5835 5588");
  });
});

describe("llms.txt does not leave the French half out", () => {
  it("lists every /fr/ page that exists", () => {
    // The file's own summary says the audience is largely French-speaking
    // (Reunion, Mauritius, France), and it was listing four of eight. An
    // assistant answering "que faire a Rodrigues" should meet the French page.
    const routes = readdirSync(join(ROOT, "app", "fr")).filter((n) => {
      try {
        return statSync(join(ROOT, "app", "fr", n, "page.tsx")).isFile();
      } catch {
        return false;
      }
    });
    expect(routes.length).toBeGreaterThanOrEqual(8);
    const missing = routes.filter((slug) => !TXT.includes(`/fr/${slug}`));
    expect(missing, `French pages absent from llms.txt: ${missing.join(", ")}`).toEqual([]);
  });

  it("describes the French pages in French", () => {
    // A French URL with an English-only description tells an assistant the
    // page is English, which is the opposite of why it exists.
    const frLines = TXT.split("\n").filter((l) => l.includes("/fr/"));
    expect(frLines.length).toBeGreaterThanOrEqual(8);
    for (const line of frLines) {
      expect(line.toLowerCase()).toMatch(/francais|français|en francais/);
    }
  });
});

// ── THE ONE FILE WRITTEN FOR AI ASSISTANTS WITHHELD BOTH PRICES ────────────
//
// llms.txt said "Current daily rates are shown on each rental page" while the
// site's own <title> tags publish "from Rs 699/day" and "from Rs 1,999/day",
// and the food bullet three lines below already priced itself ("des Rs 80").
// An assistant asked "how much is a scooter on Rodrigues?" could not answer
// from the file built to answer it, so it either skipped the site or guessed.
describe("llms.txt states the prices the site already publishes", () => {
  const txt = readFileSync(join(process.cwd(), "public", "llms.txt"), "utf8");

  it("gives both headline rates", () => {
    expect(txt).toContain("Rs 699");
    expect(txt).toContain("Rs 1,899");
  });

  it("keeps the word 'from', because neither is the only rate", () => {
    // Four car rates: Rs 1,899 / 1,999 / 2,399 / 2,899. Stating the cheapest
    // bare would be a price the owner does not charge for three of them.
    expect(txt).toMatch(/from Rs 699\/day/);
    expect(txt).toMatch(/from Rs 1,899\/day/);
  });

  // ── THIS FILE HOLDS THE LAST HAND-TYPED PRICE ON THE SITE ────────────────
  //
  // The category titles stopped carrying a literal in 2eb8f542, because the
  // hardcoded "Rs 1,999" was wrong the morning after it was written — the
  // owner repriced the Swift to Rs 1,899 and only the derived half of the
  // page followed. llms.txt is static and cannot read the fleet, so it kept
  // the stale figure a day longer than the page did.
  //
  // This is the tripwire. If a price literal comes back into the titles,
  // there are two hand-typed prices again and they will drift apart.
  it("is not racing a second hardcoded price in the category titles", () => {
    const page = readFileSync(
      join(process.cwd(), "app", "browse", "[category]", "page.tsx"),
      "utf8",
    );
    // Comments stripped first: a prose mention of an old price is history,
    // not a hardcoded price, and asserting over prose is how three tests in
    // this repo have broken on their own explanatory text.
    const code = page
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const META = code.slice(
      code.indexOf("const META"),
      code.indexOf("export async function generateMetadata"),
    );
    expect(META).not.toMatch(/Rs [\d,]+/);
  });

  it("no longer defers the answer to another page", () => {
    expect(txt).not.toContain("Current daily rates are");
  });


});
