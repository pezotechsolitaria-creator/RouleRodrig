"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleStores, STORE_COOKIE } from "@/lib/merchant/context";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/merchant/login");
}

/**
 * Switch which shop or restaurant the dashboard is acting for.
 *
 * The submitted id is checked against getAccessibleStores() before it is stored,
 * so a hand-crafted form cannot point the dashboard at somebody else's shop —
 * the cookie is a preference, never a permission.
 */
export async function switchStore(formData: FormData) {
  const storeId = String(formData.get("storeId") ?? "");
  const supabase = await createClient();
  const allowed = await getAccessibleStores(supabase);
  if (!allowed.some((s) => s.id === storeId)) return;

  (await cookies()).set(STORE_COOKIE, storeId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/merchant", "layout");
}
