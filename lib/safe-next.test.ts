import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

// Every payload below was reachable on the live site before this helper: the
// `?next=` parameter was assigned straight to window.location.href after
// sign-in, and interpolated as `${origin}${next}` in the auth callback.

describe("safeNext — legitimate destinations pass through", () => {
  it("keeps ordinary same-site paths", () => {
    expect(safeNext("/orders")).toBe("/orders");
    expect(safeNext("/checkout")).toBe("/checkout");
    expect(safeNext("/shop/some-store/a-product")).toBe("/shop/some-store/a-product");
  });
  it("keeps query strings and fragments", () => {
    expect(safeNext("/orders?page=2")).toBe("/orders?page=2");
    expect(safeNext("/browse/scooter#booking")).toBe("/browse/scooter#booking");
  });
  it("falls back when absent", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined, "/orders")).toBe("/orders");
    expect(safeNext("")).toBe("/");
  });
});

describe("safeNext — open redirect and XSS payloads are refused", () => {
  const fallback = "/orders";
  const attacks: [string, string][] = [
    ["absolute https URL", "https://evil.com"],
    ["absolute http URL", "http://evil.com/path"],
    ["protocol-relative", "//evil.com"],
    ["protocol-relative with path", "//evil.com/x"],
    ["backslash-relative", "/\\evil.com"],
    ["double backslash", "\\\\evil.com"],
    ["javascript scheme", "javascript:alert(document.cookie)"],
    ["data scheme", "data:text/html,<script>alert(1)</script>"],
    ["userinfo trick", "/@evil.com"],
    ["scheme with newline", "java\nscript:alert(1)"],
    ["scheme with tab", "java\tscript:alert(1)"],
    ["leading whitespace absolute", "  https://evil.com"],
    ["no leading slash", "evil.com"],
  ];

  for (const [label, payload] of attacks) {
    it(`refuses ${label}`, () => {
      expect(safeNext(payload, fallback)).toBe(fallback);
    });
  }

  it("refuses the callback userinfo trick that produced host evil.com", () => {
    // `${origin}${next}` with this value parsed as https://roulerodrig.com@evil.com
    expect(safeNext("@evil.com", fallback)).toBe(fallback);
  });

  it("refuses the subdomain-suffix trick", () => {
    // `${origin}${next}` → roulerodrig.com.evil.com
    expect(safeNext(".evil.com", fallback)).toBe(fallback);
  });

  it("allows an @ later in the path — only the host position is dangerous", () => {
    expect(safeNext("/orders/user@example.com", fallback)).toBe("/orders/user@example.com");
  });

  it("never returns a value that could leave the origin", () => {
    for (const [, payload] of attacks) {
      const out = safeNext(payload, fallback);
      expect(out.startsWith("/")).toBe(true);
      expect(out.startsWith("//")).toBe(false);
      expect(/^[a-z][a-z0-9+.-]*:/i.test(out)).toBe(false);
    }
  });
});
