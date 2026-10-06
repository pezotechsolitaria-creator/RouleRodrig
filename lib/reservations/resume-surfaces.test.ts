import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Every door back to "Choose a way to pay" (6 Oct 2026) ───────────────────
//
// The hold screen was a dead end: /pay was a 404, /track did not know
// reservation references, and the payment choice lived on one page. These pin
// the doors, end to end where the code allows and by source where it is UI.

const code = (...p: string[]) =>
  readFileSync(join(process.cwd(), ...p), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

// ── /track's lookup: a reservation answers with its own page ────────────────

const lookup = vi.hoisted(() => ({ path: null as string | null, calls: [] as [string, string][] }));
vi.mock("@/lib/reservations/resume-lookup", () => ({
  reservationReference: (r: string) => (/^RR-?[0-9A-Z]{5}$/i.test(r.trim()) ? r.toUpperCase() : null),
  reservationPathFor: async (r: string, c: string) => {
    lookup.calls.push([r, c]);
    return lookup.path;
  },
}));
vi.mock("@/lib/rate-limit", () => ({ guard: () => null }));
vi.mock("@/lib/supabase/admin", () => ({
  getPrivileged: async () => ({ rpc: async () => ({ data: null, error: null }) }),
}));
vi.mock("@/lib/vehicle-name", () => ({ vehicleName: async (s: string) => s }));

const post = async (body: object) => {
  const { POST } = await import("@/app/api/activity/lookup/route");
  const req = new Request("http://x/api/activity/lookup", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
  const res = await POST(req as never);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

beforeEach(() => {
  lookup.path = null;
  lookup.calls = [];
});

describe("/api/activity/lookup and a reservation reference", () => {
  it("answers with the guest's own page when the reference and contact belong together", async () => {
    lookup.path = "/booking/abc";
    const r = await post({ ref: "RR-H01BK", email: "5123 4567" });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ redirect: "/booking/abc" });
    // The phone travels to the matcher as typed: reservations accept it.
    expect(lookup.calls).toEqual([["RR-H01BK", "5123 4567"]]);
  });

  it("says one not-found for a wrong reference and a wrong contact alike", async () => {
    const r = await post({ ref: "RR-H01BK", email: "someone@example.com" });
    expect(r.status).toBe(404);
    expect(r.body.error).toBe("We couldn't find anything with that reference and email or phone. Check both and try again.");
    const r2 = await post({ ref: "RR-ZZZZZ", email: "5123 4567" });
    expect(r2.body.error).toBe(r.body.error);
  });

  it("leaves rental references to the booking lookup", async () => {
    await post({ ref: "RR-A1B2C3", email: "a@b.co" });
    expect(lookup.calls).toEqual([]);
  });
});

// ── /pay is a real address now ──────────────────────────────────────────────

const nav = vi.hoisted(() => ({ to: "" }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    nav.to = to;
    throw new Error("NEXT_REDIRECT");
  },
}));

describe("/pay", () => {
  it("sends /pay to the lookup", async () => {
    const { default: Pay } = await import("@/app/pay/page");
    expect(() => Pay()).toThrow("NEXT_REDIRECT");
    expect(nav.to).toBe("/track");
  });

  it("sends /pay/<ref> with the reference already in the box", async () => {
    const { default: PayRef } = await import("@/app/pay/[ref]/page");
    await expect(PayRef({ params: Promise.resolve({ ref: "rr-h01bk" }) })).rejects.toThrow("NEXT_REDIRECT");
    expect(nav.to).toBe("/track?ref=RR-H01BK");
    await expect(PayRef({ params: Promise.resolve({ ref: "<script>" }) })).rejects.toThrow("NEXT_REDIRECT");
    expect(nav.to).toBe("/track");
  });
});

// ── The page, the bar, the nav ──────────────────────────────────────────────

describe("the reservation page remembers itself and puts WhatsApp first", () => {
  const HUB = code("components", "reservations", "ReservationHub.tsx");

  it("writes the way back while something is still to do, and forgets it after", () => {
    expect(HUB).toContain('if (hub.state === "checking" || hub.state === "needs_information" || hub.state === "pay") {');
    expect(HUB).toContain("upsertPending({");
    expect(HUB).toContain("removePending(v.reference);");
  });

  it("never cancels on leaving: no unmount or navigation action touches the server", () => {
    expect(HUB).not.toMatch(/beforeunload|pagehide|action:\s*"cancel/);
  });

  it("swaps Ti Roulé for WhatsApp while open, and back after", () => {
    expect(HUB).toContain("setNavContact({ href: wa, label: c.whatsapp });");
    expect(HUB).toContain("return () => setNavContact(null);");
  });

  it("sends this page's link in the WhatsApp message", () => {
    expect(HUB).toContain("waText(lang, v.reference, title, when, pageUrl)");
  });
});

describe("the bottom nav's centre button", () => {
  const NAV = code("components", "BottomNav.tsx");
  it("becomes a green WhatsApp link when a page registers one", () => {
    expect(NAV).toContain('if (tab.action === "tiroule" && contact) {');
    expect(NAV).toContain("bg-[#25D366]");
  });
});

describe("/track", () => {
  const TRACK = code("app", "track", "TrackLookup.tsx");
  it("takes a phone, and lands a reservation on its own page", () => {
    expect(TRACK).toContain('contact.replace(/\\D/g, "").length >= 7');
    expect(TRACK).toContain('body.redirect.startsWith("/booking/")');
    expect(TRACK).toContain("window.location.assign(body.redirect);");
  });
});

describe("a car or scooter booking has a way back too", () => {
  const SHEET = code("components", "BookingSection.tsx");
  const MANAGE = code("app", "manage-booking", "page.tsx");

  it("is remembered while an online amount is due, and forgotten once paid", () => {
    expect(SHEET).toContain('if (resData.bookingId && dueOnline > 0 && form.payment_preference !== "in_person") {');
    expect(SHEET).toContain('kind: "rental",');
    expect(SHEET).toContain("removePending(bookingReference(lastBooking.bookingId));");
  });

  it("opens from the bar with the email this device kept, never one from the URL", () => {
    expect(MANAGE).toContain('readPending().find((e) => e.kind === "rental" && e.ref === cleaned)');
    expect(MANAGE).toContain("void lookup(cleaned, kept.email);");
    expect(MANAGE).not.toMatch(/searchParams[^;]*get\("email"\)/);
  });
});
