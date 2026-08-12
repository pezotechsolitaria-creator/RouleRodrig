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
