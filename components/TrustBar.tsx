import { ShieldCheck, BadgePercent, MessageCircle, CalendarCheck } from "lucide-react";

const ITEMS = [
  { icon: ShieldCheck, title: "Helmet included", desc: "Every rental, no extra charge" },
  // WAS "Multi-day discounts", which stopped being true when the automatic
  // 10%/15% tiers came out of lib/booking-pricing.ts (M159). Free scooter
  // delivery is the offer that IS real, and is now priced that way.
  { icon: BadgePercent, title: "Free scooter delivery", desc: "Brought to where you are staying" },
  { icon: MessageCircle, title: "WhatsApp support", desc: "Real people, fast replies" },
  { icon: CalendarCheck, title: "Easy booking", desc: "Request in a minute" },
];

export default function TrustBar() {
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
