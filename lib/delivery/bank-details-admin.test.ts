import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ── "HOW DO I ADD BANK DETAILS FOR DELIVERY?" ───────────────────────────────
//
// Asked by the owner on 2026-09-09. The answer was: you can't. M190 added the
// four columns to delivery_settings and taught delivery_request_view() to read
// them, and never built a way to WRITE them — no admin screen, and no RPC
// updating that table at all. All four sat NULL, so bank transfer was never
// offered on /deliver and nothing anywhere said why.
//
// The trap this guards is the one M190 itself was written for.
// delivery_request_view() switches the whole option on from the account NAME:
//
//     case when coalesce(btrim(s.bank_account_name), '') = '' then null
//
// so saving a name with no NUMBER offers the customer a transfer and then shows
// them nowhere to send it. The new screen must not be able to produce that.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const API = strip(read("app/api/admin/delivery-bank/route.ts"));
const PANEL = strip(read("app/admin/payment-methods/DeliveryBankPanel.tsx"));

describe("the name and the number travel together", () => {
  it("the server refuses one without the other", () => {
    // The client check is a courtesy; this is the one that has to hold.
    expect(API).toMatch(/hasName !== hasNumber/);
    expect(API).toMatch(/status: 400/);
  });

  it("the screen says so before the tap, not after it", () => {
    expect(PANEL).toMatch(/const half = hasName !== hasNumber/);
    expect(PANEL).toMatch(/disabled=\{busy \|\| !loaded \|\| half\}/);
  });

  it("still lets both be cleared, because that is the off switch", () => {
    // Refusing empty values would leave the owner no way to stop offering
    // transfers once he had started.
    expect(API).toMatch(/const orNull = \(v: string\) =>/);
    expect(API).toMatch(/z\.string\(\)\.trim\(\)\.max/);
  });
});

describe("it writes the row the reader actually reads", () => {
  it("targets delivery_settings id=main", () => {
    expect(API).toMatch(/from\("delivery_settings"\)/);
    expect(API).toMatch(/\.eq\("id", "main"\)/);
  });

  it("writes all four columns", () => {
    for (const col of [
      "bank_account_name",
      "bank_name",
      "bank_account_number",
      "bank_note",
    ]) {
      expect(API, `${col} is not written`).toContain(col);
    }
  });
});

describe("it is an admin surface, with this platform's admin auth", () => {
  it("checks the signed password cookie", () => {
    // The console has no Supabase user, so is_platform_admin() can never be
    // true for it and RLS cannot be the boundary here. This check is.
    expect(API).toMatch(/verifySession\(req\.cookies\.get\(COOKIE_NAME\)\?\.value\)/);
    expect(API).toMatch(/status: 401/);
  });

  it("guards both verbs, not just the write", () => {
    // Split on the handlers themselves; the file's preamble is not one, and
    // counting it made this fail on the imports.
    const handlers = API.split(/export async function /).slice(1);
    const verbs = handlers.map((h) => h.match(/^\w+/)?.[0] ?? "");
    expect(verbs).toEqual(expect.arrayContaining(["GET", "POST"]));
    handlers.forEach((h, i) => {
      expect(h, `${verbs[i]} has no auth check`).toMatch(/isAuthed\(req\)/);
    });
  });

  it("says plainly when the service key is missing", () => {
    // Locally it always is, and a silent failure here looks like a saved form
    // that did not save.
    expect(API).toMatch(/hasServiceRole\(\)/);
    expect(API).toMatch(/status: 503/);
  });
});

describe("the screen tells the owner the state he is actually in", () => {
  it("warns while transfers are switched off", () => {
    // The whole reason the question was asked: nothing said the option was
    // off, or that filling this in is what turns it on.
    expect(PANEL).toMatch(/loaded && !live/);
    expect(PANEL).toContain("only pay cash");
  });

  it("does not let it be mistaken for a shop's account", () => {
    // store_payment_settings is set higher up the same page and pays a
    // MERCHANT for goods. This pays the platform a delivery fee.
    expect(PANEL).toContain("Not a");
    expect(PANEL).toMatch(/cash to the driver at the door/);
  });
});
