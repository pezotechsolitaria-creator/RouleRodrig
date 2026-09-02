import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

// ── ONE DEFINITION OF "WHAT NEEDS YOU" ──────────────────────────────────────
//
// The attention queue used to be assembled inline in app/admin/page.tsx, which
// is why the answer existed on the command centre and nowhere else — an
// operator working the food queue all morning never learned that a merchant had
// been waiting since yesterday.
//
// Adding the bell created the obvious hazard: a second place that decides what
// counts as needing attention. A bell showing 0 while the dashboard shows 3 is
// worse than no bell, because it is believed. So both read the same loader, and
// this test fails if either one starts gathering its own counts again.
//
// It reads source rather than running the queries: the failure being guarded is
// a structural one, and a database is not needed to see it.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("the bell and the dashboard cannot disagree", () => {
  it("the command centre asks the shared loader", () => {
    const page = read("app/admin/page.tsx");
    expect(page).toContain("loadAttention");
  });

  it("the bell's endpoint asks the same loader", () => {
    const route = read("app/api/admin/attention/route.ts");
    expect(route).toContain("loadAttention");
  });

  it("the command centre no longer builds the list itself", () => {
    // attentionItems() is the pure function the LOADER calls. If it reappears
    // here, the page has started assembling its own counts again and the two
    // answers are free to drift.
    const page = read("app/admin/page.tsx");
    expect(page).not.toContain("attentionItems(");
  });

  it("only the loader gathers the counts", () => {
    // Every count query lives in one file. These two are the fingerprints of
    // that gathering; finding them anywhere else means it was copied.
    const loader = read("lib/admin/attention-load.ts");
    expect(loader).toContain("owner_applications");
    expect(loader).toContain("payment_blocked_stores");

    for (const f of ["app/admin/page.tsx", "app/api/admin/attention/route.ts"]) {
      expect(read(f), `${f} gathers its own counts`).not.toContain(
        "owner_applications",
      );
    }
  });

  it("the endpoint degrades to an empty list rather than a 500", () => {
    // The bell is chrome on every admin page. A failing chrome element must not
    // make an otherwise working page look broken.
    const route = read("app/api/admin/attention/route.ts");
    expect(route).toContain("degraded");
  });
});
