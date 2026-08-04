import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasShop } from "@/lib/merchant/context";
import OnboardingForm from "@/components/merchant/OnboardingForm";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function MerchantOnboardingPage() {
  const supabase = await createClient();

  // A merchant who already has a shop has nothing to onboard — send them to
  // the dashboard instead of letting them create a second one from this form.
  // (This is a page-load check, not the real race guard — that's the partial
  // unique index on merchants(owner_id); see onboard_merchant().)
  if (await hasShop(supabase)) redirect("/merchant");

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("is_active", true)
    .order("position");

  return <OnboardingForm categories={categories ?? []} />;
}
