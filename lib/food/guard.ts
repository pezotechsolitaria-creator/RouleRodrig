import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { guardAdminApi, type AdminApiContext } from "@/lib/admin/api-guard";

// The gate every /api/admin/food/* route opens with.
//
// The implementation moved to lib/admin/api-guard.ts once the marketplace ops
// desk needed the same door: the check was never food-specific, and a security
// check written in two places is a security check that will eventually differ.
// This file stays as the name five food routes already import.

export type FoodAdminContext = AdminApiContext;

export function guardFoodAdmin(req: NextRequest): Promise<NextResponse | FoodAdminContext> {
  return guardAdminApi(req, "Food admin");
}

export { readJson, failed } from "@/lib/admin/api-guard";
