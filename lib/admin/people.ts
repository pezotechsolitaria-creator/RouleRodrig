// Pure decisions for the People & Operations desk. No database, no React, no
// Node — so every rule below is testable without either, and the API route and
// the screen can share one implementation instead of agreeing by accident.
//
// ── THE THREE THINGS THAT ARE NOT THE SAME THING ────────────────────────────
//
// A marketplace ops tool gets this wrong once and never recovers, because the
// three states answer three different questions and get collapsed into one
// "status" column the moment somebody is in a hurry:
//
//   ACCOUNT     May this person be on the platform at all?
//               pending · active · suspended · deactivated
//   VERIFICATION Have we checked they are who they say they are?
//               unsubmitted · submitted · in review · verified · rejected
//   OPERATIONAL Are they trading / driving RIGHT NOW?
//               a shop is open or closed · a driver is offline, available, busy
//
// They are genuinely independent. "Active + verified + shop closed" is a
// merchant on holiday. "Active + unverified + open" is a shop trading while its
// papers are still being read. Both are real, and a single status enum can
// express neither.
//
// This project already models all three in the database — merchants.status /
// merchants.kyc_status / stores.status, and delivery_drivers.status /
// .availability — so nothing here invents a new vocabulary. What it does is
// name the shared shape so one screen can show both kinds of person, and pin
// the mapping in tests so a future enum value cannot silently land in the wrong
// column.

/**
 * ── WHO OPERATES ON THIS PLATFORM ──────────────────────────────────────────
 *
 * The desk covered merchants and delivery partners. Five event organisers and
 * two kitchens were operating on the platform and appeared on it NOWHERE — an
 * ops desk that cannot see seven of the people using it is not an ops desk.
 *
 * These four are exactly the groups with their own table and their own row
 * today. TAXI and ERRANDS are deliberately NOT members: they are CAPABILITIES a
 * delivery partner holds (delivery_drivers.can_deliver, .can_run_errands), not
 * separate people, and splitting them into kinds would list the same human
 * twice and let an admin approve one half of them. They are surfaced as chips
 * on the driver instead — see capabilitiesOf().
 *
 * SERVICE PROVIDERS arrived with trade_providers (m177). They were excluded
 * while that table did not exist — a kind whose query returns nothing teaches
 * an admin the desk is broken — and the moment it did, the exclusion became the
 * lie instead.
 */
export type PersonKind = "merchant" | "driver" | "kitchen" | "organizer" | "service";

/** Every kind, in the order the desk lists them. */
export const PERSON_KINDS: PersonKind[] = [
  "merchant",
  "kitchen",
  "service",
  "driver",
  "organizer",
];

export const KIND_LABEL: Record<PersonKind, { one: string; many: string }> = {
  merchant: { one: "Shop", many: "Shops" },
  kitchen: { one: "Restaurant", many: "Restaurants" },
  driver: { one: "Delivery partner", many: "Delivery partners" },
  organizer: { one: "Event organiser", many: "Event organisers" },
  service: { one: "Service provider", many: "Service providers" },
};

/** What the `segment` column means for each kind, in the admin's words. */
export const SEGMENT_LABEL: Record<PersonKind, string> = {
  merchant: "Category",
  kitchen: "Collection point",
  driver: "Vehicle",
  organizer: "Organiser",
  service: "Trade",
};

/**
 * What a delivery partner is actually cleared to do.
 *
 * Capabilities, not kinds. One person can deliver parcels AND run errands, and
 * on this island usually does — so they are chips on one row rather than two
 * rows that can drift out of step.
 */
export function capabilitiesOf(row: {
  canDeliver?: boolean | null;
  canRunErrands?: boolean | null;
}): string[] {
  const out: string[] = [];
  if (row.canDeliver) out.push("Deliveries");
  if (row.canRunErrands) out.push("Errands");
  return out;
}

/**
 * How far through joining are they, and WHOSE MOVE IS IT?
 *
 * ── WHY THIS IS NOT A FOURTH VALUE OF `AccountState` ──────────────────
 * It was tempting: "invited" looks like it belongs next to "pending". It does
 * not, and the reason is the one that keeps the other three apart — it answers
 * a different question. Account state answers "may they be here?". This answers
 * "what is outstanding, and who is holding it up?".
 *
 * They vary independently. An invited merchant is `pending` + `invited`. The
 * moment they sign in they are still `pending` — an admin has not approved them
 * yet — but they are `activated`, and the desk’s next action just changed from
 * "chase them" to "review them". Collapsing the two loses exactly that.
 *
 * The ladder is ordered, and every rung is a different person’s move:
 *
 *   invited               we sent it; waiting on THEM to sign up
 *   activated             they signed in; the account is theirs now
 *   incomplete            theirs, but required details are still missing
 *   awaiting_verification details in, documents waiting on US
 *   complete              nothing outstanding
 *
 * Somebody who signed themselves up never sits at `invited`; they join the
 * ladder at `activated`, which is why this is derived and never stored.
 */
export type OnboardingState =
  | "invited"
  | "activated"
  | "incomplete"
  | "awaiting_verification"
  | "complete";

/** May this person be on the platform at all? */
export type AccountState = "pending" | "active" | "suspended" | "deactivated";

/** Have we checked who they are? */
export type VerificationState =
  | "unsubmitted"
  | "submitted"
  | "in_review"
  | "verified"
  | "rejected";

/** Are they working right now? Merchants trade, drivers drive. */
export type OperationalState = "open" | "closed" | "offline" | "available" | "busy";

// ── Mapping the stored enums onto the shared shape ──────────────────────────
//
// `rejected` and `inactive` both mean "not on the platform, not coming back
// without an admin acting" — which is what deactivated means here. They stay
// distinct in the DATABASE because rejected carries "we said no" and inactive
// carries "they stopped", and losing that would lose a reason.

const MERCHANT_ACCOUNT: Record<string, AccountState> = {
  pending: "pending",
  approved: "active",
  suspended: "suspended",
  rejected: "deactivated",
};

const DRIVER_ACCOUNT: Record<string, AccountState> = {
  pending: "pending",
  approved: "active",
  suspended: "suspended",
  rejected: "deactivated",
  inactive: "deactivated",
};

export function accountStateOf(kind: PersonKind, stored: string | null | undefined): AccountState {
  const table = kind === "merchant" ? MERCHANT_ACCOUNT : DRIVER_ACCOUNT;
  // An unknown value is treated as pending, never as active. A new enum member
  // nobody has mapped yet must not grant somebody the run of the platform.
  return table[(stored ?? "").trim()] ?? "pending";
}

/** The stored value to write for a requested account state. */
export function storedAccountValue(kind: PersonKind, next: AccountState): string {
  if (next === "active") return "approved";
  if (next === "suspended") return "suspended";
  if (next === "pending") return "pending";
  // Drivers distinguish "we said no" (rejected) from "they stopped" (inactive).
  // Deactivating from the desk is the second: an admin turning somebody off is
  // not the same act as refusing their application.
  return kind === "driver" ? "inactive" : "rejected";
}

const KYC: Record<string, VerificationState> = {
  unsubmitted: "unsubmitted",
  submitted: "submitted",
  in_review: "in_review",
  approved: "verified",
  rejected: "rejected",
};

export function verificationOf(stored: string | null | undefined): VerificationState {
  return KYC[(stored ?? "").trim()] ?? "unsubmitted";
}

/**
 * What a driver's availability ACTUALLY is, given their account.
 *
 * ── THE ONE RULE THE BRIEF NAMES TWICE ────────────────────────────────────
 * "A suspended person can never appear available." The two columns are
 * independent in storage — a suspended driver keeps whatever availability they
 * last set — and that is correct, because un-suspending them should restore
 * what they had rather than silently knock them offline.
 *
 * So the reconciliation belongs at the point of DISPLAY and DISPATCH, not in
 * the write. Every screen and every query must go through here rather than
 * reading the column, which is why it is a function and not a comment.
 */
export function effectiveAvailability(
  account: AccountState,
  stored: string | null | undefined,
): "offline" | "available" | "busy" {
  if (account !== "active") return "offline";
  const v = (stored ?? "").trim();
  return v === "available" || v === "busy" ? v : "offline";
}

/** A shop is open only if its merchant may trade AND the shop itself is live. */
export function storeIsOpen(account: AccountState, storeStatus: string | null | undefined): boolean {
  if (account !== "active") return false;
  return (storeStatus ?? "").trim() === "active";
}

// ── Actions, and how hard each one should be to perform ─────────────────────
//
// The brief's confirmation hierarchy, as data rather than as a convention
// somebody remembers. A screen reads `risk` and picks its modal; it cannot
// accidentally offer a one-click suspend, because the level travels with the
// action.

export type PeopleAction =
  | "resend_invite"
  | "activate"
  | "suspend"
  | "deactivate"
  | "verify"
  | "reject_verification"
  | "delete";

export type Risk = "low" | "medium" | "high" | "destructive";

export const ACTION_RISK: Record<PeopleAction, Risk> = {
  // Sending an email again costs nothing and un-sticks the commonest problem in
  // admin-assisted onboarding: the invitation went to spam.
  resend_invite: "low",
  // Turning somebody ON is recoverable by turning them off again.
  activate: "low",
  verify: "low",
  // Reversible, but somebody stops earning the moment it lands.
  suspend: "high",
  reject_verification: "medium",
  // Reversible in the database, but it reads as "you are finished here".
  deactivate: "high",
  // Not reversible at all.
  delete: "destructive",
};

/** Which actions may be applied to many people at once. */
export const BULK_ACTIONS: PeopleAction[] = [
  "activate",
  "suspend",
  "deactivate",
  "verify",
];

/**
 * Never in bulk, whatever a caller asks for.
 *
 * Deleting is the one action with no undo, and a bulk delete is the shape of
 * mistake that ends a marketplace. The brief says so; this is the enforcement,
 * called on the SERVER so a crafted request cannot route around the UI.
 */
export function isBulkAllowed(action: string): action is PeopleAction {
  return (BULK_ACTIONS as string[]).includes(action);
}

/** Does this action need a written reason before it may proceed? */
export function needsReason(action: PeopleAction): boolean {
  return ACTION_RISK[action] === "high";
}

/**
 * What the operator is about to do, in a sentence, before they do it.
 *
 * Written here rather than in the modal so the same words appear in the bulk
 * preview, the single-row confirmation and the audit entry — three places that
 * otherwise drift until they describe three different actions.
 */
export function describeAction(
  action: PeopleAction,
  kind: PersonKind,
  count: number,
): { title: string; body: string } {
  const who =
    count === 1
      ? kind === "merchant"
        ? "this merchant"
        : "this delivery partner"
      : `${count} ${kind === "merchant" ? "merchants" : "delivery partners"}`;

  switch (action) {
    case "resend_invite":
      return {
        title: `Send the invitation to ${who} again?`,
        body: "Same link, same address. Nothing about their account changes.",
      };
    case "activate":
      return {
        title: `Activate ${who}?`,
        body:
          kind === "merchant"
            ? "They will be able to sign in, and their shops can go back on sale."
            : "They will be able to sign in and go online for deliveries.",
      };
    case "suspend":
      return {
        title: `Suspend ${who}?`,
        body:
          kind === "merchant"
            ? "Sign-in stops and every shop comes off the site immediately. Orders already placed are NOT cancelled — settle them from the orders desk."
            : "Sign-in stops and they go offline at once. Any delivery already assigned stays assigned — reassign it from the deliveries desk before suspending if it is in progress.",
      };
    case "deactivate":
      return {
        title: `Deactivate ${who}?`,
        body:
          "They come off the platform and stay off until somebody activates them again. Nothing is deleted, and their history remains.",
      };
    case "verify":
      return {
        title: `Mark ${who} as verified?`,
        body: "Records that their documents have been checked. It does not change whether they are active.",
      };
    case "reject_verification":
      return {
        title: `Reject the documents for ${who}?`,
        body: "They will need to submit again. Their account status is untouched.",
      };
    case "delete":
      return {
        title: `Permanently delete ${who}?`,
        body: "This cannot be undone.",
      };
  }
}

/**
 * The exact words an operator must type to authorise an action, or null.
 *
 * Only the destructive tier asks for this, and it asks for the ENTITY'S OWN
 * NAME rather than a generic "DELETE". Typing a word you were given proves you
 * can read; typing the name of the thing in front of you proves you meant that
 * one and not the row above it.
 */
export function confirmWordFor(action: PeopleAction, entityName?: string): string | null {
  if (ACTION_RISK[action] !== "destructive") return null;
  const name = (entityName ?? "").trim();
  return name || "DELETE";
}

// ── Search, filter, sort ────────────────────────────────────────────────────

export type PeopleFilter = {
  q: string;
  account: AccountState | "all";
  verification: VerificationState | "all";
  /** Merchants: a category hint. Drivers: a vehicle type. */
  segment: string | "all";
  /** Drivers only. */
  availability: "all" | "offline" | "available" | "busy";
  /** Where they are on the joining ladder. */
  onboarding: OnboardingState | "all";
  sort: "recent" | "name" | "oldest";
  page: number;
};

export const DEFAULT_FILTER: PeopleFilter = {
  q: "",
  account: "all",
  verification: "all",
  segment: "all",
  availability: "all",
  onboarding: "all",
  sort: "recent",
  page: 1,
};

export const PAGE_SIZE = 25;

/**
 * Read a filter out of URL search params.
 *
 * The URL is the state, so a filtered view can be shared, bookmarked and
 * survives a reload — which is the difference between an ops tool and a demo.
 * Unknown values fall back to the default rather than throwing: a hand-edited
 * URL should show a list, not an error page.
 */
export function filterFromParams(params: URLSearchParams | Record<string, string | undefined>): PeopleFilter {
  const get = (k: string): string =>
    (params instanceof URLSearchParams ? params.get(k) : params[k]) ?? "";
  const oneOf = <T extends string>(v: string, allowed: readonly T[], fallback: T): T =>
    (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

  const page = Number.parseInt(get("page"), 10);
  return {
    q: get("q").slice(0, 120),
    account: oneOf(get("account"), ["all", "pending", "active", "suspended", "deactivated"] as const, "all"),
    verification: oneOf(
      get("verification"),
      ["all", "unsubmitted", "submitted", "in_review", "verified", "rejected"] as const,
      "all",
    ),
    segment: get("segment").trim() || "all",
    availability: oneOf(get("availability"), ["all", "offline", "available", "busy"] as const, "all"),
    onboarding: oneOf(
      get("onboarding"),
      ["all", "invited", "activated", "incomplete", "awaiting_verification", "complete"] as const,
      "all",
    ),
    sort: oneOf(get("sort"), ["recent", "name", "oldest"] as const, "recent"),
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 500) : 1,
  };
}

/** The inverse, for building a link. Defaults are omitted so URLs stay short. */
export function paramsFromFilter(f: PeopleFilter): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.account !== "all") p.set("account", f.account);
  if (f.verification !== "all") p.set("verification", f.verification);
  if (f.segment !== "all") p.set("segment", f.segment);
  if (f.availability !== "all") p.set("availability", f.availability);
  if (f.onboarding !== "all") p.set("onboarding", f.onboarding);
  if (f.sort !== "recent") p.set("sort", f.sort);
  if (f.page > 1) p.set("page", String(f.page));
  return p;
}

/** One row of either kind, as the desk sees it. */
export type PersonRow = {
  id: string;
  kind: PersonKind;
  name: string;
  /** Owner name for a merchant; blank for a driver, who IS the person. */
  subtitle: string;
  email: string;
  phone: string;
  account: AccountState;
  verification: VerificationState;
  /** Merchants: category hint. Drivers: vehicle type. */
  segment: string;
  /** Drivers only — already reconciled with the account state. */
  availability?: "offline" | "available" | "busy";
  /** Merchants only. */
  storesOpen?: number;
  storesTotal?: number;
  joinedAt: string;
  /** Where they are on the joining ladder. Derived, never stored. */
  onboarding: OnboardingState;
  /**
   * The address an admin invited them at, or null if they signed themselves up.
   * Its presence is what tells an assisted account from a self-service one, and
   * it stops being the way in the moment `claimed` is true.
   */
  inviteEmail: string | null;
  invitedAt: string | null;
  /** Has a real person signed in and taken ownership of this row? */
  claimed: boolean;
};

const norm = (s: string) => s.toLowerCase().trim();

/** Does this row match the free-text box? Name, owner, email and phone. */
export function matchesQuery(row: PersonRow, q: string): boolean {
  const needle = norm(q);
  if (!needle) return true;
  // Digits only for a phone, so "+230 5835 5588" finds "58355588".
  const digits = needle.replace(/\D/g, "");
  const phone = row.phone.replace(/\D/g, "");
  return (
    norm(row.name).includes(needle) ||
    norm(row.subtitle).includes(needle) ||
    norm(row.email).includes(needle) ||
    (digits.length >= 3 && phone.includes(digits))
  );
}

export function applyFilter(rows: PersonRow[], f: PeopleFilter): PersonRow[] {
  const kept = rows.filter((r) => {
    if (!matchesQuery(r, f.q)) return false;
    if (f.account !== "all" && r.account !== f.account) return false;
    if (f.verification !== "all" && r.verification !== f.verification) return false;
    if (f.segment !== "all" && norm(r.segment) !== norm(f.segment)) return false;
    if (f.availability !== "all" && (r.availability ?? "offline") !== f.availability) return false;
    if (f.onboarding !== "all" && r.onboarding !== f.onboarding) return false;
    return true;
  });

  const sorted = [...kept].sort((a, b) => {
    if (f.sort === "name") return a.name.localeCompare(b.name);
    const at = Date.parse(a.joinedAt) || 0;
    const bt = Date.parse(b.joinedAt) || 0;
    return f.sort === "oldest" ? at - bt : bt - at;
  });
  return sorted;
}

export function paginate<T>(rows: T[], page: number, size = PAGE_SIZE): { slice: T[]; pages: number } {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const safe = Math.min(Math.max(1, page), pages);
  return { slice: rows.slice((safe - 1) * size, safe * size), pages };
}

/**
 * The counters above the table.
 *
 * ── ONLY WHAT IS REALLY KNOWN ─────────────────────────────────────────────
 * Every number here is a count of rows the desk is already holding. Nothing is
 * estimated, and nothing is shown as 0 when the truth is "not measured" — the
 * screen renders "—" for that, which is why these are numbers and never
 * defaults.
 */
export type PeopleStats = {
  total: number;
  active: number;
  pending: number;
  suspended: number;
  deactivated: number;
  awaitingVerification: number;
  /** Invited by an admin and not yet signed in. */
  awaitingActivation: number;
  /** Drivers only. */
  online?: number;
  busy?: number;
  /** Merchants only. */
  shopsOpen?: number;
};

export function computeStats(rows: PersonRow[], kind: PersonKind): PeopleStats {
  const base: PeopleStats = {
    total: rows.length,
    active: rows.filter((r) => r.account === "active").length,
    pending: rows.filter((r) => r.account === "pending").length,
    suspended: rows.filter((r) => r.account === "suspended").length,
    deactivated: rows.filter((r) => r.account === "deactivated").length,
    awaitingVerification: rows.filter(
      (r) => r.verification === "submitted" || r.verification === "in_review",
    ).length,
    // The number an assisted-onboarding desk actually runs on: people we invited
    // who have not turned up yet, and whom nobody chases unless it is on screen.
    awaitingActivation: rows.filter((r) => r.onboarding === "invited").length,
  };
  if (kind === "driver") {
    return {
      ...base,
      online: rows.filter((r) => r.availability === "available").length,
      busy: rows.filter((r) => r.availability === "busy").length,
    };
  }
  return { ...base, shopsOpen: rows.reduce((n, r) => n + (r.storesOpen ?? 0), 0) };
}

// ── Labels ──────────────────────────────────────────────────────────────────

export const ACCOUNT_LABEL: Record<AccountState, string> = {
  pending: "Pending",
  active: "Active",
  suspended: "Suspended",
  deactivated: "Deactivated",
};

export const VERIFICATION_LABEL: Record<VerificationState, string> = {
  unsubmitted: "No documents",
  submitted: "Submitted",
  in_review: "In review",
  verified: "Verified",
  rejected: "Rejected",
};

export const ONBOARDING_LABEL: Record<OnboardingState, string> = {
  invited: "Invitation sent",
  activated: "Signed in",
  incomplete: "Profile incomplete",
  awaiting_verification: "Awaiting verification",
  complete: "Complete",
};

/**
 * Whose move is it? The desk sorts its day by this.
 *
 * "them" means chasing is the only thing available; "us" means somebody here
 * has work to do. Showing it stops an operator reading "Invitation sent" as a
 * task and mailing the same person for the fourth time.
 */
export function whoseMove(state: OnboardingState): "them" | "us" | "nobody" {
  if (state === "invited" || state === "incomplete") return "them";
  if (state === "activated" || state === "awaiting_verification") return "us";
  return "nobody";
}

export const AVAILABILITY_LABEL: Record<"offline" | "available" | "busy", string> = {
  offline: "Offline",
  available: "Online",
  busy: "On a delivery",
};

// ── Admin-assisted onboarding ───────────────────────────────────────
//
// Not everybody who sells or delivers here is comfortable with a sign-up form.
// So an admin can create the account FOR them — and then it is theirs: the
// invitation is claimed by email on first sign-in, and no password is ever
// generated, seen, or transmitted by anybody at Roulé Rodrigues.
//
// That is not a new mechanism. It is the one the kitchen and the event door
// already run on (admin_add_kitchen_staff + claim_kitchen_invites,
// admin_invite_organizer + claim_organizer_invite). What follows is only the
// decisions around it that belong neither in SQL nor in a component.

/**
 * Where are they on the ladder?
 *
 * Derived from what the row already says, in ONE place, so the list badge, the
 * detail panel and the "who needs chasing" counter cannot drift apart.
 */
export function onboardingOf(input: {
  claimed: boolean;
  inviteEmail: string | null | undefined;
  profileComplete: boolean;
  verification: VerificationState;
}): OnboardingState {
  // The only rung that is about the invitation rather than the person’s own
  // progress: we have written the row, and nobody has come to collect it.
  if (!input.claimed) return (input.inviteEmail ?? "").trim() ? "invited" : "incomplete";
  if (!input.profileComplete) return "incomplete";
  if (input.verification === "verified") return "complete";
  if (input.verification === "submitted" || input.verification === "in_review") {
    return "awaiting_verification";
  }
  // Signed in, details filled, nothing submitted to check yet.
  return "activated";
}

/**
 * E.164, or null.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────
 * delivery_drivers.phone is CHECKed against ^\+[1-9][0-9]{6,15}$. Someone here
 * who types their number the way everyone on the island writes it — "5835 5588"
 * — violates that constraint, and Postgres answers with a bare 23514 that an
 * admin sitting beside the driver cannot act on. M108’s live assertion hit this
 * exact wall on its first run.
 *
 * So the number is normalised before it can reach the database at all, and the
 * default country code is Mauritius/Rodrigues because that is who uses this.
 * Anything already carrying a + is respected as typed.
 */
export function normalizePhone(input: string, defaultCc = "230"): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  // Keep the fact of a leading + (or 00), then drop every non-digit: spaces,
  // dashes, brackets, the lot.
  const international = raw.startsWith("+") || raw.startsWith("00");
  const digits = raw.replace(/^00/, "").replace(/\D/g, "");
  if (!digits) return null;

  const e164 = international ? `+${digits}` : `+${defaultCc}${digits}`;
  return /^\+[1-9][0-9]{6,15}$/.test(e164) ? e164 : null;
}

/**
 * How long before an invitation may be sent again.
 *
 * Long enough that a double-clicked button and an impatient operator cannot
 * mail somebody four times; short enough to fix "it went to spam" while they
 * are still standing in front of you.
 */
export const RESEND_COOLDOWN_MS = 5 * 60 * 1000;

export function canResendInvite(
  row: { claimed: boolean; inviteEmail: string | null; invitedAt: string | null },
  now: number = Date.now(),
): { ok: boolean; reason?: string; waitMs?: number } {
  if (!row.inviteEmail) {
    return { ok: false, reason: "This account was not created from an invitation." };
  }
  if (row.claimed) {
    return { ok: false, reason: "They have already signed in — there is nothing left to claim." };
  }
  const sent = row.invitedAt ? Date.parse(row.invitedAt) : NaN;
  if (Number.isFinite(sent)) {
    const wait = RESEND_COOLDOWN_MS - (now - sent);
    if (wait > 0) {
      return {
        ok: false,
        reason: "An invitation went out a moment ago. Give it a few minutes before sending another.",
        waitMs: wait,
      };
    }
  }
  return { ok: true };
}

/**
 * Is there enough here to trade, or to drive?
 *
 * An admin creating the account only has to know a name, an email and — for a
 * driver — a phone and a vehicle. The rest is the person’s own to fill in, which
 * is what `incomplete` means on the ladder. Returned as a LIST so the detail
 * panel can say precisely what is missing instead of the word "incomplete",
 * which tells an operator nothing they can act on.
 */
export function missingProfileFields(
  kind: PersonKind,
  row: { phone?: string | null; segment?: string | null; email?: string | null },
): string[] {
  const missing: string[] = [];
  if (!(row.email ?? "").trim()) missing.push("Email address");
  if (!(row.phone ?? "").trim()) missing.push("Phone number");
  if (kind === "driver" && !(row.segment ?? "").trim()) missing.push("Vehicle type");
  if (kind === "merchant" && !(row.segment ?? "").trim()) missing.push("What they sell");
  // A restaurant with no pickup hint is the one a customer cannot find. It is
  // the field this island actually needs — "green gate beside the market"
  // outranks a street address here.
  if (kind === "kitchen" && !(row.segment ?? "").trim()) missing.push("Where to collect");
  // A trade with no name is unbookable: the customer is choosing "car wash" or
  // "plumber", not a business they have never heard of.
  if (kind === "service" && !(row.segment ?? "").trim()) missing.push("Trade");
  return missing;
}
