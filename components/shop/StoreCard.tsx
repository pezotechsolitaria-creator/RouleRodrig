import Link from "next/link";
import { Store as StoreIcon, Star, MapPin } from "lucide-react";
import { hhmm } from "@/lib/schedule";

// One row of browse_stores()'s `stores` array, exactly as the RPC names them.
// The open/closed verdict is the SERVER's (computed inside the same query at
// request time) — /shop is force-dynamic, so it is correct at the minute
// without any client-side re-derivation.
export type BrowseStoreCard = {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  address: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  productCount: number;
  categories: string[];
  acceptingOrders: boolean;
  offersRrDelivery: boolean;
  offersOwnDelivery: boolean;
  offersPickup: boolean;
  acceptsCash: boolean;
  acceptsBankTransfer: boolean;
  hasSchedule: boolean;
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
  isClosedToday: boolean;
  nextOpenAt: string | null;
};

function StatusBadge({ store }: { store: BrowseStoreCard }) {
  // A shop that never set opening hours gets no badge at all — claiming either
  // "open" or "closed" for it would be invented information.
  if (!store.hasSchedule) return null;
  if (store.isOpen) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-dark/90 px-2.5 py-1 font-dm text-[11px] font-semibold text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Open now
      </span>
    );
  }
  const opens = !store.isClosedToday ? hhmm(store.opensAt) : "";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-dark/90 px-2.5 py-1 font-dm text-[11px] font-medium text-muted">
      <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
      {opens ? `Opens ${opens}` : "Closed today"}
    </span>
  );
}

const chip =
  "rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-dm text-[10px] font-medium text-muted";

export default function StoreCard({ store }: { store: BrowseStoreCard }) {
  return (
    <Link
      href={`/shop/${store.slug}`}
      className="group overflow-hidden rounded-2xl border border-white/10 bg-dark-card transition-colors hover:border-yellow/30"
    >
      <div className="relative aspect-[16/8] w-full overflow-hidden bg-white/5">
        {store.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={store.coverUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-yellow/10 to-transparent text-yellow/30">
            <StoreIcon size={34} />
          </div>
        )}
        <div className="absolute left-2 top-2">
          <StatusBadge store={store} />
        </div>
        {!store.acceptingOrders && (
          <span className="absolute right-2 top-2 rounded-full bg-dark/90 px-2.5 py-1 font-dm text-[11px] font-medium text-muted">
            Not taking orders yet
          </span>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-center gap-3">
          {store.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-yellow/10 text-yellow ring-1 ring-inset ring-yellow/20">
              <StoreIcon size={18} />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-syne text-base font-bold text-offwhite">{store.name}</p>
            {store.tagline && <p className="truncate font-dm text-xs text-muted">{store.tagline}</p>}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-dm text-xs text-muted">
          {store.ratingCount > 0 && store.ratingAvg !== null && (
            <span className="inline-flex items-center gap-1 text-offwhite">
              <Star size={12} className="fill-yellow text-yellow" />
              {Number(store.ratingAvg).toFixed(1)}
              <span className="text-muted">({store.ratingCount})</span>
            </span>
          )}
          <span>
            {store.productCount} product{store.productCount === 1 ? "" : "s"}
          </span>
          {store.categories.length > 0 && <span className="truncate">{store.categories.slice(0, 2).join(" · ")}</span>}
        </div>

        {store.address && (
          <p className="mt-1.5 flex items-center gap-1 truncate font-dm text-xs text-muted">
            <MapPin size={11} className="shrink-0" /> {store.address}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {store.offersPickup && <span className={chip}>Pickup</span>}
          {store.offersRrDelivery && <span className={chip}>Delivery</span>}
          {store.offersOwnDelivery && <span className={chip}>Your own driver</span>}
          {store.acceptsCash && <span className={chip}>Cash</span>}
          {store.acceptsBankTransfer && <span className={chip}>Bank transfer</span>}
        </div>
      </div>
    </Link>
  );
}
