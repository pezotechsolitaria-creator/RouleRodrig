import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");
const SRC = "app/deliver/[id]/RequestTracker.tsx";
const MIG = "supabase/migrations/20260908130000_m190_somewhere_to_send_the_money.sql";

// ── "BANK TRANSFER" WITH NOWHERE TO SEND IT ─────────────────────────────────
//
// /deliver offered two ways to pay and one of them had no destination. There
// was no account_number, no bank_name, nothing, anywhere in app/deliver,
// lib/delivery or app/api/delivery-requests — while the marketplace, events and
// stores side has all of it.
//
// It is worse than a missing feature. Cash is capped at Rs 3,000; above that
// the sheet greys cash out and leaves the transfer as the ONLY choice — one
// that led to a screen demanding a receipt for a payment the customer had no
// way to make. Two of the requests posted on 8 September carried Rs 5,000
// quotes, which is exactly that dead end.

describe("the account has somewhere to live", () => {
  const sql = read(MIG);

  it("sits on the settings row that holds every other delivery rule", () => {
    expect(sql).toMatch(/alter table delivery_settings/);
    for (const col of [
      "bank_account_name",
      "bank_name",
      "bank_account_number",
      "bank_note",
    ]) {
      expect(sql).toContain(col);
    }
  });

  it("is null as a WHOLE until somebody fills it in", () => {
    // A half-configured account is the dangerous state: an accountName with no
    // number reads as working and is not. The whole object collapses to null
    // unless there is a name to pay.
    // Quotes are doubled in the file because the patch is built inside an
    // E'...' literal, so this is `''''` on disk and `''` once executed.
    expect(sql).toMatch(
      /case when coalesce\(btrim\(s\.bank_account_name\), ''''\) = '''' then null/,
    );
  });

  it("re-running changes nothing", () => {
    expect(sql).toMatch(/if position\('''bankDetails'''/);
  });
});

describe("the UI never offers a transfer it cannot complete", () => {
  const src = read(SRC);

  it("the option is gated on a real account", () => {
    expect(src).toMatch(
      /const transferAllowed = Boolean\(view\.bankDetails\?\.accountName\)/,
    );
    expect(src).toMatch(/disabled: !transferAllowed/);
  });

  it("it never opens defaulted to the greyed option", () => {
    // `cashAllowed ? "cash" : "bank_transfer"` would arm Confirm on a disabled
    // choice when cash is over the cap AND no account exists — the sheet would
    // open pointing at a refusal.
    expect(src).toMatch(/cashAllowed \|\| !transferAllowed \? "cash"/);
  });

  it("it says whose problem it is", () => {
    // The customer did nothing wrong and cannot fix it themselves, so the copy
    // must not read like a validation error.
    expect(src).toContain("c.pay.transferUnset");
    const copy = read("lib/delivery/copy.i18n.ts");
    expect(copy.match(/transferUnset:/g) ?? []).toHaveLength(3);
  });
});

describe("the receipt screen names the account", () => {
  const src = read(SRC);

  it("it is passed in, not assumed", () => {
    expect(src).toMatch(/bank=\{view\.bankDetails \?\? null\}/);
  });

  it("the number is selectable", () => {
    // Somebody is copying it into a banking app one-handed. Text, not an image,
    // and select-all so one tap takes the whole thing.
    expect(src).toMatch(/select-all/);
  });

  it("every label exists in all three languages", () => {
    const copy = read("lib/delivery/copy.i18n.ts");
    for (const k of ["bankName:", "bankBank:", "bankNumber:"]) {
      expect(copy.match(new RegExp(k, "g")) ?? []).toHaveLength(3);
    }
  });
});
