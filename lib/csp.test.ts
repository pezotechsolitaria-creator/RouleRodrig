import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── THE BUG THIS FILE EXISTS TO PREVENT ────────────────────────────────────
// The Content Security Policy declared img-src and connect-src but never
// media-src. CSP falls back to `default-src 'self'` for any directive it does
// not name, so every hero video served from Supabase Storage was blocked —
// silently. The <video> mounted, the load was refused, onError unmounted the
// layer, and the site showed the still photo with no error anywhere the owner
// would look. It had never worked, for any uploaded clip.
//
// A missing CSP directive is exactly the kind of defect that survives a green
// build, a passing test suite and a code review, because nothing fails — a
// feature just quietly does not happen. These tests read the real config.

const CONFIG = readFileSync(join(__dirname, "..", "next.config.ts"), "utf8");

/** The CSP is a joined array of directive strings in next.config.ts. */
function directive(name: string): string | null {
  const m = CONFIG.match(new RegExp(`"${name} ([^"]*)"`));
  return m ? m[1] : null;
}

describe("Content Security Policy", () => {
  it("declares media-src, or every hosted video is blocked", () => {
    expect(directive("media-src")).not.toBeNull();
  });

  it("allows video from the Supabase Storage bucket the site actually uses", () => {
    const media = directive("media-src") ?? "";
    // Storage is a different origin, so 'self' alone is not enough.
    expect(media).toMatch(/https:/);
  });

  it("allows blob: media, which is how uploads are previewed before saving", () => {
    expect(directive("media-src") ?? "").toContain("blob:");
  });

  it("allows the YouTube and Vimeo players the hero can embed", () => {
    const frame = directive("frame-src") ?? "";
    expect(frame).toContain("youtube-nocookie.com");
    expect(frame).toContain("player.vimeo.com");
  });

  it("keeps PayPal framing, which checkout depends on", () => {
    expect(directive("frame-src") ?? "").toContain("paypal.com");
  });

  it("does NOT open frame-src to all of https:", () => {
    // An iframe is far more dangerous to allow broadly than an image or a
    // video: it can host a convincing fake login. Providers stay explicit.
    const frame = directive("frame-src") ?? "";
    expect(frame).not.toMatch(/(^|\s)https:(\s|$)/);
  });

  it("still refuses plugins and framing of this site", () => {
    // Regression guard on the protections that were already correct.
    expect(directive("object-src")).toBe("'none'");
    expect(directive("frame-ancestors")).toBe("'none'");
    expect(directive("base-uri")).toBe("'self'");
    expect(directive("form-action")).toBe("'self'");
  });

  it("keeps default-src locked to self, which is why the rest must be explicit", () => {
    expect(directive("default-src")).toBe("'self'");
  });
});

// ── THE POLICY THAT BROKE LOCAL DEVELOPMENT ─────────────────────────────────
//
// `next dev` wraps every module in eval(), and this policy applies in dev, so
// the browser refused main-app.js and NOTHING hydrated — not one component,
// the whole app. The switcher did nothing, every <Link> did a full page load,
// and no client-side behaviour could be verified locally at all. A fix could
// be correct and look dead.
//
// The grant is therefore dev-only, and these assertions are the whole reason
// it is safe: what production serves is one named constant, and the dev branch
// is the only thing that may name the grant.

describe("the eval grant is development-only", () => {
  const PROD_SCRIPT_SRC = directive("script-src") ?? "";

  it("what production serves has no eval grant in it", () => {
    expect(PROD_SCRIPT_SRC).not.toBe("");
    expect(PROD_SCRIPT_SRC).not.toContain("unsafe-eval");
  });

  it("the only mention of it is gated on NODE_ENV", () => {
    const code = CONFIG.replace(/^\s*\/\/.*$/gm, "");
    const lines = code.split("\n").filter((l) => l.includes("unsafe-eval"));
    // Exactly one, and it is the conditional. Two would mean somebody added a
    // second path to it — which is how a dev-only grant reaches production.
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("IS_DEV ?");
    expect(code).toContain('const IS_DEV = process.env.NODE_ENV === "development"');
  });

  it("still carries the third-party scripts checkout needs", () => {
    // The constant was extracted out of the array; this is the guard that the
    // extraction dropped nothing on the way.
    for (const host of ["paypal.com", "va.vercel-scripts.com", "posthog.com"]) {
      expect(PROD_SCRIPT_SRC, host).toContain(host);
    }
    expect(PROD_SCRIPT_SRC).toContain("'self'");
  });
});
