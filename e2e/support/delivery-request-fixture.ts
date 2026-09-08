// A faithful `delivery_request_view` body, so the customer's tracking screen
// can be driven without a service-role key.
//
// /api/delivery-requests/[id] is a privileged route and SUPABASE_SERVICE_ROLE_KEY
// is deliberately absent from local .env.local, so the real page 503s here and
// the screen the owner complained about could not be opened at all locally.
// Stubbing the one POST it makes renders the REAL component, with the real
// layout, against a body shaped exactly like production's.
//
// The values are the owner's own reported job: "f44", collected at "kot pive",
// delivered to Port Mathurin.

export type RequestState =
  | "open"
  | "quoted"
  | "accepted"
  // A cash job whose ID has not been uploaded yet. accept_delivery_quote
  // defaults to cash and advance_delivery then refuses to let the driver leave
  // `assigned` without it, so this is the DEFAULT path and the upload is the
  // one thing holding the job up.
  | "blocked"
  | "delivered";

export function requestFixture(state: RequestState) {
  const base = {
    id: "fa8c9c10-cc4b-439f-b8de-dd6afcee98ba",
    kind: "package",
    what: "f44",
    sizeClass: "small",
    cargoKind: null,
    errandKind: null,
    photoPath: null,
    scheduleKind: "asap",
    timeSlot: null,
    windowStart: new Date(Date.now() - 3_600_000).toISOString(),
    windowEnd: null,
    pickupLat: -19.7245,
    pickupLng: 63.4102,
    dropoffLat: -19.6833,
    dropoffLng: 63.4167,
    status: state === "quoted" ? "open" : state === "open" ? "open" : "accepted",
    pickupText: "kot pive",
    pickupNote: null,
    dropoffText: "Port Mathurin",
    dropoffNote: null,
    spendCap: null,
    cashLimit: 500_00,
    contactName: "Emmanuel",
    contactPhone: "+230 5xxx xxxx",
    createdAt: new Date(Date.now() - 7_200_000).toISOString(),
    expiresAt: new Date(Date.now() + 7_200_000).toISOString(),
    cancelReason: null,
    bankDetails: null,
    quotes: [] as unknown[],
    delivery: null as unknown,
  };

  if (state === "quoted") {
    base.quotes = [
      { id: "q1", driverId: "d1", driverName: "Jean", fee: 250_00, note: "Can go now", vehicleType: "scooter", createdAt: new Date().toISOString() },
      { id: "q2", driverId: "d2", driverName: "Marie", fee: 200_00, note: null, vehicleType: "car", createdAt: new Date().toISOString() },
    ];
  }

  if (state === "accepted" || state === "blocked" || state === "delivered") {
    base.delivery = {
      id: "del-1",
      status: state === "delivered" ? "delivered" : state === "blocked" ? "assigned" : "out_for_delivery",
      fee: 250_00,
      pin: "4821",
      assignedAt: new Date(Date.now() - 1_800_000).toISOString(),
      pickedUpAt: new Date(Date.now() - 900_000).toISOString(),
      deliveredAt: state === "delivered" ? new Date().toISOString() : null,
      driverId: "d1",
      driverName: "Jean",
      driverPhone: "+230 5000 0000",
      vehicleType: "scooter",
      tripId: "trip-1",
      channelKey: state === "delivered" ? null : "trip:del-1",
      paymentMethod: "cash",
      paymentProofAt: null,
      paymentReference: null,
      // Supplied unless the state is explicitly the blocked one. Leaving this
      // null by default made every "accepted" fixture a BLOCKED job, which
      // quietly measured the wrong screen.
      idDocumentAt: state === "blocked" ? null : new Date(Date.now() - 3_000_000).toISOString(),
    };
  }

  return base;
}
