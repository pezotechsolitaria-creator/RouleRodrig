import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { escapeLike, sameEmail } from "./email-match";

describe("an email is not a pattern", () => {
  it("escapes the LIKE wildcards an address can contain", () => {
    expect(escapeLike("j_doe@gmail.com")).toBe("j\\_doe@gmail.com");
    expect(escapeLike("50%off@x.mu")).toBe("50\\%off@x.mu");
    expect(escapeLike("a\\b@x.mu")).toBe("a\\\\b@x.mu");
    expect(escapeLike("plain@x.mu")).toBe("plain@x.mu");
  });

  it("matches only the same address, whatever the case or padding", () => {
    expect(sameEmail(" J_Doe@Gmail.com ", "j_doe@gmail.com")).toBe(true);
    // The bug: ilike's `_` made these match. They must not.
    expect(sameEmail("jxdoe@gmail.com", "j_doe@gmail.com")).toBe(false);
    expect(sameEmail("j-doe@gmail.com", "j_doe@gmail.com")).toBe(false);
  });

  it("never matches on an empty address or a missing column", () => {
    expect(sameEmail("", "")).toBe(false);
    expect(sameEmail(null, "a@b.mu")).toBe(false);
    expect(sameEmail("a@b.mu", "")).toBe(false);
  });
});

describe("the activity feed uses both layers on every email-keyed source", () => {
  const src = readFileSync("lib/activity-server.ts", "utf8");
  // Code only: the comment explaining the bug names `.ilike("email", email)`.
  const code = src.split(/\r?\n/).filter((l) => !l.trim().startsWith("//")).join("\n");

  it("queries with the escaped pattern, never the raw address", () => {
    expect(code).toMatch(/const pattern = escapeLike\(email\);/);
    expect(code).not.toMatch(/\.ilike\("[a-z_]+", email\)/);
    expect(code.match(/\.ilike\("[a-z_]+", pattern\)/g)?.length).toBe(4);
  });

  it("re-checks each email-matched row before showing it", () => {
    expect(code).toMatch(/sameEmail\(row\.email, email\)[^\n]*"booking"/);
    expect(code).toMatch(/sameEmail\(row\.email, email\)[^\n]*"place_booking"/);
    expect(code).toMatch(/sameEmail\(row\.customer_email, email\)/);
    expect(code).toMatch(/sameEmail\(row\.guest_email, email\)/);
  });

  it("drops what the customer cleared (M234)", () => {
    expect(code).toMatch(/hiddenKeysFor\(opts\.userId\)/);
    for (const kind of ["booking", "place_booking", "ride", "service_booking"]) {
      expect(code).toContain(`hideKey("${kind}"`);
    }
  });
});
