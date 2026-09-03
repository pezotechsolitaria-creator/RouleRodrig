import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── THE ALERT DID NOT SAY WHERE TO GO (M159) ────────────────────────────────
//
// Booking RR-329D81 carried a customer note reading "Amener le scooter a La
// villa ALLAMANDA Saint-Francois, Nouvelle Decouverte". The confirmation EMAIL
// printed it under "Customer note". The WhatsApp alert — the thing the owner
// actually reads, on his phone, while deciding what to do next — listed the
// name, the vehicle, the dates, the total and the phone number, and not the
// address. He had to go and open the email to find out where he was driving.

const SRC = readFileSync(
  join(__dirname, "..", "app", "api", "bookings", "route.ts"),
  "utf8",
);
/** Prose in comments must never be what satisfies a test. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the owner's WhatsApp alert says where to take the vehicle", () => {
  it("includes the customer note, which is where the address arrives", () => {
    expect(CODE).toContain("record.message");
  });

  it("puts it inside the booking.created alert, not somewhere else", () => {
    const alert = CODE.slice(
      CODE.indexOf('type: "booking.created"'),
      CODE.indexOf('type: "booking.created"') + 1600,
    );
    expect(alert).toContain("record.message");
  });

  it("still carries everything it carried before", () => {
    // Adding a field must not quietly cost another one.
    const alert = CODE.slice(
      CODE.indexOf('type: "booking.created"'),
      CODE.indexOf('type: "booking.created"') + 1600,
    );
    for (const field of ["record.name", "scooterName", "record.phone", "record.pickup_time"]) {
      expect(alert).toContain(field);
    }
  });

  it("caps the note so one long message cannot lose the whole alert", () => {
    // CallMeBot delivers over a URL. An unbounded paste would not truncate the
    // note — it would drop the message, and the owner would learn nothing at
    // all about a booking he has taken money for.
    expect(CODE).toMatch(/record\.message\.length > 300/);
    expect(CODE).toMatch(/record\.message\.slice\(0, 297\)/);
  });
});
