import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── Guarding what a unit test cannot execute ────────────────────────────────
//
// The People & Operations route needs a service-role key and an admin session
// to run, so neither exists in a test process — and the things most worth
// protecting are precisely the ones that only happen on the server:
// authorisation, the bulk-delete refusal, and the audit write.
//
// So this reads the route the way the repo's other standing guards do
// (rpc-grants, sw-cache, reachable-pages): it asserts the SHAPE of the file.
// A source scan cannot prove the code is correct, but it can prove somebody
// has not deleted the line that makes it safe — which is the regression that
// actually happens, usually while refactoring something else.

const SRC = readFileSync(join(process.cwd(), "app/api/admin/people/route.ts"), "utf8");

/** The body of one exported handler. */
function handler(method: "GET" | "PATCH" | "POST"): string {
  const at = SRC.indexOf(`export async function ${method}(`);
  expect(at, `${method} handler is missing or was renamed`).toBeGreaterThan(-1);
  const next = ["GET", "PATCH", "POST"]
    .map((m) => SRC.indexOf(`export async function ${m}(`, at + 10))
    .filter((i) => i > -1)
    .sort((a, b) => a - b)[0];
  return SRC.slice(at, next === undefined ? SRC.length : next);
}

describe("every handler is behind the admin gate", () => {
  it("opens each one with guardAdminApi before doing anything else", () => {
    for (const m of ["GET", "PATCH", "POST"] as const) {
      const body = handler(m);
      const gate = body.indexOf("guardAdminApi");
      expect(gate, `${m} does not call guardAdminApi`).toBeGreaterThan(-1);

      // It must be the FIRST thing. A read that happens before the gate is a
      // read that happens for a stranger, however the response is discarded.
      const firstAwait = body.indexOf("await");
      expect(firstAwait, `${m} awaits something before the gate`).toBe(
        body.indexOf("await guardAdminApi"),
      );
      expect(body).toContain("if (gate instanceof NextResponse) return gate");
    }
  });
});

describe("bulk delete is refused on the server", () => {
  it("checks isBulkAllowed in the bulk handler", () => {
    const post = handler("POST");
    expect(post).toContain("isBulkAllowed");
    // And refuses rather than falling through.
    expect(post).toMatch(/if\s*\(!isBulkAllowed\([\s\S]{0,40}\)\)\s*{[\s\S]{0,200}status:\s*400/);
  });

  it("refuses delete on the single-person handler too", () => {
    // Deleting has its own route with a dependency check and a typed
    // confirmation (lib/admin/merchant-delete.ts). This one must never become
    // a shortcut around it.
    expect(handler("PATCH")).toContain('action === "delete"');
  });

  it("caps how many people one request may touch", () => {
    // Not a security boundary, a blast radius. An unbounded id list is a way to
    // suspend the whole platform with one malformed request.
    expect(handler("POST")).toMatch(/\.slice\(0,\s*\d+\)/);
  });
});

describe("high-risk actions cannot be performed without a reason", () => {
  it("is enforced in both handlers, not only in the modal", () => {
    for (const m of ["PATCH", "POST"] as const) {
      const body = handler(m);
      expect(body, `${m} does not require a reason`).toContain("needsReason");
      expect(body).toMatch(/status:\s*422/);
    }
  });
});

describe("every mutation leaves a trail", () => {
  it("audits the single-person path", () => {
    expect(handler("PATCH")).toMatch(/await audit\(/);
  });

  it("audits each person in a bulk run AND the run itself", () => {
    const post = handler("POST");
    // Two calls: one per person, one summary. "Who suspended eight merchants on
    // Tuesday" must be answerable without reconstructing it from eight rows.
    expect(post.match(/await audit\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(post).toContain("people.bulk.");
  });

  it("records what changed, not merely that something did", () => {
    // applyOne reads the row BEFORE writing so the diff is real.
    expect(SRC).toContain("// Read BEFORE");
    expect(SRC).toMatch(/from:\s*\(before as/);
  });
});

describe("a bulk run reports its failures rather than hiding them", () => {
  it("collects per-person failures and returns them", () => {
    const post = handler("POST");
    expect(post).toContain("failures");
    expect(post).toMatch(/applied:\s*done/);
  });
});
