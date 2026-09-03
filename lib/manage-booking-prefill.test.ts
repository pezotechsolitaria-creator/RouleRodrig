import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── "SEE THE FULL DETAILS" LOOKED LIKE A DEAD BUTTON (M164) ─────────────────
//
// Reproduced by loading the real URL rather than reasoning about it:
// /manage-booking?ref=RR-380693 returns 200, renders the right page, and the
// BOOKING REFERENCE box comes up empty — value: "".
//
// So a customer taps "See the full details" on a /track card that has just
// shown them their reference, and lands on a form demanding they type that
// same reference in again. Nothing errors, nothing redirects; it simply looks
// like the button did nothing, which is exactly how it was reported.
//
// The page never read the query string at all: const [ref, setRef] =
// useState(""), and no useSearchParams anywhere in the file.

const ROOT = join(__dirname, "..");
const SRC = readFileSync(join(ROOT, "app", "manage-booking", "page.tsx"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const TRACK = readFileSync(join(ROOT, "lib", "activity.ts"), "utf8");

describe("the reference in the link is used", () => {
  it("reads ref from the query string on mount", () => {
    expect(CODE).toContain('new URLSearchParams(window.location.search).get("ref")');
    // The read was later split across two lines when the signed-in
    // auto-lookup landed (M165); what matters is that the value is
    // cleaned and put into state, not which line it happens on.
    expect(CODE).toContain("fromUrl.trim().toUpperCase()");
    expect(CODE).toContain("setRef(cleaned)");
  });

  it("normalises it, because references are shown uppercase everywhere else", () => {
    expect(CODE).toContain(".toUpperCase()");
  });

  it("selects the tab that can actually look it up", () => {
    // Landing on the Shop tab with a rental reference filled in would be worse
    // than landing on an empty form.
    expect(CODE).toMatch(/setKind\("vehicle"\)/);
  });

  it("moves focus to email, the only thing left to type", () => {
    expect(CODE).toContain("emailRef.current?.focus({ preventScroll: true })");
    expect(CODE).toContain("ref={emailRef}");
  });

  it("does it without dragging in a Suspense boundary", () => {
    // useSearchParams would require one for a string only needed after
    // hydration. This is already a client component.
    expect(CODE).not.toContain("useSearchParams");
  });
});

describe("the link that feeds it still points here", () => {
  it("lib/activity builds /manage-booking?ref= for rentals and experiences", () => {
    expect((TRACK.match(/\/manage-booking\?ref=/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("and the param name matches what the page reads", () => {
    // A rename on either side turns the button back into a dead end.
    expect(TRACK).toContain("/manage-booking?ref=${encodeURIComponent(reference)}");
    expect(CODE).toContain('.get("ref")');
  });
});
