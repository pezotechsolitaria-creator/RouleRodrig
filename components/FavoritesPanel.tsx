"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, X, ArrowRight, Bike, BedDouble, Route as RouteIcon, Mail, Send, Check, Share2, Copy } from "lucide-react";
import { useFavorites, type FavoriteType } from "@/context/FavoritesContext";
import { useLanguage } from "@/context/LanguageContext";
import { SITE_URL } from "@/lib/site";

const COPY = {
  en: { saved: "Saved", title: "Your saved list", empty: "Tap the ♥ on any scooter, stay or route to save it here.", clear: "Clear all", plan: "Plan my trip", book: "Book a scooter", emailCta: "Email me my list + island deals", emailPlaceholder: "you@email.com", emailSent: "Sent! Check your inbox.", send: "Send", share: "Share Rodrigues", shareMsg: "Found my Rodrigues trip on Roule Rodrigues — scooters, stays, routes & more 🛵🌴", copy: "Copy link", copied: "Link copied!", groups: { scooter: "Scooters", place: "Stay · Eat · Do", route: "Routes & Trails" } },
  fr: { saved: "Favoris", title: "Votre liste de favoris", empty: "Touchez le ♥ sur un scooter, hébergement ou itinéraire pour l'enregistrer ici.", clear: "Tout effacer", plan: "Planifier mon séjour", book: "Réserver un scooter", emailCta: "Recevoir ma liste + les bons plans par e-mail", emailPlaceholder: "vous@email.com", emailSent: "Envoyé ! Vérifiez vos e-mails.", send: "Envoyer", share: "Partager Rodrigues", shareMsg: "J'ai préparé mon séjour à Rodrigues sur Roule Rodrigues — scooters, hébergements, itinéraires 🛵🌴", copy: "Copier le lien", copied: "Lien copié !", groups: { scooter: "Scooters", place: "Dormir · Manger · Faire", route: "Routes & Sentiers" } },
  cr: { saved: "Favori", title: "Ou lalis favori", empty: "Tap lor ♥ lor enn skooter, lozman ou rout pou anrezistre li isi.", clear: "Efas tou", plan: "Plann mo vwayaz", book: "Rezerv enn skooter", emailCta: "Avoy mwa mo lalis + bann ofer par e-mail", emailPlaceholder: "ou@email.com", emailSent: "Avoye! Get ou bwat resepsion.", send: "Avoye", share: "Partaz Rodrig", shareMsg: "Mo finn plann mo vwayaz Rodrig lor Roule Rodrigues — skooter, lozman, rout 🛵🌴", copy: "Kopye lien", copied: "Lien kopye!", groups: { scooter: "Skooter", place: "Reste · Manze · Fer", route: "Rout & Santi" } },
} as const;

const GROUP_ICON: Record<FavoriteType, React.ElementType> = {
  scooter: Bike,
  place: BedDouble,
  route: RouteIcon,
};
const GROUP_ORDER: FavoriteType[] = ["scooter", "place", "route"];

export default function FavoritesPanel() {
  const { favorites, count, remove, clear, hydrated } = useFavorites();
  const { language } = useLanguage();
  const c = COPY[language as keyof typeof COPY] ?? COPY.en;
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  // Let other components (return-visitor nudge, sticky bar) open the panel.
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("rr:open-saved", handler);
    return () => window.removeEventListener("rr:open-saved", handler);
  }, []);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (sending || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
    setSending(true);
    try {
      await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "saved-list" }),
      });
      setSent(true);
    } catch {
      setSent(true); // don't block the UX on network errors
    } finally {
      setSending(false);
    }
  }

  function shareSite() {
    const url = SITE_URL;
    const text = `${c.shareMsg} ${url}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ title: "Roule Rodrigues", text: c.shareMsg, url }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(SITE_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }

  if (!hydrated) return null;

  const grouped = GROUP_ORDER.map((type) => ({
    type,
    items: favorites.filter((f) => f.type === type),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      {/* Floating button (bottom-left, opposite WhatsApp) — only once something is saved */}
      {count > 0 && (
      <button
        onClick={() => setOpen(true)}
        aria-label={`${c.saved} (${count})`}
        className="fixed bottom-6 left-6 z-40 flex items-center gap-2 bg-dark-card/90 backdrop-blur-md border border-white/15 text-offwhite rounded-full pl-3 pr-4 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.5)] hover:border-yellow/50 transition-colors"
      >
        <span className="relative flex">
          <Heart size={18} className="fill-red-500 text-red-500" />
          <span className="absolute -top-2 -right-2 bg-yellow text-dark text-[10px] font-syne font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
            {count}
          </span>
        </span>
        <span className="font-syne font-bold text-sm hidden sm:inline">{c.saved}</span>
      </button>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[100] flex justify-end"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="relative w-full max-w-md h-full bg-dark border-l border-dark-border flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border">
                <div className="flex items-center gap-2">
                  <Heart size={18} className="fill-red-500 text-red-500" />
                  <h2 className="font-syne font-extrabold text-offwhite text-lg">{c.title}</h2>
                  <span className="font-dm text-muted text-sm">({count})</span>
                </div>
                <button onClick={() => setOpen(false)} aria-label="Close" className="text-muted hover:text-offwhite transition-colors">
                  <X size={22} />
                </button>
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
                {count === 0 && (
                  <div className="flex flex-col items-center justify-center text-center py-16 px-4">
                    <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-yellow/10 border border-yellow/20 mb-4">
                      <Heart size={24} className="text-yellow" />
                    </span>
                    <p className="font-dm text-muted text-sm leading-relaxed max-w-[16rem]">{c.empty}</p>
                  </div>
                )}
                {grouped.map((g) => {
                  const Icon = GROUP_ICON[g.type];
                  return (
                    <div key={g.type}>
                      <p className="flex items-center gap-2 font-bebas text-yellow text-xs tracking-[0.2em] mb-3">
                        <Icon size={13} /> {c.groups[g.type]} ({g.items.length})
                      </p>
                      <div className="space-y-2.5">
                        {g.items.map((f) => (
                          <div key={`${f.type}:${f.id}`} className="group flex items-center gap-3 bg-dark-card border border-dark-border rounded-xl p-2.5 hover:border-yellow/40 transition-colors">
                            <Link href={f.href} onClick={() => setOpen(false)} className="flex items-center gap-3 flex-1 min-w-0">
                              {f.image ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={f.image} alt={f.name} className="w-14 h-14 rounded-lg object-cover shrink-0" loading="lazy" />
                              ) : (
                                <span className="w-14 h-14 rounded-lg bg-dark flex items-center justify-center shrink-0">
                                  <Icon size={18} className="text-yellow/50" />
                                </span>
                              )}
                              <span className="min-w-0">
                                <span className="block font-syne font-bold text-offwhite text-sm truncate">{f.name}</span>
                                {f.meta && <span className="block font-dm text-muted text-xs truncate">{f.meta}</span>}
                              </span>
                            </Link>
                            <button
                              onClick={() => remove(f.type, f.id)}
                              aria-label="Remove"
                              className="shrink-0 text-muted/50 hover:text-red-400 transition-colors p-1"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="border-t border-dark-border p-4 space-y-3">
                {/* Email capture — lifecycle remarketing */}
                {sent ? (
                  <p className="flex items-center justify-center gap-2 text-green-400 font-dm text-sm py-2">
                    <Check size={15} /> {c.emailSent}
                  </p>
                ) : (
                  <form onSubmit={submitEmail} className="space-y-2">
                    <label className="flex items-center gap-1.5 font-dm text-xs text-muted">
                      <Mail size={12} className="text-yellow" /> {c.emailCta}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={c.emailPlaceholder}
                        className="flex-1 bg-dark-card border border-dark-border rounded-full px-4 py-2.5 text-sm text-offwhite font-dm focus:border-yellow focus:outline-none"
                      />
                      <button type="submit" disabled={sending} aria-label={c.send} className="shrink-0 flex items-center justify-center gap-1.5 bg-yellow text-dark font-syne font-bold text-sm px-4 rounded-full hover:bg-yellow-dark transition-colors disabled:opacity-60">
                        <Send size={15} />
                      </button>
                    </div>
                  </form>
                )}

                {/* Share / refer */}
                <div className="flex gap-2">
                  <button onClick={shareSite} className="flex-1 flex items-center justify-center gap-1.5 border border-white/20 text-offwhite font-dm text-xs py-2.5 rounded-full hover:bg-white/5 transition-colors">
                    <Share2 size={13} /> {c.share}
                  </button>
                  <button onClick={copyLink} className="flex-1 flex items-center justify-center gap-1.5 border border-white/20 text-offwhite font-dm text-xs py-2.5 rounded-full hover:bg-white/5 transition-colors">
                    {copied ? <><Check size={13} className="text-green-400" /> {c.copied}</> : <><Copy size={13} /> {c.copy}</>}
                  </button>
                </div>

                <div className="flex gap-2 pt-1">
                  <Link href="#trip-planner" onClick={() => setOpen(false)} className="flex-1 flex items-center justify-center gap-1.5 border border-white/20 text-offwhite font-syne font-bold text-sm py-3 rounded-full hover:bg-white/5 transition-colors">
                    {c.plan}
                  </Link>
                  <Link href="#booking" onClick={() => setOpen(false)} className="flex-1 flex items-center justify-center gap-1.5 bg-yellow text-dark font-syne font-bold text-sm py-3 rounded-full hover:bg-yellow-dark transition-colors">
                    {c.book} <ArrowRight size={14} />
                  </Link>
                </div>
                <button onClick={clear} className="w-full text-center font-dm text-xs text-muted/50 hover:text-red-400 transition-colors">
                  {c.clear}
                </button>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
