"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { STATUS_LABEL, type OrderStatus } from "@/lib/orders/status";

// URL-driven filters (no client data-fetching library on this server-rendered
// page) — every change pushes a new URL, the server component re-fetches.
export default function OrdersFilterBar() {
  const { t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");

  function pushParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
      <form
        className="relative flex-1"
        onSubmit={(e) => { e.preventDefault(); pushParams({ q: search.trim() || null }); }}
      >
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onBlur={() => pushParams({ q: search.trim() || null })}
          placeholder={t.ordersFilter.searchPlaceholder}
          aria-label={t.ordersFilter.searchOrders}
          className="w-full rounded-xl border border-dark-border bg-dark-card py-2.5 pl-8 pr-3 font-dm text-sm text-offwhite placeholder:text-muted/50 transition-colors focus:border-yellow focus:outline-none"
        />
      </form>
      <select
        value={searchParams.get("status") ?? "all"}
        onChange={(e) => pushParams({ status: e.target.value === "all" ? null : e.target.value })}
        aria-label={t.ordersFilter.filterByStatus}
        className="rounded-xl border border-dark-border bg-dark-card px-3 py-2.5 font-dm text-sm text-offwhite transition-colors focus:border-yellow focus:outline-none sm:w-44"
      >
        <option value="all">{t.ordersFilter.allStatuses}</option>
        {(Object.keys(STATUS_LABEL) as OrderStatus[]).map((s) => (
          <option key={s} value={s}>{STATUS_LABEL[s]}</option>
        ))}
      </select>
    </div>
  );
}
