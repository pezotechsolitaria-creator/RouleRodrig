"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Package, ShoppingBasket, Check, Pencil, MapPin, Navigation, User } from "lucide-react";
import { toast } from "sonner";
import PhoneInput from "@/components/PhoneInput";
import PlacePicker from "@/components/PlacePicker";
import PhotoInput from "./PhotoInput";
import type { RidePlace } from "@/lib/rides/places";
import { cn } from "@/lib/utils";
import { toCents } from "@/lib/money";
import { toE164 } from "@/lib/phone";
import { saveRequest } from "@/lib/delivery/my-requests";
import { recipe, transition, type as t } from "@/lib/delivery/tokens";

// ── Asking for something to be moved ────────────────────────────────────────
//
// ── WHY THIS WAS REBUILT ───────────────────────────────────────────────────
// delivery_requests has never had a single row. Three of the reasons were in
// the database and are fixed in M136 — nobody could quote, nobody could accept,
// and the winning driver could not see the job. The fourth reason was THIS
// FORM: about ten fields on one scroll, with the only button below all of them.
// A visitor had to read the whole thing before finding out what it would cost
// them (nothing) or commit them to (nothing). Both facts lived past the fold.
//
// ── What changed, and what deliberately did not ────────────────────────────
// It is still ONE screen and still ONE request. The old file's objection to a
// wizard was right and is preserved: "a traveller on island data should not pay
// four round trips". Staging here is pure client state — no navigation, no
// extra fetch, and every answer stays on the page.
//
// What changed is DISCLOSURE. One group is open at a time; a finished group
// collapses to a line you can tap to reopen. And the action is pinned above the
// fold-line at the bottom of the thumb's reach, saying at every moment what it
// will do and what it will cost. That is the DoorDash checkout pattern, which
// is worth taking; their palette and their fixed-menu model are not, and are
// not taken. See lib/delivery/tokens.ts.
//
// On success this now LEAVES, to /deliver/<id>. The old version showed a
// "posted!" panel that went nowhere, which was honest at the time — there was
// nowhere to go.

type Kind = "package" | "shop_and_deliver";
type Step = "what" | "where" | "who";
const STEPS: Step[] = ["what", "where", "who"];

export default function DeliverForm({ signedInEmail }: { signedInEmail: string | null }) {
  const router = useRouter();

  const [step, setStep] = useState<Step>("what");
  const [kind, setKind] = useState<Kind>("package");
  const [what, setWhat] = useState("");
  const [budget, setBudget] = useState("");
  const [sizeClass, setSizeClass] = useState<"standard" | "large">("standard");
  // A storage PATH in a private bucket, never a URL.
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  // A PLACE, not a string. The picker yields a name AND coordinates for the ~40
  // named Rodriguan landmarks, which is what dispatch needs and what free text
  // never gave it — a Deliver Anything job had no origin at all, and M145 had
  // to stop a null origin excluding every driver who had ever reported a
  // position. Anywhere unnamed still goes through with lat/lng null.
  const [pickup, setPickup] = useState<RidePlace | null>(null);
  const [dropoff, setDropoff] = useState<RidePlace | null>(null);
  const [pickupNote, setPickupNote] = useState("");
  const [dropoffNote, setDropoffNote] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isGuest = !signedInEmail;
  const guestEmailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(guestEmail.trim());

  // Money never touches a float. toCents() works on the decimal string, because
  // Math.round(parseFloat("9.995") * 100) is 999, not 1000 — see lib/money.ts.
  const budgetCents = useMemo(() => (budget.trim() ? toCents(budget) : null), [budget]);

  // PhoneInput hands back formatInternational() -- "+230 5712 3456", with
  // spaces -- and both /api/delivery-requests and the table underneath enforce
  // strict E.164. Sending it as typed 400d EVERY submission, for everybody,
  // on the last tap of the form.
  const phoneE164 = useMemo(() => toE164(phone), [phone]);

  const done: Record<Step, boolean> = {
    // A PHOTO COUNTS. For the 44% of Rodriguans over 60 who cannot write
    // (2022 census Vol. VI Table E2a), holding up a phone is the description --
    // so either a few words or a picture unlocks the step, not both.
    what:
      (what.trim().length >= 3 || photoPath !== null) &&
      (kind !== "shop_and_deliver" || (budgetCents !== null && budgetCents > 0)),
    where: pickup !== null && dropoff !== null,
    who:
      name.trim().length >= 2 &&
      // Not "they typed something" -- "the server will accept it". The old
      // check passed on any non-empty string and handed the failure to the
      // submit button.
      phoneE164 !== null &&
      (!isGuest || guestEmailValid),
  };
  const allDone = done.what && done.where && done.who;

  function advance() {
    const next = STEPS[STEPS.indexOf(step) + 1];
    if (next) setStep(next);
  }

  async function submit() {
    if (submitting || !allDone) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/delivery-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          what: what.trim(),
          pickupText: pickup?.name.trim(),
          pickupNote: pickupNote.trim() || undefined,
          dropoffText: dropoff?.name.trim(),
          dropoffNote: dropoffNote.trim() || undefined,
          // Sent at last. The API has accepted these since it was written and
          // the form never had any to send.
          pickupLat: pickup?.lat ?? undefined,
          pickupLng: pickup?.lng ?? undefined,
          dropoffLat: dropoff?.lat ?? undefined,
          dropoffLng: dropoff?.lng ?? undefined,
          sizeClass,
          // Rupees on screen, minor units on the wire — the same convention as
          // every other amount in this system.
          maxBudget: kind === "shop_and_deliver" ? budgetCents ?? undefined : undefined,
          photoPath: photoPath ?? undefined,
          contactName: name.trim(),
          contactPhone: phoneE164,
          guestEmail: isGuest ? guestEmail.trim().toLowerCase() : undefined,
        }),
      });
      const json = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !json.id) {
        toast.error(json.error ?? "Something went wrong. Please try again.");
        return;
      }
      // Remember it on this device BEFORE navigating, so a guest who closes the
      // tab and comes back is not asked to prove anything.
      saveRequest({
        id: json.id,
        email: isGuest ? guestEmail.trim().toLowerCase() : undefined,
        what: what.trim(),
      });
      router.push(`/deliver/${json.id}`);
    } catch {
      toast.error("Could not reach us. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // What the pinned button says right now. Never a bare "Next": the last step's
  // label has to carry that this asks for prices rather than booking anything.
  // The FIRST group that is still unfinished, which is not always the open one:
  // somebody can complete all three, reopen step 1, switch to "Buy & deliver"
  // and leave the budget empty. The CTA used to keep saying "Ask for prices"
  // and stay enabled, because it only ever looked at the step in front of it --
  // and submit() then returned silently, so the tap did nothing at all.
  const firstUnfinished = STEPS.find((sp) => !done[sp]) ?? null;

  const cta =
    step !== "who"
      ? !done[step]
        ? { label: stepPrompt(step, kind), disabled: true, fix: null }
        : { label: "Continue", disabled: false, fix: null }
      : firstUnfinished
        ? {
            // Names the missing thing and, when it is behind them, offers to go
            // back to it rather than leaving a dead button.
            label: stepPrompt(firstUnfinished, kind),
            disabled: firstUnfinished === "who",
            fix: firstUnfinished === "who" ? null : firstUnfinished,
          }
        : { label: submitting ? "Posting…" : "Ask for prices", disabled: submitting, fix: null };

  return (
    <>
      <div className="flex flex-col gap-3">
        {/* ── 1. What ──────────────────────────────────────────────────── */}
        <Group
          index={1}
          icon={kind === "shop_and_deliver" ? ShoppingBasket : Package}
          title="What do you need moved?"
          summary={summaryWhat(kind, what, sizeClass, photoPath !== null)}
          open={step === "what"}
          complete={done.what}
          onOpen={() => setStep("what")}
        >
          <fieldset>
            <legend className="sr-only">What kind of job</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    k: "package" as const,
                    icon: Package,
                    title: "Collect & deliver",
                    body: "It already exists somewhere. A parcel from family, something you left behind.",
                  },
                  {
                    k: "shop_and_deliver" as const,
                    icon: ShoppingBasket,
                    title: "Buy & deliver",
                    body: "Someone buys it for you first, then brings it. You set the most they may spend.",
                  },
                ]
              ).map((o) => {
                const on = kind === o.k;
                return (
                  <button
                    key={o.k}
                    type="button"
                    onClick={() => setKind(o.k)}
                    aria-pressed={on}
                    className={on ? recipe.cardButtonSelected : recipe.cardButton}
                  >
                    <span className="flex items-center justify-between">
                      <o.icon size={18} className={on ? "text-yellow" : "text-muted"} />
                      {/* Not colour alone: roughly one man in twelve here cannot
                          rely on the yellow to tell him which one is chosen. */}
                      {on && <Check size={15} className="text-yellow" />}
                    </span>
                    <span className={cn(t.cardTitle, "mt-2 block text-offwhite")}>{o.title}</span>
                    <span className={cn(t.meta, "mt-1 block leading-relaxed text-muted")}>
                      {o.body}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-4">
            <label htmlFor="d-what" className={cn(t.meta, "mb-1.5 block text-muted")}>
              {kind === "package" ? "What are we collecting?" : "What should we buy?"}
            </label>
            <textarea
              id="d-what"
              rows={2}
              value={what}
              onChange={(e) => setWhat(e.target.value)}
              className={cn(recipe.field, "resize-none")}
              placeholder={
                kind === "package"
                  ? "e.g. A medium box, about 10 kg, from my sister"
                  : "e.g. 2 gas bottles, 12 kg, any brand"
              }
            />
          </div>

          <PhotoInput path={photoPath} onChange={setPhotoPath} />

          <AnimatePresence initial={false}>
            {kind === "shop_and_deliver" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={transition.step}
                className="overflow-hidden"
              >
                <div className="mt-4">
                  <label htmlFor="d-budget" className={cn(t.meta, "mb-1.5 block text-muted")}>
                    The most we may spend on it (Rs)
                  </label>
                  <input
                    id="d-budget"
                    type="text"
                    inputMode="decimal"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className={recipe.field}
                    placeholder="e.g. 1500"
                  />
                  {/* The two numbers, kept apart. Conflating them is how a
                      driver ends up out of pocket at the till. */}
                  <p className={cn(t.meta, "mt-1.5 text-muted")}>
                    You repay what was actually spent, up to this. The delivery fee is
                    separate and each driver names their own.
                  </p>
                  {budget.trim() && budgetCents === null && (
                    <p className={cn(t.meta, "mt-1.5 text-red-400")}>
                      Enter an amount in rupees, like 1500.
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Same words and same consequence as the checkout box — the M103
              gate. A large job is only ever quoted by a car or a van. */}
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3.5 transition-colors hover:border-yellow/40">
            <input
              type="checkbox"
              checked={sizeClass === "large"}
              onChange={(e) => setSizeClass(e.target.checked ? "large" : "standard")}
              className="mt-0.5 h-4 w-4 shrink-0 accent-yellow"
            />
            <span>
              <span className={cn(t.bodySm, "block font-semibold text-offwhite")}>
                This is a large item — it needs a car
              </span>
              <span className={cn(t.meta, "mt-0.5 block leading-relaxed text-muted")}>
                Furniture, a gas bottle, an appliance, several big boxes. Only drivers with
                a car or a van will be able to quote.
              </span>
            </span>
          </label>
        </Group>

        {/* ── 2. Where ─────────────────────────────────────────────────── */}
        <Group
          index={2}
          icon={MapPin}
          title="Where is it going?"
          summary={done.where ? `${pickup?.name} → ${dropoff?.name}` : null}
          open={step === "where"}
          complete={done.where}
          onOpen={() => setStep("where")}
        >
          {/* Pick a name, do not type an address. This is the field people
              hesitate over most: there are no street numbers in most of
              Rodrigues, and a box that looks like it wants one gets abandoned.
              The list is the same forty landmarks the ride flow uses, it
              matches French and old spellings, and it offers "use where I am
              now" for somebody standing at the door. */}
          <div className="flex flex-col gap-3">
            <PlacePicker
              label="COLLECT FROM"
              icon={MapPin}
              value={pickup}
              onPick={setPickup}
              placeholder="Village, shop or landmark"
            />
            {pickup && (
              <input
                value={pickupNote}
                onChange={(e) => setPickupNote(e.target.value)}
                className={recipe.field}
                placeholder="Who to ask for, or how to find it (optional)"
                aria-label="How to find the pickup"
              />
            )}

            <PlacePicker
              label="DELIVER TO"
              icon={Navigation}
              value={dropoff}
              onPick={setDropoff}
              placeholder="Village, hotel or landmark"
            />
            {dropoff && (
              <input
                value={dropoffNote}
                onChange={(e) => setDropoffNote(e.target.value)}
                className={recipe.field}
                placeholder="Gate colour, floor, anything that helps (optional)"
                aria-label="How to find the drop-off"
              />
            )}
          </div>
        </Group>

        {/* ── 3. Who ───────────────────────────────────────────────────── */}
        <Group
          index={3}
          icon={User}
          title="How do drivers reach you?"
          summary={done.who ? `${name.trim()} · ${phone.trim()}` : null}
          open={step === "who"}
          complete={done.who}
          onOpen={() => setStep("who")}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="d-name" className={cn(t.meta, "mb-1.5 block text-muted")}>
                Your name
              </label>
              <input
                id="d-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={recipe.field}
                placeholder="Marie"
                autoComplete="name"
              />
            </div>
            <div>
              {/* htmlFor + id, or the field has no accessible name — the exact
                  failure PhoneInput's `id` prop exists to prevent. */}
              <label htmlFor="d-phone" className={cn(t.meta, "mb-1.5 block text-muted")}>
                Your phone
              </label>
              <PhoneInput
                id="d-phone"
                value={phone}
                onChange={setPhone}
                disabled={submitting}
                inputClassName={cn(recipe.field, "pl-10")}
              />
            </div>
          </div>

          {isGuest && (
            <div className="mt-4">
              <label htmlFor="d-email" className={cn(t.meta, "mb-1.5 block text-muted")}>
                Your email
              </label>
              <input
                id="d-email"
                type="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                className={recipe.field}
                placeholder="you@example.com"
                autoComplete="email"
              />
              <p className={cn(t.meta, "mt-1.5 text-muted")}>
                This is how you get back to your request from another phone — we check
                it against your reference. Prices appear on the request page.
              </p>
            </div>
          )}
        </Group>
      </div>

      {/* ── The action, pinned ─────────────────────────────────────────── */}
      {/* The single most important structural change. It was below ten fields,
          so nobody saw it while deciding whether this was worth their time. It
          clears the floating bottom nav, which owns the strip below it. */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-dark/95 px-5 pb-[max(5.5rem,calc(env(safe-area-inset-bottom)+5.5rem))] pt-3 backdrop-blur-md md:pb-4",
        )}
      >
        <div className="mx-auto max-w-2xl">
          <button
            type="button"
            onClick={() => {
              if (cta.fix) return setStep(cta.fix);
              if (step === "who") return void submit();
              advance();
            }}
            disabled={cta.disabled}
            className={cn(recipe.primaryAction, "inline-flex items-center justify-center gap-2")}
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            {cta.label}
          </button>
          {/* The two facts that were below the fold. They are the reason
              somebody finishes this form, so they sit ON the button. */}
          <p className={cn(t.meta, "mt-2 text-center text-white/55")}>
            Free to ask. You only pay once you accept a driver&apos;s price.
          </p>
        </div>
      </div>
    </>
  );
}

// ── An accordion group ──────────────────────────────────────────────────────
//
// Closed, it is a one-line answer you can tap to change. Open, it is the only
// thing asking anything. That is what turns ten fields into three decisions.

function Group({
  index,
  icon: Icon,
  title,
  summary,
  open,
  complete,
  onOpen,
  children,
}: {
  index: number;
  icon: typeof Package;
  title: string;
  summary: string | null;
  open: boolean;
  complete: boolean;
  onOpen: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border transition-colors",
        open ? "border-white/[0.14] bg-dark-card" : "border-white/10 bg-white/[0.02]",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
            complete ? "bg-yellow text-dark" : open ? "bg-yellow/15 text-yellow" : "bg-white/[0.06] text-white/40",
          )}
        >
          {complete ? <Check size={15} /> : index}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn(t.cardTitle, "block text-offwhite")}>{title}</span>
          {!open && summary && (
            <span className={cn(t.meta, "mt-0.5 block truncate text-muted")}>{summary}</span>
          )}
        </span>
        {!open && <Pencil size={14} className="shrink-0 text-white/25" aria-hidden />}
        {open && <Icon size={16} className="shrink-0 text-white/25" aria-hidden />}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={transition.step}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

// ── What the pinned button says while a step is unfinished ──────────────────
// Naming the missing thing beats a greyed-out "Next" that explains nothing.

function stepPrompt(step: Step, kind: Kind): string {
  if (step === "what") {
    return kind === "shop_and_deliver"
      ? "Say what to buy, and your limit"
      : "Say what it is, or add a photo";
  }
  if (step === "where") return "Add where it starts and ends";
  return "Add your name and number";
}

function summaryWhat(kind: Kind, what: string, sizeClass: string, hasPhoto = false): string | null {
  const body = what.trim() || (hasPhoto ? "Photo added" : "");
  if (!body) return null;
  const label = kind === "shop_and_deliver" ? "Buy & deliver" : "Collect & deliver";
  return `${label} · ${body}${sizeClass === "large" ? " · Large" : ""}`;
}
