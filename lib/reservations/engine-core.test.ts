import { describe, expect, it } from "vitest";
import {
  PAYMENT_STATUSES,
  RESERVATION_STATUSES,
  RESERVATION_TRANSITIONS,
  TERMINAL,
  TransitionError,
  assertPaymentTransition,
  assertTransition,
  canTransition,
  holdsCapacity,
  isDueToExpire,
} from "./status";
import { generateAccessToken, generateReference, hashToken, isTokenShaped, normalizeReference, REFERENCE_RE, sameHash } from "./reference";
import { computeDue, computeTotal, DEFAULT_POLICIES, formatMur, paymentStatusOnConfirm, resolvePolicy } from "./policy";
import { countdown, hubView } from "./timeline";

// ── The reservation engine's rules, one test per promise ─────────────────────

describe("reservation lifecycle", () => {
  it("rejects going backwards", () => {
    expect(() => assertTransition("confirmed", "requested")).toThrow(TransitionError);
    expect(() => assertTransition("completed", "in_progress")).toThrow(TransitionError);
    expect(() => assertTransition("under_review", "requested")).toThrow(TransitionError);
  });

  it("terminal states go nowhere", () => {
    for (const t of TERMINAL) {
      for (const to of RESERVATION_STATUSES) expect(canTransition(t, to), `${t}→${to}`).toBe(false);
    }
  });

  it("needs_information returns to review, never straight to confirmed", () => {
    expect(() => assertTransition("needs_information", "under_review")).not.toThrow();
    expect(() => assertTransition("needs_information", "confirmed")).toThrow(TransitionError);
  });

  it("a confirmed hold expires only while money is still outstanding", () => {
    expect(() => assertTransition("confirmed", "expired", "payment_pending")).not.toThrow();
    expect(() => assertTransition("confirmed", "expired", "paid")).toThrow(TransitionError);
    expect(() => assertTransition("confirmed", "expired", "pay_in_person")).toThrow(TransitionError);
    expect(() => assertTransition("confirmed", "expired")).toThrow(TransitionError);
  });

  it("every status has a transition entry (no silent gaps)", () => {
    for (const s of RESERVATION_STATUSES) expect(RESERVATION_TRANSITIONS[s]).toBeDefined();
  });

  it("only confirmed-and-later reservations hold capacity", () => {
    expect(holdsCapacity("requested")).toBe(false);
    expect(holdsCapacity("under_review")).toBe(false);
    expect(holdsCapacity("confirmed")).toBe(true);
    expect(holdsCapacity("expired")).toBe(false);
  });
});

describe("money axis", () => {
  it("rejects un-paying", () => {
    expect(() => assertPaymentTransition("paid", "payment_pending")).toThrow(TransitionError);
    expect(() => assertPaymentTransition("paid", "unpaid")).toThrow(TransitionError);
    expect(() => assertPaymentTransition("refunded", "paid")).toThrow(TransitionError);
  });

  it("allows the real paths", () => {
    expect(() => assertPaymentTransition("unpaid", "payment_pending")).not.toThrow();
    expect(() => assertPaymentTransition("payment_pending", "paid")).not.toThrow();
    expect(() => assertPaymentTransition("payment_pending", "unpaid")).not.toThrow(); // deadline rollback
    expect(() => assertPaymentTransition("pay_in_person", "paid")).not.toThrow();
    expect(() => assertPaymentTransition("paid", "refunded")).not.toThrow();
  });

  it("every payment status has an entry", () => {
    for (const s of PAYMENT_STATUSES) expect(() => assertPaymentTransition(s, s)).toThrow(); // self-loops are not moves
  });

  it("confirm never means paid", () => {
    for (const t of Object.keys(DEFAULT_POLICIES) as (keyof typeof DEFAULT_POLICIES)[]) {
      const pol = DEFAULT_POLICIES[t];
      const { deposit_due_mur } = computeDue(pol, 1999);
      expect(paymentStatusOnConfirm(pol, deposit_due_mur), t).not.toBe("paid");
    }
  });
});

describe("the deadline job's rule", () => {
  const now = new Date("2026-10-05T08:00:00Z");
  const past = "2026-10-05T07:59:00Z";
  it("expires a confirmed hold whose payment never came", () => {
    expect(isDueToExpire({ reservation_status: "confirmed", payment_status: "payment_pending", payment_deadline_at: past }, now)).toBe(true);
  });
  it("never touches a paid row, or one paying in person, or one without a deadline", () => {
    expect(isDueToExpire({ reservation_status: "confirmed", payment_status: "paid", payment_deadline_at: past }, now)).toBe(false);
    expect(isDueToExpire({ reservation_status: "confirmed", payment_status: "pay_in_person", payment_deadline_at: past }, now)).toBe(false);
    expect(isDueToExpire({ reservation_status: "confirmed", payment_status: "payment_pending", payment_deadline_at: null }, now)).toBe(false);
    expect(isDueToExpire({ reservation_status: "under_review", payment_status: "unpaid", payment_deadline_at: past }, now)).toBe(false);
  });
});

describe("reference and access token", () => {
  it("references are RR- + 5 Crockford characters without I L O U", () => {
    for (let i = 0; i < 500; i++) {
      const r = generateReference();
      expect(r).toMatch(REFERENCE_RE);
      expect(r.slice(3)).not.toMatch(/[ILOU]/);
    }
  });
  it("forgives how a guest types it", () => {
    expect(normalizeReference("rr 8f42k")).toBe("RR-8F42K");
    expect(normalizeReference("RR-8F4ZK")).toBe("RR-8F4ZK");
    expect(normalizeReference("RR-8FO2K")).toBe("RR-8F02K"); // O → 0
    expect(normalizeReference("nope")).toBeNull();
  });
  it("tokens are 256-bit, stored only as a hash", () => {
    const t = generateAccessToken();
    expect(isTokenShaped(t)).toBe(true);
    const h = hashToken(t);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(t);
    expect(sameHash(h, hashToken(t))).toBe(true);
    expect(sameHash(h, hashToken(generateAccessToken()))).toBe(false);
  });
  it("a reference is not token-shaped, so it can never open a booking", () => {
    expect(isTokenShaped("RR-8F42K")).toBe(false);
  });
});

describe("price and policy", () => {
  const cocos = { unit_mur: 1999, perPerson: true, child_mur: 990, baby_mur: null };
  it("prices a party from the listing: adults, children, free babies", () => {
    expect(computeTotal(cocos, { adults: 2, children: 1, babies: 1 })).toBe(1999 * 2 + 990);
  });
  it("a child with no child price pays the adult price", () => {
    expect(computeTotal({ unit_mur: 1999, perPerson: true }, { adults: 1, children: 1, babies: 0 })).toBe(3998);
  });
  it("per-unit products multiply by days/nights", () => {
    expect(computeTotal({ unit_mur: 699, perPerson: false }, { adults: 1, children: 0, babies: 0 }, 3)).toBe(2097);
  });
  it("no listed price → no total (Roulé quotes on confirm)", () => {
    expect(computeTotal({ unit_mur: null, perPerson: true }, { adults: 2, children: 0, babies: 0 })).toBeNull();
  });
  it("splits deposit and balance by policy", () => {
    expect(computeDue({ ...DEFAULT_POLICIES.stay, deposit_percent: 30 }, 10000)).toEqual({ deposit_due_mur: 3000, balance_due_mur: 7000 });
    expect(computeDue(DEFAULT_POLICIES.experience, 3998)).toEqual({ deposit_due_mur: 3998, balance_due_mur: 0 });
    expect(computeDue({ ...DEFAULT_POLICIES.other, mode: "pay_at_pickup" }, 500)).toEqual({ deposit_due_mur: 0, balance_due_mur: 500 });
  });
  it("a stored policy is filled from the default and clamped", () => {
    const p = resolvePolicy("experience", { deadline_hours: 0, allowed_methods: ["paypal", "stripe" as never] });
    expect(p.deadline_hours).toBe(12);
    expect(p.allowed_methods).toEqual(["paypal"]);
  });
  it("formats rupees the site's way", () => {
    expect(formatMur(1999)).toBe("Rs 1,999");
    expect(formatMur(null)).toBe("—");
  });
});

describe("the guest's timeline", () => {
  const now = new Date("2026-10-04T10:00:00Z");
  const far = new Date("2026-10-10T05:00:00Z");
  const soon = new Date("2026-10-05T05:00:00Z");
  it("a fresh request is being checked", () => {
    expect(hubView({ reservation_status: "requested", payment_status: "unpaid" }, far, now).state).toBe("checking");
  });
  it("confirmed + payment pending asks for payment and is payable", () => {
    const v = hubView({ reservation_status: "confirmed", payment_status: "payment_pending" }, far, now);
    expect(v.state).toBe("pay");
    expect(v.payable).toBe(true);
    expect(v.nodes.map((n) => n.state)).toEqual(["done", "done", "active", "todo"]);
  });
  it("paid: Ready lights up only the day before", () => {
    expect(hubView({ reservation_status: "confirmed", payment_status: "paid" }, far, now).nodes[3].state).toBe("todo");
    expect(hubView({ reservation_status: "confirmed", payment_status: "paid" }, soon, now).nodes[3].state).toBe("active");
  });
  it("declined and expired are calm stops, never payable", () => {
    expect(hubView({ reservation_status: "declined", payment_status: "unpaid" }, far, now).payable).toBe(false);
    expect(hubView({ reservation_status: "expired", payment_status: "unpaid" }, far, now).nodes[2].state).toBe("stopped");
  });
  it("counts down in hours and minutes", () => {
    expect(countdown("2026-10-05T09:42:00Z", now)).toBe("23h 42m");
    expect(countdown("2026-10-04T09:00:00Z", now)).toBeNull();
  });
});
