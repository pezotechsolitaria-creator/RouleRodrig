import type { Metadata } from "next";
import { viewOrder } from "@/lib/esim/service";
import AppPageHeader from "@/components/AppPageHeader";
import OrderInstall from "./OrderInstall";
import { toUiLang } from "../../copy";

// ── /esim/order/ES-XXXXXX?k=… — the install page ─────────────────────────────
//
// Private: the key in the URL is the credential (lib/esim/ids.ts), so the page
// is noindex, sends no Referer anywhere (a tap on a help link must not hand
// the key to another site), and is rendered per request.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your eSIM | Roule Rodrigues",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function EsimOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ k?: string }>;
}) {
  const [{ ref }, { k }] = await Promise.all([params, searchParams]);
  const view = await viewOrder(ref, k ?? null, { refresh: true });

  return (
    <>
      <AppPageHeader showBack backHref="/esim" />
      <main className="min-h-[calc(100vh-4rem)] bg-dark pb-[calc(8rem+env(safe-area-inset-bottom))]">
        <OrderInstall initial={view} refParam={ref} keyParam={k ?? null} lang={view ? toUiLang(view.language) : "en"} />
      </main>
    </>
  );
}
