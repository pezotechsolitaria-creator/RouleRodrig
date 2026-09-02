import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EMAIL_TYPES, emailCategory, emailPriority, liveEmailTypes } from "./types";

// ── THE ONE EMAIL THAT HAS TO BE TRUSTED ────────────────────────────────────
//
// Password resets and confirmations were the only customer mail this site did
// not send itself. Supabase Auth sent them over its own SMTP: rate-limited to
// roughly one message a minute, from a shared sender this domain has never
// vouched for, and invisible to email_log. So the single email whose entire job
// is to be believed was the single email most likely to be filtered — and the
// one place "did it send?" had no answer.
//
// app/api/auth/email-link now mints the link with generateLink() (which sends
// nothing) and delivers it through the same router as every other email.
//
// These assertions guard the parts that fail SILENTLY:
//   * a type left marked `planned`, so the quota engine treats live mail as
//     something that never leaves
//   * the route quietly reporting whether an address has an account
//   * the send being dropped from the route, which breaks nothing visibly

const ROUTE = readFileSync(
  join(process.cwd(), "app/api/auth/email-link/route.ts"),
  "utf8",
);

describe("the auth email types are live, not planned", () => {
  for (const t of ["password_reset", "email_verification"] as const) {
    it(`${t} is registered and actually emitted`, () => {
      expect(t in EMAIL_TYPES).toBe(true);
      // The failure this catches is invisible: a `planned` type still sends,
      // it is simply excluded from the live set the quota engine reasons about.
      expect("planned" in EMAIL_TYPES[t], `${t} is planned but code sends it`)
        .toBe(false);
      expect(liveEmailTypes()).toContain(t);
    });

    it(`${t} is account-critical, so a reserve can never hold it back`, () => {
      expect(emailCategory(t)).toBe("account");
      // Somebody locked out cannot wait for a quota window to reopen.
      expect(emailPriority(t)).toBe("critical");
    });
  }
});

describe("the route cannot be used to discover who has an account", () => {
  it("mints the link with generateLink, which sends nothing itself", () => {
    // The whole design rests on this: Supabase still owns the token and its
    // expiry, and only the delivery moves to us.
    expect(ROUTE).toContain("generateLink");
  });

  it("hands the link to our own sender", () => {
    expect(ROUTE).toContain("sendAuthLink");
  });

  it("answers identically whether or not the address exists", () => {
    // Every branch returns the same object. If a future edit adds a distinct
    // 404 or "no such user" reply, this fails — which is the point, because
    // that reply is an enumeration oracle and reads as a helpful error.
    const bodies = ROUTE.match(/NextResponse\.json\([^)]*\)/g) ?? [];
    const nonOk = bodies.filter((b) => !b.includes("ok: true"));
    // Exactly one: the malformed-JSON guard, which happens before any address
    // is known and so reveals nothing about one.
    expect(nonOk).toHaveLength(1);
    expect(nonOk[0]).toContain("Invalid request");
  });

  it("is rate limited, because it mails an address the caller chose", () => {
    expect(ROUTE).toContain("guard(");
  });

  it("only ever redirects back to this site", () => {
    // An open redirect here would hand a recovery token to another origin.
    expect(ROUTE).toContain("safeNext");
    expect(ROUTE).toContain('startsWith("//")');
  });
});
