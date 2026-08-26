// ── What a vehicle can carry, and what it should not ────────────────────────
//
// The AUTHORITY is SQL: vehicle_can_handle() is what dispatch gates on, and no
// screen may be trusted to decide who gets offered a job. This is the mirror
// the SCREENS use — the driver page explaining what reaches them, the admin
// desk, the customer form saying what a choice will do.
//
// ── WHY THERE ARE NOW TWO QUESTIONS, NOT ONE ───────────────────────────────
// The old model asked one: does it FIT? A job was "standard" or "large", and
// large meant car-or-van. That is necessary and nowhere near sufficient, and
// the owner put his finger on exactly why: A LORRY CANNOT DELIVER FOOD.
//
// Not because the food does not fit. Because it is the wrong tool — a lorry is
// slow, it cannot reach half the tracks on this island, and a hot meal in a
// flatbed arrives cold and covered in dust. Equally an open pickup is right for
// cement and wrong for documents in the rain, and a bicycle is right for an
// envelope and wrong for a gas bottle.
//
// So a job now carries a CARGO KIND as well as a size, and each vehicle
// declares what it can actually do. Both must pass.
//
// ── The customer never sees this vocabulary ────────────────────────────────
// They pick what the thing IS, in plain words with a picture. "Is this a large
// item?" was a judgement call we were asking the customer to make on our
// behalf; "food · a parcel · something big · something heavy or dirty" is a
// question about their own life, which is the kind people answer correctly.

export type SizeClass = "standard" | "large";

/** What is being moved. Decides suitability, not just whether it fits. */
export const CARGO_KINDS = ["general", "food", "fragile", "heavy"] as const;
export type CargoKind = (typeof CARGO_KINDS)[number];

/** The vehicles a driver can register (app/api/driver/apply/route.ts). */
export const VEHICLE_TYPES = [
  "foot",
  "bicycle",
  "scooter",
  "car",
  "van",
  "pickup",
  "lorry",
] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const VEHICLE_LABEL: Record<string, string> = {
  foot: "On foot",
  bicycle: "Bicycle",
  scooter: "Scooter or motorbike",
  car: "Car",
  van: "Van",
  pickup: "Pickup truck",
  lorry: "Lorry",
};

/** Mirrors `delivery_settings.large_item_vehicles`' default. Kept so callers
 *  written against the old shape keep compiling; the capability table below is
 *  now the real answer. */
export const DEFAULT_LARGE_ITEM_VEHICLES: readonly string[] = [
  "car",
  "van",
  "pickup",
  "lorry",
];

type Capability = {
  /** Can take a job marked "large" — furniture, an appliance, several boxes. */
  large: boolean;
  /** THE LOAD IS CONTAINED — a bag, a top box, a boot, a closed van. Not "has
   *  a roof": a scooter with an insulated box is how food is delivered the
   *  world over, and an open flatbed is not, whatever the cab looks like. */
  enclosed: boolean;
  /** Quick and nimble enough that a hot meal is still hot, and able to reach a
   *  narrow track or a footpath. */
  nimble: boolean;
  /** Can take real weight — a gas bottle, cement, building materials. */
  heavy: boolean;
};

// Each row is a claim about the physical world, not a policy. Change these only
// when a vehicle genuinely changes.
const CAPABILITY: Record<VehicleType, Capability> = {
  // A bag, a delivery bag, a top box. The load is held, not exposed — which is
  // exactly how a takeaway travels. Their limit is SIZE, not protection.
  foot: { large: false, enclosed: true, nimble: true, heavy: false },
  bicycle: { large: false, enclosed: true, nimble: true, heavy: false },
  scooter: { large: false, enclosed: true, nimble: true, heavy: false },
  car: { large: true, enclosed: true, nimble: true, heavy: false },
  // A van IS a good food vehicle: enclosed, and it reaches everywhere a car
  // does. Marking it un-nimble narrowed hot food to cars alone, which on an
  // island with a handful of drivers is a real cost for no physical reason.
  van: { large: true, enclosed: true, nimble: true, heavy: true },
  // An open bed. Normal size, goes anywhere — but protects nothing.
  pickup: { large: true, enclosed: false, nimble: true, heavy: true },
  // The only genuinely un-nimble one: too big for half the tracks here, and
  // slow enough that a hot meal stops being hot.
  lorry: { large: true, enclosed: false, nimble: false, heavy: true },
};

/** What each kind of job actually demands. */
const DEMANDS: Record<CargoKind, Partial<Capability>> = {
  // Anything that fits. The size gate still applies.
  general: {},
  // Hot or cold, and it has to arrive that way: enclosed against dust and rain,
  // nimble enough to be quick. THIS is the rule that stops a lorry being sent
  // for a takeaway.
  food: { enclosed: true, nimble: true },
  // Documents, a laptop, a cake. Must not be rained on or bounced in a flatbed.
  fragile: { enclosed: true },
  // A gas bottle, cement, a washing machine. Needs a vehicle built for weight.
  heavy: { heavy: true },
};

export const CARGO_LABEL: Record<CargoKind, string> = {
  general: "A parcel or a box",
  food: "Food or something hot",
  fragile: "Fragile or must stay dry",
  heavy: "Heavy or dirty",
};

/** What the customer reads when choosing. Their life, not our vocabulary. */
export const CARGO_HELP: Record<CargoKind, string> = {
  general: "Clothes, shopping, papers, a package from family.",
  food: "A meal, a cake, anything that must arrive hot or cold.",
  fragile: "Documents, electronics, anything that must not get wet.",
  heavy: "A gas bottle, cement, an appliance, building materials.",
};

/**
 * Can this vehicle take this job?
 *
 * Mirrors the SQL exactly, including its permissive cases: an unknown vehicle
 * or an unknown cargo kind passes, because an unrecognised value must never
 * silently strand a delivery nobody is eligible for. A job offered slightly too
 * widely has a driver who can say no; a job offered to nobody just sits there.
 */
export function vehicleCanCarry(
  vehicleType: string | null | undefined,
  sizeClass: SizeClass | string | null | undefined,
  cargoKind: CargoKind | string | null | undefined = "general",
): boolean {
  const cap = CAPABILITY[(vehicleType ?? "") as VehicleType];

  // SIZE is judged cautiously: a vehicle nobody has described is not assumed
  // to be a van, so it does not get the fridge. This is the M103 contract and
  // it does not change.
  if ((sizeClass ?? "standard") === "large" && (!cap || !cap.large)) return false;

  // SUITABILITY is judged permissively: with no capability row there is nothing
  // to check, and refusing here would strand a job rather than merely offering
  // it a little too widely. A job offered too widely has a driver who can say
  // no; a job offered to nobody just sits there.
  if (!cap) return true;

  const demands = DEMANDS[(cargoKind ?? "general") as CargoKind];
  if (!demands) return true;
  if (demands.enclosed && !cap.enclosed) return false;
  if (demands.nimble && !cap.nimble) return false;
  if (demands.heavy && !cap.heavy) return false;
  return true;
}

/** Every vehicle that could take this job. Used to warn a customer BEFORE they
 *  post something nobody on the island can carry. */
export function vehiclesFor(
  sizeClass: SizeClass | string | null | undefined,
  cargoKind: CargoKind | string | null | undefined,
): VehicleType[] {
  return VEHICLE_TYPES.filter((v) => vehicleCanCarry(v, sizeClass, cargoKind));
}

/**
 * One line for a driver about what their vehicle means for the work they see.
 *
 * Said plainly and without apology. A scooter rider is not being penalised and
 * the sentence must not read as one; a lorry driver is not being told the lorry
 * is bad, only that nobody wants their dinner delivered in it.
 */
export function vehicleEligibilityNote(vehicleType: string | null | undefined): string {
  const cap = CAPABILITY[(vehicleType ?? "") as VehicleType];
  if (!cap) return "You are offered every delivery.";

  const cannot = CARGO_KINDS.filter((k) => !vehicleCanCarry(vehicleType, "standard", k));
  const sizeLine = cap.large
    ? "Large items reach you too."
    : "Large items go to a car, van, pickup or lorry.";

  if (cannot.length === 0) return `Every kind of job reaches you. ${sizeLine}`;
  const list = cannot.map((k) => CARGO_LABEL[k].toLowerCase()).join(", or ");
  return `You are not sent ${list}. ${sizeLine}`;
}
