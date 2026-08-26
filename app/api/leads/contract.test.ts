import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// ── EVERY CALLER MUST SEND THE FIELD THE ROUTE READS ────────────────────────
//
// app/transfers/TransferRequest.tsx sent `target`. The route reads
// `body.target_name` and returns 400 when it is blank. So from June to late
// August every single transfer enquiry was refused and recorded nowhere.
//
// Production, the day it was found:
//     taxi            11
//     food_concierge   8
//     stay_eat_do      6
//     tiroule_miss     2
//     transfer         0   <-- the only caller using the wrong key
//
// Two things kept it quiet, and both are worth naming because they are common:
//   1. `fetch` resolves on 4xx. It only rejects on a network failure, so the
//      `.catch(() => {})` that looked like error handling never ran.
//   2. Nothing read the response. A fire-and-forget call that ignores its
//      result cannot tell "sent" from "refused".
//
// A unit test of the route would not have caught this: the route was correct.
// The bug lived in the SHAPE AGREEMENT between four callers and one reader, so
// that is what this asserts — the same source-reading approach lib/legal.test.ts
// uses to stop the policy drifting away from the product.

const ROOT = join(__dirname, "..", "..", "..");
const SCAN = ["app", "components"];
const ENDPOINT = '"/api/leads"';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts"))
      out.push(full);
  }
  return out;
}

const callers = SCAN.flatMap((d) => walk(join(ROOT, d)))
  .map((f) => ({
    file: f.slice(ROOT.length + 1),
    src: readFileSync(f, "utf8"),
  }))
  .filter((f) => f.src.includes(ENDPOINT));

describe("the /api/leads request shape", () => {
  it("finds the callers at all", () => {
    // If this drops to zero the rest of the file silently passes forever.
    expect(callers.length).toBeGreaterThanOrEqual(4);
  });

  it("every caller sends target_name", () => {
    for (const c of callers) {
      expect(
        c.src,
        `${c.file} POSTs to /api/leads without target_name`,
      ).toContain("target_name");
    }
  });

  it("no caller sends a bare `target:` instead", () => {
    // The exact typo. `target_name:` must not match, hence the negative
    // lookahead on the underscore.
    for (const c of callers) {
      const bare =
        /\btarget:(?!\s*_)/.test(c.src) && !/target_name:/.test(c.src);
      expect(bare, `${c.file} sends \`target:\`, which the route ignores`).toBe(
        false,
      );
    }
  });

  it("sends a kind the route will accept", () => {
    // KINDS in app/api/leads/route.ts. A kind outside it is refused the same
    // silent way, so the list is asserted from the route's own source rather
    // than copied here where it could drift.
    const route = readFileSync(
      join(ROOT, "app", "api", "leads", "route.ts"),
      "utf8",
    );
    const listed = route.match(/const KINDS = \[([^\]]+)\]/);
    expect(listed, "KINDS was renamed or reshaped in the route").toBeTruthy();
    const kinds =
      (listed?.[1] ?? "").match(/"[^"]+"/g)?.map((s) => s.slice(1, -1)) ?? [];
    expect(kinds.length).toBeGreaterThan(0);

    for (const c of callers) {
      const sent = c.src.match(/kind:\s*"([^"]+)"/g) ?? [];
      for (const k of sent) {
        const value = k.match(/"([^"]+)"/)?.[1] ?? "";
        expect(
          kinds,
          `${c.file} sends kind "${value}", which the route refuses`,
        ).toContain(value);
      }
    }
  });
});

describe("a refused lead is not silent", () => {
  it("the transfer caller reports a non-ok response", () => {
    // Not a demand that it AWAIT the call — it must not, the WhatsApp handoff
    // cannot wait on analytics. Only that a refusal is visible to somebody.
    const src = readFileSync(
      join(ROOT, "app", "transfers", "TransferRequest.tsx"),
      "utf8",
    );
    expect(src).toMatch(/r\.ok/);
  });
});
