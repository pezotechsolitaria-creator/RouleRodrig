import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Toaster } from "sonner";
import { ClipboardList } from "lucide-react";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import OrdersDesk from "./OrdersDesk";

// ── The orders desk ─────────────────────────────────────────────────────────
//
// One list of every order on the platform — kitchen, shop and event — with the
// two buttons that matter on each: accept it, or cancel it.
//
// It does not replace /admin/food, /admin/marketplace or /admin/events. Those
// stay, and they do more: menus, stock, tickets, delivery pins. This is the
// screen for the one question those three could not answer between them —
// "what is waiting for me right now?" — because each of them could only ever
// see its own third of the answer.
export const dynamic = "force-dynamic";

export const metadata = { title: "Orders · Admin" };

export default async function AdminOrdersPage() {
  const cookieStore = await cookies();
  if (!verifySession(cookieStore.get(COOKIE_NAME)?.value)) redirect("/admin/login");

  return (
    <main className="min-h-screen bg-dark px-4 pb-20 pt-8 text-offwhite lg:px-8">
      <div className="mx-auto max-w-4xl">
        <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">EVERY ORDER</p>
        <h1 className="mt-1 flex items-center gap-2 font-syne text-2xl font-extrabold">
          <ClipboardList size={20} className="text-yellow" /> Orders
        </h1>
        <p className="mt-1.5 font-dm text-sm text-muted">
          Kitchens, shops and events in one list. Accept an order or cancel it from here.
        </p>

        <OrdersDesk />
      </div>

      <Toaster
        theme="dark"
        position="top-center"
        toastOptions={{
          style: {
            background: "#15161a",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#f4f4f5",
          },
        }}
      />
    </main>
  );
}
