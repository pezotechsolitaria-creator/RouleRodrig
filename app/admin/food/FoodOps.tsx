"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardList, UtensilsCrossed, ChefHat, Tags, ScanLine, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import OrderQueue from "./OrderQueue";
import MenuPanel from "./MenuPanel";
import KitchensPanel from "./KitchensPanel";
import CategoriesPanel from "./CategoriesPanel";
import HandoffPanel from "./HandoffPanel";
import { foodWrite, type AdminFoodCategory, type AdminKitchen } from "./types";

// Food Operations.
//
// The customer's screen is deliberately simple; this one is deliberately not.
// That asymmetry is the product decision: a customer is asking "what do I want
// to eat", and the operator is running a service across several kitchens with
// no staff of their own. Hiding operational power from the operator to keep the
// admin "clean" would just move the work to WhatsApp.
//
// The tab order is the order of the day: the queue you watch all service, the
// menu you change between services, the kitchens and taxonomy you touch
// monthly, and the counter you open when someone arrives.

type Tab = "queue" | "menu" | "kitchens" | "categories" | "handoff";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "queue", label: "Orders", icon: ClipboardList },
  { id: "menu", label: "Menu", icon: UtensilsCrossed },
  { id: "kitchens", label: "Kitchens", icon: ChefHat },
  { id: "categories", label: "Categories", icon: Tags },
  { id: "handoff", label: "Handoff", icon: ScanLine },
];

export default function FoodOps() {
  const [tab, setTab] = useState<Tab>("queue");
  const [kitchens, setKitchens] = useState<AdminKitchen[]>([]);
  const [categories, setCategories] = useState<AdminFoodCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [restocking, setRestocking] = useState(false);
  // Bumped by any write that changes the catalog, so panels holding their own
  // list re-read rather than showing a stale menu after an edit elsewhere.
  const [version, setVersion] = useState(0);

  const loadShared = useCallback(async () => {
    const [k, c] = await Promise.all([
      fetch("/api/admin/food/kitchens").then((r) => r.json()).catch(() => ({})),
      fetch("/api/admin/food/categories").then((r) => r.json()).catch(() => ({})),
    ]);
    setKitchens(k.kitchens ?? []);
    setCategories(c.categories ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void loadShared(); }, [loadShared, version]);

  const restockAll = useCallback(async () => {
    if (!confirm("Restock every dish on the island to its daily count?")) return;
    setRestocking(true);
    const res = await foodWrite("/api/admin/food/actions", {
      method: "POST",
      body: JSON.stringify({ action: "restock_day" }),
    });
    setRestocking(false);
    if (!res.ok) { toast.error(res.error); return; }
    const n = (res.data as { restocked?: number } | null)?.restocked ?? 0;
    toast.success(n === 0 ? "Everything was already at capacity." : `Restocked ${n} dish${n === 1 ? "" : "es"}.`);
    setVersion((v) => v + 1);
  }, []);

  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => {
          const Icon = t.icon;
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 font-dm text-sm font-medium transition-colors ${
                on
                  ? "border-yellow/60 bg-yellow/15 text-yellow"
                  : "border-white/10 bg-dark-card text-muted hover:border-white/25 hover:text-offwhite"
              }`}
            >
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
        <button
          onClick={() => void restockAll()}
          disabled={restocking}
          title="Restock every dish to its daily count. Safe to press twice."
          className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-dark-card px-4 py-2 font-dm text-sm text-muted hover:text-yellow disabled:opacity-50"
        >
          {restocking ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
          Start the day
        </button>
      </div>

      <div className="mt-6">
        {loading ? (
          <p className="flex items-center gap-2 font-dm text-sm text-muted">
            <Loader2 size={15} className="animate-spin" /> Loading…
          </p>
        ) : tab === "queue" ? (
          <OrderQueue kitchens={kitchens.map((k) => ({ id: k.storeId, name: k.name }))} />
        ) : tab === "menu" ? (
          <MenuPanel
            key={version}
            kitchens={kitchens}
            categories={categories}
            onChanged={() => setVersion((v) => v + 1)}
          />
        ) : tab === "kitchens" ? (
          <KitchensPanel kitchens={kitchens} reload={() => setVersion((v) => v + 1)} />
        ) : tab === "categories" ? (
          <CategoriesPanel categories={categories} reload={() => setVersion((v) => v + 1)} />
        ) : (
          <HandoffPanel onCollected={() => setVersion((v) => v + 1)} />
        )}
      </div>
    </div>
  );
}
