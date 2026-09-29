import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMAIL_TYPES } from "@/lib/email/types";
import { PAYMENT } from "@/lib/payment-details";
import { computeMoney, docStatus, heroAmount, type ReceiptlyDoc } from "@/lib/receiptly/model";

// ── WHAT A CASH CUSTOMER (AND THE OWNER) IS TOLD, END TO END (M220) ─────────
//
// The router is mocked, so these assert the OUTCOME — which email leaves, to
// whom, keyed how, saying what — with no provider, database or key. The four
// failures this guards against are all silent in production:
//
//   · a cash customer told to pay online, or shown a bank account
//   · a balance that subtracts a deposit nobody paid (RR-329D81: Rs 3,864
//     printed, Rs 5,152 owed)
//   · a second cash payment deduped into the first one's receipt
//   · an unregistered email type, which sends at the wrong quota priority

type Captured = {
  type: string;
  to: string;
  subject: string;
  html: string;
  attachments?: { name: string; content: string }[];
  idempotencyKey?: string | null;
  relatedType?: string | null;
  relatedId?: string | null;
};

const sent: Captured[] = [];

vi.mock("@/lib/email/send", () => ({
  sendTransactionalEmail: async (input: Captured) => {
    sent.push(input);
    return { ok: true };
  },
}));

// No database in a test: the brand lookup and the owner-inbox lookup both
// fall back, exactly as they do when a read fails in production.
vi.mock("@/lib/supabase/admin", () => ({
  getPrivileged: async () => {
    throw new Error("no database in tests");
  },
  hasServiceRole: () => false,
}));

const FLEET: Record<string, { name: string; cat: string }> = {
  swift: { name: "Suzuki Swift", cat: "car" },
  burgman: { name: "BURGMAN 125cc", cat: "scooter" },
};
vi.mock("@/lib/vehicle-name", () => ({
  vehicleName: async (id: string) => FLEET[id]?.name ?? id,
  vehicleCategory: async (id: string) => FLEET[id]?.cat ?? "scooter",
  withVehicleName: async <T extends { scooter: string }>(b: T) => ({ ...b, scooter: FLEET[b.scooter]?.name ?? b.scooter }),
}));

// Every document an email attaches, so the PDF's figures can be asserted
// without parsing a PDF. The real builder still runs.
const docs: ReceiptlyDoc[] = [];
vi.mock("@/lib/receiptly/attach", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/receiptly/attach")>();
  return {
    ...real,
    attachmentsFor: (doc: ReceiptlyDoc | null) => {
      if (doc) docs.push(doc);
      return real.attachmentsFor(doc);
    },
  };
});

const pushes: { email?: string | null; title: string; body: string }[] = [];
vi.mock("@/lib/push/send", () => ({
  pushToCustomer: async (who: { email?: string | null }, p: { title: string; body: string }) => {
    pushes.push({ email: who.email, title: p.title, body: p.body });
    return 1;
  },
}));

const ID = "4f2a1b90-1111-4222-8333-944455556666";
const REF = "RR-4F2A1B";

// A car rental confirmed by hand with nothing paid — the live RR-329D81 shape.
const RENTAL = {
  id: ID,
  ref: REF,
  name: "Marie Perrine",
  email: "marie@example.com",
  phone: "+230 5123 4567",
  scooter: "swift",
  start_date: "2026-10-01",
  end_date: "2026-10-05",
  days: 4,
  pickup_time: "09:00",
  return_time: "17:00",
  total_price: "Rs 5,152",
  total_amount: 5152,
  delivery_fee: 0,
  deposit_amount: 1288,
  deposit_pct: 25,
  message: null,
  status: "confirmed",
  pay_in_person: true,
};

const RESERVATION = {
  id: ID,
  ref: REF,
  place_name: "Îles aux Cocos boat trip",
  category: "boat",
  name: "Sandrine Baltz",
  email: "sandrine@example.com",
  phone: "+230 5765 4321",
  start_date: "2026-10-02",
  end_date: "2026-10-02",
  guests: 2,
  quantity: 2,
  time_slot: "09:00",
  message: null,
  deposit_amount: 3600,
  status: "confirmed",
  pay_in_person: true,
};

const only = (): Captured => {
  expect(sent, "expected exactly one email").toHaveLength(1);
  return sent[0];
};

/** The island's clock, at 12:00 local on `day`. Only Date is faked. */
const islandDay = (day: string) => vi.setSystemTime(new Date(`${day}T08:00:00Z`));

beforeEach(() => {
  sent.length = 0;
  pushes.length = 0;
  docs.length = 0;
  // The fixtures pick up on 1 Oct 2026: pin "today" to two days before, so an
  // "at pickup" assertion does not silently turn into "Still to pay (cash)"
  // when the calendar catches up with it.
  vi.useFakeTimers({ toFake: ["Date"] });
  islandDay("2026-09-29");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the confirmation of a rental paid in person", () => {
  it("tells them to bring the WHOLE amount in cash, and that nothing is paid online", async () => {
    const { sendVehicleConfirmedInPerson } = await import("@/lib/email");
    expect(await sendVehicleConfirmedInPerson({ ...RENTAL })).toBe(true);
    const m = only();
    expect(m.to).toBe(RENTAL.email);
    expect(m.subject).toContain("Rs 5,152");
    expect(m.html).toContain("Rs 5,152 in cash");
    expect(m.html).toContain("Suzuki Swift");
    expect(m.html).toContain("Nothing to pay online");
    expect(m.html).toContain("To pay at pickup (cash)");
    // Bilingual, like every customer email.
    expect(m.html).toContain("FRANÇAIS");
    expect(m.html).toContain("Rien à payer en ligne");
    // The RR-329D81 regression, and the bank it must never send them to.
    expect(m.html).not.toContain("3,864");
    expect(m.html).not.toContain("Deposit to confirm");
    expect(m.html).not.toContain(PAYMENT.account);
    // The existing emails never state the Rs 5,000 car security deposit, so
    // this one does not introduce it either.
    expect(m.html).not.toMatch(/security deposit/i);
  });

  it("is keyed once per booking and sent as the registered status type", async () => {
    const { sendVehicleConfirmedInPerson } = await import("@/lib/email");
    await sendVehicleConfirmedInPerson({ ...RENTAL });
    const m = only();
    expect(m.idempotencyKey).toBe(`booking_confirmed_in_person:${ID}`);
    expect(m.type).toBe("car_booking_status");
    expect(Object.keys(EMAIL_TYPES)).toContain(m.type);
    expect(m.relatedType).toBe("booking");
    expect(m.relatedId).toBe(ID);
    expect(m.attachments?.length, "the confirmation PDF is missing").toBeGreaterThan(0);
  });

  it("subtracts cash taken as it was confirmed", async () => {
    const { sendVehicleConfirmedInPerson } = await import("@/lib/email");
    await sendVehicleConfirmedInPerson({ ...RENTAL, scooter: "burgman", amount_paid: 2000 });
    const m = only();
    expect(m.type).toBe("scooter_booking_status");
    expect(m.html).toContain("Rs 3,152 in cash");
    expect(m.html).toContain("already received Rs 2,000");
  });

  it("escapes what a person typed", async () => {
    const { sendVehicleConfirmedInPerson } = await import("@/lib/email");
    await sendVehicleConfirmedInPerson({ ...RENTAL, name: "<b>Eve</b> & Co" });
    expect(only().html).toContain("&lt;b&gt;Eve&lt;/b&gt; &amp; Co");
  });

  it("the PDF asks for cash while cash is owed", async () => {
    const { sendVehicleConfirmedInPerson } = await import("@/lib/email");
    await sendVehicleConfirmedInPerson({ ...RENTAL, amount_paid: 2000 });
    expect(docs).toHaveLength(1);
    expect(docs[0].notes).toContain("Pay in cash when you collect the vehicle");
  });

  it("paid in full as it was confirmed: the PDF asks for nothing more (M220 review)", async () => {
    const { sendVehicleConfirmedInPerson } = await import("@/lib/email");
    await sendVehicleConfirmedInPerson({ ...RENTAL, amount_paid: 5152 });
    const m = only();
    expect(docs[0].notes).toBe("Paid in full. Bring your driver's licence and this reference.");
    expect(docStatus(docs[0], computeMoney(docs[0])).label).toBe("PAID IN FULL");
    expect(m.html).toContain("paid in full");
    expect(m.html).not.toMatch(/Pay <strong>Rs [\d,]+ in cash/);
  });

  it("sends nothing without an address", async () => {
    const { sendVehicleConfirmedInPerson } = await import("@/lib/email");
    expect(await sendVehicleConfirmedInPerson({ ...RENTAL, email: null })).toBe(false);
    expect(sent).toHaveLength(0);
  });
});

describe("the confirmation of a reservation paid in person", () => {
  it("says pay on arrival, in cash, nothing online", async () => {
    const { sendPlaceConfirmedInPerson } = await import("@/lib/email");
    expect(await sendPlaceConfirmedInPerson({ ...RESERVATION })).toBe(true);
    const m = only();
    expect(m.html).toContain("Rs 3,600 on arrival (cash)");
    expect(m.html).toContain("Nothing to pay online");
    expect(m.html).toContain("à votre arrivée (en espèces)");
    expect(m.html).not.toContain(PAYMENT.account);
    expect(m.type).toBe("activity_status");
    expect(m.idempotencyKey).toBe(`booking_confirmed_in_person:${ID}`);
    expect(m.relatedType).toBe("place_booking");
  });

  it("a stay is filed as accommodation", async () => {
    const { sendPlaceConfirmedInPerson } = await import("@/lib/email");
    await sendPlaceConfirmedInPerson({ ...RESERVATION, category: "hotel" });
    expect(only().type).toBe("accommodation_status");
  });

  it("the PDF says pay on arrival while owed, and only 'paid in full' once it is not", async () => {
    const { sendPlaceConfirmedInPerson } = await import("@/lib/email");
    await sendPlaceConfirmedInPerson({ ...RESERVATION });
    expect(docs[0].notes).toContain("Pay in cash on arrival");
    await sendPlaceConfirmedInPerson({ ...RESERVATION, amount_paid: 3600 });
    expect(docs[1].notes).toBe("Paid in full. Show this reference if asked.");
  });
});

describe("the receipt for a payment recorded in person", () => {
  const RECEIPT = {
    id: ID,
    email: RENTAL.email,
    name: RENTAL.name,
    scooter: "Suzuki Swift",
    vehicleCategory: "car",
    start_date: RENTAL.start_date,
    end_date: RENTAL.end_date,
    days: 4,
    total_amount: 5152,
    delivery_fee: 0,
    deposit_amount: 1288,
    deposit_pct: 25,
    payInPerson: true,
  };

  it("names the method, the day, and what is still to pay", async () => {
    const { sendBookingPaymentReceipt } = await import("@/lib/email");
    await sendBookingPaymentReceipt({
      ...RECEIPT,
      received: 2000,
      method: "Cash",
      paymentId: "pay-1",
      paidToDate: 2000,
      receivedOn: "2026-09-29",
    });
    const m = only();
    expect(m.html).toContain("Rs 2,000</strong> in cash on 29 September 2026");
    expect(m.html).toContain("Still to pay: <strong>Rs 3,152</strong>, in cash at pickup");
    expect(m.html).toContain("en espèces le 29 septembre 2026");
    expect(m.idempotencyKey).toBe("payment_receipt:pay-1");
    expect(m.type).toBe("car_payment_confirmation");
  });

  it("a second payment gets its OWN receipt, and knows about the first", async () => {
    const { sendBookingPaymentReceipt } = await import("@/lib/email");
    await sendBookingPaymentReceipt({
      ...RECEIPT,
      received: 3152,
      method: "MCB Juice",
      paymentId: "pay-2",
      paidToDate: 5152,
      receivedOn: "2026-10-01",
    });
    const m = only();
    expect(m.idempotencyKey).toBe("payment_receipt:pay-2");
    expect(m.html).toContain("by MCB Juice");
    expect(m.html).toContain("Paid in full");
    expect(m.html).toContain("Paid so far");
    expect(m.html).toContain("Rs 5,152");
    expect(m.html).not.toContain("Still to pay");
  });

  it("the PayPal / bank-transfer receipt still works, once per booking", async () => {
    const { sendBookingPaymentReceipt } = await import("@/lib/email");
    await sendBookingPaymentReceipt({
      ...RECEIPT,
      payInPerson: false,
      vehicleCategory: "scooter",
      received: 1288,
      method: "Bank transfer",
    });
    const m = only();
    expect(m.idempotencyKey).toBe(`scooter_payment_confirmation:${ID}`);
    expect(m.html).toContain("by bank transfer");
    expect(m.html).toContain("your booking is confirmed");
    expect(m.html).toContain("Rs 3,864</strong>, at pickup");
  });

  it("a reservation paid in cash on arrival is paid in full", async () => {
    const { sendPlacePaymentReceipt } = await import("@/lib/email");
    await sendPlacePaymentReceipt({
      id: ID,
      email: RESERVATION.email,
      name: RESERVATION.name,
      placeName: RESERVATION.place_name,
      category: "boat",
      when: "2 Oct 2026 at 09:00",
      price: 3600,
      received: 3600,
      method: "Cash",
      paymentId: "pay-3",
      paidToDate: 3600,
      receivedOn: "2026-10-02",
      payInPerson: true,
    });
    const m = only();
    expect(m.idempotencyKey).toBe("payment_receipt:pay-3");
    expect(m.type).toBe("activity_payment_confirmation");
    expect(m.html).toContain("in cash on 2 October 2026");
    expect(m.html).toContain("Paid in full");
  });
});

describe("the PDF of a receipt for ONE payment (M220 review)", () => {
  const RECEIPT = {
    id: ID,
    email: RENTAL.email,
    name: RENTAL.name,
    scooter: "Suzuki Swift",
    vehicleCategory: "car",
    start_date: RENTAL.start_date,
    end_date: RENTAL.end_date,
    days: 4,
    total_amount: 5152,
    delivery_fee: 0,
    deposit_amount: 1288,
    deposit_pct: 25,
    payInPerson: true,
  };

  it("the first payment: 'Received with thanks' is this payment, and the rest is owed", async () => {
    const { sendBookingPaymentReceipt } = await import("@/lib/email");
    await sendBookingPaymentReceipt({
      ...RECEIPT,
      received: 2000,
      method: "Cash",
      paymentId: "a1b2c3d4-0000-4000-8000-000000000001",
      paidToDate: 2000,
      receivedOn: "2026-09-29",
    });
    const d = docs[0];
    const m = computeMoney(d);
    expect(heroAmount(d, m)).toEqual({ minor: 200000, caption: "Received with thanks" });
    expect(m.totalMinor).toBe(515200);
    expect(m.outstandingMinor).toBe(315200);
    expect(d.notes).toContain("Still to pay: Rs 3,152, in cash at pickup.");
    expect(only().attachments?.[0].name).toBe("Receipt-RR-4F2A1B-A1B2C3.pdf");
  });

  it("a later payment: the hero is THIS payment, not the running total, and the balance stays true", async () => {
    const { sendBookingPaymentReceipt } = await import("@/lib/email");
    await sendBookingPaymentReceipt({
      ...RECEIPT,
      received: 3152,
      method: "MCB Juice",
      paymentId: "pay-2",
      paidToDate: 5152,
      receivedOn: "2026-09-29",
    });
    const d = docs[0];
    const m = computeMoney(d);
    // It used to print Rs 5,152 "Received with thanks" for a Rs 3,152 payment.
    expect(heroAmount(d, m)).toEqual({ minor: 315200, caption: "Received with thanks" });
    // The first payment is its own line, so Paid + Balance + badge still add up.
    expect(d.lines.at(-1)).toEqual({ description: "Received before this payment", qty: 1, unitMinor: -200000 });
    expect(m.outstandingMinor).toBe(0);
    expect(docStatus(d, m).label).toBe("PAID IN FULL");
    expect(d.depositPct).toBeNull();
    expect(d.depositFixedMinor).toBeNull();
    expect(d.notes).toContain("Rs 3,152 received by MCB Juice");
    expect(d.notes).toContain("Paid so far: Rs 5,152 of Rs 5,152.");
    expect(d.notes).toContain("Paid in full.");
    // Its own file: two receipts for one booking must not share a name.
    expect(only().attachments?.[0].name).toBe("Receipt-RR-4F2A1B-PAY2.pdf");
  });

  it("the once-per-booking PayPal / bank-transfer receipt keeps its name and its figure", async () => {
    const { sendBookingPaymentReceipt } = await import("@/lib/email");
    await sendBookingPaymentReceipt({ ...RECEIPT, payInPerson: false, received: 1288, method: "Bank transfer" });
    const d = docs[0];
    expect(computeMoney(d).receivedMinor).toBe(128800);
    expect(d.lines.some((l) => l.unitMinor < 0)).toBe(false);
    expect(only().attachments?.[0].name).toBe("Receipt-RR-4F2A1B.pdf");
  });

  it("a reservation's second payment is receipted the same way", async () => {
    const { sendPlacePaymentReceipt } = await import("@/lib/email");
    await sendPlacePaymentReceipt({
      id: ID,
      email: RESERVATION.email,
      name: RESERVATION.name,
      placeName: RESERVATION.place_name,
      category: "boat",
      when: "2 Oct 2026 at 09:00",
      start_date: RESERVATION.start_date,
      price: 3600,
      received: 2600,
      method: "Cash",
      paymentId: "pay-4",
      paidToDate: 3600,
      receivedOn: "2026-09-29",
      payInPerson: true,
    });
    const d = docs[0];
    const m = computeMoney(d);
    expect(heroAmount(d, m).minor).toBe(260000);
    expect(m.outstandingMinor).toBe(0);
    expect(d.notes).toContain("Paid so far: Rs 3,600 of Rs 3,600.");
    expect(only().attachments?.[0].name).toBe("Receipt-RR-4F2A1B-PAY4.pdf");
  });
});

describe("a receipt recorded on or after the pickup / arrival day (M220 review)", () => {
  it("a rental asks them to bring nothing, and the rest is 'Still to pay (cash)'", async () => {
    islandDay("2026-10-01");
    const { sendBookingPaymentReceipt } = await import("@/lib/email");
    await sendBookingPaymentReceipt({
      id: ID,
      email: RENTAL.email,
      name: RENTAL.name,
      scooter: "Suzuki Swift",
      vehicleCategory: "car",
      start_date: RENTAL.start_date,
      end_date: RENTAL.end_date,
      days: 4,
      total_amount: 5152,
      delivery_fee: 0,
      payInPerson: true,
      received: 2000,
      method: "Cash",
      paymentId: "pay-5",
      paidToDate: 2000,
      receivedOn: "2026-10-01",
    });
    const m = only();
    expect(m.html).toContain("Still to pay (cash): <strong>Rs 3,152</strong>.");
    expect(m.html).toContain("Reste à payer (espèces) : <strong>Rs 3,152</strong>.");
    expect(m.html).not.toContain("at pickup");
    expect(m.html).not.toContain("Before your pickup");
    expect(m.html).not.toContain("bring it with you");
    expect(m.html).not.toContain("au retrait");
    expect(docs[0].notes).toContain("Still to pay (cash): Rs 3,152.");
  });

  it("the day before pickup it still says what to bring", async () => {
    islandDay("2026-09-30");
    const { sendBookingPaymentReceipt } = await import("@/lib/email");
    await sendBookingPaymentReceipt({
      id: ID,
      email: RENTAL.email,
      name: RENTAL.name,
      scooter: "Suzuki Swift",
      start_date: RENTAL.start_date,
      end_date: RENTAL.end_date,
      total_amount: 5152,
      payInPerson: true,
      received: 2000,
      method: "Cash",
      paymentId: "pay-6",
      paidToDate: 2000,
    });
    const m = only();
    expect(m.html).toContain("Before your pickup");
    expect(m.html).toContain(", in cash at pickup");
  });

  it("a reservation drops 'on arrival' from the arrival day on", async () => {
    islandDay("2026-10-02");
    const { sendPlacePaymentReceipt } = await import("@/lib/email");
    await sendPlacePaymentReceipt({
      id: ID,
      email: RESERVATION.email,
      name: RESERVATION.name,
      placeName: RESERVATION.place_name,
      category: "boat",
      when: "2 Oct 2026 at 09:00",
      start_date: RESERVATION.start_date,
      price: 3600,
      received: 1000,
      method: "Cash",
      paymentId: "pay-7",
      paidToDate: 1000,
      payInPerson: true,
    });
    const m = only();
    expect(m.html).toContain("Still to pay (cash): <strong>Rs 2,600</strong>.");
    expect(m.html).not.toContain("on arrival");
    expect(m.html).not.toContain("à votre arrivée");
  });
});

describe("the reminders read what was actually paid", () => {
  it("the pickup reminder tells a cash customer what to bring", async () => {
    const { sendPickupReminder } = await import("@/lib/email");
    await sendPickupReminder({ ...RENTAL });
    const m = only();
    expect(m.html).toContain("Please bring Rs 5,152 in cash");
    expect(m.html).toContain("To pay at pickup (cash)");
    expect(m.html).not.toContain("Deposit to confirm");
    expect(m.html).not.toContain("3,864");
  });

  it("an online booking whose deposit arrived shows it as paid, with the true balance", async () => {
    const { sendPickupReminder } = await import("@/lib/email");
    await sendPickupReminder({
      ...RENTAL,
      pay_in_person: false,
      amount_paid: 1288,
      deposit_paid_at: "2026-09-20T10:00:00Z",
    });
    const m = only();
    expect(m.html).toContain("Deposit paid");
    expect(m.html).toContain("Rs 3,864");
    expect(m.html).not.toContain("in cash");
  });

  it("the owner's deliver reminder says how much cash to collect", async () => {
    const { sendAdminPickupReminder } = await import("@/lib/email");
    await sendAdminPickupReminder({ ...RENTAL });
    const m = only();
    expect(m.subject).toContain("💵 Collect Rs 5,152 in cash");
    expect(m.html).toContain("💵 Collect Rs 5,152 in cash");
  });

  it("the reservation reminder says pay in cash on arrival, and the owner's says collect", async () => {
    const { sendPlaceReminder, sendAdminPlaceReminder } = await import("@/lib/email");
    await sendPlaceReminder({ ...RESERVATION });
    expect(sent[0].html).toContain("Pay Rs 3,600 in cash on arrival");
    expect(sent[0].html).toContain("Réglez Rs 3,600 en espèces à votre arrivée");
    await sendAdminPlaceReminder({ ...RESERVATION });
    expect(sent[1].html).toContain("💵 Collect Rs 3,600 in cash on arrival");
  });

  it("an online reservation's reminder is unchanged — no cash line", async () => {
    const { sendPlaceReminder } = await import("@/lib/email");
    await sendPlaceReminder({ ...RESERVATION, pay_in_person: false });
    expect(only().html).not.toContain("in cash");
  });

  it("the return reminder, after pickup, says 'Still to pay (cash)', not 'at pickup' (M220 review)", async () => {
    islandDay("2026-10-04");
    const { sendReturnReminder } = await import("@/lib/email");
    await sendReturnReminder({ ...RENTAL, amount_paid: 2000 });
    const m = only();
    expect(m.html).toContain("Still to pay (cash) · Reste à payer (espèces)");
    expect(m.html).toContain("Rs 3,152");
    expect(m.html).not.toContain("To pay at pickup");
  });

  it("a rental confirmed by the old pill never tells them their deposit is still to pay", async () => {
    const { sendPickupReminder } = await import("@/lib/email");
    await sendPickupReminder({ ...RENTAL, pay_in_person: false });
    const m = only();
    expect(m.html).toContain("Deposit paid");
    expect(m.html).not.toContain("Still to pay");
  });
});

describe("the request emails no longer promise online payment only", () => {
  const REQUEST = { ...RENTAL, status: "pending", pay_in_person: false };

  it("a rental request offers paying in person, and acknowledges the preference", async () => {
    const { sendBookingEmails } = await import("@/lib/email");
    await sendBookingEmails({ ...REQUEST, payment_preference: "in_person" });
    const customer = sent.find((s) => s.to === RENTAL.email)!;
    expect(customer.html).toContain("or pay in person, when we agree it with you");
    expect(customer.html).toContain("You asked to pay in person");
    expect(customer.html).toContain("payer en personne, si nous en convenons ensemble");
    expect(customer.html).toContain("Vous avez demandé à payer en personne");
    // M220 review: no online deposit is quoted to someone who asked to pay in
    // person — not in the paragraph, not on the card.
    expect(customer.html).not.toContain("Deposit to confirm");
    expect(customer.html).not.toContain("secures the vehicle");
    expect(customer.html).not.toContain("réserve le véhicule");
    expect(customer.html).toContain("In person, to be confirmed");
    const owner = sent.find((s) => s.to !== RENTAL.email)!;
    expect(owner.html).toContain("Wants to pay");
  });

  it("without a preference it offers the option, acknowledges nothing, and quotes the plan", async () => {
    const { sendBookingEmails } = await import("@/lib/email");
    await sendBookingEmails({ ...REQUEST });
    const customer = sent.find((s) => s.to === RENTAL.email)!;
    expect(customer.html).toContain("or pay in person");
    expect(customer.html).not.toContain("You asked to pay in person");
    // A request still quotes the plan — it is not a claim anything was paid.
    expect(customer.html).toContain("Deposit to confirm");
    expect(customer.html).toContain("secures the vehicle");
  });

  it("a reservation request says how it can be paid once it is checked", async () => {
    const { sendPlaceBookingEmails } = await import("@/lib/email");
    await sendPlaceBookingEmails({ ...RESERVATION, status: "pending", pay_in_person: false, payment_preference: "in_person" });
    const customer = sent.find((s) => s.to === RESERVATION.email)!;
    expect(customer.html).toContain(
      "Once we have checked it is free, you can pay online by bank transfer or PayPal — or in person, when we agree it with you.",
    );
    expect(customer.html).toContain("You asked to pay in person");
    expect(customer.html).toContain("Rien n'est débité pour l'instant");
    expect(customer.html).toContain("Une fois la disponibilité vérifiée");
  });

  it("a request-only listing (no price) promises no online payment (M220 review)", async () => {
    const { sendPlaceBookingEmails } = await import("@/lib/email");
    for (const deposit_amount of [null, 0]) {
      sent.length = 0;
      await sendPlaceBookingEmails({ ...RESERVATION, deposit_amount, status: "pending", pay_in_person: false });
      const customer = sent.find((s) => s.to === RESERVATION.email)!;
      expect(customer.html).not.toContain("PayPal");
      expect(customer.html).not.toContain("Nothing is charged yet");
      expect(customer.html).not.toContain("Rien n'est débité");
    }
  });
});

describe("the push for a confirmation", () => {
  it("a cash booking is told how to pay, not just 'confirmed'", async () => {
    const { notifyBookingStatus } = await import("@/lib/notifications/booking-status");
    await notifyBookingStatus({
      id: ID,
      email: RENTAL.email,
      status: "confirmed",
      kind: "vehicle",
      payInPerson: true,
      balanceRupees: 5152,
    });
    expect(pushes).toEqual([
      {
        email: RENTAL.email,
        title: "Confirmed — pay in cash at pickup",
        body: `${REF} is confirmed. Pay Rs 5,152 in cash at pickup — nothing to pay online.`,
      },
    ]);
  });

  it("an online booking keeps the generic line, even when the row cannot be read", async () => {
    const { notifyBookingStatus } = await import("@/lib/notifications/booking-status");
    await notifyBookingStatus({ id: ID, email: RENTAL.email, status: "confirmed" });
    expect(pushes[0].title).toBe("Booking confirmed");
    expect(pushes[0].body).toBe(`Your booking ${REF} is confirmed. We'll see you soon.`);
  });

  it("a reservation says on arrival", async () => {
    const { inPersonConfirmedCopy } = await import("@/lib/notifications/booking-status");
    expect(inPersonConfirmedCopy("place", REF, 3600)).toEqual({
      title: "Confirmed — pay on arrival",
      body: `${REF} is confirmed. Pay Rs 3,600 in cash on arrival — nothing to pay online.`,
    });
    expect(inPersonConfirmedCopy("vehicle", REF, 0).body).toContain("paid in full");
    expect(inPersonConfirmedCopy("vehicle", REF, null).body).toBe(
      `${REF} is confirmed. Pay in cash at pickup — nothing to pay online.`,
    );
  });
});
