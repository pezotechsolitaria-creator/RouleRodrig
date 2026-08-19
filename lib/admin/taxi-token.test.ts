import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The obvious implementation of "let the owner change a driver's link" is to add
// "driver_token" to ALLOWED in the taxi route. It is wrong three ways: the value
// would be human-chosen, it would accept "" or null (the column is nullable and
// a UNIQUE btree permits many nulls, so a blank makes the driver unreachable
// with no error anywhere), and it would skip the prefix re-roll that stops one
// driver's six characters resolving to another driver's token.
//
// This is a lint, not a proof. The behaviour is asserted in M126's DO block,
// which actually calls the function. This file exists because the wrong fix is
// one line long and somebody will reach for it.

const ROUTE = readFileSync(
  join(process.cwd(), "app", "api", "admin", "taxi", "route.ts"),
  "utf8",
);

describe("a driver's access token is not a settable field", () => {
  it("keeps driver_token out of the ALLOWED whitelist", () => {
    const allowed = ROUTE.match(/const ALLOWED = \[([\s\S]*?)\] as const;/)?.[1];
    expect(allowed, "ALLOWED not found — this test has gone blind, fix the regex").toBeTruthy();
    expect(allowed).not.toContain("driver_token");
  });

  it("changes the token through the RPC, never a table write", () => {
    expect(ROUTE).toContain("admin_rotate_driver_token");
    // Every remaining mention must be a READ — a select list, a row type, or the
    // template that builds the link. None may sit inside a write call.
    expect(ROUTE).not.toMatch(/\.(insert|update|upsert)\([^)]*driver_token/);
  });

  it("refuses a rotate id that is not a uuid before it reaches the database", () => {
    expect(ROUTE).toContain("UUID.test(rotateFor)");
  });

  it("never writes a credential into the audit trail", () => {
    // audit_logs is append-only with no purge, and /admin/audit renders the diff
    // verbatim — a token logged there outlives the rotation meant to retire it.
    const auditCall = ROUTE.match(/await audit\(supabase, \{[\s\S]*?\}\);/)?.[0] ?? "";
    expect(auditCall, "the rotate audit call moved — re-point this test").toContain(
      "taxi.rotate_token",
    );
    // The action NAME contains "token", which is fine. It is the diff payload
    // that must never carry a credential.
    const diff = auditCall.match(/diff:\s*(\{[^}]*\})/)?.[1] ?? "";
    expect(diff, "no diff on the rotate audit call").toBeTruthy();
    expect(diff).not.toContain("driver_token");
    expect(diff).not.toContain("link");
    expect(diff).not.toMatch(/token/);
  });
});
