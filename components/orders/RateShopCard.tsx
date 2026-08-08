"use client";

import { useState } from "react";
import { Star, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// The one place a customer can rate a shop.
//
// It appears on the order they just collected, not on the storefront: the
// storefront cannot prove you bought anything, and an unprovable review is what
// makes "Top rated" meaningless. The credential travels with the request —
// either the order id (session) or the order number + email (guest) — and the
// database re-checks it.
//
// Stars are required, words are not. Asking for a paragraph is what stops
// people leaving a rating at all, and the rating is the part that feeds
// stores.rating_avg.
type Credential = { orderId: string } | { orderNumber: string; email: string };

const LABELS = ["", "Poor", "Not great", "Fine", "Good", "Excellent"];

export default function RateShopCard({
  credential,
  storeName,
  className = "",
}: {
  credential: Credential;
  storeName: string;
  className?: string;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!rating || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/shop/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...credential, rating, body: body.trim() || undefined }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "We couldn't save your review.");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't save your review.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className={`rounded-2xl border border-green-500/25 bg-green-500/[0.06] p-5 ${className}`}>
        <h2 className="flex items-center gap-1.5 font-syne text-sm font-bold text-green-400">
          <CheckCircle2 size={15} /> Thank you
        </h2>
        <p className="mt-2 font-dm text-sm text-offwhite/85">
          Your review is live on {storeName}&apos;s page. It helps the next visitor pick a shop they can trust.
        </p>
      </section>
    );
  }

  const shown = hover || rating;

  return (
    <section aria-labelledby="rate-heading" className={`rounded-2xl border border-white/10 bg-dark-card p-5 ${className}`}>
      <h2 id="rate-heading" className="font-syne text-sm font-bold text-offwhite">
        How was {storeName}?
      </h2>
      <p className="mt-1 font-dm text-xs text-muted">
        Only customers who actually collected an order can review — so your rating counts.
      </p>

      <div className="mt-4 flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              setRating(i);
              setError(null);
            }}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(0)}
            aria-label={`${i} star${i === 1 ? "" : "s"}`}
            aria-pressed={rating === i}
            className="rounded-lg p-1 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow/60"
          >
            <Star size={28} className={i <= shown ? "fill-yellow text-yellow" : "text-muted/40"} />
          </button>
        ))}
        {shown > 0 && <span className="ml-2 font-dm text-sm text-muted">{LABELS[shown]}</span>}
      </div>

      <label htmlFor="review-body" className="mt-4 block font-dm text-xs text-muted">
        Anything you&apos;d tell another traveller? <span className="text-muted/60">(optional)</span>
      </label>
      <textarea
        id="review-body"
        rows={3}
        maxLength={1000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="The honey was the best I found on the island…"
        className="mt-1.5 w-full resize-y rounded-xl border border-dark-border bg-dark px-4 py-3 font-dm text-sm text-offwhite placeholder:text-muted/60 focus:border-yellow focus:outline-none"
      />

      {error && (
        <p role="alert" className="mt-2 font-dm text-sm text-red-400">
          {error}
        </p>
      )}

      <Button type="button" className="mt-3 w-full" disabled={busy || rating === 0} onClick={() => void submit()}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : "Post review"}
      </Button>
      <p className="mt-2 font-dm text-[11px] text-muted">
        Published straight away under your first name and last initial. You can review each order once.
      </p>
    </section>
  );
}
