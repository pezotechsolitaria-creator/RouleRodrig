import { Store, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export default async function MerchantHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS-scoped read (staff_read policy → only this user's memberships). Proves
  // authenticated data access works from the app, and tells us the next step.
  const { data: staff } = await supabase.from("merchant_staff").select("merchant_id").limit(1);
  const hasShop = (staff?.length ?? 0) > 0;

  const greetName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "there";

  return (
    <div className="py-8">
      <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">WELCOME</p>
      <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">Bonzour, {greetName} 👋</h1>
      <p className="mt-1.5 font-dm text-sm text-muted">
        You&apos;re signed in as <span className="text-offwhite/90">{user?.email}</span>.
      </p>

      <div className="mt-7 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-6">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-yellow/10 text-yellow ring-1 ring-inset ring-yellow/20">
          {hasShop ? <Store size={20} /> : <Sparkles size={20} />}
        </span>
        <h2 className="mt-4 font-syne text-lg font-bold text-offwhite">
          {hasShop ? "Your shop" : "Set up your shop"}
        </h2>
        <p className="mt-1 font-dm text-sm leading-relaxed text-muted">
          {hasShop
            ? "Your merchant dashboard — today's stock, orders to prepare, and cash collected — is the next milestone."
            : "In under a minute you'll snap a photo of what you sell, set a price, and go live. The guided setup is the next milestone."}
        </p>
      </div>
    </div>
  );
}
