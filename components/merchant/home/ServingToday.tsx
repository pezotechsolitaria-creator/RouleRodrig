import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";
import type { ServingToday as Serving } from "@/lib/merchant/serving";

// The kitchen's slot-three block. Answers "what can I still serve", which a
// stock report cannot: three of the four ways a dish goes off the menu have
// nothing to do with how many portions are left.
export default function ServingToday({ serving }: { serving: Serving }) {
  if (!serving.ok) {
    return (
      <section className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
        <p className="font-syne text-sm font-bold text-amber-300">Menu unavailable</p>
        <p className="mt-1 font-dm text-xs text-offwhite/70">
          We couldn&apos;t read your menu just now. Reload the page.
        </p>
      </section>
    );
  }

  if (serving.total === 0) {
    return (
      <section className="mt-4 rounded-2xl border border-white/10 bg-dark-card p-4">
        <p className="flex items-center gap-2 font-syne text-sm font-bold text-offwhite">
          <UtensilsCrossed size={15} className="text-yellow" /> Nothing on your menu yet
        </p>
        <p className="mt-1 font-dm text-xs text-muted">
          Add your first dish — a name and a price is enough. Serving times can come later.
        </p>
        <Link
          href="/merchant/menu"
          className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-yellow px-5 font-syne text-sm font-bold text-dark"
        >
          Add a dish
        </Link>
      </section>
    );
  }

  const allOn = serving.off.length === 0;

  return (
    <section className="mt-4 rounded-2xl border border-white/10 bg-dark-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-2 font-syne text-sm font-bold text-offwhite">
          <UtensilsCrossed size={15} className="text-yellow" /> Serving now
        </p>
        <Link href="/merchant/menu" className="font-dm text-xs text-muted hover:text-yellow">
          {serving.orderable} of {serving.total}
        </Link>
      </div>

      {allOn ? (
        <p className="mt-1 font-dm text-xs text-muted">
          Everything on your menu can be ordered right now.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {/* Named, not counted. "3 dishes unavailable" sends the cook to the
              menu to find out which; the names are the whole value. */}
          {serving.off.slice(0, 4).map((d) => (
            <li key={d.name} className="flex items-baseline justify-between gap-3 font-dm text-xs">
              <span className="truncate text-offwhite/85">{d.name}</span>
              <span className="shrink-0 text-muted">{d.reason}</span>
            </li>
          ))}
          {serving.off.length > 4 && (
            <li className="font-dm text-xs text-muted">
              and {serving.off.length - 4} more
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
