import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ── NO SERVICE ROLE, NO BOOKING — AND A SENTENCE, NOT A 500 (M221) ──────────
//
// M221 takes INSERT on bookings and place_bookings away from anon and
// authenticated, so both public booking routes write through getPrivileged().
// That helper does not fail when SUPABASE_SERVICE_ROLE_KEY is missing: it
// quietly hands back the visitor's own client, whose insert M221 now refuses.
// Every booking would have died as a generic 500 with nothing in the log that
// named the cause.
//
// These drive the real POST handlers with the key reported missing and pin
// three things: a 503 the customer can act on, a console.error naming the key,
// and NOTHING read, written, emailed or queued. A positive control with the
// key present proves the refusal is the only difference.

const h = vi.hoisted(() => ({
  hasKey: true,
  privilegedCalls: 0,
  inserts: [] as { table: string; rows: unknown }[],
  sendBookingEmails: vi.fn(async () => {}),
  sendPlaceBookingEmails: vi.fn(async () => {}),
  upsertBrevoContact: vi.fn(async () => {}),
  enqueueNotification: vi.fn(async () => {}),
}));

// A query builder that answers every read with no rows and records inserts.
function table(name: string) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "gte", "lte"]) chain[m] = () => chain;
  chain.insert = async (rows: unknown) => {
    h.inserts.push({ table: name, rows });
    return { error: null };
  };
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
  return chain;
}
const serviceClient = { from: (name: string) => table(name) };

vi.mock("@/lib/supabase/admin", () => ({
  hasServiceRole: () => h.hasKey,
  getPrivileged: async () => {
    h.privilegedCalls++;
    return serviceClient;
  },
}));
vi.mock("@/lib/rate-limit", () => ({ guardShared: async () => null, guard: () => null }));
vi.mock("@/lib/content", () => ({
  getContent: async () => ({
    fleet: [{ id: "burgman", name: "Suzuki Burgman", price: "Rs 800 / day", units: 1 }],
    vehicleCategories: [],
  }),
  getContentWithStatus: async () => ({
    loaded: true,
    content: {
      recommended: {
        items: [
          { id: "lagoon-boat", name: "Lagoon boat trip", category: "activity", capacity: 6, depositAmount: 2500, timeSlots: [] },
        ],
      },
    },
  }),
}));
vi.mock("@/lib/email", () => ({
  sendBookingEmails: h.sendBookingEmails,
  sendPlaceBookingEmails: h.sendPlaceBookingEmails,
  upsertBrevoContact: h.upsertBrevoContact,
}));
vi.mock("@/lib/notifications/queue", () => ({ enqueueNotification: h.enqueueNotification }));

const { POST: postVehicle } = await import("./route");
const { POST: postPlace } = await import("../place-bookings/route");

const REFUSAL =
  "Bookings are temporarily unavailable — message us on WhatsApp and we will book it for you.";

// A day a few days out in Rodrigues (UTC+4), so the rental window is valid.
const day = (ahead: number) =>
  new Date(Date.now() + 4 * 3_600_000 + ahead * 86_400_000).toISOString().slice(0, 10);

function req(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const vehicle = () =>
  postVehicle(
    req("/api/bookings", {
      name: "Marie Test",
      phone: "+230 5769 8834",
      email: "marie@example.com",
      scooter: "burgman",
      start_date: day(3),
      end_date: day(5),
      payment_preference: "in_person",
    }),
  );
const place = () =>
  postPlace(
    req("/api/place-bookings", {
      place_id: "lagoon-boat",
      name: "Marie Test",
      phone: "+230 5769 8834",
      email: "marie@example.com",
      start_date: day(3),
      quantity: 2,
      payment_preference: "in_person",
    }),
  );

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  h.hasKey = true;
  h.privilegedCalls = 0;
  h.inserts = [];
  h.sendBookingEmails.mockClear();
  h.sendPlaceBookingEmails.mockClear();
  h.upsertBrevoContact.mockClear();
  h.enqueueNotification.mockClear();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
});

for (const [label, send, tableName] of [
  ["a vehicle rental (/api/bookings)", vehicle, "bookings"],
  ["a stay or activity (/api/place-bookings)", place, "place_bookings"],
] as const) {
  describe(label, () => {
    it("with the key: saved through the service role (the control)", async () => {
      const res = await send();
      expect(res.status).toBe(200);
      expect(h.inserts.map((i) => i.table)).toEqual([tableName]);
    });

    it("without the key: a 503 with somewhere to go, not the generic 500", async () => {
      h.hasKey = false;
      const res = await send();
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: REFUSAL });
    });

    it("without the key: the log names the missing key", async () => {
      h.hasKey = false;
      await send();
      const logged = errorSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
      expect(logged).toContain("SUPABASE_SERVICE_ROLE_KEY missing");
      expect(logged).toContain("M221");
    });

    it("without the key: nothing is read, written, emailed or queued", async () => {
      h.hasKey = false;
      await send();
      // Not even the fallback client: the refusal comes before getPrivileged().
      expect(h.privilegedCalls).toBe(0);
      expect(h.inserts).toEqual([]);
      expect(h.sendBookingEmails).not.toHaveBeenCalled();
      expect(h.sendPlaceBookingEmails).not.toHaveBeenCalled();
      expect(h.upsertBrevoContact).not.toHaveBeenCalled();
      expect(h.enqueueNotification).not.toHaveBeenCalled();
    });
  });
}
