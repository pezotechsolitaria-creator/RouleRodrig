"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, UtensilsCrossed, Plus } from "lucide-react";

// ── Menu du jour, for the person cooking it ────────────────────────────────
//
// The owner: "a dashboard for restaurants will help them to set up stocks menu
// du jour by themselves, and if they are not computer literate, we the admin
// can do it for them in our main dashboard."
//
// So this is deliberately NOT a second copy of /admin/food. The daily job in a
// kitchen is not creating dishes — it is saying what is on today and how much
// is left. Three controls, nothing else:
//
//   · On the menu — take a dish off entirely
//   · Sold out    — until tomorrow, then it comes back on its own
//   · Today's count — how many are being made
//
// No prices. A cook marking the fish sold out is operations; a cook repricing
// the fish is the owner's revenue. Same person today, different people soon,
// and the line is cheaper to keep than to add later. Everything here is still
// editable from /admin/food for a restaurant that would rather phone.

type Dish = {
  productId: string;
  name: string;
  kitchen: string;
  onMenu: boolean;
  dailyCapacity: number | null;
  soldOut: boolean;
  soldToday: number;
};

export default function MenuPanel({ canManage = false }: { canManage?: boolean } = {}) {
  const [dishes, setDishes] = useState<Dish[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/kitchen?menu=1", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not load the menu.");
      setDishes((body.dishes as Dish[]) ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the menu.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function update(dish: Dish, patch: Record<string, unknown>) {
    if (busy) return;
    setBusy(dish.productId);
    setError(null);
    try {
      const res = await fetch("/api/kitchen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: dish.productId, ...patch }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "That didn't save.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(null);
    }
  }

  if (dishes === null) {
    return (
      <p className="flex items-center gap-2 font-dm text-sm text-muted">
        <Loader2 size={14} className="animate-spin" /> Loading the menu…
      </p>
    );
  }

  return (
    <div>
      {error && (
        <p role="alert" className="mb-3 rounded-xl border border-red-500/25 bg-red-500/[0.07] px-4 py-3 font-dm text-sm text-red-400">
          {error}
        </p>
      )}

      {dishes.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-dark-card p-8 text-center">
          <UtensilsCrossed size={24} className="mx-auto text-muted" />
          {/* "Roulé Rodrigues adds dishes for you" was never true of somebody
              who OWNS the shop — they have had /merchant/products the whole
              time and this screen told them to go and ask. Staff still get the
              original sentence, because for them it is correct. */}
          {canManage ? (
            <>
              <p className="mt-2 font-dm text-sm text-muted">
                No dishes yet. Add your first one and it appears here.
              </p>
              <Link
                href="/merchant/products/new"
                className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-yellow px-4 font-syne text-sm font-bold text-dark"
              >
                <Plus size={15} /> Add a dish
              </Link>
            </>
          ) : (
            <p className="mt-2 font-dm text-sm text-muted">
              No dishes yet. Roulé Rodrigues adds dishes for you — ask them and they appear here.
            </p>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {dishes.map((d) => (
            <li
              key={d.productId}
              className={`rounded-2xl border p-4 ${
                d.soldOut || !d.onMenu ? "border-white/10 bg-dark-card opacity-70" : "border-white/12 bg-dark-card"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-syne text-base font-bold">{d.name}</p>
                  <p className="font-dm text-xs text-muted">
                    {d.kitchen}
                    {/* Sold today against the count, so the number means
                        something. No money — that is the owner's screen. */}
                    {" · "}
                    {d.soldToday} sold today
                    {d.dailyCapacity != null && ` of ${d.dailyCapacity}`}
                  </p>
                </div>
                {busy === d.productId && <Loader2 size={15} className="mt-1 shrink-0 animate-spin text-yellow" />}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => void update(d, { soldOut: !d.soldOut })}
                  disabled={busy !== null}
                  className={`min-h-[44px] rounded-full px-4 font-syne text-sm font-bold disabled:opacity-50 ${
                    d.soldOut ? "bg-yellow text-dark" : "border border-white/20 text-offwhite"
                  }`}
                >
                  {/* Comes back on its own at midnight, so nobody has to
                      remember to undo it before service tomorrow. */}
                  {d.soldOut ? "Sold out — put back on" : "Mark sold out"}
                </button>

                <button
                  onClick={() => void update(d, { onMenu: !d.onMenu })}
                  disabled={busy !== null}
                  className="min-h-[44px] rounded-full border border-white/20 px-4 font-dm text-sm text-offwhite disabled:opacity-50"
                >
                  {d.onMenu ? "Take off the menu" : "Put on the menu"}
                </button>

                <button
                  onClick={() => {
                    const answer = window.prompt(
                      `How many ${d.name} are you making today?\n\nLeave empty for "as many as we can".`,
                      d.dailyCapacity != null ? String(d.dailyCapacity) : "",
                    );
                    if (answer === null) return;
                    const trimmed = answer.trim();
                    if (trimmed === "") return void update(d, { clearCapacity: true });
                    const n = Number.parseInt(trimmed, 10);
                    if (Number.isNaN(n) || n < 0 || n > 999) {
                      setError("Enter a count between 0 and 999.");
                      return;
                    }
                    void update(d, { capacity: n });
                  }}
                  disabled={busy !== null}
                  className="min-h-[44px] rounded-full border border-white/20 px-4 font-dm text-sm text-offwhite disabled:opacity-50"
                >
                  {d.dailyCapacity != null ? `Today: ${d.dailyCapacity}` : "Set today's count"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ADD A DISH, ON A MENU THAT ALREADY HAS DISHES.
          This control used to exist ONLY inside the empty state, so the moment
          a kitchen had one dish it lost every way to add a second from this
          screen — the screen called "Today's menu", which is where a cook
          plainly goes to change what they are cooking. Ti Kitchen has seven
          dishes and no button.

          It also pointed at /merchant/products, the catalogue LIST, rather than
          the form: a cook who found it still had to work out that "add a dish"
          means "open the product editor". */}
      {canManage && dishes.length > 0 && (
        <Link
          href="/merchant/products/new"
          className="mt-4 flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-yellow/40 bg-yellow/[0.08] font-syne text-sm font-bold text-yellow transition-colors hover:bg-yellow/[0.14]"
        >
          <Plus size={16} /> Add a dish
        </Link>
      )}
    </div>
  );
}
