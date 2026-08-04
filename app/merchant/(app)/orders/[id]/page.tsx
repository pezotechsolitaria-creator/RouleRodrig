import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasShop } from "@/lib/merchant/context";
import { isUuid } from "@/lib/file-signature";
import OrderDetail from "@/components/merchant/orders/OrderDetail";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function MerchantOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  if (!(await hasShop(supabase))) redirect("/merchant/onboarding");

  return <OrderDetail id={id} />;
}
