"use client";

import { useState } from "react";
import { Loader2, Package, ShoppingBasket, Check } from "lucide-react";
import { toast } from "sonner";
import PhoneInput from "@/components/PhoneInput";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// ── Asking for something to be moved ────────────────────────────────────────
//
// Deliberately ONE screen, not a wizard. A wizard is right when each step
// depends on the last; here the whole ask is six short facts, and a traveller
// on island data should not pay four round trips to give them.
//
// The two kinds are the first question because everything else reads
// differently underneath them: a collection has nothing to buy, a shopping run
// needs a ceiling. That is enforced in the database too — the customer cannot
// talk their way past it from here.

type Kind = "package" | "shop_and_deliver";

// Byte-for-byte the vehicle booking form's field (components/BookingSection.tsx
// `inputCls`), because that is the field design this site already uses for
// every serious form — and this page was the odd one out: bg-dark instead of
// bg-dark-card, py-3 instead of py-3.5. Small differences, but they are what
// made the phone box look like it belonged to another site.
//
// Not "similar to" — copied, so the two cannot drift apart the next time either
// is touched.
const input =
  "w-full bg-dark-card border border-dark-border rounded-xl px-4 py-3.5 text-offwhite text-sm font-dm placeholder:text-muted/50 focus:border-yellow focus:outline-none transition-colors";
const label = "mb-1.5 block font-dm text-xs text-muted";

export default function DeliverForm({ signedInEmail }: { signedInEmail: string | null }) {
  const [kind, setKind] = useState<Kind>("package");
  const [what, setWhat] = useState("");
  const [pickupText, setPickupText] = useState("");
  const [pickupNote, setPickupNote] = useState("");
  const [dropoffText, setDropoffText] = useState("");
  const [dropoffNote, setDropoffNote] = useState("");
  const [sizeClass, setSizeClass] = useState<"standard" | "large">("standard");
  const [budget, setBudget] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const isGuest = !signedInEmail;
  const guestEmailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(guestEmail.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/delivery-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          what: what.trim(),
          pickupText: pickupText.trim(),
          pickupNote: pickupNote.trim() || undefined,
          dropoffText: dropoffText.trim(),
          dropoffNote: dropoffNote.trim() || undefined,
          sizeClass,
          // Rupees on screen, minor units on the wire — the same convention as
          // every other amount in this system.
          maxBudget: kind === "shop_and_deliver" ? Math.round(Number(budget) * 100) : undefined,
          contactName: name.trim(),
          contactPhone: phone.trim(),
          guestEmail: isGuest ? guestEmail.trim().toLowerCase() : undefined,
        }),
      });
      const json = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) {
        toast.error(json.error ?? "Something went wrong. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      toast.error("Could not reach us. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-yellow/30 bg-yellow/[0.06] p-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-yellow text-dark">
          <Check size={22} />
        </span>
        <h2 className="mt-4 font-syne text-lg font-bold text-offwhite">Your request is posted</h2>
        {/* Says what happens next AND what does not: nobody is on the way yet,
            and the price is not set. Both are the opposite of how ordering
            works everywhere else on this site, so leaving it implied would
            invite somebody to sit and wait for a driver who was never sent. */}
        <p className="mt-2 font-dm text-sm leading-relaxed text-muted">
          Drivers who can carry it will send you a price. You choose the one you want —
          nobody is on the way until you do. We will message you on{" "}
          <span className="text-offwhite/80">{phone || "your number"}</span> when the
          first quote arrives.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* ── What kind of job ─────────────────────────────────────────────── */}
      <fieldset>
        <legend className="mb-2 font-bebas text-[11px] tracking-[0.3em] text-yellow">
          WHAT DO YOU NEED
        </legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(
            [
              { k: "package" as const, icon: Package, t: "Collect & deliver",
                d: "It already exists somewhere. A parcel from family, something you left behind." },
              { k: "shop_and_deliver" as const, icon: ShoppingBasket, t: "Buy & deliver",
                d: "Someone buys it for you first, then brings it. You set the most they may spend." },
            ]
          ).map((o) => (
            <button
              key={o.k}
              type="button"
              onClick={() => setKind(o.k)}
              aria-pressed={kind === o.k}
              className={`rounded-xl border p-4 text-left transition-colors ${
                kind === o.k
                  ? "border-yellow/60 bg-yellow/10"
                  : "border-white/10 bg-dark-card hover:border-white/25"
              }`}
            >
              <o.icon size={18} className={kind === o.k ? "text-yellow" : "text-muted"} />
              <span className="mt-2 block font-syne text-sm font-bold text-offwhite">{o.t}</span>
              <span className="mt-1 block font-dm text-xs leading-relaxed text-muted">{o.d}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="d-what" className={label}>
          {kind === "package" ? "What are we collecting?" : "What should we buy?"}
        </label>
        <Textarea
          id="d-what"
          value={what}
          onChange={(e) => setWhat(e.target.value)}
          rows={2}
          className={input}
          placeholder={
            kind === "package"
              ? "e.g. A medium box, about 10 kg, from my sister"
              : "e.g. 2 gas bottles, 12 kg, any brand"
          }
        />
      </div>

      {kind === "shop_and_deliver" && (
        <div>
          <label htmlFor="d-budget" className={label}>
            The most we may spend on it (Rs)
          </label>
          <input
            id="d-budget"
            type="number"
            min={1}
            inputMode="decimal"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className={input}
            placeholder="e.g. 1500"
          />
          {/* The two numbers are separated here because conflating them is how
              a driver ends up out of pocket. */}
          <p className="mt-1.5 font-dm text-xs text-muted">
            You repay what was actually spent, up to this. The delivery fee is separate
            and each driver names their own.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="d-from" className={label}>Collect from</label>
          <input id="d-from" value={pickupText} onChange={(e) => setPickupText(e.target.value)}
                 className={input} placeholder="Village, shop or landmark" />
          <input value={pickupNote} onChange={(e) => setPickupNote(e.target.value)}
                 className={`${input} mt-2`} placeholder="Who to ask for, or how to find it" />
        </div>
        <div>
          <label htmlFor="d-to" className={label}>Deliver to</label>
          <input id="d-to" value={dropoffText} onChange={(e) => setDropoffText(e.target.value)}
                 className={input} placeholder="Village, hotel or landmark" />
          <input value={dropoffNote} onChange={(e) => setDropoffNote(e.target.value)}
                 className={`${input} mt-2`} placeholder="Gate colour, floor, anything that helps" />
        </div>
      </div>

      {/* Same question, same words and same consequence as the checkout box —
          this is the M103 gate, and a large job is only quoted by drivers with
          a car or a van. */}
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-dark-card p-3.5 transition-colors hover:border-yellow/40">
        <input
          type="checkbox"
          checked={sizeClass === "large"}
          onChange={(e) => setSizeClass(e.target.checked ? "large" : "standard")}
          className="mt-0.5 h-4 w-4 shrink-0 accent-yellow"
        />
        <span>
          <span className="block font-dm text-sm font-semibold text-offwhite">
            This is a large item — it needs a car
          </span>
          <span className="mt-0.5 block font-dm text-xs leading-relaxed text-muted">
            Furniture, a gas bottle, an appliance, several big boxes. Only drivers with a
            car or a van will be able to quote.
          </span>
        </span>
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="d-name" className={label}>Your name</label>
          <input id="d-name" value={name} onChange={(e) => setName(e.target.value)}
                 className={input} placeholder="Marie" autoComplete="name" />
        </div>
        <div>
          {/* htmlFor + id, or the field has no accessible name — the exact
              failure PhoneInput's `id` prop exists to prevent. */}
          <label htmlFor="d-phone" className={label}>Your phone</label>
          {/* The component now styles itself if given nothing, which is the
              safety net — but this page's other fields sit on bg-dark, so it is
              passed explicitly to match them exactly. pl-10 clears the glyph. */}
          <PhoneInput
            id="d-phone"
            value={phone}
            onChange={setPhone}
            disabled={submitting}
            inputClassName={`${input} pl-10`}
          />
        </div>
      </div>

      {isGuest && (
        <div>
          <label htmlFor="d-email" className={label}>Your email</label>
          <input id="d-email" type="email" value={guestEmail}
                 onChange={(e) => setGuestEmail(e.target.value)} className={input}
                 placeholder="you@example.com" autoComplete="email" />
          <p className="mt-1.5 font-dm text-xs text-muted">So we can send you the quotes.</p>
        </div>
      )}

      <Button
        type="submit"
        disabled={
          submitting ||
          what.trim().length < 3 ||
          pickupText.trim().length < 2 ||
          dropoffText.trim().length < 2 ||
          name.trim().length < 2 ||
          !phone.trim() ||
          (isGuest && !guestEmailValid) ||
          (kind === "shop_and_deliver" && !(Number(budget) > 0))
        }
        className="w-full"
      >
        {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
        {submitting ? "Posting…" : "Ask for prices"}
      </Button>

      {/* The button says "ask for prices", not "book", because that is what it
          does. Nobody is dispatched and nothing is charged here. */}
      <p className="text-center font-dm text-xs text-muted">
        Free to ask. You only pay once you accept a driver&apos;s price.
      </p>
    </form>
  );
}
