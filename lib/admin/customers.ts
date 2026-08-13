// ── WHO ACTUALLY BOUGHT SOMETHING ───────────────────────────────────────────
//
// The Customers page listed auth.users. That is not the same thing as customers,
// and on this platform it is barely related to it. Of twelve accounts: three are
// real people, three are test merchants on reserved .invalid domains, two are
// test organisers, one is the Food platform's own service account, one is a
// door test, and two are M4 fixtures. Meanwhile the people who actually spent
// money — guests who checked out without registering — appeared nowhere except
// as a number in a footnote.
//
// So the list is rebuilt from TRANSACTIONS instead of accounts. A customer is
// someone who ordered, rented or booked. Having an account is a property they
// might also have, not the thing that makes them a customer.
//
// Pure on purpose: identity merging and search are the parts that decide whether
// the owner can find the person on the phone to them, so they are tested rather
// than trusted.

export type TxnKind = "order" | "rental" | "experience";

export type Txn = {
  kind: TxnKind;
  name: string | null;
  email: string | null;
  phone: string | null;
  /** orders.customer_id — present only when they were signed in. */
  accountId: string | null;
  /** Minor units. Only counted into spend when countsToSpend is true. */
  amountMinor: number;
  countsToSpend: boolean;
  at: string;
  ref: string | null;
};

export type Account = { id: string; email: string | null; createdAt: string };

export type Person = {
  key: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  accountId: string | null;
  hasAccount: boolean;
  joined: string | null;
  orders: number;
  rentals: number;
  experiences: number;
  spentMinor: number;
  lastSeen: string | null;
  refs: string[];
};

/** RFC-reserved domains that can never receive mail. Every seeded fixture and
 *  service account on this platform uses one, so this is a rule rather than a
 *  list of names to keep updating. */
const RESERVED = [".invalid", ".internal", ".test", ".example", ".localhost"];

export function isReservedEmail(email: string | null | undefined): boolean {
  const e = (email ?? "").trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 0) return false;
  const domain = e.slice(at + 1);
  return RESERVED.some((r) => domain === r.slice(1) || domain.endsWith(r));
}

export function normEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/** Mauritian numbers get written +230 5827 0562, 58270562, 5827-0562. Comparing
 *  the last 8 digits makes those the same person, which is the point. */
export function normPhone(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-8) : "";
}

/** Accent- and case-insensitive, so "Rene" finds "René". */
export function fold(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** One person may appear as a signed-in order, a guest order and a rental. Email
 *  is the strongest link they share, then phone, then the name they typed. */
function keyFor(t: Txn, emailByAccount: Map<string, string>, index: number): string {
  const viaAccount = t.accountId ? emailByAccount.get(t.accountId) ?? "" : "";
  const email = normEmail(t.email) || viaAccount;
  if (email) return `e:${email}`;
  const phone = normPhone(t.phone);
  if (phone) return `p:${phone}`;
  const name = fold(t.name);
  if (name) return `n:${name}`;
  return t.accountId ? `a:${t.accountId}` : `x:${index}`;
}

export function buildPeople(accounts: Account[], txns: Txn[]): Person[] {
  const emailByAccount = new Map<string, string>();
  for (const a of accounts) {
    const e = normEmail(a.email);
    if (e) emailByAccount.set(a.id, e);
  }

  const accountByEmail = new Map<string, Account>();
  for (const a of accounts) {
    const e = normEmail(a.email);
    if (e && !accountByEmail.has(e)) accountByEmail.set(e, a);
  }

  const byKey = new Map<string, Person>();

  txns.forEach((t, i) => {
    const key = keyFor(t, emailByAccount, i);
    let p = byKey.get(key);
    if (!p) {
      p = {
        key,
        name: null,
        email: null,
        phone: null,
        accountId: null,
        hasAccount: false,
        joined: null,
        orders: 0,
        rentals: 0,
        experiences: 0,
        spentMinor: 0,
        lastSeen: null,
        refs: [],
      };
      byKey.set(key, p);
    }

    // Keep the fullest version of each detail rather than the last one seen.
    const viaAccount = t.accountId ? emailByAccount.get(t.accountId) ?? null : null;
    if (!p.name && t.name?.trim()) p.name = t.name.trim();
    if (!p.email && (normEmail(t.email) || viaAccount)) p.email = normEmail(t.email) || viaAccount;
    if (!p.phone && normPhone(t.phone)) p.phone = t.phone!.trim();
    if (!p.accountId && t.accountId) p.accountId = t.accountId;

    if (t.kind === "order") p.orders += 1;
    else if (t.kind === "rental") p.rentals += 1;
    else p.experiences += 1;

    if (t.countsToSpend) p.spentMinor += Number(t.amountMinor) || 0;
    if (t.at && (!p.lastSeen || t.at > p.lastSeen)) p.lastSeen = t.at;
    if (t.ref) p.refs.push(t.ref);
  });

  // Attach the account, so the row can say "has an account" and show when they
  // joined — including for a guest order placed with the same address.
  for (const p of byKey.values()) {
    const acc = p.email ? accountByEmail.get(p.email) : undefined;
    if (acc) {
      p.hasAccount = true;
      p.accountId = p.accountId ?? acc.id;
      p.joined = acc.createdAt;
    } else if (p.accountId) {
      p.hasAccount = true;
    }
  }

  return [...byKey.values()].sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? ""));
}

/** Accounts that have never transacted. Real, but not customers yet — and the
 *  reason the old page looked full of strangers. */
export function dormantAccounts(accounts: Account[], people: Person[]): Account[] {
  const seen = new Set<string>();
  for (const p of people) {
    if (p.email) seen.add(p.email);
    if (p.accountId) seen.add(p.accountId);
  }
  return accounts.filter((a) => !seen.has(normEmail(a.email)) && !seen.has(a.id));
}

/** Name, email, phone or order reference — because the owner knows the person by
 *  whichever of those the customer just said down the phone. The old page
 *  searched email only, so typing "Marie" found nobody. */
export function matchesQuery(p: Person, query: string): boolean {
  const q = fold(query);
  if (!q) return true;
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 4 && normPhone(p.phone).includes(digits)) return true;
  return (
    fold(p.name).includes(q) ||
    fold(p.email).includes(q) ||
    p.refs.some((r) => fold(r).includes(q))
  );
}

/** What to call somebody who never gave a name. */
export function displayName(p: Person): string {
  return p.name || p.email || p.phone || "Unnamed customer";
}
