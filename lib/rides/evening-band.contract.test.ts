import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RIDES_COPY, KREOL_NEEDS_REVIEW } from "./copy.i18n";
import { offerMessage } from "./model";
import { returnSavings } from "./transfer";

// ── M221 · AN EVENING BAND AND A NIGHT BAND ─────────────────────────────────
//
// The owner, after M220 went live: keep "priced by hand" for true night
// (22:00–04:59); make the early evening (17:00–21:59) a fixed Rs 300 so
// afternoon flights dispatch without him; both windows configurable.
//
// The engine is proven in Postgres — supabase/tests/m221_evening_and_night_
// bands.sql, 27 assertions green on production inside a rolled-back
// transaction on 29 Sep 2026, beside the M220 suite pinned to the launch list.
// These guard the code around it, with comments stripped before any "must not
// contain" check (an explanation of a banned number quotes the number).

const ROOT = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .split(/\r?\n/).filter((l) => !l.trim().startsWith("//")).join("\n");

const M221 = read("supabase", "migrations", "20260929120000_m221_evening_and_night_bands.sql");
const BOOK = read("app", "taxi", "book", "BookRide.tsx");
const PAGE = read("app", "transfers", "page.tsx");
const PANEL = read("app", "admin", "rides", "TransferPricingPanel.tsx");
const ADMIN_ROUTE = read("app", "api", "admin", "transfer-pricing", "route.ts");
const BOOK_ROUTE = read("app", "api", "rides", "route.ts");
const OFFER_SCREEN = read("app", "r", "[token]", "RideOfferScreen.tsx");
const DESK = read("app", "admin", "rides", "RidesDesk.tsx");

describe("the migration", () => {
  it("adds the evening band switched OFF, so the launch list re-prices exactly as it quoted", () => {
    expect(M221).toMatch(/add column if not exists evening_mode\s+text not null default 'none'/);
    expect(M221).toMatch(/add column if not exists evening_surcharge\s+integer not null default 0/);
  });

  it("gives an hour both bands claim to NIGHT", () => {
    expect(M221).toMatch(/v_late := v\.night_mode <> 'none'/);
    expect(M221).toMatch(/v_eve\s+:= not v_late and v\.evening_mode <> 'none'/);
  });

  it("publishes the owner's decision as a new list: evening fixed Rs 300 17-21, night by hand 22-04", () => {
    expect(M221).toMatch(/'manual', 22, 4, night_surcharge, night_multiplier,\s*\n\s*'fixed', 17, 21, 30000, 1\.20,/);
    // Guarded against being published twice by a re-run.
    expect(M221).toMatch(/not exists \(select 1 from public\.transfer_pricing_versions where created_by = 'migration m221'\)/);
  });

  it("replaces create_ride_request in place — no drop, so no second overload", () => {
    expect(M221).not.toMatch(/drop function/i);
    expect(M221).toMatch(/create or replace function public\.create_ride_request\(/);
    // The one change: each leg says why its fare is pending.
    expect(M221).toMatch(/'reason', v_out->>'manualReason'/);
    expect(M221).toMatch(/'reason', v_back->>'manualReason'/);
  });

  it("names both windows on every quote", () => {
    expect(M221).toMatch(/'eveningWindow', jsonb_build_object\('from', v\.evening_from_hour/);
  });
});

describe("the booking screen names the band it priced", () => {
  it("explains a surcharge with the band and its window, not a bare 'night rate'", () => {
    expect(BOOK).toContain("t.bandIncluded(legBand(l)");
    expect(BOOK).not.toContain("t.nightIncluded");
  });

  it("says evening when an evening fare is by hand, and night only at night — both when both apply", () => {
    expect(BOOK).toMatch(/quote\.manualReasons\?\.includes\("evening"\) \? t\.eveningManual\(bandWindow\("evening"\)\) : null/);
    expect(BOOK).toMatch(/quote\.manualReasons\?\.includes\("night"\) \? t\.nightManual\(bandWindow\("night"\)\) : null/);
    expect(BOOK).toContain("{manualLines.map((line) => (");
  });

  it("falls back to the NIGHT band for a quote written before bands existed", () => {
    expect(BOOK).toMatch(/const legBand = \(l: TransferLeg\): "evening" \| "night" => l\.band \?\? "night";/);
  });
});

describe("the public page and the editor", () => {
  it("states each band in its own sentence, from the price list", () => {
    expect(PAGE).toMatch(/bandSentence\("Evening", p\.eveningMode/);
    expect(PAGE).toMatch(/bandSentence\("Night", p\.nightMode/);
    // No hours or surcharge typed into the page.
    expect(code(PAGE)).not.toMatch(/\b(17|21|22):00\b|\b04:59\b|Rs 300\b/);
  });

  it("documents where the return package saves money, computed from the fares", () => {
    expect(PAGE).toContain("returnSentence(airport)");
    expect(PANEL).toContain("returnDifference(");
  });

  it("offers both windows in the editor, and says night wins an overlap", () => {
    expect(PANEL).toMatch(/<BandFields name="evening"/);
    expect(PANEL).toMatch(/<BandFields name="night"/);
    expect(PANEL).toContain("the Night rule applies to the shared hours");
  });

  it("stores the evening band and refuses a fixed band with no amount", () => {
    expect(ADMIN_ROUTE).toMatch(/evening_surcharge: v\.eveningSurcharge != null \? toMinor\(v\.eveningSurcharge\) : current\.evening_surcharge/);
    expect(ADMIN_ROUTE).toMatch(/v\.eveningMode !== "fixed" \|\| \(v\.eveningSurcharge \?\? 0\) > 0/);
  });
});

describe("fixes from the adversarial review of M221", () => {
  const M221B = read("supabase", "migrations", "20260929130000_m221b_now_quotes_are_rechecked.sql");

  it("a 'now' quote is re-priced at booking, so 21:40 evening cannot dispatch at 22:05", () => {
    expect(M221B).toMatch(/if v_q\.outbound_at is null then\s*\n\s*v_chk := price_transfer_leg\(v_q\.pricing_version_id, v_q\.road_km, v_q\.trip_type, v_n, null\);/);
    expect(M221B).toMatch(/hint='repriced'/);
    expect(M221B).not.toMatch(/drop function/i);
  });

  it("a publish that omits the evening band keeps the one in force — never switches it off", () => {
    expect(ADMIN_ROUTE).toMatch(/eveningMode: z\.enum\(NIGHT_MODES\)\.optional\(\)/);
    expect(code(ADMIN_ROUTE)).not.toMatch(/eveningMode: z\.enum\(NIGHT_MODES\)\.default\("none"\)/);
    expect(ADMIN_ROUTE).toMatch(/evening_mode: v\.eveningMode \?\? current\.evening_mode/);
  });

  it("refuses a return fare dearer than one way, and says 'more' if one ever exists", () => {
    expect(ADMIN_ROUTE).toMatch(/v\.returnEach\.every\(\(r, i\) => r <= v\.oneWay\[i\]\)/);
    expect(PAGE).toContain("returnDifference(p)");
    expect(PANEL).toContain("MORE per trip than one way");
  });

  it("advertises the evening only for the hours night does not take", () => {
    expect(PAGE).toContain("effectiveEveningLabel(");
    expect(BOOK).toContain("effectiveEveningLabel(quote.eveningWindow, quote.nightWindow)");
  });

  it("does not promise a driver in minutes when the fare is held", () => {
    expect(BOOK).toMatch(/done\.pending === "all" \? c\.transfer\.donePendingHeading : c\.done\.heading/);
  });
});

describe("the evening window, minus the night", () => {
  // Import-free re-statement of the three shapes the helper must handle.
  it("is the full evening when the bands do not touch", async () => {
    const { effectiveEveningLabel } = await import("./transfer");
    expect(effectiveEveningLabel({ from: 17, to: 21 }, { from: 22, to: 4, mode: "manual" })).toBe("17:00–21:59");
  });

  it("loses the hours night takes", async () => {
    const { effectiveEveningLabel } = await import("./transfer");
    expect(effectiveEveningLabel({ from: 17, to: 23 }, { from: 22, to: 4, mode: "manual" })).toBe("17:00–21:59");
  });

  it("disappears when night covers it — the M220 launch shape", async () => {
    const { effectiveEveningLabel } = await import("./transfer");
    expect(effectiveEveningLabel({ from: 17, to: 21 }, { from: 17, to: 4, mode: "manual" })).toBeNull();
  });

  it("is unaffected by a night band switched off", async () => {
    const { effectiveEveningLabel } = await import("./transfer");
    expect(effectiveEveningLabel({ from: 17, to: 21 }, { from: 17, to: 4, mode: "none" })).toBe("17:00–21:59");
  });
});

describe("what a return package saves", () => {
  it("is zero where the package costs the same as two one-way trips", () => {
    // The owner's launch fares: 1,200/1,500/2,000 one way; 1,200/1,500/1,700 each way.
    expect(returnSavings({ oneWay: [120000, 150000, 200000], returnEach: [120000, 150000, 170000] }))
      .toEqual([0, 0, 30000]);
  });

  it("never reports a negative saving", () => {
    expect(returnSavings({ oneWay: [100, 100, 100], returnEach: [150, 100, 50] })).toEqual([0, 0, 50]);
  });

  it("but the signed difference keeps 'costs more' apart from 'the same'", async () => {
    const { returnDifference } = await import("./transfer");
    expect(returnDifference({ oneWay: [100, 100, 100], returnEach: [150, 100, 50] })).toEqual([-50, 0, 50]);
  });
});

describe("the reason travels to the email and the owner's alert", () => {
  it("reads the engine's own reason from the booking, never the clock", () => {
    expect(BOOK_ROUTE).toMatch(/\.filter\(\(l\) => l\.farePending\)\.map\(\(l\) => l\.reason \?\? null\)/);
    expect(BOOK_ROUTE).toContain("pendingReason,");
  });

  it("names no single reason when two legs are pending for different ones (review fix)", () => {
    expect(BOOK_ROUTE).toMatch(/const pendingRaw = pendingReasons\.length === 1 \? pendingReasons\[0\] : null;/);
  });
});

describe("drivers see both numbers once a commission exists", () => {
  const base = {
    driverName: "Jean", service: "airport" as const, pickup: "Plaine Corail Airport",
    dropoff: "Port Mathurin", passengers: 2, whenText: "Fri 18:30", acceptUrl: "https://x/r/t",
  };

  it("says 'You earn' once when there is no commission, as before", () => {
    const m = offerMessage({ ...base, price: 230000, customerPays: 230000 });
    expect(m).toContain("You earn: Rs 2,300");
    expect(m).not.toContain("Customer pays");
  });

  it("says what to collect and what to keep when there is", () => {
    const m = offerMessage({ ...base, price: 207000, customerPays: 230000 });
    expect(m).toContain("Customer pays you: Rs 2,300 cash");
    expect(m).toContain("You keep: Rs 2,070");
    expect(m).not.toContain("You earn");
  });

  it("labels the offer screen 'YOU KEEP' with the customer's fare and the commission", () => {
    expect(OFFER_SCREEN).toMatch(/offer\.fare > offer\.price \?/);
    expect(OFFER_SCREEN).toContain("YOU KEEP");
    expect(OFFER_SCREEN).toContain("Roulé commission");
  });
});

describe("a return package's two references sit together on the desk", () => {
  it("names the partner trip by its reference", () => {
    expect(DESK).toMatch(/r\.package_id === ride\.package_id && r\.id !== ride\.id/);
    expect(DESK).toContain("rideReference(partner.id)");
  });
});

describe("Kreol that nobody from the island has read is listed, not hidden", () => {
  const get = (obj: unknown, path: string): unknown =>
    path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);

  it("every flagged path exists in the Kreol dictionary", () => {
    for (const { path } of KREOL_NEEDS_REVIEW) {
      expect(get(RIDES_COPY.cr, path), path).toBeDefined();
    }
  });

  it("a 'French fallback' entry really is the French wording — Kreol was not invented", () => {
    for (const { path, fallback } of KREOL_NEEDS_REVIEW.filter((k) => k.fallback === "fr")) {
      const cr = get(RIDES_COPY.cr, path);
      const fr = get(RIDES_COPY.fr, path);
      const sample = (v: unknown) =>
        typeof v === "function" ? (v as (...a: string[]) => string)("evening", "Rs 300", "17:00–21:59") : v;
      expect(sample(cr), `${path} (${fallback})`).toBe(sample(fr));
    }
  });

  it("covers every airport-transfer string in the Kreol dictionary", () => {
    const listed = new Set(KREOL_NEEDS_REVIEW.map((k) => k.path));
    for (const key of Object.keys(RIDES_COPY.cr.book.transfer)) {
      expect(listed.has(`book.transfer.${key}`), key).toBe(true);
    }
  });
});

// ── The confirmation email says which reason, in both of its languages ──────
const sent: { type: string; html: string }[] = [];
vi.mock("@/lib/email/send", () => ({
  sendTransactionalEmail: async (input: { type: string; html: string }) => {
    sent.push(input);
    return { ok: true };
  },
}));

describe("the confirmation email names the reason a fare is pending", () => {
  const RIDE = {
    reference: "RR-4F2A91", service: "airport" as const, whenKind: "scheduled",
    scheduledAt: "2026-10-02T23:00:00+04:00", pickup: "Plaine Corail Airport", dropoff: "Port Mathurin",
    passengers: 1, luggage: 0, price: null, flightRef: "MK 144", meetGreet: false, notes: null,
    name: "Marie Perrine", phone: "+230 5123 4567", email: "marie@example.com",
    zone: 3, farePending: true,
  };
  beforeEach(() => { sent.length = 0; });

  it("night", async () => {
    const { sendRideEmails } = await import("@/lib/email");
    await sendRideEmails({ ...RIDE, pendingReason: "night" });
    const c = sent.find((s) => s.type === "ride_request_confirmation")!;
    expect(c.html).toContain("Night transfers are priced by hand");
    expect(c.html).toContain("Les transferts de nuit sont tarifés au cas par cas");
    expect(c.html).not.toContain("Evening and night");
    expect(sent.find((s) => s.type === "owner_ride_alert")!.html).toContain("falls in the night window");
  });

  it("a large group is not called night", async () => {
    const { sendRideEmails } = await import("@/lib/email");
    await sendRideEmails({ ...RIDE, pendingReason: "group" });
    const c = sent.find((s) => s.type === "ride_request_confirmation")!;
    expect(c.html).toContain("Transfers for a group this size are confirmed by hand");
    expect(c.html).not.toMatch(/Night transfers|Evening transfers/);
  });
});
