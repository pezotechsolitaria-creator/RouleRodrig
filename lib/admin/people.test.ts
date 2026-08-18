import { describe, it, expect } from "vitest";
import {
  ACTION_RISK,
  accountStateOf,
  applyFilter,
  computeStats,
  describeAction,
  DEFAULT_FILTER,
  effectiveAvailability,
  filterFromParams,
  isBulkAllowed,
  matchesQuery,
  needsReason,
  paginate,
  paramsFromFilter,
  storeIsOpen,
  storedAccountValue,
  verificationOf,
  canResendInvite,
  missingProfileFields,
  normalizePhone,
  onboardingOf,
  RESEND_COOLDOWN_MS,
  whoseMove,
  type PersonRow,
} from "./people";

// The rules a People & Operations desk cannot get wrong. Every one of these is
// a decision that would otherwise live inside a component, be duplicated in an
// API route, and drift.

const row = (over: Partial<PersonRow> = {}): PersonRow => ({
  id: "1",
  kind: "merchant",
  name: "Chez Banane",
  subtitle: "Marie Louise",
  email: "marie@example.com",
  phone: "+230 5835 5588",
  account: "active",
  verification: "verified",
  segment: "restaurant",
  joinedAt: "2026-01-01T00:00:00Z",
  onboarding: "complete",
  inviteEmail: null,
  invitedAt: null,
  claimed: true,
  ...over,
});

describe("the three states are not the same state", () => {
  it("maps every merchant status onto an account state", () => {
    expect(accountStateOf("merchant", "pending")).toBe("pending");
    expect(accountStateOf("merchant", "approved")).toBe("active");
    expect(accountStateOf("merchant", "suspended")).toBe("suspended");
    expect(accountStateOf("merchant", "rejected")).toBe("deactivated");
  });

  it("maps every driver status, including the two that mean 'gone'", () => {
    expect(accountStateOf("driver", "pending")).toBe("pending");
    expect(accountStateOf("driver", "approved")).toBe("active");
    expect(accountStateOf("driver", "suspended")).toBe("suspended");
    expect(accountStateOf("driver", "rejected")).toBe("deactivated");
    expect(accountStateOf("driver", "inactive")).toBe("deactivated");
  });

  it("treats an UNKNOWN status as pending, never as active", () => {
    // A new enum member nobody has mapped must not hand somebody the platform.
    expect(accountStateOf("merchant", "some_future_state")).toBe("pending");
    expect(accountStateOf("driver", "")).toBe("pending");
    expect(accountStateOf("driver", null)).toBe("pending");
  });

  it("writes back the value the database actually stores", () => {
    expect(storedAccountValue("merchant", "active")).toBe("approved");
    expect(storedAccountValue("merchant", "deactivated")).toBe("rejected");
    // A driver turned off by an admin is `inactive` — "we said no" (rejected)
    // is a different act and must not be recorded as one.
    expect(storedAccountValue("driver", "deactivated")).toBe("inactive");
    expect(storedAccountValue("driver", "suspended")).toBe("suspended");
  });

  it("keeps verification separate, and calls approved KYC 'verified'", () => {
    expect(verificationOf("approved")).toBe("verified");
    expect(verificationOf("in_review")).toBe("in_review");
    expect(verificationOf(null)).toBe("unsubmitted");
    expect(verificationOf("nonsense")).toBe("unsubmitted");
  });
});

describe("a suspended person can never appear available", () => {
  // The brief names this rule twice, which is usually a sign somebody has been
  // burned by it. The columns stay independent in storage so un-suspending
  // restores what they had; the reconciliation happens on the way out.
  it("forces every non-active account offline", () => {
    for (const account of ["pending", "suspended", "deactivated"] as const) {
      expect(effectiveAvailability(account, "available")).toBe("offline");
      expect(effectiveAvailability(account, "busy")).toBe("offline");
    }
  });

  it("lets an active driver be exactly what they stored", () => {
    expect(effectiveAvailability("active", "available")).toBe("available");
    expect(effectiveAvailability("active", "busy")).toBe("busy");
    expect(effectiveAvailability("active", "offline")).toBe("offline");
    expect(effectiveAvailability("active", "garbage")).toBe("offline");
  });

  it("closes every shop of a merchant who may not trade", () => {
    expect(storeIsOpen("active", "active")).toBe(true);
    expect(storeIsOpen("suspended", "active")).toBe(false);
    expect(storeIsOpen("pending", "active")).toBe(false);
    // And an active merchant whose shop is simply shut stays shut.
    expect(storeIsOpen("active", "paused")).toBe(false);
    expect(storeIsOpen("active", "holiday")).toBe(false);
  });
});

describe("how hard an action is to perform", () => {
  it("puts suspend and deactivate above a single click", () => {
    expect(ACTION_RISK.suspend).toBe("high");
    expect(ACTION_RISK.deactivate).toBe("high");
    expect(needsReason("suspend")).toBe(true);
    expect(needsReason("deactivate")).toBe(true);
  });

  it("keeps switching somebody ON cheap, because it is reversible", () => {
    expect(ACTION_RISK.activate).toBe("low");
    expect(needsReason("activate")).toBe(false);
  });

  it("REFUSES to delete in bulk, whatever is asked for", () => {
    // The one action with no undo. This is the server-side enforcement, so a
    // crafted request cannot route around the UI that hides the button.
    expect(isBulkAllowed("delete")).toBe(false);
    expect(isBulkAllowed("drop_everything")).toBe(false);
    expect(ACTION_RISK.delete).toBe("destructive");
  });

  it("allows exactly the four reversible bulk actions", () => {
    for (const a of ["activate", "suspend", "deactivate", "verify"]) {
      expect(isBulkAllowed(a)).toBe(true);
    }
  });

  it("says what will happen, and counts the people it will happen to", () => {
    const one = describeAction("suspend", "merchant", 1);
    expect(one.title).toContain("this merchant");
    const many = describeAction("suspend", "merchant", 8);
    expect(many.title).toContain("8 merchants");
    // The consequence an operator actually needs: existing orders survive.
    expect(many.body).toMatch(/NOT cancelled/);
  });

  it("warns that suspending a driver leaves an assigned delivery assigned", () => {
    expect(describeAction("suspend", "driver", 1).body).toMatch(/stays assigned/);
  });
});

describe("search", () => {
  it("finds a merchant by name, owner or email", () => {
    expect(matchesQuery(row(), "banane")).toBe(true);
    expect(matchesQuery(row(), "marie")).toBe(true);
    expect(matchesQuery(row(), "MARIE@EXAMPLE")).toBe(true);
    expect(matchesQuery(row(), "zzz")).toBe(false);
  });

  it("finds a phone however it was typed", () => {
    // The stored number is formatted; the operator types what is on the screen
    // in front of them, which is rarely the same string.
    expect(matchesQuery(row(), "58355588")).toBe(true);
    expect(matchesQuery(row(), "+230 5835")).toBe(true);
    expect(matchesQuery(row(), "5835-5588")).toBe(true);
  });

  it("does not match a one-digit query against every phone on the platform", () => {
    expect(matchesQuery(row(), "5")).toBe(false);
  });

  it("returns everything for an empty query", () => {
    expect(matchesQuery(row(), "   ")).toBe(true);
  });
});

describe("filtering and sorting", () => {
  const rows = [
    row({ id: "a", name: "Alpha", account: "active", joinedAt: "2026-01-01T00:00:00Z" }),
    row({ id: "b", name: "Bravo", account: "suspended", joinedAt: "2026-03-01T00:00:00Z" }),
    row({ id: "c", name: "Charlie", account: "pending", verification: "submitted", joinedAt: "2026-02-01T00:00:00Z" }),
  ];

  it("filters by account state", () => {
    expect(applyFilter(rows, { ...DEFAULT_FILTER, account: "suspended" }).map((r) => r.id)).toEqual(["b"]);
  });

  it("filters by verification independently of the account", () => {
    const got = applyFilter(rows, { ...DEFAULT_FILTER, verification: "submitted" });
    expect(got.map((r) => r.id)).toEqual(["c"]);
  });

  it("sorts newest first by default, and oldest or by name on request", () => {
    expect(applyFilter(rows, DEFAULT_FILTER).map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(applyFilter(rows, { ...DEFAULT_FILTER, sort: "oldest" }).map((r) => r.id)).toEqual(["a", "c", "b"]);
    expect(applyFilter(rows, { ...DEFAULT_FILTER, sort: "name" }).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("filters drivers by availability", () => {
    const drivers = [
      row({ id: "d1", kind: "driver", availability: "available" }),
      row({ id: "d2", kind: "driver", availability: "offline" }),
    ];
    expect(applyFilter(drivers, { ...DEFAULT_FILTER, availability: "available" }).map((r) => r.id)).toEqual(["d1"]);
  });
});

describe("the URL is the state", () => {
  it("survives a round trip", () => {
    const f = { ...DEFAULT_FILTER, q: "marie", account: "suspended" as const, sort: "name" as const, page: 3 };
    expect(filterFromParams(paramsFromFilter(f))).toEqual(f);
  });

  it("omits defaults so a shared link stays short", () => {
    expect(paramsFromFilter(DEFAULT_FILTER).toString()).toBe("");
  });

  it("shows a list rather than an error for a hand-edited URL", () => {
    const f = filterFromParams(new URLSearchParams("account=banana&sort=sideways&page=-4"));
    expect(f.account).toBe("all");
    expect(f.sort).toBe("recent");
    expect(f.page).toBe(1);
  });

  it("refuses an absurd page number rather than paging forever", () => {
    expect(filterFromParams(new URLSearchParams("page=999999")).page).toBe(500);
  });
});

describe("paging", () => {
  const rows = Array.from({ length: 60 }, (_, i) => row({ id: String(i) }));

  it("cuts the list into pages", () => {
    expect(paginate(rows, 1).slice).toHaveLength(25);
    expect(paginate(rows, 3).slice).toHaveLength(10);
    expect(paginate(rows, 1).pages).toBe(3);
  });

  it("clamps a page past the end back onto the last one", () => {
    expect(paginate(rows, 99).slice.map((r) => r.id)).toEqual(paginate(rows, 3).slice.map((r) => r.id));
  });

  it("reports one page for an empty list, not zero", () => {
    expect(paginate([], 1).pages).toBe(1);
  });
});

describe("the counters", () => {
  it("counts real rows, and counts verification separately from the account", () => {
    const rows = [
      row({ account: "active", verification: "verified", storesOpen: 2 }),
      row({ account: "active", verification: "submitted", storesOpen: 0 }),
      row({ account: "suspended", verification: "in_review" }),
      row({ account: "pending", verification: "unsubmitted" }),
    ];
    const s = computeStats(rows, "merchant");
    expect(s.total).toBe(4);
    expect(s.active).toBe(2);
    expect(s.suspended).toBe(1);
    expect(s.pending).toBe(1);
    // Submitted AND in review are both waiting on a human.
    expect(s.awaitingVerification).toBe(2);
    expect(s.shopsOpen).toBe(2);
  });

  it("counts drivers by what they are really doing", () => {
    const drivers = [
      row({ kind: "driver", account: "active", availability: "available" }),
      row({ kind: "driver", account: "active", availability: "busy" }),
      // Suspended: whatever they stored, they are offline — see the rule above.
      row({ kind: "driver", account: "suspended", availability: "offline" }),
    ];
    const s = computeStats(drivers, "driver");
    expect(s.online).toBe(1);
    expect(s.busy).toBe(1);
    expect(s.shopsOpen).toBeUndefined();
  });
});

// ── Admin-assisted onboarding ───────────────────────────────────────
//
// Some of the people who sell and deliver here will not fill in a sign-up form,
// so an admin creates the account for them. What follows is the set of rules
// that keeps "created for them" from becoming "controlled by us".

describe("the onboarding ladder is not the account state", () => {
  it("puts an unclaimed invitation on the first rung", () => {
    expect(
      onboardingOf({
        claimed: false,
        inviteEmail: "marie@example.com",
        profileComplete: true,
        verification: "unsubmitted",
      }),
    ).toBe("invited");
  });

  it("moves them off it the moment they sign in — while the account is STILL pending", () => {
    // This is the whole reason the ladder is separate. The account state has
    // not changed and must not: an admin still has to approve them. What
    // changed is whose move it is.
    const state = onboardingOf({
      claimed: true,
      inviteEmail: "marie@example.com",
      profileComplete: true,
      verification: "unsubmitted",
    });
    expect(state).toBe("activated");
    expect(whoseMove(state)).toBe("us");
    expect(whoseMove("invited")).toBe("them");
  });

  it("says incomplete when they own it but have not filled it in", () => {
    expect(
      onboardingOf({
        claimed: true,
        inviteEmail: "marie@example.com",
        profileComplete: false,
        verification: "unsubmitted",
      }),
    ).toBe("incomplete");
  });

  it("hands it back to us once documents are in, and finishes at verified", () => {
    const base = { claimed: true, inviteEmail: null, profileComplete: true } as const;
    expect(onboardingOf({ ...base, verification: "submitted" })).toBe("awaiting_verification");
    expect(onboardingOf({ ...base, verification: "in_review" })).toBe("awaiting_verification");
    expect(onboardingOf({ ...base, verification: "verified" })).toBe("complete");
    expect(whoseMove("complete")).toBe("nobody");
  });

  it("never puts a self-service signup on the invited rung", () => {
    // Nobody invited them, so "waiting for them to accept" is meaningless.
    expect(
      onboardingOf({
        claimed: true,
        inviteEmail: null,
        profileComplete: true,
        verification: "unsubmitted",
      }),
    ).toBe("activated");
  });

  it("counts who is still to turn up, separately from who is still to be checked", () => {
    const rows = [
      row({ id: "a", onboarding: "invited", claimed: false, account: "pending" }),
      row({ id: "b", onboarding: "invited", claimed: false, account: "pending" }),
      row({ id: "c", onboarding: "awaiting_verification", verification: "submitted" }),
      row({ id: "d" }),
    ];
    const s = computeStats(rows, "merchant");
    expect(s.awaitingActivation).toBe(2);
    expect(s.awaitingVerification).toBe(1);
  });

  it("filters by it, and survives a hand-edited URL", () => {
    const rows = [row({ id: "a", onboarding: "invited" }), row({ id: "b" })];
    expect(applyFilter(rows, { ...DEFAULT_FILTER, onboarding: "invited" }).map((r) => r.id)).toEqual(["a"]);
    expect(filterFromParams({ onboarding: "nonsense" }).onboarding).toBe("all");
    expect(paramsFromFilter({ ...DEFAULT_FILTER, onboarding: "invited" }).get("onboarding")).toBe("invited");
  });
});

describe("a local phone number reaches the database in E.164", () => {
  // delivery_drivers.phone is CHECKed against ^\+[1-9][0-9]{6,15}$. Without
  // this, an admin typing a number the way it is written on the island gets a
  // bare 23514 they cannot act on. M108's live assertion hit exactly that.
  it("adds the country code to a local number, however it is spaced", () => {
    expect(normalizePhone("5835 5588")).toBe("+23058355588");
    expect(normalizePhone("58-35-55-88")).toBe("+23058355588");
    expect(normalizePhone(" (5835) 5588 ")).toBe("+23058355588");
  });

  it("respects a number that already carries a country code", () => {
    expect(normalizePhone("+230 5835 5588")).toBe("+23058355588");
    expect(normalizePhone("0033 6 12 34 56 78")).toBe("+33612345678");
    expect(normalizePhone("+33 6 12 34 56 78")).toBe("+33612345678");
  });

  it("refuses what the constraint would refuse, rather than passing it on", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("   ")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("12")).toBeNull();
    expect(normalizePhone("+0123456789")).toBeNull();
    expect(normalizePhone("+1234567890123456789")).toBeNull();
  });
});

describe("resending an invitation", () => {
  const invited = {
    claimed: false,
    inviteEmail: "marie@example.com",
    invitedAt: "2026-08-18T10:00:00Z",
  };
  const at = (iso: string) => Date.parse(iso);

  it("is refused inside the cooldown, and allowed after it", () => {
    expect(canResendInvite(invited, at("2026-08-18T10:01:00Z")).ok).toBe(false);
    expect(canResendInvite(invited, at("2026-08-18T10:01:00Z")).waitMs).toBe(RESEND_COOLDOWN_MS - 60_000);
    expect(canResendInvite(invited, at("2026-08-18T10:06:00Z")).ok).toBe(true);
  });

  it("is refused once they have signed in, because there is nothing left to claim", () => {
    expect(canResendInvite({ ...invited, claimed: true }, at("2026-09-01T00:00:00Z")).ok).toBe(false);
  });

  it("is refused for somebody who was never invited", () => {
    expect(canResendInvite({ claimed: true, inviteEmail: null, invitedAt: null }).ok).toBe(false);
  });

  it("is allowed when the timestamp is missing rather than blocked forever", () => {
    // An invitation with no invited_at is old or was written by hand. Refusing
    // to ever resend it would strand the person with no way through.
    expect(canResendInvite({ ...invited, invitedAt: null }).ok).toBe(true);
  });
});

describe("what is still missing is listed, not summarised", () => {
  it("names the fields so the panel can say which", () => {
    expect(missingProfileFields("driver", { email: "a@b.co", phone: "", segment: "scooter" })).toEqual([
      "Phone number",
    ]);
    expect(missingProfileFields("driver", { email: "", phone: "", segment: "" })).toEqual([
      "Email address",
      "Phone number",
      "Vehicle type",
    ]);
    expect(missingProfileFields("merchant", { email: "a@b.co", phone: "+230", segment: "cafe" })).toEqual([]);
  });
});

describe("the invitation never becomes a second way to be active", () => {
  it("keeps an invited driver offline even if the column says otherwise", () => {
    // Belt and braces with admin_invite_driver, which writes 'offline'. If a
    // stray write ever set availability on a pending driver, dispatch still
    // must not see them.
    expect(effectiveAvailability("pending", "available")).toBe("offline");
  });

  it("does not let resend_invite into a bulk run", () => {
    // Low risk per person, but a bulk resend is a way to mail everybody at
    // once, which is spam with an admin cookie in front of it.
    expect(isBulkAllowed("resend_invite")).toBe(false);
    expect(ACTION_RISK.resend_invite).toBe("low");
    expect(needsReason("resend_invite")).toBe(false);
  });
});
