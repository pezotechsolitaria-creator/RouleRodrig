import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── THE ORGANISER'S PHONE (M125) ────────────────────────────────────────────
//
// "For organiser makes ticket sales and payment confirmed."
//
// The trap here is quiet: merchant_push_targets walks merchant_staff, and an
// organiser is deliberately NOT staff — they hold a scoped account (M43) and
// reach their events through an assignment to the platform merchant's store
// (M40), precisely so they never become merchants. Reusing the merchant
// function would have found nobody and reported success.

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const MIGRATION = "supabase/migrations/20260819190000_m125_organizer_push_targets.sql";
// Only the executable SQL is judged, never the comments explaining it — the
// header names merchant_staff on purpose, to say why it is NOT used.
const stripSql = (src: string) => src.replace(/^\s*--.*$/gm, "");

describe("organizer_push_targets", () => {
  const sql = read(MIGRATION);

  it("resolves organisers through their assignment, not through merchant_staff", () => {
    const body = stripSql(sql);
    expect(body).toMatch(/event_organizer_assignments/);
    expect(body).toMatch(/event_organizers/);
    expect(body).not.toMatch(/merchant_staff/);
  });

  it("never wakes someone who has not claimed their account", () => {
    // An invited-but-unclaimed organiser has no business being woken, and a
    // revoked one must stop immediately.
    expect(sql).toMatch(/o\.status = 'active'/);
    expect(sql).toMatch(/o\.user_id is not null/);
  });

  it("skips endpoints the push service keeps rejecting", () => {
    expect(sql).toMatch(/fail_count/);
  });
});

describe("the push-target boundary", () => {
  const sql = read(MIGRATION);

  it("locks the new function with REVOKE, not by omitting a GRANT", () => {
    // Default grants reach anon on this project, so the revoke IS the lock.
    expect(sql).toMatch(/revoke all on function public\.organizer_push_targets\(uuid\) from public/);
    expect(sql).toMatch(/grant execute on function public\.organizer_push_targets\(uuid\) to service_role/);
  });

  it("closes the same hole that was already open on the merchant one", () => {
    // merchant_push_targets was executable by anon: a push target row IS the
    // credential to send to that device.
    expect(sql).toMatch(/revoke all on function public\.merchant_push_targets\(uuid\) from anon/);
  });

  it("asserts the result instead of trusting the revokes", () => {
    expect(sql).toMatch(/has_function_privilege\('anon'/);
    expect(sql).toMatch(/raise exception/);
  });
});

describe("a ticket sale wakes the organiser", () => {
  const send = read("lib/push/send.ts");
  const placed = read("lib/notifications/order-placed.ts");

  it("has its own sender, keyed by store", () => {
    expect(send).toMatch(/export async function pushToOrganizer/);
    expect(send).toMatch(/targetsFrom\("organizer_push_targets"/);
  });

  it("fires on a placed order", () => {
    expect(placed).toMatch(/pushToOrganizer\(input\.storeId/);
    expect(placed).toMatch(/Ticket sold/);
  });

  it("is AWAITED, or serverless kills it before it leaves", () => {
    // The exact bug the merchant push carries a comment about.
    expect(placed).toMatch(/organizerPush,\s*\]\);/);
  });

  it("cannot fail the order it is reporting", () => {
    const i = placed.indexOf("pushToOrganizer(");
    expect(placed.slice(i, i + 700)).toMatch(/\.catch\(\(err\) =>/);
  });

  it("counts as the order having reached someone who can act", () => {
    expect(placed).toMatch(/organizerPushed > 0/);
  });
});
