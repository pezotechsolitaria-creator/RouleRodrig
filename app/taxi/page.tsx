"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Car,
  Phone,
  MessageCircle,
  Star,
  Loader2,
  ArrowLeft,
  MapPin,
  Languages,
  DollarSign,
  Bus,
  Bike,
} from "lucide-react";
import type { TaxiDriver } from "@/lib/supabase/taxi-types";

const VEHICLE_EMOJI: Record<string, string> = {
  car: "🚗",
  minibus: "🚐",
  van: "🚐",
  scooter: "🛵",
  other: "🚕",
};

const VEHICLE_ICON: Record<string, React.ElementType> = {
  car: Car,
  minibus: Bus,
  van: Bus,
  scooter: Bike,
  other: Car,
};

export default function TaxiPage() {
  const [drivers, setDrivers] = useState<TaxiDriver[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/taxi")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setDrivers(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-dark text-offwhite font-dm">
      <div className="max-w-6xl mx-auto px-6 py-10 md:py-16">
        {/* Back */}
        <div className="mb-10">
          <Link href="/" className="inline-flex items-center gap-2 text-muted hover:text-yellow text-sm transition-colors">
            <ArrowLeft size={15} /> Roule Rodrigues
          </Link>
        </div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-14"
        >
          <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">RODRIGUES ISLAND · TRANSPORT</p>
          <h1
            className="font-syne font-extrabold uppercase leading-[0.95] mb-4"
            style={{ fontSize: "clamp(38px, 9vw, 80px)" }}
          >
            Taxi &<br />Transport
          </h1>
          <p className="text-muted font-dm text-sm md:text-base max-w-xl leading-relaxed">
            Trusted local drivers for airport transfers, island tours and point-to-point rides. Tap WhatsApp
            or call directly to agree your fare — no app, no middleman.
          </p>
        </motion.div>

        {/* Driver grid */}
        {loading ? (
          <div className="flex items-center gap-3 text-muted py-16">
            <Loader2 size={18} className="animate-spin text-yellow" /> Loading drivers…
          </div>
        ) : drivers.length === 0 ? (
          <div className="text-center py-20">
            <Car size={48} className="text-muted/20 mx-auto mb-4" />
            <p className="text-muted font-dm text-sm">No drivers listed yet — check back soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {drivers.map((d, i) => {
              const VIcon = VEHICLE_ICON[d.vehicle_type] ?? Car;
              const waNumber = (d.whatsapp ?? d.phone).replace(/\D/g, "");
              const waLink = `https://wa.me/${waNumber}?text=${encodeURIComponent(`Hi ${d.name}, I need a taxi on Rodrigues Island 🚗`)}`;
              return (
                <motion.div
                  key={d.id}
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: i * 0.07 }}
                  className={`bg-dark-card rounded-2xl overflow-hidden flex flex-col transition-colors ${
                    d.featured
                      ? "border-2 border-yellow/50 hover:border-yellow shadow-[0_0_24px_rgba(245,200,66,0.08)]"
                      : "border border-dark-border hover:border-yellow/40"
                  }`}
                >
                  {/* Photo or placeholder */}
                  <div className="relative h-44 bg-gradient-to-br from-yellow/10 via-dark-card to-dark overflow-hidden">
                    {d.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={d.photo} alt={d.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-5xl">{VEHICLE_EMOJI[d.vehicle_type] ?? "🚗"}</span>
                      </div>
                    )}
                    {d.featured && (
                      <span className="absolute top-3 left-3 flex items-center gap-1 font-bebas text-[9px] tracking-[0.15em] bg-yellow/10 text-yellow border border-yellow/30 px-2.5 py-1 rounded-full backdrop-blur-sm">
                        <Star size={8} className="fill-yellow" /> TOP DRIVER
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-5 flex flex-col flex-1 gap-3">
                    <div>
                      <h2 className="font-syne font-bold text-offwhite text-lg leading-tight">{d.name}</h2>
                      <p className="flex items-center gap-1.5 text-muted text-xs font-dm mt-0.5">
                        <VIcon size={12} className="text-yellow" />
                        {d.vehicle}
                      </p>
                    </div>

                    {d.areas && (
                      <p className="flex items-start gap-1.5 text-offwhite/70 text-xs font-dm">
                        <MapPin size={12} className="text-yellow shrink-0 mt-0.5" />
                        {d.areas}
                      </p>
                    )}

                    {d.languages && d.languages.length > 0 && (
                      <p className="flex items-center gap-1.5 text-offwhite/60 text-xs font-dm">
                        <Languages size={12} className="text-yellow" />
                        {d.languages.join(" · ")}
                      </p>
                    )}

                    {d.rate_from && (
                      <p className="flex items-center gap-1.5 text-yellow text-xs font-dm font-medium">
                        <DollarSign size={12} /> From {d.rate_from}
                      </p>
                    )}

                    {d.notes && (
                      <p className="text-muted/60 text-xs font-dm italic">{d.notes}</p>
                    )}

                    {/* CTA row */}
                    <div className="flex items-center gap-2 mt-auto pt-3 border-t border-dark-border">
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 bg-green-500/15 text-green-400 hover:bg-green-500/25 text-xs font-syne font-bold px-3 py-2.5 rounded-full transition-colors"
                      >
                        <MessageCircle size={13} /> WhatsApp
                      </a>
                      <a
                        href={`tel:${d.phone.replace(/\s/g, "")}`}
                        className="flex items-center justify-center gap-1.5 bg-dark border border-dark-border hover:border-yellow/40 text-muted hover:text-yellow text-xs font-syne font-bold px-3 py-2.5 rounded-full transition-colors"
                      >
                        <Phone size={13} /> Call
                      </a>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        <p className="text-muted/40 font-dm text-xs mt-10 text-center">
          Fares are agreed directly with the driver. Prices listed are starting estimates only.
        </p>
      </div>
    </main>
  );
}
