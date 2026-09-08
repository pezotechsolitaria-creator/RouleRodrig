import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");
const M192 = "supabase/migrations/20260908210000_m192_evidence_can_still_be_recorded.sql";
const M193 = "supabase/migrations/20260908213000_m193_a_receipt_is_kept_no_longer_than_needed.sql";
const M193B = "supabase/migrations/20260908214000_m193_b_the_receipt_carries_an_amount.sql";

describe("evidence can still be recorded after an operator intervenes", () => {
  const sql = read(M192);

  it("the gate is about being finished, not about being 'assigned'", () => {
    // Both attach functions refused unless status was exactly 'assigned'. The
    // office's only tool for a stuck bank-transfer job is
    // admin_force_delivery_status, which moves it off 'assigned' — so working
    // around the gate made the evidence permanently unrecordable.
    // Doubled quotes on disk: the patch is built inside an E'...' literal.
    expect(sql).toMatch(
      /status in \(''delivered'', ''cancelled'', ''failed_delivery'', ''returned_to_merchant''\)/,
    );
    expect(sql).toMatch(/This delivery is finished\./);
  });

  it("it patches BOTH documents, from one list", () => {
    // Two contains rather than one dotAll regex: the /s flag needs ES2018 and
    // this tsconfig targets ES2017, so `next build` rejects it even though
    // vitest's esbuild does not.
    expect(sql).toContain("attach_delivery_payment_proof");
    expect(sql).toContain("attach_delivery_id_document");
    expect(sql).toMatch(/foreach v_name in array/);
  });

  it("it refuses to rewrite a shape it does not recognise", () => {
    expect(sql).toMatch(/refusing to rewrite blind/);
  });

  it("re-running is a no-op", () => {
    expect(sql).toMatch(/if position\('is finished' in v_def\) > 0 then/);
  });
});

describe("a receipt is kept no longer than it is needed", () => {
  const sql = read(M193);

  it("it has a retention setting at all", () => {
    // The ID had a whole machine — setting, expiry query, forget function,
    // nightly cron — and the bank slip had none of it, on a platform whose own
    // M158 header argues at length that keeping an ID too long would be
    // disproportionate under the Data Protection Act 2017.
    expect(sql).toMatch(/payment_proof_retention_days integer not null default 90/);
  });

  it("it outlives the ID, deliberately", () => {
    // The ID answers "is this the person at the door" and stops mattering at
    // handover. A receipt answers "did the money arrive", months later.
    expect(sql).toMatch(/WHY 90 DAYS AND NOT 30/);
  });

  it("the expiry query mirrors the identity one", () => {
    expect(sql).toMatch(/payment_proof_path is not null/);
    expect(sql).toMatch(/payment_proof_purged_at is null/);
    expect(sql).toMatch(/make_interval\(days => s\.payment_proof_retention_days\)/);
  });

  it("neither new function is reachable by a client", () => {
    expect(sql).toMatch(/revoke all on function public\.expired_payment_proofs\(integer\) from public, anon, authenticated/);
    expect(sql).toMatch(/revoke all on function public\.forget_payment_proof\(uuid\) from public, anon, authenticated/);
  });
});

describe("the purge covers both documents", () => {
  const src = read("app/api/cron/purge-documents/route.ts");

  it("they are one list, not two code paths", () => {
    // The receipt having no purge at all is what happens when the second kind
    // is a copy of the first that somebody forgot to write.
    expect(src).toMatch(/const KINDS = \[/);
    expect(src).toContain("delivery-identity");
    expect(src).toContain("delivery-payments");
    expect(src).toContain("expired_payment_proofs");
    expect(src).toContain("forget_payment_proof");
  });

  it("one kind failing does not stop the other", () => {
    expect(src).toMatch(/anyListFailed = true/);
    expect(src).toMatch(/continue;/);
  });

  it("it still deletes the object BEFORE nulling the path", () => {
    // A crash between the two must leave a row pointing at nothing, not a file
    // nobody knows about. A path with no file is a 404 the read route already
    // handles; a file with no path is invisible for ever.
    const loop = src.slice(src.indexOf("for (const row of rows)"));
    expect(loop.indexOf(".remove([")).toBeLessThan(loop.indexOf("forgetErr"));
  });

  it("it reports per kind", () => {
    expect(src).toMatch(/byKind: report/);
  });
});

describe("the receipt finally carries an amount", () => {
  const sql = read(M193B);

  it("the old signature is dropped before the new one is made", () => {
    // Adding even a defaulted parameter creates a SECOND overload, and
    // PostgREST then refuses the endpoint with PGRST203.
    expect(sql).toMatch(/drop function if exists public\.attach_delivery_payment_proof\(uuid, text, text, text\);/);
    const dropAt = sql.indexOf("drop function if exists");
    const createAt = sql.indexOf("create or replace function public.attach_delivery_payment_proof");
    expect(dropAt).toBeLessThan(createAt);
  });

  it("a negative amount is refused", () => {
    expect(sql).toMatch(/p_amount is not null and p_amount < 0/);
  });

  it("re-attaching a clearer photo does not erase the amount", () => {
    expect(sql).toMatch(/payment_amount = coalesce\(p_amount, payment_amount\)/);
  });

  it("the form sends cents, never a float", () => {
    // 9.995 * 100 is 999.4999999999999 in IEEE-754. This repo has shipped a
    // money bug from that shape twice.
    const src = read("app/deliver/[id]/RequestTracker.tsx");
    expect(src).toMatch(/amount: amount\.trim\(\) \? toCents\(amount\.trim\(\)\) : undefined/);
    expect(src).not.toMatch(/parseFloat\(amount/);
  });

  it("blank stays blank rather than becoming zero", () => {
    const src = read("app/deliver/[id]/RequestTracker.tsx");
    expect(src).toMatch(/amount\.trim\(\) \?/);
  });

  it("the field says it is optional, in three languages", () => {
    const copy = read("lib/delivery/copy.i18n.ts");
    expect(copy.match(/amountOptional:/g) ?? []).toHaveLength(3);
    expect(copy.match(/amountPlaceholder:/g) ?? []).toHaveLength(3);
  });

  it("and the route passes it through", () => {
    const route = read("app/api/delivery-requests/[id]/route.ts");
    expect(route).toMatch(/amount: z\.number\(\)\.int\(\)\.min\(0\)/);
    expect(route).toMatch(/p_amount: v\.amount \?\? null/);
  });
});

describe("polling does not eat the island's shared budget", () => {
  it("the view limit is keyed by the request too", () => {
    // Mobile CGNAT puts much of Rodrigues behind a handful of addresses, and
    // every open tracker polls three times a minute. Twenty people watching
    // twenty different deliveries were 429ing each other out of one ceiling.
    const route = read("app/api/delivery-requests/[id]/route.ts");
    expect(route).toMatch(/"delivery-request-view", 60, 60_000, id\)/);
  });

  it("but the GUESSING budget still keys on the IP alone", () => {
    // There the budget IS the brute-force protection: splitting it by what is
    // being guessed would let an attacker split their own budget.
    //
    // It moved from every guest VIEW to every guest MISS, because polling a
    // pair that works is not guessing — but it is still IP-keyed, with no
    // identity argument, and that is the part this pins.
    const route = read("app/api/delivery-requests/[id]/route.ts");
    const at = route.indexOf('"delivery-request-guest-miss"');
    expect(at).toBeGreaterThan(-1);
    const call = route.slice(at, at + 140);
    expect(call).toContain("60_000");
    // No fourth argument: an identity here would defeat the point.
    expect(call).not.toMatch(/60_000,\s*\w/);
  });
});
