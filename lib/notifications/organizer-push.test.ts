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

// ── AND THE HALF THAT WAS NEVER BUILT (2026-09) ─────────────────────────────
//
// Everything above tests the SEND, and the send has been correct since August.
// It reached nobody. There was no register_organizer_push, no
// /api/organizer/push, and no control anywhere on /organizer — so
// organizer_push_targets() resolved to an empty set, and a send to zero targets
// returns 0 and is indistinguishable from success.
//
// That is the worst shape a notification can take: built, wired, verified, and
// silent, with nothing in any log to say so. These guard the subscribe half.
describe("an organiser can actually subscribe", () => {
  const route = read("app/api/organizer/push/route.ts");
  const page = read("app/organizer/page.tsx");
  const toggle = read("app/driver/AlertsToggle.tsx");

  it("has a route, and it registers through the organiser RPC", () => {
    expect(route).toMatch(/register_organizer_push/);
    // Never the merchant one: an organiser is deliberately not merchant_staff,
    // so register_merchant_push would refuse them and report a clean failure.
    expect(route).not.toMatch(/register_merchant_push/);
  });

  it("refuses to subscribe against a server that cannot send", () => {
    // The switch would say "on" and nothing would ever arrive — the exact
    // failure this route exists to end.
    expect(route).toMatch(/pushIsConfigured/);
  });

  it("never takes the event from the body", () => {
    // Targeting resolves the store at SEND time, so one subscription covers
    // every event an organiser is given. Accepting an id here would let a
    // caller name somebody else's event.
    expect(route).not.toMatch(/storeId|eventId|p_store_id/);
  });

  it("offers the switch on the organiser's page", () => {
    expect(page).toMatch(/AlertsToggle/);
    expect(page).toMatch(/url: "\/api\/organizer\/push"/);
  });

  it("only offers it to somebody with events to sell", () => {
    // Door staff scan at the gate and have no sales to hear about; the RPC
    // would refuse them, and a switch that cannot work is worse than none.
    expect(page).toMatch(/events\.length > 0 && \(\s*<AlertsToggle/);
  });

  it("reuses the one toggle rather than forking it", () => {
    // The permission dance, the denied state and the "reopen it in browser
    // settings" instructions are the same problem on both screens.
    expect(toggle).toMatch(/target\?: PushTarget/);
    expect(toggle).toMatch(/disablePush\(target\)/);
    expect(toggle).toMatch(/enablePush\(target\)/);
  });
});
