import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { HOME_BLOCKS, type BlockId } from "./blocks";
import { MERCHANT_KINDS } from "@/lib/merchant/kind";

// ── THE RULE THIS FILE EXISTS TO ENFORCE ────────────────────────────────────
//
//        A BLOCK NEVER RECEIVES KIND. KIND PICKS THE BLOCK.
//
// The merchant home was 390 lines and fourteen blocks. It is now a spine plus a
// registry, and the only thing keeping it that way is that nobody adds a `kind`
// prop to a block and starts branching inside it — which is the fourteen-block
// home coming back one component at a time.

const HOME_DIR = join(process.cwd(), "components", "merchant", "home");
const PAGE = join(process.cwd(), "app", "merchant", "(app)", "page.tsx");

const blockFiles = readdirSync(HOME_DIR).filter(
  (f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"),
);

describe("HOME_BLOCKS", () => {
  it("has an entry for every merchant kind", () => {
    // Trivially true via the Record type — asserted anyway so the contract is
    // visible to a reviewer who is looking at the test file, not the types.
    for (const kind of MERCHANT_KINDS) {
      expect(HOME_BLOCKS[kind], `no block list for "${kind}"`).toBeDefined();
    }
  });

  it("names only blocks that actually exist as components", () => {
    const named = new Set(Object.values(HOME_BLOCKS).flat());
    for (const id of named) {
      expect(
        blockFiles.includes(`${id}.tsx`),
        `HOME_BLOCKS names "${id}" but components/merchant/home/${id}.tsx does not exist`,
      ).toBe(true);
    }
  });

  it("lists no block twice for one kind", () => {
    for (const kind of MERCHANT_KINDS) {
      const list = HOME_BLOCKS[kind];
      expect(new Set(list).size, `"${kind}" repeats a block`).toBe(list.length);
    }
  });

  it("gives every kind at least one block of its own", () => {
    // A kind whose slot is empty gets the spine and nothing else, which is a
    // signal the kind was added before anything was built for it.
    for (const kind of MERCHANT_KINDS) {
      expect(HOME_BLOCKS[kind].length, `"${kind}" has no blocks`).toBeGreaterThan(0);
    }
  });

  it("gives every kind its money, because that question is universal", () => {
    for (const kind of MERCHANT_KINDS) {
      expect(HOME_BLOCKS[kind]).toContain("Earnings" satisfies BlockId);
    }
  });

  it("does NOT give a kitchen or a box office a shop's stock report", () => {
    // A cook asks what is still servable today and a box office sells against a
    // fixed allocation. Neither question is "how many units are low", and
    // answering it with a shop's block under a different noun is exactly the
    // branching this registry exists to prevent.
    expect(HOME_BLOCKS.kitchen).not.toContain("Stock" satisfies BlockId);
    expect(HOME_BLOCKS.events).not.toContain("Stock" satisfies BlockId);
    expect(HOME_BLOCKS.shop).toContain("Stock" satisfies BlockId);
  });
});

describe("no block knows what kind of merchant is looking at it", () => {
  for (const file of blockFiles) {
    it(`${file} takes no kind`, () => {
      const src = readFileSync(join(HOME_DIR, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split(/\r?\n/)
        .filter((l) => !l.trim().startsWith("//"))
        .join("\n");
      // A block may receive a plain capability boolean — TradingNow takes
      // hasFulfilmentChoice — but never the kind itself, and never a comparison
      // against one.
      expect(src, `${file} accepts a kind prop`).not.toMatch(/\bkind\s*[?:]\s*MerchantKind/);
      expect(src, `${file} branches on kind`).not.toMatch(/kind\s*===\s*["']/);
      expect(src, `${file} reads the kind vocabulary`).not.toContain("KIND_VOCAB");
    });
  }
});

describe("the home page composes rather than branches", () => {
  const page = readFileSync(PAGE, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

  it("chooses blocks from the registry", () => {
    expect(page).toContain("HOME_BLOCKS[kind].map");
  });

  it("never compares kind to a literal", () => {
    // The single line that would start the slide back to fourteen blocks.
    expect(page).not.toMatch(/kind\s*===\s*["']/);
  });

  it("no longer hand-copies the navigation into a tile grid", () => {
    // Six destinations were duplicated here by hand, so the grid and the tab
    // bar could disagree about where a merchant can go.
    expect(page).not.toContain('aria-label="Quick actions"');
  });

  it("no longer ends on a Recent products list", () => {
    expect(page).not.toContain("Recent products");
  });

  it("stayed short", () => {
    const lines = readFileSync(PAGE, "utf8").split(/\r?\n/).length;
    expect(lines, `home is ${lines} lines; it was 390 and should stay near 180`).toBeLessThan(230);
  });
});
