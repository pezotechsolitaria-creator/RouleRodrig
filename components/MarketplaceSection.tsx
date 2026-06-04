"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Phone, Tag, Star, Loader2 } from "lucide-react";
import type { MarketplaceListing } from "@/lib/supabase/types";

const CATEGORY_CONFIG: Record<
  string,
  { label: string; emoji: string; color: string }
> = {
  restaurant:    { label: "Restaurant",   emoji: "🍽️", color: "bg-green-500/10 text-green-400 border-green-500/30" },
  tour:          { label: "Tour",         emoji: "🧭", color: "bg-blue-500/10   text-blue-400  border-blue-500/30" },
  activity:      { label: "Activity",     emoji: "🤿", color: "bg-purple-500/10 text-purple-400 border-purple-500/30" },
  accommodation: { label: "Accommodation",emoji: "🏡", color: "bg-amber-400/10  text-amber-400 border-amber-400/30" },
  shopping:      { label: "Shopping",     emoji: "🛍️", color: "bg-pink-500/10   text-pink-400  border-pink-500/30" },
};

export default function MarketplaceSection() {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    fetch("/api/marketplace")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setListings(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (!loading && listings.length === 0) return null;

  const categories = ["all", ...Array.from(new Set(listings.map((l) => l.category)))];
  const filtered = filter === "all" ? listings : listings.filter((l) => l.category === filter);

  return (
    <section id="marketplace" className="bg-dark py-24 md:py-36" aria-label="Local deals marketplace">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="mb-12"
        >
          <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">EXCLUSIVE OFFERS</p>
          <h2
            className="font-syne font-extrabold text-offwhite uppercase leading-none"
            style={{ fontSize: "clamp(24px, 7vw, 72px)" }}
          >
            LOCAL DEALS
          </h2>
          <p className="text-muted font-dm text-sm md:text-base mt-4 max-w-lg">
            Special offers from our island partners — restaurants, tours, and activities exclusively for Roule Rodrigues riders.
          </p>
        </motion.div>

        {loading ? (
          <div className="flex items-center gap-3 text-muted font-dm text-sm py-12">
            <Loader2 size={18} className="animate-spin text-yellow" /> Loading offers…
          </div>
        ) : (
          <>
            {/* Category filter pills */}
            {categories.length > 2 && (
              <div className="flex flex-wrap gap-2 mb-8">
                {categories.map((cat) => {
                  const cfg = cat === "all" ? null : CATEGORY_CONFIG[cat];
                  return (
                    <button
                      key={cat}
                      onClick={() => setFilter(cat)}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-dm border transition-colors ${
                        filter === cat
                          ? "bg-yellow text-dark border-yellow font-bold"
                          : "border-dark-border text-muted hover:border-yellow/40 hover:text-offwhite"
                      }`}
                    >
                      {cfg ? <span>{cfg.emoji}</span> : null}
                      {cat === "all" ? "All" : cfg?.label ?? cat}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((listing, i) => {
                const cfg = CATEGORY_CONFIG[listing.category] ?? {
                  label: listing.category,
                  emoji: "🏪",
                  color: "bg-muted/10 text-muted border-muted/20",
                };
                return (
                  <motion.div
                    key={listing.id}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ duration: 0.6, delay: i * 0.07 }}
                    className="bg-dark-card border border-dark-border rounded-2xl p-6 flex flex-col hover:border-yellow/40 transition-colors group"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`flex items-center gap-1.5 font-bebas text-[9px] tracking-[0.2em] border px-2.5 py-1 rounded-full ${cfg.color}`}>
                            <span>{cfg.emoji}</span>
                            {cfg.label.toUpperCase()}
                          </span>
                          {listing.featured && (
                            <span className="flex items-center gap-1 font-bebas text-[9px] tracking-[0.15em] bg-yellow/10 text-yellow border border-yellow/30 px-2.5 py-1 rounded-full">
                              <Star size={8} className="fill-yellow" /> FEATURED
                            </span>
                          )}
                        </div>
                        <h3 className="font-syne font-bold text-offwhite text-base">
                          {listing.business_name}
                        </h3>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-muted font-dm text-sm leading-relaxed flex-1 mb-4">
                      {listing.description}
                    </p>

                    {/* Offer highlight */}
                    <div className="flex items-start gap-2.5 bg-yellow/5 border border-yellow/20 rounded-xl px-4 py-3 mb-5">
                      <Tag size={13} className="text-yellow shrink-0 mt-0.5" />
                      <p className="text-yellow font-dm text-sm font-medium leading-snug">
                        {listing.offer}
                      </p>
                    </div>

                    {/* CTA row */}
                    <div className="flex items-center gap-3 flex-wrap mt-auto">
                      {listing.contact && (
                        <a
                          href={listing.contact.startsWith("+") || listing.contact.startsWith("0")
                            ? `tel:${listing.contact}`
                            : `https://wa.me/${listing.contact.replace(/\D/g, "")}`}
                          className="flex items-center gap-1.5 text-xs font-dm text-muted hover:text-yellow transition-colors"
                        >
                          <Phone size={11} /> {listing.contact}
                        </a>
                      )}
                      {listing.website && (
                        <a
                          href={listing.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs font-dm text-muted hover:text-yellow transition-colors ml-auto"
                        >
                          Visit <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <p className="text-muted/40 font-dm text-xs mt-8 text-center">
              Partner deals are exclusive to Roule Rodrigues customers. Mention your rental when you visit.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
