import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OPTIMISABLE_IMAGE_HOSTS, canOptimise } from "./hosts";

// ── TWO LISTS THAT MUST AGREE, AND CANNOT SHARE CODE ────────────────────────
//
// next/image THROWS on a host that is not in remotePatterns. So if this list
// and next.config.ts's ever disagree, the symptom is not a slow image — it is a
// blank page, on whichever route happened to render a URL from the missing
// host. The content blob already holds two images served from roulerodrig.com,
// which was not configured until today.
//
// The obvious fix was to import one list into the other. It does not work:
// `next build` accepted it and `next dev` died on startup with "Cannot find
// module './lib/images/hosts'", because Next compiles next.config.ts to
// next.config.compiled.js and the relative path no longer resolves from there.
// The build gave no warning at all.
//
// So the lists are written twice and held together here.

const CONFIG = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");

describe("the optimiser allowlist matches next.config.ts", () => {
  it("lists exactly the same hosts, in remotePatterns", () => {
    const block = CONFIG.slice(CONFIG.indexOf("remotePatterns: ["));
    const configured = Array.from(
      block.slice(0, block.indexOf("],")).matchAll(/hostname:\s*"([^"]+)"/g),
    ).map((m) => m[1]);

    expect(
      [...configured].sort(),
      "next.config.ts remotePatterns and lib/images/hosts.ts have drifted — " +
        "next/image throws on an unconfigured host, so this ships as a blank page",
    ).toEqual([...OPTIMISABLE_IMAGE_HOSTS].sort());
  });

  it("still covers our own domain, which the content blob actually uses", () => {
    expect(canOptimise("https://roulerodrig.com/og-image.jpg")).toBe(true);
    expect(canOptimise("https://twikiojcklvvuttbrijr.supabase.co/storage/v1/x.jpg")).toBe(true);
  });
});

describe("anything it does not recognise falls back rather than throwing", () => {
  it("refuses a host nobody configured", () => {
    // A merchant pasting a link, or a URL typed into the content studio.
    expect(canOptimise("https://images.example.com/photo.jpg")).toBe(false);
    expect(canOptimise("https://evil.supabase.co.attacker.net/x.jpg")).toBe(false);
  });

  it("refuses what it cannot parse, and inline data", () => {
    expect(canOptimise("not a url")).toBe(false);
    expect(canOptimise("data:image/png;base64,AAAA")).toBe(false);
    expect(canOptimise("blob:https://x/y")).toBe(false);
    expect(canOptimise("")).toBe(false);
    expect(canOptimise(null)).toBe(false);
    expect(canOptimise(undefined)).toBe(false);
  });

  it("allows our own relative paths", () => {
    expect(canOptimise("/icon-192.png")).toBe(true);
  });

  it("matches a wildcard on the SUFFIX, not anywhere in the string", () => {
    expect(canOptimise("https://anything.supabase.co/x.jpg")).toBe(true);
    expect(canOptimise("https://supabase.co.example.com/x.jpg")).toBe(false);
  });
});
