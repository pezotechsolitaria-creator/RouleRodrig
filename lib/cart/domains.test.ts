import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { CART_DOMAINS, toCartDomain } from "./domains";

// ── THE BUG THIS FILE EXISTS TO PREVENT ────────────────────────────────────
// app/checkout/page.tsx is a SERVER component. It imported CART_DOMAINS from
// lib/cart/CartContext.tsx, which carries "use client" — so React handed it a
// client *reference* instead of the array, and `.includes()` threw at render
// time. Checkout returned a 500 in production.
//
// It typechecked. It built. It passed every existing test. The RSC boundary is
// not part of the type system, so nothing caught it until the page was opened
// on the live site. These tests are the cheap standing check.

describe("cart domains", () => {
  it("lists exactly the three sellable domains", () => {
    expect([...CART_DOMAINS]).toEqual(["food", "shop", "events"]);
  });

  it("narrows a trusted value", () => {
    expect(toCartDomain("food")).toBe("food");
    expect(toCartDomain("events")).toBe("events");
  });

  it("refuses anything else rather than trusting a query parameter", () => {
    // This value arrives from ?cart=… — i.e. from the customer.
    expect(toCartDomain("../../etc/passwd")).toBe("shop");
    expect(toCartDomain("")).toBe("shop");
    expect(toCartDomain(null)).toBe("shop");
    expect(toCartDomain(undefined)).toBe("shop");
  });

  it("honours an explicit fallback", () => {
    expect(toCartDomain("nonsense", "food")).toBe("food");
  });

  it("is importable by a server component — no 'use client' directive", () => {
    // The whole point of this module. If someone moves these constants back
    // into CartContext.tsx, checkout 500s again.
    const src = readFileSync(join(__dirname, "domains.ts"), "utf8");
    expect(src).not.toMatch(/^\s*["']use client["']/m);
  });
});

describe("server components never import a plain value from a client module", () => {
  // Walks the App Router and fails on the exact shape that broke checkout: a
  // file WITHOUT "use client" importing something other than a component from
  // lib/cart/CartContext. Importing CartProvider is fine — passing a component
  // across the boundary is what the boundary is for.
  const APP_DIR = join(__dirname, "..", "..", "app");

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.tsx?$/.test(entry)) out.push(full);
    }
    return out;
  }

  it("does not import cart values from the client module into a server file", () => {
    const offenders: string[] = [];
    for (const file of walk(APP_DIR)) {
      const src = readFileSync(file, "utf8");
      if (/^\s*["']use client["']/m.test(src)) continue;

      const importMatch = src.match(/import\s+\{([^}]+)\}\s+from\s+["'][^"']*cart\/CartContext["']/);
      if (!importMatch) continue;

      const named = importMatch[1]
        .split(",")
        .map((s) => s.replace(/\btype\b/, "").trim())
        .filter(Boolean)
        // A component crossing the boundary is legitimate; a constant is not.
        // Components are PascalCase by convention, which is the only signal
        // available without resolving the module.
        .filter((n) => !/^[A-Z][A-Za-z]*$/.test(n) || n === n.toUpperCase());

      if (named.length) offenders.push(`${file}: ${named.join(", ")}`);
    }
    expect(offenders, "import these from lib/cart/domains instead").toEqual([]);
  });
});
