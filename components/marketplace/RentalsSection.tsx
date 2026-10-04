import Link from "next/link";
import { ArrowRight, Bike, Car, KeyRound } from "lucide-react";
import { rupees, type RentalCategoryLink, type RentalsRail } from "@/lib/marketplace/rentals-rail";

// ── THE RENTALS BRANCH OF /marketplace ──────────────────────────────────────
//
// Architecture review 2026-09-30, item 2. Links, not listings: every tap lands
// on the /browse page that already sells the thing, with its own booking form,
// structured data and price. That is why there is no Product or Offer markup
// here — the rental pages own it, and two pages describing one offer is how a
// price drifts. The hub carries a plain ItemList of these same links instead.
//
// Every figure comes from the fleet through lib/marketplace/rentals-rail.ts.
// With no figure (a seed read) a card says where the price is, not a number.

/** Two wheels, four wheels, or equipment — from the owner's words, no guess
 *  about anything else. */
function iconFor(c: RentalCategoryLink): React.ElementType {
  if (c.kind === "equipment") return KeyRound;
  const s = `${c.id} ${c.label}`.toLowerCase();
  if (/scooter|moto|bike|moped/.test(s)) return Bike;
  if (/car|4x4|suv|jeep|van/.test(s)) return Car;
  return KeyRound;
}

export default function RentalsSection({ rail }: { rail: RentalsRail }) {
  return (
    <>
      <div className="mt-4 space-y-4">
        {rail.categories.map((c) => {
          const Icon = iconFor(c);
          const vehicles = rail.vehicles.filter((v) => v.category === c.id);
          return (
            <div key={c.id}>
              <Link
                href={c.href}
                className="flex min-h-[88px] items-start gap-3 rounded-2xl border border-white/10 bg-dark-card p-4 transition-colors hover:border-yellow/45"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-yellow text-dark">
                  <Icon size={20} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-syne text-[17px] font-extrabold text-offwhite">
                    {c.label}
                  </span>
                  <span className="mt-0.5 block font-dm text-[13px] leading-relaxed text-muted">
                    {c.fromPerDay != null
                      ? `From ${rupees(c.fromPerDay)}/day`
                      : "Prices and dates on the next page"}
                  </span>
                </span>
                <ArrowRight size={17} className="mt-1 shrink-0 text-yellow" aria-hidden />
              </Link>

              {vehicles.length > 0 && (
                // Each model's own page, so "the Avenis, Rs 699 a day" is one
                // tap from the hub as it is from a WhatsApp message.
                <ul className="mt-2 flex flex-wrap gap-2" aria-label={`${c.label} to rent`}>
                  {vehicles.map((v) => (
                    <li key={v.href} className="max-w-full">
                      <Link
                        href={v.href}
                        className="inline-flex min-h-11 max-w-full flex-wrap items-center gap-x-1.5 rounded-xl border border-white/12 px-3.5 py-1.5 font-dm text-[13px] text-offwhite transition-colors hover:border-yellow/40 hover:text-yellow"
                      >
                        <span className="break-words">{v.name}</span>
                        {v.perDay != null && (
                          <span className="text-muted">· {rupees(v.perDay)}/day</span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {rail.water.length > 0 && (
        // Boats here are skippered trips booked as experiences, never a
        // self-drive rental — so they are named for what they are, and linked
        // rather than listed as if they were fleet.
        <p className="mt-4 font-dm text-[12.5px] leading-relaxed text-muted">
          On the water, with a skipper:{" "}
          {rail.water.map((w, i) => (
            <span key={w.type}>
              {i > 0 && (i === rail.water.length - 1 ? " and " : ", ")}
              <Link href={w.href} className="text-yellow underline underline-offset-4">
                {w.label}
              </Link>
            </span>
          ))}
          .
        </p>
      )}
    </>
  );
}
