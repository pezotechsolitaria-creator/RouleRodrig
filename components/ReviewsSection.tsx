"use client";

import { useEffect, useState } from "react";
import { Star, PenLine, Loader2, CheckCircle, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { FleetItem } from "@/lib/defaults";

interface PublicReview {
  id: string;
  scooter_id: string | null;
  scooter_name: string | null;
  name: string;
  origin: string | null;
  rating: number;
  text: string;
  created_at: string;
}

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <div className="flex gap-1" aria-label={`${value} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={size}
          className={i < value ? "fill-yellow text-yellow" : "text-muted/30"}
        />
      ))}
    </div>
  );
}

export default function ReviewsSection({ fleet = [] }: { fleet?: FleetItem[] }) {
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  // form state
  const [name, setName] = useState("");
  const [origin, setOrigin] = useState("");
  const [scooterId, setScooterId] = useState("");
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/reviews")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: PublicReview[]) => setReviews(Array.isArray(d) ? d : []))
      .catch(() => setReviews([]))
      .finally(() => setLoading(false));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (rating < 1) return setError("Please choose a star rating.");
    if (name.trim().length < 2) return setError("Please enter your name.");
    if (text.trim().length < 4) return setError("Please write a short review.");

    setSubmitting(true);
    try {
      const scooter = fleet.find((f) => f.id === scooterId);
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          origin,
          rating,
          text,
          scooter_id: scooterId || undefined,
          scooter_name: scooter?.name || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Something went wrong.");
      }
      setDone(true);
      setName(""); setOrigin(""); setScooterId(""); setRating(0); setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  const avg =
    reviews.length > 0
      ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
      : null;

  return (
    <section id="reviews" className="bg-dark py-24 md:py-36" aria-label="Rider reviews">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="mb-12 flex flex-col md:flex-row md:items-end md:justify-between gap-6"
        >
          <div>
            <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">RIDER REVIEWS</p>
            <h2
              className="font-syne font-extrabold text-offwhite uppercase leading-[0.95]"
              style={{ fontSize: "clamp(34px, 8vw, 80px)" }}
            >
              SHARE YOUR RIDE
            </h2>
            {avg && (
              <div className="flex items-center gap-3 mt-4">
                <Stars value={Math.round(Number(avg))} size={16} />
                <span className="font-syne font-bold text-offwhite text-sm">
                  {avg} · {reviews.length} review{reviews.length !== 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>

          <button
            onClick={() => { setFormOpen(true); setDone(false); setError(null); }}
            className="flex items-center gap-2 bg-yellow text-dark font-syne font-bold text-sm px-6 py-3.5 rounded-full hover:bg-yellow-dark transition-colors shrink-0 self-start md:self-auto"
          >
            <PenLine size={15} /> Write a Review
          </button>
        </motion.div>

        {/* Reviews grid */}
        {loading ? (
          <div className="flex items-center gap-2 text-muted font-dm text-sm py-8">
            <Loader2 size={16} className="animate-spin" /> Loading reviews…
          </div>
        ) : reviews.length === 0 ? (
          <div className="text-center border border-dashed border-dark-border rounded-2xl py-16 px-6">
            <Star size={32} className="text-yellow/40 mx-auto mb-4" />
            <p className="font-syne font-bold text-offwhite text-lg">Be the first to review</p>
            <p className="font-dm text-muted text-sm mt-1">
              Rented with us? Share your experience and help other travellers.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
            {reviews.map((r, i) => (
              <motion.article
                key={r.id}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.6, delay: (i % 3) * 0.1 }}
                className="bg-dark-card border border-dark-border rounded-2xl p-6 md:p-8 flex flex-col hover:border-yellow/30 transition-colors"
              >
                <div className="flex items-center justify-between mb-5">
                  <Stars value={r.rating} />
                  {r.scooter_name && (
                    <span className="font-bebas text-[10px] tracking-[0.15em] bg-yellow/10 text-yellow px-2.5 py-1 rounded-full">
                      {r.scooter_name}
                    </span>
                  )}
                </div>
                <blockquote className="text-offwhite/75 font-dm text-sm leading-relaxed flex-1 mb-6">
                  {r.text}
                </blockquote>
                <footer className="pt-5 border-t border-dark-border">
                  <p className="font-syne font-bold text-offwhite text-sm">{r.name}</p>
                  {r.origin && (
                    <p className="font-bebas text-muted text-xs tracking-[0.2em] mt-0.5">{r.origin}</p>
                  )}
                </footer>
              </motion.article>
            ))}
          </div>
        )}
      </div>

      {/* ── Submission modal ────────────────────────────────────── */}
      <AnimatePresence>
        {formOpen && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setFormOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 20 }}
              transition={{ duration: 0.25 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-dark-card border border-dark-border rounded-2xl p-6 sm:p-8 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-start justify-between mb-6">
                <div>
                  <p className="font-bebas text-yellow text-[10px] tracking-[0.3em]">YOUR EXPERIENCE</p>
                  <h3 className="font-syne font-extrabold text-offwhite text-xl">Write a Review</h3>
                </div>
                <button
                  onClick={() => setFormOpen(false)}
                  className="text-muted hover:text-offwhite p-1 -mr-1 -mt-1"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>

              {done ? (
                <div className="text-center py-8">
                  <CheckCircle size={40} className="text-green-400 mx-auto mb-4" />
                  <p className="font-syne font-bold text-offwhite text-lg">Thank you!</p>
                  <p className="font-dm text-muted text-sm mt-2 max-w-xs mx-auto">
                    Your review has been submitted and will appear on the site once our team approves it.
                  </p>
                  <button
                    onClick={() => setFormOpen(false)}
                    className="mt-6 bg-yellow text-dark font-syne font-bold text-sm px-6 py-3 rounded-full hover:bg-yellow-dark transition-colors"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-5">
                  {/* Rating */}
                  <div>
                    <label className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                      YOUR RATING
                    </label>
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setRating(n)}
                          onMouseEnter={() => setHoverRating(n)}
                          onMouseLeave={() => setHoverRating(0)}
                          className="transition-transform hover:scale-110"
                          aria-label={`${n} star${n !== 1 ? "s" : ""}`}
                        >
                          <Star
                            size={32}
                            className={n <= (hoverRating || rating) ? "fill-yellow text-yellow" : "text-muted/30"}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                        YOUR NAME
                      </label>
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Sophie L."
                        className="w-full bg-[#0d0d0d] border border-dark-border rounded-xl px-4 py-3 text-offwhite text-sm font-dm placeholder:text-muted/40 focus:border-yellow focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                        WHERE FROM (optional)
                      </label>
                      <input
                        value={origin}
                        onChange={(e) => setOrigin(e.target.value)}
                        placeholder="e.g. Paris, France"
                        className="w-full bg-[#0d0d0d] border border-dark-border rounded-xl px-4 py-3 text-offwhite text-sm font-dm placeholder:text-muted/40 focus:border-yellow focus:outline-none"
                      />
                    </div>
                  </div>

                  {fleet.length > 0 && (
                    <div>
                      <label className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                        WHICH SCOOTER? (optional)
                      </label>
                      <select
                        value={scooterId}
                        onChange={(e) => setScooterId(e.target.value)}
                        className="w-full bg-[#0d0d0d] border border-dark-border rounded-xl px-4 py-3 text-offwhite text-sm font-dm focus:border-yellow focus:outline-none appearance-none"
                      >
                        <option value="">— Select —</option>
                        {fleet.map((f) => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                      YOUR REVIEW
                    </label>
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      rows={4}
                      placeholder="Tell other travellers about your experience…"
                      className="w-full bg-[#0d0d0d] border border-dark-border rounded-xl px-4 py-3 text-offwhite text-sm font-dm placeholder:text-muted/40 focus:border-yellow focus:outline-none resize-none"
                    />
                  </div>

                  {error && <p className="text-red-400 font-dm text-sm">{error}</p>}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 bg-yellow text-dark font-syne font-bold text-sm px-6 py-3.5 rounded-full hover:bg-yellow-dark disabled:opacity-50 transition-colors"
                  >
                    {submitting ? <Loader2 size={15} className="animate-spin" /> : <PenLine size={15} />}
                    {submitting ? "Submitting…" : "Submit Review"}
                  </button>
                  <p className="text-muted/50 text-xs font-dm text-center">
                    Reviews are checked before appearing publicly.
                  </p>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
