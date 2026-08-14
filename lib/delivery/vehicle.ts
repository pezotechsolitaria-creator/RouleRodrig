// ── What a vehicle can carry ────────────────────────────────────────────────
//
// The AUTHORITY is SQL: `vehicle_can_carry()` (M103) is what dispatch actually
// gates on, and no screen may be trusted to decide who gets offered a job.
//
// This is the mirror the SCREENS use — the driver page explaining why large
// jobs never reach a scooter, the admin desk labelling a delivery, the checkout
// telling a customer what ticking the box does. Written once here rather than
// as four hardcoded lists that drift apart the first time the owner adds a
// pickup to `delivery_settings.large_item_vehicles`.
//
// DEFAULT_LARGE_ITEM_VEHICLES mirrors the column default. Anything reading live
// settings should pass them in rather than rely on it — the point of that
// column is that the owner can change it without a deploy.

export type SizeClass = "standard" | "large";

/** The vehicles a driver can register (app/api/driver/apply/route.ts). */
export const VEHICLE_TYPES = ["scooter", "car", "van", "bicycle", "foot"] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

/** Mirrors `delivery_settings.large_item_vehicles`' default. */
export const DEFAULT_LARGE_ITEM_VEHICLES: readonly string[] = ["car", "van"];

export const VEHICLE_LABEL: Record<string, string> = {
  scooter: "Scooter or motorbike",
  car: "Car",
  van: "Van or pickup",
  bicycle: "Bicycle",
  foot: "On foot",
};

/**
 * Can this vehicle take this job?
 *
 * Mirrors the SQL exactly, including its two permissive cases: an unknown or
 * absent size class is carryable by everyone, because an unset requirement must
 * never silently strand a delivery that nobody is eligible for.
 */
export function vehicleCanCarry(
  vehicleType: string | null | undefined,
  sizeClass: SizeClass | string | null | undefined,
  largeItemVehicles: readonly string[] = DEFAULT_LARGE_ITEM_VEHICLES,
): boolean {
  if ((sizeClass ?? "standard") !== "large") return true;
  return largeItemVehicles.includes(vehicleType ?? "");
}

/**
 * One line for a driver about what their vehicle means for the jobs they see.
 *
 * Said plainly and without apology: a scooter rider is not being penalised, and
 * the sentence should not read as one. They are simply not sent a fridge.
 */
export function vehicleEligibilityNote(
  vehicleType: string | null | undefined,
  largeItemVehicles: readonly string[] = DEFAULT_LARGE_ITEM_VEHICLES,
): string {
  return vehicleCanCarry(vehicleType, "large", largeItemVehicles)
    ? "You get every delivery, including large items."
    : "You get standard deliveries. Large items go to drivers with a car or a van.";
}
