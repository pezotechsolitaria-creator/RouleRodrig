import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { deleteRefusal, canCancelInstead, cancelInsteadPrompt, serverRefusal } from "@/lib/admin/booking-delete";

// ── Admin keeps everything (architecture review 2026-09-30, item 3) ─────────
//
// The rule, then both DELETE routes driven for real against a fake privileged
// client. The fake APPLIES the delete's filters to the row as it stands at
// delete time, so the "changed while you were looking" guard is proven by a
// run, not by reading the source.

describe("the rule", () => {
  it("lets an unpaid request go", () => {
    expect(deleteRefusal("vehicle", { status: "pending" }, 0)).toBeNull();
    expect(deleteRefusal("vehicle", { status: "approved", amount_paid: 0 }, 0)).toBeNull();
    expect(deleteRefusal("place", { status: "cancelled" }, 0)).toBeNull();
    expect(deleteRefusal("place", { status: "unavailable" }, 0)).toBeNull();
  });

  it("keeps anything with money, a commitment or a no-show on it", () => {
    const cases: [Parameters<typeof deleteRefusal>[1], number, string][] = [
      [{ status: "cancelled" }, 1, "ledger"],
      [{ status: "pending", amount_paid: 1288 }, 0, "paid"],
      [{ status: "approved", deposit_paid_at: "2026-09-01T10:00:00Z" }, 0, "money_received"],
      [{ status: "approved", paypal_capture_id: "CAP-1" }, 0, "money_received"],
      [{ status: "cancelled", no_show_at: "2026-09-02T10:00:00Z" }, 0, "no_show"],
      [{ status: "confirmed" }, 0, "confirmed"],
      [{ status: "completed" }, 0, "completed"],
    ];
    for (const [row, ledger, reason] of cases) {
      expect(deleteRefusal("vehicle", row, ledger)?.reason, JSON.stringify(row)).toBe(reason);
    }
  });

  it("offers Cancel only where a cancel still means something", () => {
    expect(deleteRefusal("vehicle", { status: "confirmed" })?.canCancel).toBe(true);
    expect(deleteRefusal("vehicle", { status: "approved", amount_paid: 500 })?.canCancel).toBe(true);
    expect(deleteRefusal("vehicle", { status: "completed" })?.canCancel).toBe(false);
    expect(deleteRefusal("vehicle", { status: "cancelled", no_show_at: "x" })?.canCancel).toBe(false);
    expect(canCancelInstead("unavailable")).toBe(false);
  });

  it("speaks in each desk's own noun, in one sentence the owner can act on", () => {
    expect(deleteRefusal("vehicle", { status: "confirmed" })?.message).toBe(
      "This booking is confirmed, so it can't be deleted. Cancel it instead: it stays on file, marked cancelled.",
    );
    expect(deleteRefusal("place", { status: "completed" })?.message).toBe(
      "This reservation is completed, so it can't be deleted. It stays on file as it is.",
    );
  });

  it("without the ledger count (the desk), still refuses on what the row shows", () => {
    expect(deleteRefusal("vehicle", { status: "confirmed" }, null)?.reason).toBe("confirmed");
    expect(deleteRefusal("vehicle", { status: "pending" }, null)).toBeNull();
  });
});

// ── What "Cancel instead" says before it goes through (architecture review
// 2026-09-30, item 3 fix) ─────────────────────────────────────────────────
// It replaces Delete on rows kept for their money or commitment, and used to
// say only "It stays on file, marked cancelled" — nothing about the customer
// being told, nor that no money goes back.

describe("the Cancel instead confirm", () => {
  it("a confirmed, unpaid rental: says the customer may be notified, no money line", () => {
    expect(cancelInsteadPrompt("vehicle", { status: "confirmed" })).toBe(
      "Cancel this booking instead? It stays on file, marked cancelled.\n\n" +
        "The customer gets a \"booking cancelled\" notification if they have notifications on.",
    );
  });

  it("a paid rental: gives the recorded amount and says it is not refunded", () => {
    const text = cancelInsteadPrompt("vehicle", { status: "confirmed", amount_paid: 1500, deposit_paid_at: "2026-09-01T10:00:00Z" });
    expect(text).toContain("Rs 1,500 is recorded as received on it — cancelling does not refund it.");
  });

  it("money received with no amount on the row: says so, with no figure made up", () => {
    const text = cancelInsteadPrompt("vehicle", { status: "approved", paypal_capture_id: "CAP-1" });
    expect(text).toContain("Money was received on it — cancelling does not refund it.");
    expect(text).not.toMatch(/Rs\s?\d/);
    expect(cancelInsteadPrompt("place", { status: "approved", deposit_paid_at: "2026-09-01T10:00:00Z" })).toContain(
      "Money was received on it",
    );
  });

  it("a reservation: the customer is NOT told (that PATCH sends nothing on a cancel)", () => {
    const text = cancelInsteadPrompt("place", { status: "confirmed", amount_paid: 2400 });
    expect(text.startsWith("Cancel this reservation instead?")).toBe(true);
    expect(text).toContain("The customer is not emailed — tell them yourself.");
    expect(text).not.toContain("notification");
    expect(text).toContain("Rs 2,400 is recorded as received on it");
  });
});

// ── The routes ──────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
const db: {
  row: Row | null;
  /** The row as it stands when the DELETE arrives, if something moved it. */
  rowAtDelete?: Row | null;
  readError: unknown;
  ledgerCount: number;
  ledgerError: unknown;
} = { row: null, readError: null, ledgerCount: 0, ledgerError: null };
const deletes: { table: string; filters: [string, string, unknown][] }[] = [];
const audits: { action: string; entityType: string; entityId?: string | null; diff?: Record<string, unknown> | null }[] = [];

function builder(table: string) {
  let op: "select" | "delete" = "select";
  let head = false;
  const filters: [string, string, unknown][] = [];
  const b = {
    select: (_cols?: string, opts?: { head?: boolean }) => ((head = !!opts?.head), b),
    delete: () => ((op = "delete"), b),
    eq: (c: string, v: unknown) => (filters.push(["eq", c, v]), b),
    is: (c: string, v: unknown) => (filters.push(["is", c, v]), b),
    maybeSingle: async () => (db.readError ? { data: null, error: db.readError } : { data: db.row, error: null }),
    then: (resolve: (v: unknown) => unknown) => {
      if (table === "booking_payments" && head) {
        return Promise.resolve(
          db.ledgerError ? { data: null, count: null, error: db.ledgerError } : { data: null, count: db.ledgerCount, error: null },
        ).then(resolve);
      }
      if (op === "delete") {
        deletes.push({ table, filters: [...filters] });
        const now = db.rowAtDelete === undefined ? db.row : db.rowAtDelete;
        const matches =
          !!now &&
          filters.every(([kind, c, v]) => (kind === "is" ? (now[c] ?? null) === v : now[c] === v));
        return Promise.resolve({ data: matches ? [{ id: now!.id }] : [], error: null }).then(resolve);
      }
      return Promise.resolve({ data: null, error: null }).then(resolve);
    },
  };
  return b;
}

vi.mock("@/lib/auth", () => ({ verifySession: () => true, COOKIE_NAME: "admin" }));
vi.mock("@/lib/supabase/admin", () => ({ getPrivileged: async () => ({ from: (t: string) => builder(t) }) }));
vi.mock("@/lib/admin/audit", () => ({
  audit: async (_a: unknown, e: (typeof audits)[number]) => {
    audits.push(e);
  },
}));
// The routes' other neighbours, kept hermetic exactly as the in-person test does.
vi.mock("@/lib/notifications/booking-status", () => ({ notifyBookingStatus: async () => {} }));
vi.mock("@/lib/receipts/payment-receipt", () => ({ sendPaymentReceipt: async () => true }));
vi.mock("@/lib/email", () => ({ sendPlaceAvailabilityConfirmed: async () => true, sendPlaceUnavailable: async () => true }));

const ID = "11111111-2222-4333-8444-555555555555";
const del = async (kind: "vehicle" | "place", body: unknown = { id: ID }) => {
  const mod = kind === "vehicle" ? await import("@/app/api/admin/bookings/route") : await import("@/app/api/admin/place-bookings/route");
  const url = kind === "vehicle" ? "http://localhost/api/admin/bookings" : "http://localhost/api/admin/place-bookings";
  const res = await mod.DELETE(
    new NextRequest(url, { method: "DELETE", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
  );
  return { status: res.status, body: (await res.json()) as { ok?: boolean; error?: string; refused?: { reason: string; canCancel: boolean } } };
};

const rental = (over: Row = {}): Row => ({
  id: ID, status: "pending", name: "Ana", email: "ana@example.com", phone: "+230 5712 3456",
  scooter: "burgman", start_date: "2026-10-02", end_date: "2026-10-04", total_amount: 3000,
  deposit_amount: 750, amount_paid: null, deposit_paid_at: null, paypal_capture_id: null, no_show_at: null,
  message: "Please bring a helmet", created_at: "2026-09-29T08:00:00Z", ...over,
});

beforeEach(() => {
  db.row = null;
  delete db.rowAtDelete;
  db.readError = null;
  db.ledgerCount = 0;
  db.ledgerError = null;
  deletes.length = 0;
  audits.length = 0;
});

describe("DELETE /api/admin/bookings", () => {
  it("deletes an unpaid request, only if nothing moved, and leaves an audit row", async () => {
    db.row = rental();
    const { status, body } = await del("vehicle");
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(deletes).toHaveLength(1);
    expect(deletes[0].table).toBe("bookings");
    expect(deletes[0].filters).toEqual(
      expect.arrayContaining([
        ["eq", "id", ID],
        ["is", "deposit_paid_at", null],
        ["is", "paypal_capture_id", null],
        ["is", "no_show_at", null],
        ["eq", "status", "pending"],
        ["is", "amount_paid", null],
      ]),
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: "booking.delete", entityType: "booking", entityId: ID });
    expect(audits[0].diff).toMatchObject({
      reference: "RR-111111", status: "pending", name: "Ana", email: "ana@example.com",
      scooter: "burgman", start_date: "2026-10-02", end_date: "2026-10-04", total_amount: 3000,
    });
    // A trail, not a backup: the customer's free text stays out.
    expect(audits[0].diff).not.toHaveProperty("message");
  });

  it("refuses a confirmed booking with the owner's sentence, and offers Cancel", async () => {
    db.row = rental({ status: "confirmed" });
    const { status, body } = await del("vehicle");
    expect(status).toBe(409);
    expect(body.error).toBe(
      "This booking is confirmed, so it can't be deleted. Cancel it instead: it stays on file, marked cancelled.",
    );
    expect(body.refused).toEqual({ reason: "confirmed", canCancel: true });
    expect(deletes).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("refuses a row with ledger money even when the row itself looks unpaid", async () => {
    db.row = rental({ status: "cancelled" });
    db.ledgerCount = 2;
    const { status, body } = await del("vehicle");
    expect(status).toBe(409);
    expect(body.refused?.reason).toBe("ledger");
    expect(body.refused?.canCancel).toBe(false);
    expect(deletes).toHaveLength(0);
  });

  it("refuses paid, deposit-paid, completed and no-show rows", async () => {
    for (const [over, reason] of [
      [{ amount_paid: 1288 }, "paid"],
      [{ deposit_paid_at: "2026-09-01T10:00:00Z" }, "money_received"],
      [{ status: "completed" }, "completed"],
      [{ status: "cancelled", no_show_at: "2026-09-02T10:00:00Z" }, "no_show"],
    ] as [Row, string][]) {
      db.row = rental(over);
      const { status, body } = await del("vehicle");
      expect(status, reason).toBe(409);
      expect(body.refused?.reason, reason).toBe(reason);
    }
    expect(deletes).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("deletes nothing when a payment lands between the check and the delete", async () => {
    db.row = rental();
    db.rowAtDelete = rental({ amount_paid: 750, deposit_paid_at: "2026-09-30T10:00:00Z" });
    const { status, body } = await del("vehicle");
    expect(status).toBe(409);
    expect(body.error).toContain("changed while you were looking at it");
    expect(audits).toHaveLength(0);
  });

  it("fails closed when the row or the ledger cannot be read", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    db.readError = { message: "boom" };
    expect((await del("vehicle")).status).toBe(500);
    db.readError = null;
    db.row = rental();
    db.ledgerError = { message: "boom" };
    const r = await del("vehicle");
    expect(r.status).toBe(500);
    expect(r.body.error).toContain("nothing was deleted");
    expect(deletes).toHaveLength(0);
    err.mockRestore();
  });

  it("says so when the row is already gone, and rejects a body with no id", async () => {
    expect((await del("vehicle")).status).toBe(404);
    expect((await del("vehicle", {})).status).toBe(400);
    expect((await del("vehicle", "not json")).status).toBe(400);
  });
});

describe("DELETE /api/admin/place-bookings", () => {
  const stay = (over: Row = {}): Row => ({
    id: ID, status: "pending", name: "Ana", email: "ana@example.com", place_id: "p1",
    place_name: "Sunset Lagoon Cruise", category: "activity", start_date: "2026-10-02", end_date: "2026-10-02",
    time_slot: "09:00", deposit_amount: 2400, amount_paid: null, deposit_paid_at: null,
    paypal_capture_id: null, no_show_at: null, created_at: "2026-09-29T08:00:00Z", ...over,
  });

  it("deletes an unpaid reservation and audits it as a place booking", async () => {
    db.row = stay();
    const { status } = await del("place");
    expect(status).toBe(200);
    expect(deletes[0].table).toBe("place_bookings");
    expect(audits[0]).toMatchObject({ action: "place_booking.delete", entityType: "place_booking", entityId: ID });
    expect(audits[0].diff).toMatchObject({ reference: "RR-111111", place_name: "Sunset Lagoon Cruise", time_slot: "09:00" });
  });

  it("refuses a paid reservation in the desk's own word", async () => {
    db.row = stay({ status: "approved", deposit_paid_at: "2026-09-01T10:00:00Z" });
    const { status, body } = await del("place");
    expect(status).toBe(409);
    expect(body.error).toBe(
      "Money was received for this reservation, so it can't be deleted. Cancel it instead: it stays on file, marked cancelled.",
    );
    expect(deletes).toHaveLength(0);
  });
});

// ── "Cancel instead" on a row the screen loaded before the money came in
// (architecture review 2026-09-30, item 3 fix) ───────────────────────────────
// The desk shows Delete on a row it loaded unpaid. The owner presses it, the
// route refuses — a payment was recorded since — and the button turns into
// Cancel instead while the list is re-read. Pressed in that window, the
// confirm read the OLD row and left out "does not refund". These take the
// route's real 409 body through the desk's reading of it into the prompt.

describe("Cancel instead, after the route refused for money the screen did not show", () => {
  const NO_REFUND = "Money was received on it — cancelling does not refund it.";

  it("rental: the ledger refusal brings the no-refund line, with no figure made up", async () => {
    const onScreen = rental(); // pending, nothing paid, as the desk loaded it
    // What the cash RPC writes in one go (M220/M222): a ledger row, the
    // running amount_paid and deposit_paid_at.
    db.row = rental({ amount_paid: 750, deposit_paid_at: "2026-09-30T10:00:00Z" });
    db.ledgerCount = 1;
    const { status, body } = await del("vehicle");
    expect(status).toBe(409);

    const kept = serverRefusal(body);
    expect(kept).toEqual({ refused: body.error, canCancel: true, reason: "ledger" });
    // Before: the prompt read the stale row alone and said nothing about money.
    expect(cancelInsteadPrompt("vehicle", onScreen)).not.toContain("refund");
    const text = cancelInsteadPrompt("vehicle", onScreen, kept!.reason);
    expect(text).toContain(NO_REFUND);
    expect(text).not.toMatch(/Rs\s?\d/);
    expect(deletes).toHaveLength(0);
  });

  it("reservation: the same, in the reservation's words", async () => {
    db.row = {
      id: ID, status: "approved", amount_paid: null, deposit_paid_at: "2026-09-30T10:00:00Z",
      paypal_capture_id: null, no_show_at: null,
    };
    const { body } = await del("place");
    const kept = serverRefusal(body);
    expect(kept?.reason).toBe("money_received");
    const text = cancelInsteadPrompt("place", { status: "approved" }, kept!.reason);
    expect(text).toContain("The customer is not emailed — tell them yourself.");
    expect(text).toContain(NO_REFUND);
  });

  it("a refusal for a commitment, not money, adds no money line", async () => {
    db.row = rental({ status: "confirmed" });
    const { body } = await del("vehicle");
    const kept = serverRefusal(body);
    expect(kept?.reason).toBe("confirmed");
    expect(cancelInsteadPrompt("vehicle", { status: "confirmed" }, kept!.reason)).not.toContain("refund");
  });

  it("the row's own amount still wins once the re-read has landed", () => {
    expect(cancelInsteadPrompt("vehicle", { status: "pending", amount_paid: 750 }, "ledger")).toContain(
      "Rs 750 is recorded as received on it — cancelling does not refund it.",
    );
  });

  it("\"changed while you were looking\" has no reason, and none is invented", async () => {
    db.row = rental();
    db.rowAtDelete = rental({ amount_paid: 750, deposit_paid_at: "2026-09-30T10:00:00Z" });
    const { status, body } = await del("vehicle");
    expect(status).toBe(409);
    expect(serverRefusal(body)).toEqual({ refused: body.error, canCancel: false, reason: null });
  });

  it("reads nothing into a body that is not a refusal", () => {
    expect(serverRefusal(null)).toBeNull();
    expect(serverRefusal({})).toBeNull();
    expect(serverRefusal({ error: "" })).toBeNull();
    expect(serverRefusal({ error: "No.", refused: { reason: "refunded", canCancel: "yes" } })).toEqual({
      refused: "No.",
      canCancel: false,
      reason: null,
    });
  });
});

// ── A declared transfer is checked, never deleted (wave 1 review, unowned
//    finding) ──────────────────────────────────────────────────────────────
// A pending or approved row whose customer says they sent a transfer carries
// no money columns yet, so the first version of the rule let Delete through —
// and the receipt they uploaded with it. M222's rule: a declared transfer must
// be checked, not overwritten. Cancel is not offered either: a cancelled row
// leaves the Money desk queue the owner reconciles from.
describe("a declared transfer", () => {
  const declared = { status: "approved", payment_reported_at: "2026-10-01T09:00:00Z" };

  it("is kept, with a reason that sends the owner to check the statement", () => {
    for (const kind of ["vehicle", "place"] as const) {
      const r = deleteRefusal(kind, declared, 0);
      expect(r?.reason).toBe("transfer_declared");
      expect(r?.canCancel).toBe(false);
      expect(r?.message).toContain("says they sent a transfer");
      expect(r?.message).toContain("Money desk");
    }
  });

  it("ranks below money that actually arrived", () => {
    expect(deleteRefusal("vehicle", { ...declared, deposit_paid_at: "2026-10-01T10:00:00Z" }, 0)?.reason).toBe(
      "money_received",
    );
  });

  it("is a reason the desk reads back from the route's 409", () => {
    expect(serverRefusal({ error: "Kept.", refused: { reason: "transfer_declared", canCancel: false } })?.reason).toBe(
      "transfer_declared",
    );
  });
});
