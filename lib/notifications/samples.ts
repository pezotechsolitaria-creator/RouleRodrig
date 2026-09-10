import {
  ownerAlert,
  alertMoneyCents,
  alertMoneyRupees,
  alertClock,
  alertElapsed,
  localDial,
} from "@/lib/notifications/owner-alert";

// ── A SAMPLE OF EVERY ALERT, WITHOUT INVENTING A SINGLE JOB ─────────────────
//
// The owner wants to read each message and say what to change. The obvious way
// to do that — create a booking, a request, an order — would put fake rows in
// front of real drivers, into real counts, and into the same board the real
// work lives on. This platform has already spent a session deleting one test
// job that got stuck.
//
// So the facts here are FROZEN FIXTURES, shaped like the real rows they were
// copied from, and the message is built by the REAL builders. That makes each
// sample a live check of the envelope — the caps, the phone shape, the link
// host — while touching no table at all.
//
// The phone number in every fixture is the owner's own, so a WhatsApp tap in a
// sample can never open a chat with a customer.

const OWNER_PHONE = "+23058363401";

export type SampleAlert = {
  key: string;
  /** What the owner would be doing when this arrives. */
  when: string;
  build: () => string;
};

export const ALERT_SAMPLES: SampleAlert[] = [
  {
    key: "delivery.request_expired",
    when: "A customer was quoted and the request timed out unbooked",
    build: () =>
      ownerAlert({
        headline: "Nobody booked: Glass - Rs 25 was offered",
        facts: [
          { label: "Customer", value: "Mee" },
          { label: "Phone", value: localDial(OWNER_PHONE) },
          { label: "Route", value: "Port Mathurin -> Baie aux Huitres" },
          { label: "Prices offered", value: 1 },
          { label: "Cheapest", value: alertMoneyCents(2500) },
          { label: "Waited", value: alertElapsed(4) },
          { label: "Account", value: "guest, no login" },
        ],
        note: "They were quoted and never booked. The request has now closed.",
        actions: [
          { kind: "chat", label: "Message them", phone: OWNER_PHONE },
          { kind: "open", label: "Board", path: "/admin/deliveries" },
        ],
      }),
  },
  {
    key: "delivery.requests_expired_digest",
    when: "Several customers were quoted and none booked",
    build: () =>
      ownerAlert({
        headline: "3 customers were quoted and never booked",
        facts: [
          { label: "Mee", value: "Glass - Rs 25 - 5836 3401 - waited 4 h" },
          { label: "Laurent", value: "Cement bag - Rs 300 - 5836 3401 - waited 9 h" },
          { label: "Sandra", value: "Pharmacy run - Rs 150 - 5836 3401 - waited 2 days" },
        ],
        note: "3 requests closed, 4 prices withdrawn.",
        actions: [{ kind: "open", label: "Board", path: "/admin/deliveries" }],
      }),
  },
  {
    key: "delivery.no_driver",
    when: "Nobody accepted a job and the offers ran out",
    build: () =>
      ownerAlert({
        headline: "No driver took this one - the customer is waiting",
        facts: [
          { label: "Job", value: "Gas cylinder" },
          { label: "Route", value: "Port Mathurin -> Riviere Cocos" },
          { label: "Customer", value: "Sandra, 5836 3401" },
          { label: "Waiting", value: alertElapsed(3) },
          { label: "Offered to", value: "4 drivers, 2 rounds" },
        ],
        note: "Assign somebody by hand, or ring the customer and tell them.",
        actions: [
          { kind: "chat", label: "Message them", phone: OWNER_PHONE },
          { kind: "open", label: "Board", path: "/admin/deliveries" },
        ],
      }),
  },
  {
    key: "delivery.package_with_driver",
    when: "A driver collected the goods and stopped",
    build: () =>
      ownerAlert({
        headline: "A driver still has this package - ring them",
        facts: [
          { label: "Job", value: "Documents" },
          { label: "Driver", value: "Jean Paul, 5836 3401" },
          { label: "Collected", value: alertClock("2026-09-10T09:15:00Z") },
          { label: "Overdue by", value: alertElapsed(5) },
          { label: "Going to", value: "Mont Lubin" },
        ],
        note: "The goods are with the driver, so this cannot be reassigned until they are back.",
        actions: [
          { kind: "chat", label: "Message the driver", phone: OWNER_PHONE },
          { kind: "open", label: "Board", path: "/admin/deliveries" },
        ],
      }),
  },
  {
    key: "ride.requested",
    when: "Somebody books a taxi",
    build: () =>
      ownerAlert({
        headline: "New taxi booking - Fri 12 Sep 10:00",
        facts: [
          { label: "Who", value: "Laurence" },
          { label: "Phone", value: localDial(OWNER_PHONE) },
          { label: "From", value: "Plaine Corail Airport" },
          { label: "To", value: "Roche Bon Dieu" },
          { label: "When", value: alertClock("2026-09-12T06:00:00Z") },
          { label: "Price", value: alertMoneyCents(80000) },
          { label: "Passengers", value: 2 },
        ],
        note: "Nobody is assigned yet.",
        actions: [
          { kind: "chat", label: "Message them", phone: OWNER_PHONE },
          { kind: "open", label: "Dispatch", path: "/admin/rides" },
        ],
      }),
  },
  {
    key: "ride.no_driver",
    when: "A booked ride has no driver and the pickup is close",
    build: () =>
      ownerAlert({
        headline: "Taxi at 10:00 still has no driver",
        facts: [
          { label: "Who", value: "Laurence, 5836 3401" },
          { label: "Pickup", value: alertClock("2026-09-12T06:00:00Z") },
          { label: "From", value: "Plaine Corail Airport" },
          { label: "Offered to", value: "3 drivers, none accepted" },
        ],
        note: "Assign somebody, or ring the passenger before they are standing at the airport.",
        actions: [
          { kind: "chat", label: "Message them", phone: OWNER_PHONE },
          { kind: "open", label: "Dispatch", path: "/admin/rides" },
        ],
      }),
  },
  {
    key: "booking.created",
    when: "A scooter or car is booked",
    build: () =>
      ownerAlert({
        headline: "Scooter booked - 12 to 15 Sep",
        facts: [
          { label: "Who", value: "A. Martin" },
          { label: "Phone", value: localDial(OWNER_PHONE) },
          { label: "Vehicle", value: "Honda Vision 110" },
          { label: "From", value: alertClock("2026-09-12T05:00:00Z") },
          { label: "Until", value: alertClock("2026-09-15T05:00:00Z") },
          // bookings store WHOLE RUPEES, not cents.
          { label: "Total", value: alertMoneyRupees(1800) },
          { label: "Paid", value: "Not yet" },
        ],
        actions: [{ kind: "open", label: "Bookings", path: "/admin" }],
      }),
  },
  {
    key: "order.payment_proof",
    when: "A customer says they have paid and uploads a slip",
    build: () =>
      ownerAlert({
        headline: "Payment slip to check - order RR-4821",
        facts: [
          { label: "Who", value: "S. Perrine" },
          { label: "Amount", value: alertMoneyCents(125000) },
          { label: "Method", value: "Bank transfer" },
          { label: "Waiting", value: alertElapsed(2) },
        ],
        note: "Nothing ships until you confirm it.",
        actions: [{ kind: "open", label: "Orders", path: "/admin" }],
      }),
  },
  {
    key: "driver.applied",
    when: "Somebody applies to drive",
    build: () =>
      ownerAlert({
        headline: "New driver application - Jean Paul",
        facts: [
          { label: "Phone", value: localDial(OWNER_PHONE) },
          { label: "Vehicle", value: "Scooter" },
          { label: "Wants to", value: "Deliver and run errands" },
          { label: "Waiting", value: alertElapsed(20) },
        ],
        note: "They cannot receive a single job until you approve them.",
        actions: [{ kind: "open", label: "Drivers", path: "/admin/deliveries" }],
      }),
  },
  {
    key: "system.worker_down",
    when: "The notification worker stops running",
    build: () =>
      ownerAlert({
        headline: "Alerts have stopped - the worker has not run for 22 min",
        facts: [
          { label: "Last run", value: alertClock("2026-09-10T18:38:00Z") },
          { label: "Queued", value: "6 messages waiting" },
        ],
        note: "WhatsApp, ntfy and delivery escalation are all silent until this is back.",
        actions: [{ kind: "open", label: "Notifications", path: "/admin/notifications" }],
      }),
  },
];

export function sampleByKey(key: string): SampleAlert | undefined {
  return ALERT_SAMPLES.find((s) => s.key === key);
}
