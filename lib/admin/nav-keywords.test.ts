import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// ── A desk you cannot find does not exist ───────────────────────────────────
//
// The Services desk was labelled "Massage · Fishing · Sea trips", and the
// sidebar quick-search matched the LABEL and nothing else. So when hiking
// guides were added to that same editor, an owner searching the admin for
// "hiking" got zero results and reasonably concluded the feature had never been
// built. It had — it was simply unnamed, which for a search box is the same
// thing.
//
// A label that enumerates its contents goes stale on the day the fourth one
// arrives, and the failure is silent: nothing type-checks wrong, nothing
// renders wrong, the feature is just invisible to the person who owns it.
//
// So this asserts the SEARCHABILITY rather than the label. Add a fifth service
// kind and this test fails until somebody makes it findable.

const SRC = path.resolve(__dirname, "..", "..", "app", "admin", "AdminDashboard.tsx");

function source(): string {
  return readFileSync(SRC, "utf8");
}

/** The `key: "…" as const` entries in SERVICE_KINDS — the kinds an owner can add. */
function serviceKinds(src: string): string[] {
  const block = src.slice(src.indexOf("const SERVICE_KINDS"));
  const end = block.indexOf("\n];");
  const body = block.slice(0, end === -1 ? undefined : end);
  return [...body.matchAll(/key:\s*"([a-z_]+)"\s*as const/g)].map((m) => m[1]);
}

/** The `keywords: "…"` string on the Services nav entry. */
function servicesKeywords(src: string): string {
  const at = src.indexOf('{ id: "services",');
  expect(at, "the Services nav entry moved or was renamed").toBeGreaterThan(-1);
  const chunk = src.slice(at, at + 600);
  const m = chunk.match(/keywords:\s*"([^"]*)"/);
  return (m?.[1] ?? "").toLowerCase();
}

describe("the admin sidebar can find every service vertical", () => {
  it("finds the kinds at all (tripwire against matching nothing)", () => {
    // A checker that silently parses nothing passes forever.
    const kinds = serviceKinds(source());
    expect(kinds.length).toBeGreaterThanOrEqual(4);
    expect(kinds).toContain("hiking");
  });

  it("makes every service kind searchable from the sidebar", () => {
    const src = source();
    const words = servicesKeywords(src);
    const missing = serviceKinds(src).filter((k) => !words.includes(k.replace(/_/g, " ")));

    expect(
      missing,
      `These service kinds cannot be found by typing their name into the admin ` +
        `sidebar search, so the owner has no way to discover them: ${missing.join(", ")}. ` +
        `Add them to the \`keywords\` on the Services nav entry.`,
    ).toEqual([]);
  });

  it("no longer hardcodes the vertical list into the nav label", () => {
    // The specific mistake: a label that enumerates today's contents. If one
    // ever comes back, it will go stale the same way.
    const src = src_at_services(source());
    expect(src).not.toMatch(/label:\s*"Massage/);
  });

  it("keeps hiking findable from Routes & Trails too", () => {
    // The trails themselves live in a different editor from the guides, and an
    // owner looking for "hiking" may want either. Both must answer.
    const src = source();
    const at = src.indexOf('{ id: "routes",');
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at, at + 400).toLowerCase()).toContain("hiking");
  });
});

function src_at_services(src: string): string {
  const at = src.indexOf('{ id: "services",');
  return src.slice(at, at + 300);
}
