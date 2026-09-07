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
const INVITE = readFileSync(join(process.cwd(), "app/api/admin/people/invite/route.ts"), "utf8");

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
    // `from` must come out of the row that was read, whatever the column is
    // called — merchants and drivers carry `status`, a taxi carries `active`.
    expect(SRC).toMatch(/from:\s*before[.[]/);
  });
});

describe("a bulk run reports its failures rather than hiding them", () => {
  it("collects per-person failures and returns them", () => {
    const post = handler("POST");
    expect(post).toContain("failures");
    expect(post).toMatch(/applied:\s*done/);
  });
});

// ── Admin-assisted onboarding ───────────────────────────────────────
//
// The invitation route can create an account for somebody who is not present,
// which makes it the most abusable endpoint on the desk. These guard the four
// properties that make it safe, none of which a type-checker can see.

/** The body of one exported handler in the invite route. */
function inviteHandler(method: "POST" | "PATCH"): string {
  const at = INVITE.indexOf(`export async function ${method}(`);
  expect(at, `invite ${method} handler is missing or was renamed`).toBeGreaterThan(-1);
  const next = ["POST", "PATCH"]
    .map((m) => INVITE.indexOf(`export async function ${m}(`, at + 10))
    .filter((i) => i > -1)
    .sort((a, b) => a - b)[0];
  return INVITE.slice(at, next === undefined ? INVITE.length : next);
}

describe("creating an account for somebody is behind the same gate", () => {
  it("opens both handlers with guardAdminApi, before any other await", () => {
    for (const m of ["POST", "PATCH"] as const) {
      const body = inviteHandler(m);
      expect(body.indexOf("await"), `invite ${m} awaits something before the gate`).toBe(
        body.indexOf("await guardAdminApi"),
      );
      expect(body).toContain("if (gate instanceof NextResponse) return gate");
    }
  });

  it("goes through the SECURITY DEFINER RPCs and never writes the tables directly", () => {
    // A direct insert would skip the duplicate check, the pending/offline
    // defaults and the audit row the function writes inside its transaction.
    expect(INVITE).toContain("admin_invite_merchant");
    expect(INVITE).toContain("admin_invite_driver");
    expect(INVITE).not.toMatch(/from\("merchants"\)[\s\S]{0,40}\.insert/);
    expect(INVITE).not.toMatch(/from\("delivery_drivers"\)[\s\S]{0,40}\.insert/);
  });
});

describe("no password is created, seen, or recorded anywhere", () => {
  it("never generates one", () => {
    // The whole point of claim-on-sign-in. An admin who could set a password
    // could sign in AS the merchant, and every later action in the audit trail
    // would read as the merchant doing it.
    //
    // Scanned with the COMMENTS STRIPPED: both files explain at length that no
    // password is ever created, and a guard that trips on its own rationale is
    // a guard somebody deletes rather than fixes.
    for (const src of [INVITE, SRC]) {
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code).not.toMatch(/password/i);
      expect(code).not.toMatch(/generatePassword|randomBytes|createUser|admin\.auth/i);
    }
  });

  it("puts nothing secret in the audit diff", () => {
    // Addresses and names only — they are what was invited. Anything token
    // shaped in a log is a credential sitting in a table people can read.
    const post = inviteHandler("POST");
    expect(post).toMatch(/diff:\s*{[^}]*email/);
    expect(post).not.toMatch(/diff:\s*{[^}]*(token|secret|password|otp)/i);
  });
});

describe("the invitation cannot be used as a mailing gun", () => {
  it("re-checks the cooldown on the server, not only in the button", () => {
    const patch = inviteHandler("PATCH");
    expect(patch).toContain("canResendInvite");
    expect(patch).toMatch(/status:\s*429/);
  });

  it("stamps the send BEFORE mailing, so a double click cannot outrun it", () => {
    const patch = inviteHandler("PATCH");
    const stamp = patch.indexOf("invited_at: sentAt");
    // `await sendInvite(`, not `sendInvite` — canResendInvite CONTAINS that
    // substring and appears earlier in the handler, so the loose version of
    // this test compared the stamp against the cooldown check and failed on a
    // file whose ordering was correct.
    const send = patch.indexOf("await sendInvite(");
    expect(stamp).toBeGreaterThan(-1);
    expect(stamp).toBeLessThan(send);
  });

  it("resending is refused in bulk by the desk route", () => {
    // isBulkAllowed is the enforcement; this pins that nobody adds it to the
    // list later without thinking about what a bulk resend is.
    const people = readFileSync(join(process.cwd(), "lib/admin/people.ts"), "utf8");
    const list = people.slice(people.indexOf("BULK_ACTIONS"), people.indexOf("BULK_ACTIONS") + 200);
    expect(list).not.toContain("resend_invite");
  });
});

describe("a duplicate invitation is reported, never duplicated", () => {
  it("returns 409 with the existing id rather than creating a second row", () => {
    const post = inviteHandler("POST");
    expect(post).toMatch(/if\s*\(!result\.created\)/);
    expect(post).toMatch(/status:\s*409/);
    expect(post).toContain("duplicate: true");
  });

  it("normalises the phone before Postgres can reject it", () => {
    // delivery_drivers.phone is CHECKed against E.164; a raw 23514 is useless
    // to an admin sitting next to the driver.
    expect(inviteHandler("POST")).toContain("normalizePhone");
  });
});
