import { describe, it, expect } from "vitest";
import {
  isReservedEmail,
  normPhone,
  fold,
  buildPeople,
  dormantAccounts,
  matchesQuery,
  displayName,
  type Account,
  type Txn,
} from "./customers";

// Shaped like production. Three real people, one platform service account, one
// test merchant on a reserved domain, one organiser who has never transacted.
const ACCOUNTS: Account[] = [
  { id: "u-rhianna", email: "rhiannaaubdool5@gmail.com", createdAt: "2026-08-12T09:00:00Z" },
  { id: "u-rohan", email: "emmanuelrohanmeunier@gmail.com", createdAt: "2026-08-12T10:00:00Z" },
  { id: "u-food", email: "food.platform@roule-rodrigues.invalid", createdAt: "2026-08-11T00:00:00Z" },
  { id: "u-marlene", email: "chez-marlene@zztest.invalid", createdAt: "2026-08-11T00:00:00Z" },
  { id: "u-org", email: "organiser.test1@roulerodrig.com", createdAt: "2026-08-11T00:00:00Z" },
];

const order = (o: Partial<Txn>): Txn => ({
  kind: "order",
  name: null,
  email: null,
  phone: null,
  accountId: null,
  amountMinor: 0,
  countsToSpend: true,
  at: "2026-08-12T12:00:00Z",
  ref: null,
  ...o,
});

describe("isReservedEmail", () => {
  it("catches every seeded fixture domain on this platform", () => {
    expect(isReservedEmail("food.platform@roule-rodrigues.invalid")).toBe(true);
    expect(isReservedEmail("chez-marlene@zztest.invalid")).toBe(true);
    expect(isReservedEmail("rr.m4.customer@example.internal")).toBe(true);
  });

  it("leaves real addresses alone", () => {
    expect(isReservedEmail("rhiannaaubdool5@gmail.com")).toBe(false);
    expect(isReservedEmail("organiser.test1@roulerodrig.com")).toBe(false);
    expect(isReservedEmail(null)).toBe(false);
    expect(isReservedEmail("not-an-email")).toBe(false);
  });

  // ".invalidation.com" is a real domain and must not be caught by a bare
  // substring check.
  it("matches the domain, not a substring of it", () => {
    expect(isReservedEmail("a@invalidation.com")).toBe(false);
    expect(isReservedEmail("a@testing.com")).toBe(false);
  });
});

describe("normPhone", () => {
  it("treats every way of writing one Mauritian number as the same", () => {
    const forms = ["+230 5827 0562", "58270562", "5827-0562", "+230 58270562"];
    const [first, ...rest] = forms.map(normPhone);
    expect(first).toBe("58270562");
    for (const r of rest) expect(r).toBe(first);
  });

  it("ignores things too short to be a number", () => {
    expect(normPhone("123")).toBe("");
    expect(normPhone(null)).toBe("");
  });
});

describe("fold", () => {
  it("ignores accents and case, so René is found by typing Rene", () => {
    expect(fold("René")).toBe("rene");
    expect(fold("  MARIE  ")).toBe("marie");
    expect(fold("Rodrigues")).toBe(fold("rodrigues"));
  });
});

describe("buildPeople", () => {
  it("counts a guest order as a person, not a footnote", () => {
    const people = buildPeople(ACCOUNTS, [
      order({ name: "Jean Paul", email: "jp@example.com", amountMinor: 45000 }),
    ]);
    expect(people).toHaveLength(1);
    expect(people[0].name).toBe("Jean Paul");
    expect(people[0].hasAccount).toBe(false);
    expect(people[0].spentMinor).toBe(45000);
  });

  // The whole reason for this module. One human, three tables, one row.
  it("merges a signed-in order, a guest order and a rental into one person", () => {
    const people = buildPeople(ACCOUNTS, [
      order({ accountId: "u-rhianna", amountMinor: 337000, at: "2026-08-12T11:00:00Z" }),
      order({
        name: "Marie Rhianna Aubdool",
        email: "RhiannaAubdool5@GMAIL.com",
        phone: "+230 5827 0562",
        amountMinor: 171000,
        at: "2026-08-12T13:00:00Z",
      }),
      {
        kind: "rental",
        name: "Marie Aubdool",
        email: "rhiannaaubdool5@gmail.com",
        phone: "58270562",
        accountId: null,
        amountMinor: 0,
        countsToSpend: false,
        at: "2026-08-12T14:00:00Z",
        ref: "RR-AB12CD",
      },
    ]);

    expect(people).toHaveLength(1);
    const p = people[0];
    expect(p.orders).toBe(2);
    expect(p.rentals).toBe(1);
    expect(p.spentMinor).toBe(508000);
    expect(p.hasAccount).toBe(true);
    expect(p.joined).toBe("2026-08-12T09:00:00Z");
    expect(p.lastSeen).toBe("2026-08-12T14:00:00Z");
    expect(p.name).toBe("Marie Rhianna Aubdool");
  });

  it("links a guest order to the account with the same address", () => {
    const people = buildPeople(ACCOUNTS, [
      order({ name: "Rohan", email: "emmanuelrohanmeunier@gmail.com", amountMinor: 1000 }),
    ]);
    expect(people[0].hasAccount).toBe(true);
    expect(people[0].accountId).toBe("u-rohan");
  });

  it("falls back to phone when there is no email at all", () => {
    const people = buildPeople([], [
      order({ name: "Ninja", phone: "+230 5836 3401", amountMinor: 100 }),
      order({ name: "Ninja", phone: "58363401", amountMinor: 200 }),
    ]);
    expect(people).toHaveLength(1);
    expect(people[0].spentMinor).toBe(300);
  });

  it("does not fold two different people into one", () => {
    const people = buildPeople([], [
      order({ name: "A", email: "a@x.com" }),
      order({ name: "B", email: "b@x.com" }),
    ]);
    expect(people).toHaveLength(2);
  });

  it("excludes cancelled money from spend but still counts the order", () => {
    const people = buildPeople([], [
      order({ email: "a@x.com", amountMinor: 352000, countsToSpend: false }),
      order({ email: "a@x.com", amountMinor: 171000, countsToSpend: true }),
    ]);
    expect(people[0].orders).toBe(2);
    expect(people[0].spentMinor).toBe(171000);
  });

  it("puts the most recent customer first", () => {
    const people = buildPeople([], [
      order({ email: "old@x.com", at: "2026-08-01T00:00:00Z" }),
      order({ email: "new@x.com", at: "2026-08-13T00:00:00Z" }),
    ]);
    expect(people.map((p) => p.email)).toEqual(["new@x.com", "old@x.com"]);
  });

  it("survives a transaction with no identifying detail whatsoever", () => {
    const people = buildPeople([], [order({ amountMinor: 500 })]);
    expect(people).toHaveLength(1);
    expect(displayName(people[0])).toBe("Unnamed customer");
  });
});

describe("dormantAccounts", () => {
  it("separates accounts that have never bought anything", () => {
    const people = buildPeople(ACCOUNTS, [order({ accountId: "u-rhianna", amountMinor: 1 })]);
    const dormant = dormantAccounts(ACCOUNTS, people).map((a) => a.email);
    expect(dormant).toContain("organiser.test1@roulerodrig.com");
    expect(dormant).toContain("food.platform@roule-rodrigues.invalid");
    expect(dormant).not.toContain("rhiannaaubdool5@gmail.com");
  });
});

describe("matchesQuery", () => {
  const [p] = buildPeople(ACCOUNTS, [
    order({
      name: "Marie Rhianna Aubdool",
      email: "rhiannaaubdool5@gmail.com",
      phone: "+230 5827 0562",
      ref: "RR260812-8EB5E3",
    }),
  ]);

  // The old page searched email only. This is the bug in one line.
  it("finds a person by their name", () => {
    expect(matchesQuery(p, "Marie")).toBe(true);
    expect(matchesQuery(p, "aubdool")).toBe(true);
  });

  it("finds them by phone, however it is typed", () => {
    expect(matchesQuery(p, "58270562")).toBe(true);
    expect(matchesQuery(p, "5827 0562")).toBe(true);
    expect(matchesQuery(p, "0562")).toBe(true);
  });

  it("finds them by email and by order reference", () => {
    expect(matchesQuery(p, "rhianna")).toBe(true);
    expect(matchesQuery(p, "RR260812")).toBe(true);
    expect(matchesQuery(p, "8eb5e3")).toBe(true);
  });

  it("still says no when it is nobody", () => {
    expect(matchesQuery(p, "Jean")).toBe(false);
    expect(matchesQuery(p, "99999999")).toBe(false);
  });

  it("an empty search shows everyone", () => {
    expect(matchesQuery(p, "")).toBe(true);
    expect(matchesQuery(p, "   ")).toBe(true);
  });
});

// ── ONE PHONE IS ONE PERSON (M118) ──────────────────────────────────────────
//
// Built from the real rows in production on 2026-08-19, which is why the owner
// could not find anyone: the number 58363401 appeared under three different
// Gmail addresses plus one guest order with no email, and keyFor() prefers
// email — so one man was four rows, each holding one or two of his orders.
describe("a customer who used several emails and numbers", () => {
  const txn = (over: Partial<Txn>): Txn => ({
    kind: "order", name: null, email: null, phone: null, accountId: null,
    at: "2026-08-12T10:00:00Z", ref: null, amountMinor: 0, countsToSpend: false,
    ...over,
  } as Txn);

  // The exact production shape.
  const rohan: Txn[] = [
    txn({ name: "Meunier Rohan", email: "emmanuelrohanmeunier@gmail.com", phone: "+230 5836 3401", ref: "RR260812-F7F582" }),
    txn({ name: "Meunier Rohan", email: "ninjaespion23@gmail.com",        phone: "58363401",       ref: "RR260812-929350" }),
    txn({ name: "Meunier Rohan", email: "roulerodrig@gmail.com",          phone: "58363401",       ref: "RR260812-5E134D" }),
    txn({ name: "TEST — Rohan",  email: null,                             phone: "+230 58363401",  ref: "TEST-PICKUP-141319" }),
    // A second number the same man used. He must be findable by this one too.
    txn({ name: "Meunier Rohan", email: "emmanuelrohanmeunier@gmail.com", phone: "+230 5769 8834", ref: "RR260809-C1364A" }),
  ];

  it("is one person, not four", () => {
    const people = buildPeople([], rohan);
    expect(people).toHaveLength(1);
  });

  it("keeps every order, so his history is not truncated", () => {
    const [p] = buildPeople([], rohan);
    expect(p.orders).toBe(5);
  });

  it("is found by the number the owner typed", () => {
    const [p] = buildPeople([], rohan);
    expect(matchesQuery(p, "58363401")).toBe(true);
  });

  it("is found by the OTHER number he also used", () => {
    // The first-phone-wins bug: only one of his numbers used to match.
    const [p] = buildPeople([], rohan);
    expect(matchesQuery(p, "57698834")).toBe(true);
  });

  it("is found by any of his email addresses", () => {
    const [p] = buildPeople([], rohan);
    for (const e of ["emmanuelrohanmeunier", "ninjaespion23", "roulerodrig"]) {
      expect(matchesQuery(p, e), `missed ${e}`).toBe(true);
    }
  });

  it("is found by name", () => {
    const [p] = buildPeople([], rohan);
    expect(matchesQuery(p, "meunier")).toBe(true);
    expect(matchesQuery(p, "rohan")).toBe(true);
  });

  it("does not fold two different people together", () => {
    const marie = txn({ name: "Marie Rhianna Aubdool", email: "rhiannaaubdool5@gmail.com", phone: "+230 5827 0562" });
    const people = buildPeople([], [...rohan, marie]);
    expect(people).toHaveLength(2);
  });

  it("merges transitively when a number links two groups", () => {
    const a = txn({ email: "a@x.com", phone: "58000001" });
    const bridge = txn({ email: "a@x.com", phone: "58000002" });
    const c = txn({ email: "c@x.com", phone: "58000002" });
    expect(buildPeople([], [a, bridge, c])).toHaveLength(1);
  });

  it("leaves people with no phone alone", () => {
    const one = txn({ email: "one@x.com" });
    const two = txn({ email: "two@x.com" });
    expect(buildPeople([], [one, two])).toHaveLength(2);
  });
});
