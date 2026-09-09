import { ShieldCheck, BadgePercent, MessageCircle, CalendarCheck } from "lucide-react";

// ── THESE ARE PROMISES, SO THEY HAVE TO BE TRUE OF THE PAGE THEY ARE ON ────
//
// This bar renders on /browse/[category] — which is the CAR page as well as the
// scooter one — and both of the first two items were false there. A helmet is
// not included with a car, and car delivery is not free: content.vehicleCategories
// prices it at Rs 600, so the real day-one cost of a car is Rs 1,499 + Rs 600.
// The page was telling a car customer, in a bar headed "Why book with us", two
// things the checkout would then contradict.
//
// The last two are true of any rental and do not vary.
const SHARED = [
  { icon: MessageCircle, title: "WhatsApp support", desc: "Real people, fast replies" },
  { icon: CalendarCheck, title: "Easy booking", desc: "Request in a minute" },
];

const SCOOTER = [
  { icon: ShieldCheck, title: "Helmet included", desc: "Every rental, no extra charge" },
  // WAS "Multi-day discounts", which stopped being true when the automatic
  // 10%/15% tiers came out of lib/booking-pricing.ts (M159). Free scooter
  // delivery is the offer that IS real, and is now priced that way.
  { icon: BadgePercent, title: "Free scooter delivery", desc: "Brought to where you are staying" },
];

// What a car actually offers, in the same shape. Delivered rather than free,
// and the thing a family choosing a car over a scooter is really buying.
const CAR = [
  { icon: ShieldCheck, title: "Air conditioning", desc: "Automatic, insured, ready to drive" },
  { icon: BadgePercent, title: "Delivered to you", desc: "To your guest house or the airport" },
];

export default function TrustBar({ category }: { category?: string } = {}) {
  const ITEMS = [...(category === "car" ? CAR : SCOOTER), ...SHARED];
  return (
    <section className="bg-dark border-y border-dark-border" aria-label="Why book with us">
      <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
        {ITEMS.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow/10 flex items-center justify-center shrink-0">
              <Icon size={18} className="text-yellow" />
            </div>
            <div className="min-w-0">
              <p className="font-syne font-bold text-offwhite text-sm leading-tight">{title}</p>
              <p className="font-dm text-muted text-xs leading-tight mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
