"use client";

import { useEffect, useRef, useState } from "react";
import {
  Star, MessageCircle, Phone, Mail, MapPin, Clock,
  ChevronLeft, ChevronRight, PenLine, X, Loader2, CheckCircle, ArrowRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { DEFAULT_CONTENT, type ContactContent, type FleetItem } from "@/lib/defaults";
import { useLanguage } from "@/context/LanguageContext";

// Compact combined "trust strip": overall rating + a swipeable review carousel +
// a one-tap contact row — replaces the old full-height Reviews and Contact
// sections. Real, crawlable contact details are kept for SEO (semantic <address>,
// tel:/mailto: links); reviews come from /api/reviews and can be added in a modal.
interface PublicReview {
  id: string; name: string; origin: string | null; rating: number;
  text: string; scooter_name: string | null; created_at: string;
}

const AV = ["#16AC69", "#E9B54A", "#C07C3E", "#3B82F6", "#EC4899", "#8B5CF6"];
function avatarFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const init = name.trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "?";
  return { color: AV[h % AV.length], init };
}

function Stars({ value, size = 12 }: { value: number; size?: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${value} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={size} className={i < value ? "fill-yellow text-yellow" : "text-muted/30"} />
      ))}
    </div>
  );
}

const COPY = {
  en: { travellers: "happy travellers", all: "View all", write: "Write a review", replies: "Usually replies within minutes", trust: "Trusted by riders across Rodrigues", wa: "WhatsApp", call: "Call", email: "Email", maps: "Open in Maps", beFirst: "Be the first to leave a review", post: "Post review", posting: "Posting…", thanks: "Thank you — your review is in!", ratingL: "Your rating", nameL: "Name", originL: "Where from", reviewL: "Your review", namePh: "Your name", originPh: "e.g. France", reviewPh: "How was your ride?", errRate: "Please pick a rating.", errName: "Please enter your name.", errText: "Please write a short review.", done: "Done", reviewsTitle: "Rider reviews" },
  fr: { travellers: "voyageurs ravis", all: "Voir tout", write: "Laisser un avis", replies: "Répond en quelques minutes", trust: "La confiance des voyageurs à Rodrigues", wa: "WhatsApp", call: "Appeler", email: "E-mail", maps: "Ouvrir Maps", beFirst: "Soyez le premier à laisser un avis", post: "Publier", posting: "Envoi…", thanks: "Merci — votre avis est publié !", ratingL: "Votre note", nameL: "Nom", originL: "D'où", reviewL: "Votre avis", namePh: "Votre nom", originPh: "ex. France", reviewPh: "Comment était votre balade ?", errRate: "Choisissez une note.", errName: "Entrez votre nom.", errText: "Écrivez un court avis.", done: "Fermer", reviewsTitle: "Avis clients" },
  cr: { travellers: "vwayazer kontan", all: "Get tou", write: "Kit enn komanter", replies: "Reponn dan detrwa minit", trust: "Bann rider Rodrig fer nou konfyans", wa: "WhatsApp", call: "Apele", email: "Email", maps: "Ouver Maps", beFirst: "Vinn premie pou kit enn komanter", post: "Poste", posting: "Pe poste…", thanks: "Mersi — ou komanter finn poste!", ratingL: "Ou not", nameL: "Nom", originL: "Kotsa", reviewL: "Ou komanter", namePh: "Ou nom", originPh: "ex. Frans", reviewPh: "Kouma ti ou balad?", errRate: "Swazir enn not.", errName: "Met ou nom.", errText: "Ekrir enn ti komanter.", done: "Ferm", reviewsTitle: "Komanter" },
};

export default function ReviewsContact({ contact }: { contact?: ContactContent; fleet?: FleetItem[] }) {
  const { language } = useLanguage();
  const L = COPY[language as keyof typeof COPY] ?? COPY.en;
  const c = contact ?? DEFAULT_CONTENT.contact;

  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [open, setOpen] = useState(false);
  const rail = useRef<HTMLDivElement>(null);

  // write-review form
  const [name, setName] = useState("");
  const [origin, setOrigin] = useState("");
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/reviews")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: PublicReview[]) => setReviews(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  const avg = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null;
  const waNum = (c.phone || "").replace(/\D/g, "");
  const wa = `https://wa.me/${waNum}`;
  const tel = `tel:${(c.phone || "").replace(/\s/g, "")}`;
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.location || "Port Mathurin, Rodrigues")}`;

  function scrollRail(dir: number) {
    const el = rail.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-rcard]");
    const step = card ? card.offsetWidth + 12 : el.clientWidth;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (rating < 1) return setErr(L.errRate);
    if (name.trim().length < 2) return setErr(L.errName);
    if (text.trim().length < 4) return setErr(L.errText);
    setSubmitting(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, origin, rating, text }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Something went wrong.");
      }
      setDone(true);
      setName(""); setOrigin(""); setRating(0); setText("");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  const contactBtns = (
    <div className="flex flex-wrap items-center gap-2.5">
      <a href={wa} target="_blank" rel="noopener noreferrer"
         className="flex-1 min-w-[128px] inline-flex items-center justify-center gap-2 bg-green-500 text-white font-syne font-bold text-sm py-3 rounded-xl hover:bg-green-600 transition-colors">
        <MessageCircle size={16} /> {L.wa}
      </a>
      <a href={tel} className="inline-flex items-center justify-center gap-1.5 border border-white/12 text-offwhite font-syne font-bold text-sm px-4 py-3 rounded-xl hover:border-yellow/40 hover:text-yellow transition-colors">
        <Phone size={15} /> {L.call}
      </a>
      <a href={`mailto:${c.email}`} className="inline-flex items-center justify-center gap-1.5 border border-white/12 text-offwhite font-syne font-bold text-sm px-4 py-3 rounded-xl hover:border-yellow/40 hover:text-yellow transition-colors">
        <Mail size={15} /> {L.email}
      </a>
      <a href={maps} target="_blank" rel="noopener noreferrer"
         className="inline-flex items-center justify-center gap-1.5 border border-white/12 text-offwhite font-syne font-bold text-sm px-4 py-3 rounded-xl hover:border-yellow/40 hover:text-yellow transition-colors">
        <MapPin size={15} /> {L.maps}
      </a>
    </div>
  );

  return (
    <section id="contact" className="bg-dark py-8 md:py-12 overflow-x-hidden scroll-mt-24" aria-label="Reviews and contact">
      <h2 className="sr-only">Reviews &amp; contact — Roule Rodrigues</h2>
      <div className="max-w-4xl mx-auto px-5">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.055] to-white/[0.01] backdrop-blur-sm p-5 md:p-7 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.9)]">
          {/* Rating + view all */}
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5 min-w-0">
              {avg ? (
                <>
                  <span className="flex items-center gap-1.5 rounded-full bg-yellow/12 px-3 py-1.5 ring-1 ring-inset ring-yellow/25">
                    <Star size={15} className="fill-yellow text-yellow" />
                    <b className="font-syne text-offwhite text-sm">{avg}</b>
                    <span className="text-muted text-xs">/5</span>
                  </span>
                  <span className="font-dm text-sm text-muted truncate">{reviews.length} {L.travellers}</span>
                </>
              ) : (
                <span className="font-syne font-bold text-offwhite text-sm">{L.trust}</span>
              )}
            </div>
            <button
              onClick={() => { setOpen(true); setDone(false); setErr(null); }}
              className="shrink-0 inline-flex items-center gap-1 text-yellow font-syne font-bold text-xs hover:gap-1.5 transition-all"
            >
              {reviews.length > 0 ? L.all : L.write} <ArrowRight size={13} />
            </button>
          </div>

          {/* Review carousel */}
          {reviews.length > 0 ? (
            <div className="relative">
              <div
                ref={rail}
                className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {reviews.map((r) => {
                  const a = avatarFor(r.name);
                  return (
                    <article key={r.id} data-rcard className="snap-start shrink-0 w-[86%] sm:w-[300px] rounded-2xl border border-white/[0.08] bg-dark/40 p-4">
                      <div className="flex items-center gap-3 mb-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-syne font-bold text-[13px] text-dark" style={{ background: a.color }}>{a.init}</span>
                        <div className="min-w-0">
                          <p className="font-syne font-bold text-offwhite text-sm truncate">{r.name}</p>
                          <div className="flex items-center gap-1.5">
                            <Stars value={r.rating} size={11} />
                            {r.origin && <span className="text-muted/60 text-[11px] font-dm truncate">· {r.origin}</span>}
                          </div>
                        </div>
                      </div>
                      <p className="font-dm text-[13px] text-offwhite/70 leading-snug line-clamp-3">{r.text}</p>
                    </article>
                  );
                })}
              </div>
              {reviews.length > 1 && (
                <>
                  <button onClick={() => scrollRail(-1)} aria-label="Previous reviews" className="hidden sm:flex absolute -left-3 top-1/2 -translate-y-1/2 h-8 w-8 items-center justify-center rounded-full bg-dark-card border border-white/15 text-offwhite hover:border-yellow/50 transition-colors">
                    <ChevronLeft size={16} />
                  </button>
                  <button onClick={() => scrollRail(1)} aria-label="Next reviews" className="hidden sm:flex absolute -right-3 top-1/2 -translate-y-1/2 h-8 w-8 items-center justify-center rounded-full bg-dark-card border border-white/15 text-offwhite hover:border-yellow/50 transition-colors">
                    <ChevronRight size={16} />
                  </button>
                </>
              )}
            </div>
          ) : (
            <button onClick={() => setOpen(true)} className="w-full rounded-2xl border border-dashed border-white/12 py-6 text-center hover:border-yellow/30 transition-colors">
              <Star size={20} className="text-yellow/40 mx-auto mb-2" />
              <span className="font-dm text-muted text-sm">{L.beFirst}</span>
            </button>
          )}

          <div className="my-5 h-px bg-white/[0.08]" />

          {/* Contact — one tap to a local */}
          {contactBtns}
          <address className="not-italic mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-dm text-muted">
            {c.hours && <span className="inline-flex items-center gap-1.5"><Clock size={12} className="text-yellow/70" /> {c.hours}</span>}
            {c.location && <span className="inline-flex items-center gap-1.5"><MapPin size={12} className="text-yellow/70" /> {c.location}</span>}
            <span className="inline-flex items-center gap-1.5 text-green-400/80">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" /> {L.replies}
            </span>
          </address>
        </div>
      </div>

      {/* Reviews modal — full list + write a review */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full sm:max-w-lg max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-dark-border bg-dark-card p-6"
            >
              <button onClick={() => setOpen(false)} className="absolute top-4 right-4 text-muted hover:text-offwhite transition-colors" aria-label="Close">
                <X size={20} />
              </button>
              <p className="font-bebas text-yellow text-[10px] tracking-[0.3em] mb-1">{L.reviewsTitle}</p>
              <h3 className="font-syne font-extrabold text-offwhite text-xl mb-5">
                {avg ? <>{avg} <Star size={16} className="inline fill-yellow text-yellow -mt-1" /> · {reviews.length}</> : L.write}
              </h3>

              {/* Write form */}
              {done ? (
                <div className="text-center py-6">
                  <CheckCircle size={38} className="text-green-400 mx-auto mb-3" />
                  <p className="font-syne font-bold text-offwhite">{L.thanks}</p>
                  <button onClick={() => setOpen(false)} className="mt-5 bg-yellow text-dark font-syne font-bold text-sm px-6 py-3 rounded-full hover:bg-yellow-dark transition-colors">{L.done}</button>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-3.5 border-b border-dark-border pb-6 mb-5">
                  <div>
                    <label className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">{L.ratingL}</label>
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} type="button" onClick={() => setRating(n)} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} className="transition-transform hover:scale-110" aria-label={`${n} stars`}>
                          <Star size={28} className={n <= (hover || rating) ? "fill-yellow text-yellow" : "text-muted/30"} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder={L.namePh} className="w-full bg-dark border border-dark-border rounded-xl px-4 py-3 text-offwhite text-sm font-dm placeholder:text-muted/40 focus:border-yellow focus:outline-none" />
                    <input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder={L.originPh} className="w-full bg-dark border border-dark-border rounded-xl px-4 py-3 text-offwhite text-sm font-dm placeholder:text-muted/40 focus:border-yellow focus:outline-none" />
                  </div>
                  <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder={L.reviewPh} className="w-full bg-dark border border-dark-border rounded-xl px-4 py-3 text-offwhite text-sm font-dm placeholder:text-muted/40 focus:border-yellow focus:outline-none resize-none" />
                  {err && <p className="text-red-400 font-dm text-sm">{err}</p>}
                  <button type="submit" disabled={submitting} className="w-full flex items-center justify-center gap-2 bg-yellow text-dark font-syne font-bold text-sm py-3 rounded-full hover:bg-yellow-dark disabled:opacity-50 transition-colors">
                    {submitting ? <Loader2 size={15} className="animate-spin" /> : <PenLine size={15} />}
                    {submitting ? L.posting : L.post}
                  </button>
                </form>
              )}

              {/* Full list */}
              <div className="space-y-3">
                {reviews.map((r) => {
                  const a = avatarFor(r.name);
                  return (
                    <div key={r.id} className="rounded-xl border border-dark-border bg-dark p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-syne font-bold text-xs text-dark" style={{ background: a.color }}>{a.init}</span>
                        <div className="min-w-0">
                          <p className="font-syne font-bold text-offwhite text-sm truncate">{r.name}{r.origin ? <span className="text-muted/60 font-dm font-normal"> · {r.origin}</span> : null}</p>
                          <Stars value={r.rating} size={11} />
                        </div>
                      </div>
                      <p className="font-dm text-[13px] text-offwhite/75 leading-relaxed">{r.text}</p>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
