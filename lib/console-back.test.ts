import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// ── Every console must have a way out ───────────────────────────────────────
//
// The owner: "FOR ALL DASHBOARDS ADD A BACK BUTTON SO THEY CAN GO BACK TO THE
// WEBSITE."
//
// Every one of them was a dead end. None linked to the site — a driver who
// opened their bookmark could reach their jobs and nothing else. Worse on a
// phone saved to the home screen, where a PWA has no address bar and often no
// back gesture, so the console really was the whole app.
//
// A missing back link is invisible: the page renders, nothing errors, and the
// only symptom is somebody stuck. So it is tested rather than remembered.

const read = (p: string) => readFileSync(p, "utf8");

const CONSOLES = [
  ["driver", "app/driver/page.tsx"],
  ["errands", "app/errands/page.tsx"],
  ["organiser", "app/organizer/page.tsx"],
  ["kitchen", "app/kitchen/page.tsx"],
  ["taxi", "app/d/[token]/page.tsx"],
  ["merchant", "app/merchant/(app)/layout.tsx"],
] as const;

describe("every dashboard can get back to the website", () => {
  it.each(CONSOLES)("%s has a back link", (_name, file) => {
    const src = read(file);
    expect(src).toMatch(/ConsoleBackLink/);
    expect(src).toMatch(/from "@\/components\/ConsoleBackLink"/);
  });

  it("uses one component, so six consoles cannot drift into six wordings", () => {
    // The kitchen originally grew its own hand-rolled "My account" link. Two
    // implementations is how the label, the target and the tap size diverge.
    for (const [, file] of CONSOLES) {
      expect(read(file)).not.toMatch(/ArrowLeft size=\{14\} \/> My account/);
    }
  });

  it("points at My account by default, not the marketing home page", () => {
    // Changed on the owner's instruction. Everyone in a console is signed in,
    // and /account is their hub: it lists every other console they can reach,
    // their orders and their bookings, with the public site one more tap away.
    // Dropping them on the home page threw away the fact that we know who they
    // are — and a merchant who also drives had no route between their own
    // consoles at all.
    const src = read("components/ConsoleBackLink.tsx");
    expect(src).toMatch(/href = "\/account"/);
  });

  it("keeps the token-only console on the public site", () => {
    // /d/<token> is the one console reached WITHOUT a login: that driver holds
    // a token by design and has no account, so /account would put a sign-in
    // wall in front of them.
    const src = read("app/d/[token]/page.tsx");
    expect(src).toMatch(/ConsoleBackLink[^>]*href="\/"/);
  });

  it("never hides the link itself on a phone, only its label", () => {
    // A home-screen shortcut has no address bar, which is precisely where the
    // way out matters most. `hidden sm:inline-flex` on the anchor would have
    // removed it exactly there.
    const src = read("components/ConsoleBackLink.tsx");
    expect(src).not.toMatch(/inline-flex[^`]*hidden/);
    expect(src).toMatch(/compactOnMobile \? "hidden sm:inline" : undefined/);
    // And the label still reaches a screen reader when it is visually hidden.
    expect(src).toMatch(/sr-only sm:hidden/);
  });

  it("is a tap target, not a line of text", () => {
    expect(read("components/ConsoleBackLink.tsx")).toMatch(/min-h-11/);
  });
});
