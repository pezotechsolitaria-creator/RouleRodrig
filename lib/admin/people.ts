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

export type PersonKind = "merchant" | "driver";

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
  | "activate"
  | "suspend"
  | "deactivate"
  | "verify"
  | "reject_verification"
  | "delete";

export type Risk = "low" | "medium" | "high" | "destructive";

export const ACTION_RISK: Record<PeopleAction, Risk> = {
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
  sort: "recent" | "name" | "oldest";
  page: number;
};

export const DEFAULT_FILTER: PeopleFilter = {
  q: "",
  account: "all",
  verification: "all",
  segment: "all",
  availability: "all",
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

export const AVAILABILITY_LABEL: Record<"offline" | "available" | "busy", string> = {
  offline: "Offline",
  available: "Online",
  busy: "On a delivery",
};
