import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ── The booking sheet's plumbing (owner brief, 6 Oct 2026) ──────────────────
//
// One booking surface: every Reserve on the rental pages opens the same sheet,
// in place. These are the wires a refactor could cut without a type error.

const code = (...p: string[]) =>
  readFileSync(join(process.cwd(), ...p), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const SHEET = code("components", "BookingSection.tsx");

describe("a vehicle page's Reserve opens the sheet where the reader is", () => {
  it("catches the link click before next/link can navigate", () => {
    // next/link navigates in React's bubble phase unless the click is already
    // prevented, so the catch has to run in the capture phase. On bubble it
    // ran second and the page left for /browse/<cat>?v= (found 6 Oct 2026).
    expect(SHEET).toContain('document.addEventListener("click", onClick, true);');
    expect(SHEET).toContain('document.removeEventListener("click", onClick, true);');
  });

  it("is a real link on both of the page's Reserve buttons, so it works without JavaScript", () => {
    const BAR = code("components", "VehicleActionBar.tsx");
    const PAGE = code("app", "browse", "[category]", "[vehicle]", "page.tsx");
    expect(BAR).toContain("data-rr-reserve={reserveId}");
    expect(PAGE).toContain("data-rr-reserve={item.id}");
    expect(PAGE).toContain("href={`/browse/${category}?v=${item.id}#booking`}");
  });
});

describe("the sheet is a dialog that gives the page back", () => {
  it("is modal, closes on Escape, and keeps Tab inside", () => {
    expect(SHEET).toContain('aria-modal="true"');
    expect(SHEET).toContain('if (e.key === "Escape")');
    expect(SHEET).toContain('if (e.key !== "Tab" || !dialogRef.current) return;');
  });

  it("locks the page's scroll only while it is open, and restores it", () => {
    // "No overflow:hidden on the page while the sheet is closed."
    expect(SHEET).toMatch(/if \(!open\) return;\s*const html = document\.documentElement;/);
    expect(SHEET).toContain("html.style.overflow = prev;");
  });
});
