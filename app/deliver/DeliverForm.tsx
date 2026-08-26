"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Boxes,
  Check,
  CloudOff,
  Loader2,
  MapPin,
  Navigation,
  Package,
  Pencil,
  Phone,
  ShoppingBasket,
  UtensilsCrossed,
  Umbrella,
  Sofa,
} from "lucide-react";
import { toast } from "sonner";
import PhoneInput from "@/components/PhoneInput";
import PlacePicker from "@/components/PlacePicker";
import PhotoInput from "./PhotoInput";
import type { RidePlace } from "@/lib/rides/places";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";
import { toCents } from "@/lib/money";
import { toE164 } from "@/lib/phone";
import { saveRequest } from "@/lib/delivery/my-requests";
import {
  DELIVER_COPY,
  ITEM_CHOICES,
  itemToColumns,
  type ItemChoice,
} from "@/lib/delivery/copy.i18n";
import {
  clearDraft,
  clearQueued,
  draftHasContent,
  isRetryable,
  queueRequest,
  readDraft,
  readQueued,
  writeDraft,
  type Draft,
  type RequestPayload,
} from "@/lib/delivery/draft";
import {
  readContact,
  rememberContact,
  rememberPlace,
} from "@/lib/delivery/remembered";
import {
  VEHICLE_LABEL,
  VEHICLE_TYPES,
  vehiclesFor,
} from "@/lib/delivery/vehicle";
import {
  prefersReducedMotion,
  recipe,
  transition,
  type as t,
} from "@/lib/delivery/tokens";

// ── Asking for something to be moved, in three screens ──────────────────────
//
// ── WHAT THIS REPLACED, AND WHY ────────────────────────────────────────────
// The version before this one was an accordion: three groups on one page, one
// open at a time, everything else collapsed to a summary line. That was already
// a large improvement on the ten-field scroll it replaced, and it still had the
// flaw the owner named — GROUP ONE ALONE WAS TALLER THAN A PHONE. Two kind
// cards, a description, a photo, four cargo cards, two size cards and an
// eligibility line: a scroll inside a step that was supposed to be one screen.
//
// So this is a real three-screen flow, and the height budget is the design
// constraint rather than an afterthought. Each screen is built to land under
// ~500px of content above the pinned bar, which is one phone screen with the
// keyboard down on everything back to a 2016 handset.
//
// ── THE FOUR MOVES THAT BOUGHT THE HEIGHT ──────────────────────────────────
//  1. THE KIND CARDS COLLAPSE. Choosing is the answer, so on the tap they fold
//     into one 48px line you can tap to change. Worth ~110px, and it is the
//     honest shape: you are not still choosing.
//  2. SIX CARDS BECAME FIVE CHIPS. "What kind of thing is it?" and "will it fit
//     in a car?" were two correct questions costing two blocks. They are one
//     row of five now — see itemToColumns in copy.i18n.ts, which keeps both
//     database columns and keeps the one genuinely ambiguous case (large AND
//     heavy: a fridge) as a single follow-up that appears only where it means
//     something.
//  3. CONTACT MOVED UP into screen 2, next to the places, which frees screen 3
//     to be a review — the thing the old flow never had. A person could reach
//     the end without once seeing what they were about to post.
//  4. THE NOTES HID. "Gate colour, floor" is a real field and almost nobody
//     fills it, so it is a link that becomes a field, not a field.
//
// ── WHAT IS DELIBERATELY STILL TRUE ────────────────────────────────────────
// It is still ONE page and ONE request. The staging is pure client state — no
// navigation, no extra fetch, nothing lost by going back. A traveller on island
// data should not pay three round trips to fill in a form, and a person on the
// third screen must be able to change the first answer without losing the rest.

type Kind = "package" | "shop_and_deliver";
const SCREENS = 3;

const ITEM_ICON: Record<ItemChoice, typeof Package> = {
  general: Package,
  food: UtensilsCrossed,
  fragile: Umbrella,
  heavy: Boxes,
  large: Sofa,
};

export default function DeliverForm({
  signedInEmail,
  helpPhone,
  helpWhatsapp,
}: {
  signedInEmail: string | null;
  helpPhone: string;
  helpWhatsapp: string;
}) {
  const router = useRouter();
  const { language } = useLanguage();
  const c = DELIVER_COPY[language];

  const [screen, setScreen] = useState(1);
  // NULL, not "package". The two cards are a real question until it is
  // answered, and defaulting one of them silently makes the collapse look like
  // the form choosing for you.
  const [kind, setKind] = useState<Kind | null>(null);
  const [what, setWhat] = useState("");
  const [budget, setBudget] = useState("");
  // NULL, for the same reason `kind` is null: "Parcel" was pre-selected, which
  // is the form answering a question on the customer's behalf — and the answer
  // decides WHO CAN CARRY THE JOB. Somebody sending a gas bottle who never
  // noticed the chips would have had it offered to bicycles.
  //
  // It also buys the height. An unanswered question is a grid; an answered one
  // is a 48px line. See the disclosure note on the render below.
  const [item, setItem] = useState<ItemChoice | null>(null);
  const [largeAndHeavy, setLargeAndHeavy] = useState(false);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [pickup, setPickup] = useState<RidePlace | null>(null);
  const [dropoff, setDropoff] = useState<RidePlace | null>(null);
  const [pickupNote, setPickupNote] = useState("");
  const [dropoffNote, setDropoffNote] = useState("");
  const [showPickupNote, setShowPickupNote] = useState(false);
  const [showDropoffNote, setShowDropoffNote] = useState(false);
  // A shopping run does not need a pickup: "buy 2 gas bottles" is a job whose
  // whole value is that the DRIVER works out where to get them.
  const [namesShop, setNamesShop] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [restored, setRestored] = useState(false);
  const [online, setOnline] = useState(true);
  const [queuedNotice, setQueuedNotice] = useState(false);

  // Normalised once. `?? ""` on both, because a tel: or wa.me link built from
  // undefined is a runtime throw inside a render — and this component is the
  // whole page.
  const tel = (helpPhone ?? "").replace(/[^\d+]/g, "");
  const wa = (helpWhatsapp ?? "").replace(/\D/g, "");

  const isGuest = !signedInEmail;
  const guestEmailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(guestEmail.trim());
  const { sizeClass, cargoKind } = itemToColumns(
    item ?? "general",
    largeAndHeavy,
  );

  // Money never touches a float: Math.round(parseFloat("9.995") * 100) is 999.
  const budgetCents = useMemo(
    () => (budget.trim() ? toCents(budget) : null),
    [budget],
  );
  // PhoneInput hands back "+230 5712 3456" WITH SPACES and the endpoint enforces
  // strict E.164 — the bug that 400'd every submission on the last tap, for
  // everybody, for as long as this form existed.
  const phoneE164 = useMemo(() => toE164(phone), [phone]);

  const reduced = prefersReducedMotion();

  // Screen 2 asks three things — collect where, deliver where, and how to reach
  // you — and they are strictly ordered. These two say which one is live, so
  // exactly one place picker stands open and the contact fields do not appear
  // over a question that has not been answered. A shopping run with no named
  // shop has no pickup to answer, and is done the moment it says so.
  const pickupDone =
    kind === "shop_and_deliver"
      ? !namesShop || pickup !== null
      : pickup !== null;
  const placesDone = pickupDone && dropoff !== null;

  // ── What is missing, per screen ──────────────────────────────────────────
  // Named rather than boolean, so the pinned button can say the missing thing
  // instead of greying out and explaining nothing.
  const done = {
    // A PHOTO COUNTS AS THE DESCRIPTION. For the 44% of Rodriguans over 60 who
    // cannot write (2022 census Vol. VI Table E2a), holding up a phone IS the
    // answer — so a few words OR a picture unlocks the screen, never both.
    1:
      kind !== null &&
      item !== null &&
      (what.trim().length >= 3 || photoPath !== null) &&
      (kind !== "shop_and_deliver" ||
        (budgetCents !== null && budgetCents > 0)),
    2:
      dropoff !== null &&
      (kind === "shop_and_deliver"
        ? !namesShop || pickup !== null
        : pickup !== null) &&
      name.trim().length >= 2 &&
      // Not "they typed something" — "the server will accept it".
      phoneE164 !== null &&
      (!isGuest || guestEmailValid),
    3: true,
  } as const;

  // ── The draft, restored — and the person, remembered ─────────────────────
  //
  // This one genuinely is an on-mount setState and stays that way. The React
  // Compiler lint objects to cascading renders, and it is right in general —
  // but the alternative here is worse in every direction: a lazy useState
  // initialiser reads localStorage DURING render, which the server cannot
  // match, so React discards the tree; and useSyncExternalStore is wrong for
  // fifteen fields that must be editable the moment they land. It fires once,
  // on mount, with an empty dependency list.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // Read after hydration, never during render: localStorage during render
    // makes the server and client markup disagree and React throws the tree
    // away.
    const known = readContact();
    if (known) {
      // A starting point, not a claim about who is holding the phone — every
      // field stays editable. Twenty seconds of typing on a numeric keypad,
      // saved on every order after the first, WITHOUT an account.
      setName(known.name);
      setPhone(known.phone);
      if (known.email) setGuestEmail(known.email);
    }

    const d = readDraft();
    if (!draftHasContent(d) || !d) return;
    setKind(d.kind);
    setWhat(d.what);
    setBudget(d.budget);
    // Validated against the live list rather than trusted: a draft written
    // before a chip was renamed must reopen as an unanswered question, not as
    // a chip that no longer exists.
    setItem(
      ITEM_CHOICES.includes(d.item as ItemChoice)
        ? (d.item as ItemChoice)
        : null,
    );
    setLargeAndHeavy(d.largeAndHeavy);
    setPhotoPath(d.photoPath);
    setPickup(d.pickup as RidePlace | null);
    setDropoff(d.dropoff as RidePlace | null);
    setPickupNote(d.pickupNote);
    setShowPickupNote(Boolean(d.pickupNote));
    setDropoffNote(d.dropoffNote);
    setShowDropoffNote(Boolean(d.dropoffNote));
    setNamesShop(d.namesShop);
    // Only where the draft actually HAS something. A draft abandoned on screen
    // one carries three empty contact strings, and writing those over the
    // remembered contact would un-remember somebody for the crime of coming
    // back — the draft would be undoing the convenience it exists to provide.
    if (d.name.trim()) setName(d.name);
    if (d.phone.trim()) setPhone(d.phone);
    if (d.guestEmail.trim()) setGuestEmail(d.guestEmail);

    // ── LAND WHERE THEY LEFT OFF ────────────────────────────────────────
    // Restoring the answers and then showing question one is most of a draft
    // and none of the point: somebody who got to the review screen and lost
    // their connection has to walk forward through three screens of their own
    // answers to reach the button again.
    //
    // Clamped to the first INCOMPLETE screen, though, and computed from the
    // draft rather than from state — the setters above have not flushed yet.
    // Landing on review with a gap behind it would show a dead post button
    // and nothing saying which answer was missing.
    setScreen(resumeScreen(d, known?.email ?? d.guestEmail, isGuest));
    setRestored(true);
    // `isGuest` is read here and deliberately NOT a dependency. It comes from
    // signedInEmail, a prop of a server-rendered page, so it cannot change
    // without a remount — and listing it would re-run the restore and stamp a
    // stale draft over answers somebody has since typed. Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── The draft, saved ─────────────────────────────────────────────────────
  // Every change, because the failure being designed against is losing four
  // minutes of typing to a dropped connection on the last tap.
  useEffect(() => {
    if (submitting) return;
    writeDraft({
      kind: kind ?? "package",
      what,
      budget,
      item: item ?? "",
      largeAndHeavy,
      photoPath,
      pickup,
      dropoff,
      pickupNote,
      dropoffNote,
      namesShop,
      name,
      phone,
      guestEmail,
      step: String(screen),
    });
  }, [
    kind,
    what,
    budget,
    item,
    largeAndHeavy,
    photoPath,
    pickup,
    dropoff,
    pickupNote,
    dropoffNote,
    namesShop,
    name,
    phone,
    guestEmail,
    screen,
    submitting,
  ]);

  const post = useCallback(
    async (
      payload: RequestPayload,
    ): Promise<{
      ok: boolean;
      id?: string;
      status: number | null;
      error?: string;
    }> => {
      try {
        const res = await fetch("/api/delivery-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = (await res.json().catch(() => ({}))) as {
          id?: string;
          error?: string;
        };
        if (!res.ok || !json.id)
          return { ok: false, status: res.status, error: json.error };
        return { ok: true, id: json.id, status: res.status };
      } catch {
        // Never reached the server at all.
        return { ok: false, status: null };
      }
    },
    [],
  );

  // ── The outbox, drained ──────────────────────────────────────────────────
  // A request finished offline is a PROMISE, so it survives a closed tab and is
  // sent the moment the browser says there is signal again.
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();

    let draining = false;
    async function drain() {
      if (draining || !navigator.onLine) return;
      const q = readQueued();
      if (!q) return;
      draining = true;
      toast.message(c.offline.sending);
      const r = await post(q.payload);
      draining = false;
      if (r.ok && r.id) {
        clearQueued();
        clearDraft();
        saveRequest({
          id: r.id,
          email: q.payload.guestEmail,
          what: q.payload.what,
        });
        router.push(`/deliver/${r.id}`);
        return;
      }
      // A refusal is not worth retrying forever — it fails on a screen nobody
      // is looking at. Surface it and forget it.
      if (!isRetryable(r.status)) {
        clearQueued();
        setQueuedNotice(false);
        toast.error(r.error ?? c.error.generic);
      }
    }

    void drain();
    window.addEventListener("online", () => {
      sync();
      void drain();
    });
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, [c, post, router]);

  async function submit() {
    if (submitting || !done[1] || !done[2] || !kind || !phoneE164 || !dropoff)
      return;
    setSubmitting(true);

    // ── THE TWO ENGLISH STRINGS BELOW ARE NOT A MISSED TRANSLATION ─────────
    // Everything the CUSTOMER reads comes from the dictionary. These two are
    // stored in delivery_requests and read by somebody else — the driver, on a
    // board that is in one language. Writing them in the customer's language
    // would mean a driver's queue arrived in a mix of three, sorted by whoever
    // happened to post.
    const payload: RequestPayload = {
      kind,
      // A photo satisfies step one on its own, and the column is NOT NULL.
      what: what.trim() || "See photo",
      // delivery_requests.pickup_text is NOT NULL with a non-empty CHECK, and a
      // driver reading their board needs a sentence rather than a blank. The
      // customer sees the translated c.where.anywhere on the review screen.
      pickupText: pickup?.name.trim() ?? "Anywhere you can find it",
      pickupNote: pickupNote.trim() || undefined,
      dropoffText: dropoff.name.trim(),
      dropoffNote: dropoffNote.trim() || undefined,
      pickupLat: pickup?.lat ?? undefined,
      pickupLng: pickup?.lng ?? undefined,
      dropoffLat: dropoff.lat ?? undefined,
      dropoffLng: dropoff.lng ?? undefined,
      sizeClass,
      cargoKind,
      // Rupees on screen, minor units on the wire.
      maxBudget:
        kind === "shop_and_deliver" ? (budgetCents ?? undefined) : undefined,
      photoPath: photoPath ?? undefined,
      contactName: name.trim(),
      contactPhone: phoneE164,
      guestEmail: isGuest ? guestEmail.trim().toLowerCase() : undefined,
    };

    // Remembered NOW, before the network, because it is not contingent on the
    // server accepting anything: the person has finished the form either way,
    // and a request that has to be queued offline is exactly the one whose
    // details are most worth not retyping.
    rememberContact({
      name: name.trim(),
      phone: phone.trim(),
      email: guestEmail.trim(),
    });
    rememberPlace(pickup);
    rememberPlace(dropoff);

    // Offline before we even try: keep the promise rather than showing an error
    // for something the person did nothing wrong to cause.
    if (!navigator.onLine) {
      queueRequest(payload);
      setQueuedNotice(true);
      setSubmitting(false);
      return;
    }

    const r = await post(payload);
    if (r.ok && r.id) {
      // Remember it on this device BEFORE navigating, so a guest who closes the
      // tab is not asked to prove anything.
      clearDraft();
      saveRequest({ id: r.id, email: payload.guestEmail, what: payload.what });
      router.push(`/deliver/${r.id}`);
      return;
    }
    setSubmitting(false);
    if (isRetryable(r.status)) {
      queueRequest(payload);
      setQueuedNotice(true);
      return;
    }
    toast.error(r.error ?? c.error.generic);
  }

  // ── What the pinned button says right now ────────────────────────────────
  const cta = (() => {
    if (screen === 1) {
      if (!kind) return { label: c.what.question, disabled: true };
      if (!item) return { label: c.what.itemQuestion, disabled: true };
      if (
        kind === "shop_and_deliver" &&
        !(budgetCents !== null && budgetCents > 0)
      ) {
        return { label: c.cta.missingBudget, disabled: true };
      }
      if (!done[1]) return { label: c.cta.missingWhat, disabled: true };
      return { label: c.cta.next, disabled: false };
    }
    if (screen === 2) {
      if (!dropoff || !pickupDone) {
        return {
          label:
            kind === "shop_and_deliver"
              ? c.cta.missingDropoff
              : c.cta.missingWhere,
          disabled: true,
        };
      }
      if (!done[2]) return { label: c.cta.missingContact, disabled: true };
      return { label: c.cta.next, disabled: false };
    }
    return {
      label: submitting ? c.review.posting : c.review.post,
      disabled: submitting || !done[1] || !done[2],
    };
  })();

  const fleet = vehiclesFor(sizeClass, cargoKind);

  return (
    <>
      {/* ── The required-field contract, permanent ─────────────────────── */}
      {/* The owner asked for this by name and it earns its height: on a flow
          where the button names the missing thing, this is the rule the button
          is enforcing, said once up front instead of discovered per tap. */}
      <p
        className={cn(
          t.bodySm,
          "flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/[0.06] px-4 py-3 text-[#B0B0B0]",
        )}
      >
        <span className="mt-0.5 shrink-0 font-bold text-red-400" aria-hidden>
          *
        </span>
        {c.required.warning}
      </p>

      {/* ── Where you are, and the way out ─────────────────────────────── */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className={cn(t.eyebrow, "text-yellow")}>
          {c.progress(screen, SCREENS)}
        </p>
        {/* Always visible, never blocking. Somebody the form is failing does
            not file a complaint — they close the tab, and nothing records that
            they tried.

            Rendered only when there is actually a number behind it, which is
            the rule NeedHelp has always followed: nothing configured means no
            dead buttons, and a tel: link to the empty string is worse than no
            link because it looks like a route out. */}
        <span className="flex items-center gap-2">
          {tel && (
            <a
              href={`tel:${tel}`}
              aria-label={c.help.call}
              className="flex min-h-12 min-w-12 items-center justify-center rounded-full border border-[#6E6E6E] text-offwhite"
            >
              <Phone size={18} aria-hidden />
            </a>
          )}
          {wa && (
            <a
              href={`https://wa.me/${wa}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={c.help.whatsapp}
              className="flex min-h-12 items-center gap-2 rounded-full border border-[#6E6E6E] px-4 font-dm text-[16px] text-offwhite"
            >
              {c.help.whatsapp}
            </a>
          )}
        </span>
      </div>

      {/* Three dashes, not a number line. It says how far without adding a
          second thing to read. */}
      <div className="mt-2 flex gap-1.5" aria-hidden>
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              n <= screen ? "bg-yellow" : "bg-white/12",
            )}
          />
        ))}
      </div>

      {restored && (
        <Notice onDismiss={() => setRestored(false)}>
          {c.offline.resumed}
        </Notice>
      )}
      {!online && <Notice icon={CloudOff}>{c.offline.banner}</Notice>}
      {queuedNotice && <Notice icon={CloudOff}>{c.offline.queued}</Notice>}

      <div className="mt-5">
        {/* ── NO AnimatePresence HERE, AND THAT IS THE FIX ─────────────────
            This was `<AnimatePresence mode="wait">` around a keyed child, for
            a crossfade between screens. It STUCK: `mode="wait"` holds the
            exiting child until its exit animation reports completion, that
            report never arrived, and the entering screen therefore never
            mounted. The symptom was the whole point of the rebuild failing —
            `screen` advanced, the pinned button relabelled itself, and the
            page went on showing screen one. Tapping Back and Continue again
            did not clear it.

            A keyed motion.div on its own remounts when the key changes and
            plays its enter animation. There is no exit to wait for and so
            nothing to wait for ever. The enter is the half that carries the
            meaning anyway — it says which direction you moved. */}
        <motion.div
          key={screen}
          initial={reduced ? false : { opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={transition.step}
        >
          {/* ── SCREEN 1 — what ──────────────────────────────────────── */}
          {screen === 1 && (
            <section aria-labelledby="d-q1">
              <h2 id="d-q1" className={cn(t.question, "text-offwhite")}>
                {c.what.question}
              </h2>

              {kind === null ? (
                <fieldset className="mt-4">
                  {/* Distinct from the h2 above it. Repeating the heading
                        verbatim made a screen reader announce the same
                        sentence twice in a row — the group needs a name, not
                        an echo. */}
                  <legend className="sr-only">
                    {`${c.what.kind.package.title} / ${c.what.kind.shop.title}`}
                  </legend>
                  <div className="grid grid-cols-1 gap-2.5">
                    {[
                      {
                        k: "package" as const,
                        icon: Package,
                        copy: c.what.kind.package,
                      },
                      {
                        k: "shop_and_deliver" as const,
                        icon: ShoppingBasket,
                        copy: c.what.kind.shop,
                      },
                    ].map((o) => (
                      <button
                        key={o.k}
                        type="button"
                        onClick={() => setKind(o.k)}
                        className={cn(
                          recipe.cardButton,
                          "flex items-center gap-4",
                        )}
                      >
                        <o.icon
                          size={26}
                          className="shrink-0 text-yellow"
                          aria-hidden
                        />
                        <span className="min-w-0">
                          <span
                            className={cn(t.cardTitle, "block text-offwhite")}
                          >
                            {o.copy.title}
                          </span>
                          <span
                            className={cn(
                              t.bodySm,
                              "mt-0.5 block text-[#B0B0B0]",
                            )}
                          >
                            {o.copy.body}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              ) : (
                <>
                  {/* Chosen: one line you can tap to change. Worth ~110px,
                        and it is the honest shape — you are not still
                        choosing. */}
                  <ChosenLine
                    icon={
                      kind === "shop_and_deliver" ? ShoppingBasket : Package
                    }
                    label={
                      kind === "shop_and_deliver"
                        ? c.what.kind.shop.title
                        : c.what.kind.package.title
                    }
                    change={c.edit}
                    onChange={() => setKind(null)}
                  />

                  {/* ── ONE QUESTION AT A TIME ─────────────────────────
                        MEASURED: with the chip grid, the description, the photo
                        and the fleet line all on screen at once, screen 1 stood
                        830px tall on a 375x812 phone against 599px of usable
                        space. Shaving type and targets would have got some of
                        that back by undoing the reason this rebuild exists —
                        18px body and 56px targets are for the 60+ audience this
                        is for, and they are not negotiable for a pixel budget.

                        So the cause was fixed instead of the symptom: screen 1
                        was asking THREE questions at once. Now each answered
                        question folds into a 48px line you can tap to change,
                        exactly as the kind cards already did. What is on screen
                        is one question and the answers behind it. */}
                  {item === null ? (
                    <fieldset className="mt-4">
                      <legend className={cn(t.label, "mb-2 text-offwhite")}>
                        {c.what.itemQuestion}
                      </legend>
                      <div className="grid grid-cols-2 gap-2">
                        {ITEM_CHOICES.map((k, i) => {
                          const on = item === k;
                          const Icon = ITEM_ICON[k];
                          return (
                            <button
                              key={k}
                              type="button"
                              onClick={() => setItem(k)}
                              aria-pressed={on}
                              className={cn(
                                on
                                  ? recipe.cardButtonSelected
                                  : recipe.cardButton,
                                "!p-3",
                                // Five into a two-column grid: the last one
                                // takes the full width rather than leaving a
                                // hole beside it.
                                i === ITEM_CHOICES.length - 1 && "col-span-2",
                              )}
                            >
                              <span className="flex items-center gap-2.5">
                                <Icon
                                  size={20}
                                  className={cn(
                                    "shrink-0",
                                    on ? "text-yellow" : "text-[#B0B0B0]",
                                  )}
                                  aria-hidden
                                />
                                <span
                                  className={cn(
                                    t.bodySm,
                                    "font-semibold text-offwhite",
                                  )}
                                >
                                  {c.what.item[k].label}
                                </span>
                                {/* Not colour alone: roughly one man in twelve
                                      here cannot rely on the amber. */}
                                {on && (
                                  <Check
                                    size={16}
                                    className="ml-auto shrink-0 text-yellow"
                                  />
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>
                  ) : (
                    <>
                      {/* Answered. The examples that were under the grid now
                            sit on this line, where they confirm the choice
                            instead of being five blocks of text read while
                            deciding. */}
                      <ChosenLine
                        icon={ITEM_ICON[item]}
                        label={c.what.item[item].label}
                        hint={c.what.item[item].help}
                        change={c.edit}
                        onChange={() => {
                          setItem(null);
                          setLargeAndHeavy(false);
                        }}
                      />

                      {/* The one genuinely ambiguous case, asked only where it
                            means something: a mattress is large and light, a
                            fridge is large and heavy, and that is the difference
                            between a car and a van. */}
                      <AnimatePresence initial={false}>
                        {item === "large" && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={transition.step}
                            className="overflow-hidden"
                          >
                            <button
                              type="button"
                              onClick={() => setLargeAndHeavy((v) => !v)}
                              aria-pressed={largeAndHeavy}
                              className={cn(
                                "mt-2 flex min-h-12 w-full items-center gap-3 rounded-xl border px-4 text-left transition-colors",
                                largeAndHeavy
                                  ? "border-yellow/60 bg-yellow/[0.07]"
                                  : "border-[#6E6E6E]",
                              )}
                            >
                              <span
                                className={cn(
                                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
                                  largeAndHeavy
                                    ? "border-yellow bg-yellow"
                                    : "border-[#6E6E6E]",
                                )}
                              >
                                {largeAndHeavy && (
                                  <Check size={14} className="text-dark" />
                                )}
                              </span>
                              <span className={cn(t.bodySm, "text-offwhite")}>
                                {c.what.largeHeavy}
                              </span>
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="mt-4">
                        <Label
                          htmlFor="d-what"
                          required
                          srMark={c.required.srMark}
                        >
                          {kind === "package"
                            ? c.what.describeLabel
                            : c.what.describeLabelShop}
                        </Label>
                        <textarea
                          id="d-what"
                          rows={2}
                          value={what}
                          onChange={(e) => setWhat(e.target.value)}
                          aria-required
                          className={cn(recipe.field, "resize-none")}
                          placeholder={
                            kind === "package"
                              ? c.what.describePlaceholder
                              : c.what.describePlaceholderShop
                          }
                        />
                      </div>

                      <PhotoInput
                        path={photoPath}
                        onChange={setPhotoPath}
                        copy={c.photo}
                      />

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
                              <Label
                                htmlFor="d-budget"
                                required
                                srMark={c.required.srMark}
                              >
                                {c.what.budgetLabel}
                              </Label>
                              <input
                                id="d-budget"
                                type="text"
                                inputMode="decimal"
                                value={budget}
                                onChange={(e) => setBudget(e.target.value)}
                                aria-required
                                className={recipe.field}
                                placeholder={c.what.budgetPlaceholder}
                              />
                              {/* The two numbers, kept apart. Conflating them is
                                how a driver ends up out of pocket at the
                                till. */}
                              <p
                                className={cn(t.meta, "mt-1.5 text-[#B0B0B0]")}
                              >
                                {c.what.budgetHelp}
                              </p>
                              {budget.trim() && budgetCents === null && (
                                <p
                                  role="alert"
                                  className={cn(t.meta, "mt-1.5 text-red-400")}
                                >
                                  {c.what.budgetBad}
                                </p>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Said BEFORE they post, not after nobody quotes. */}
                      <p
                        className={cn(t.meta, "mt-4 text-[#B0B0B0]")}
                        aria-live="polite"
                      >
                        {fleet.length === 0
                          ? c.what.fleetNone
                          : // MEASURED at three lines and 72px when every vehicle
                            // qualified — which is the DEFAULT choice, so almost
                            // everybody paid for it. A list of all seven is not
                            // information; the list only means something when it
                            // is a restriction.
                            fleet.length === VEHICLE_TYPES.length
                            ? c.what.fleetAny
                            : c.what.fleet(
                                fleet
                                  .map((v) => VEHICLE_LABEL[v].toLowerCase())
                                  .join(", "),
                              )}
                      </p>
                    </>
                  )}
                </>
              )}
            </section>
          )}

          {/* ── SCREEN 2 — where, and who ────────────────────────────── */}
          {screen === 2 && (
            <section aria-labelledby="d-q2">
              <h2 id="d-q2" className={cn(t.question, "text-offwhite")}>
                {c.where.question}
              </h2>

              <div className="mt-4 flex flex-col gap-2.5">
                {kind === "shop_and_deliver" ? (
                  <>
                    <p className={cn(t.label, "text-offwhite")}>
                      {c.where.pickupShop}
                    </p>
                    {/* Two taps, not a search box. The honest default for a
                          shopping run is that the driver decides — they know
                          which shop has gas bottles today. */}
                    <div className="grid grid-cols-1 gap-2">
                      {[
                        {
                          on: !namesShop,
                          label: c.where.anywhere,
                          help: c.where.anywhereHelp,
                          set: false,
                        },
                        {
                          on: namesShop,
                          label: c.where.namedShop,
                          help: c.where.namedShopHelp,
                          set: true,
                        },
                      ].map((o) => (
                        <button
                          key={o.label}
                          type="button"
                          onClick={() => {
                            setNamesShop(o.set);
                            if (!o.set) setPickup(null);
                          }}
                          aria-pressed={o.on}
                          className={cn(
                            o.on
                              ? recipe.cardButtonSelected
                              : recipe.cardButton,
                            "!p-3",
                          )}
                        >
                          <span className="flex items-center justify-between gap-3">
                            <span
                              className={cn(
                                t.bodySm,
                                "font-semibold text-offwhite",
                              )}
                            >
                              {o.label}
                            </span>
                            {o.on && (
                              <Check
                                size={18}
                                className="shrink-0 text-yellow"
                              />
                            )}
                          </span>
                          <span
                            className={cn(
                              t.meta,
                              "mt-0.5 block text-[#B0B0B0]",
                            )}
                          >
                            {o.help}
                          </span>
                        </button>
                      ))}
                    </div>
                    {namesShop && (
                      <PlacePicker
                        label={c.where.pickupShop}
                        required
                        icon={MapPin}
                        value={pickup}
                        onPick={setPickup}
                        placeholder={c.where.searchPlaceholder}
                        copy={c.where}
                      />
                    )}
                  </>
                ) : (
                  <>
                    <PlacePicker
                      label={c.where.pickup}
                      required
                      icon={MapPin}
                      value={pickup}
                      onPick={setPickup}
                      placeholder={c.where.searchPlaceholder}
                      copy={c.where}
                    />
                    {pickup && (
                      <NoteField
                        open={showPickupNote}
                        onOpen={() => setShowPickupNote(true)}
                        openLabel={c.where.addNote}
                        value={pickupNote}
                        onChange={setPickupNote}
                        placeholder={c.where.pickupNote}
                      />
                    )}
                  </>
                )}

                <PlacePicker
                  label={c.where.dropoff}
                  required
                  icon={Navigation}
                  value={dropoff}
                  onPick={setDropoff}
                  placeholder={c.where.searchPlaceholder}
                  // Opens itself only once the pickup question is settled.
                  // Both panels open at once made this screen 1661px tall.
                  autoOpen={pickupDone}
                  copy={c.where}
                />
                {dropoff && (
                  <NoteField
                    open={showDropoffNote}
                    onOpen={() => setShowDropoffNote(true)}
                    openLabel={c.where.addNote}
                    value={dropoffNote}
                    onChange={setDropoffNote}
                    placeholder={c.where.dropoffNote}
                  />
                )}
              </div>

              {/* Contact lives here rather than on its own screen, which is
                  what frees screen 3 to be a review — and it appears only once
                  the places are settled, so screen 2 is never asking three
                  questions at the same time. Nothing is hidden that is due:
                  the pinned button names whichever one is outstanding. */}
              {placesDone && (
                <>
                  <h3 className={cn(t.label, "mt-6 text-offwhite")}>
                    {c.where.contact}
                  </h3>
                  <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <Label
                        htmlFor="d-name"
                        required
                        srMark={c.required.srMark}
                      >
                        {c.where.name}
                      </Label>
                      <input
                        id="d-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className={recipe.field}
                        placeholder={c.where.namePlaceholder}
                        autoComplete="name"
                        aria-required
                      />
                    </div>
                    <div>
                      <Label
                        htmlFor="d-phone"
                        required
                        srMark={c.required.srMark}
                      >
                        {c.where.phone}
                      </Label>
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
                    <div className="mt-3">
                      <Label
                        htmlFor="d-email"
                        required
                        srMark={c.required.srMark}
                      >
                        {c.where.email}
                      </Label>
                      <input
                        id="d-email"
                        type="email"
                        value={guestEmail}
                        onChange={(e) => setGuestEmail(e.target.value)}
                        className={recipe.field}
                        placeholder="you@example.com"
                        autoComplete="email"
                        aria-required
                      />
                      <p className={cn(t.meta, "mt-1.5 text-[#B0B0B0]")}>
                        {c.where.emailHelp}
                      </p>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {/* ── SCREEN 3 — review ────────────────────────────────────── */}
          {screen === 3 && (
            <section aria-labelledby="d-q3">
              <h2 id="d-q3" className={cn(t.question, "text-offwhite")}>
                {c.review.question}
              </h2>

              {/* The screen the old flow never had. A person could reach the
                    end without once seeing what they were about to post. */}
              <dl className="mt-4 overflow-hidden rounded-2xl border border-[#6E6E6E]">
                <ReviewRow
                  label={c.review.rowItem}
                  value={[
                    kind === "shop_and_deliver"
                      ? c.what.kind.shop.title
                      : c.what.kind.package.title,
                    item ? c.what.item[item].label : "",
                    what.trim() || (photoPath ? c.what.describeOrPhoto : ""),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  onEdit={() => setScreen(1)}
                  editLabel={c.edit}
                />
                {kind === "shop_and_deliver" && budgetCents !== null && (
                  <ReviewRow
                    label={c.review.rowBudget}
                    value={`Rs ${(budgetCents / 100).toLocaleString("en-GB")}`}
                    onEdit={() => setScreen(1)}
                    editLabel={c.edit}
                  />
                )}
                <ReviewRow
                  label={c.review.rowRoute}
                  value={`${pickup?.name ?? c.where.anywhere} → ${dropoff?.name ?? ""}`}
                  onEdit={() => setScreen(2)}
                  editLabel={c.edit}
                />
                <ReviewRow
                  label={c.review.rowContact}
                  value={`${name.trim()} · ${phone.trim()}`}
                  onEdit={() => setScreen(2)}
                  editLabel={c.edit}
                  last
                />
              </dl>

              {/* The four facts that decide whether somebody finishes. They
                    used to be three cards ABOVE the form, read by people who
                    had not yet decided to care. */}
              <ul className="mt-4 flex flex-col gap-2">
                {c.review.promises.map((p) => (
                  <li key={p} className="flex items-start gap-2.5">
                    <Check
                      size={18}
                      className="mt-0.5 shrink-0 text-yellow"
                      aria-hidden
                    />
                    <span className={cn(t.bodySm, "text-[#B0B0B0]")}>{p}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </motion.div>
      </div>

      {/* ── The action, pinned ─────────────────────────────────────────── */}
      {/* Always in the thumb's reach, always saying what it will do. It clears
          the app's floating bottom nav, which owns the strip below it. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-dark/95 px-5 pb-[max(5rem,calc(env(safe-area-inset-bottom)+5rem))] pt-3 backdrop-blur-md md:pb-4">
        <div className="mx-auto flex max-w-2xl items-center gap-2.5">
          {screen > 1 && (
            <button
              type="button"
              onClick={() => setScreen((s) => s - 1)}
              aria-label={c.back}
              className="flex min-h-16 shrink-0 items-center gap-1.5 rounded-full border border-[#6E6E6E] px-5 font-dm text-[16px] text-offwhite"
            >
              <ArrowLeft size={18} aria-hidden />
              <span className="hidden sm:inline">{c.back}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              screen === SCREENS ? void submit() : setScreen((s) => s + 1)
            }
            disabled={cta.disabled}
            className={cn(
              recipe.primaryAction,
              "inline-flex items-center justify-center gap-2",
            )}
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            {cta.label}
          </button>
        </div>
        <p
          className={cn(
            t.meta,
            "mx-auto mt-2 max-w-2xl text-center text-[#B0B0B0]",
          )}
        >
          {screen === SCREENS ? c.review.postedCaption : c.cta.freeToAsk}
        </p>
      </div>
    </>
  );
}

// ── A label that carries the required mark ──────────────────────────────────
//
// The asterisk is aria-hidden and `aria-required` on the control does the
// announcing, because a screen reader saying "star" after every label is noise
// where the attribute is the actual semantic. The visible mark is red AND is an
// asterisk: the banner above explains the glyph, so it does not rely on hue.

function Label({
  htmlFor,
  required,
  srMark,
  children,
}: {
  htmlFor: string;
  required?: boolean;
  srMark: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn(t.label, "mb-1.5 block text-offwhite")}
    >
      {children}
      {required && (
        <>
          <span className="font-bold text-red-400" aria-hidden>
            {" *"}
          </span>
          <span className="sr-only">{` (${srMark})`}</span>
        </>
      )}
    </label>
  );
}

/**
 * Which screen a restored draft should open on.
 *
 * Never further than the person got, and never past a question they have not
 * answered — whichever is nearer.
 */
function resumeScreen(d: Draft, email: string, isGuest: boolean): number {
  const wanted = Number(d.step);
  const item = ITEM_CHOICES.includes(d.item as ItemChoice);
  const budget = d.budget.trim() ? toCents(d.budget) : null;
  const oneDone =
    Boolean(d.kind) &&
    item &&
    (d.what.trim().length >= 3 || d.photoPath !== null) &&
    (d.kind !== "shop_and_deliver" || (budget !== null && budget > 0));
  if (!oneDone) return 1;

  const pickupDone =
    d.kind === "shop_and_deliver"
      ? !d.namesShop || d.pickup !== null
      : d.pickup !== null;
  const twoDone =
    pickupDone &&
    d.dropoff !== null &&
    d.name.trim().length >= 2 &&
    toE164(d.phone) !== null &&
    (!isGuest || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()));
  if (!twoDone) return 2;

  return Number.isFinite(wanted) && wanted >= 1 && wanted <= SCREENS
    ? wanted
    : 3;
}

function ChosenLine({
  icon: Icon,
  label,
  hint,
  change,
  onChange,
}: {
  icon: typeof Package;
  label: string;
  /** The examples, shown once the choice is made rather than five at a time
   *  while it is being made. */
  hint?: string;
  change: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="mt-3 flex min-h-12 w-full items-center gap-3 rounded-xl border border-yellow/40 bg-yellow/[0.07] px-4 py-2 text-left"
    >
      <Icon size={18} className="shrink-0 text-yellow" aria-hidden />
      <span className="min-w-0 flex-1">
        <span
          className={cn(t.bodySm, "block truncate font-semibold text-offwhite")}
        >
          {label}
        </span>
        {hint && (
          <span className={cn(t.meta, "block truncate text-[#B0B0B0]")}>
            {hint}
          </span>
        )}
      </span>
      <span
        className={cn(
          t.meta,
          "shrink-0 text-yellow underline underline-offset-4",
        )}
      >
        {change}
      </span>
    </button>
  );
}

// ── A field that is a link until somebody wants it ──────────────────────────
// "Gate colour, floor, anything that helps" is a real field that almost nobody
// fills. As a field it costs 80px on every visit; as a link it costs 48px and
// still gets filled by the people who need it.

function NoteField({
  open,
  onOpen,
  openLabel,
  value,
  onChange,
  placeholder,
}: {
  open: boolean;
  onOpen: () => void;
  openLabel: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  if (!open) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          t.meta,
          "flex min-h-12 items-center gap-1.5 self-start text-yellow underline underline-offset-4",
        )}
      >
        <Pencil size={14} aria-hidden />
        {openLabel}
      </button>
    );
  }
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={recipe.field}
      placeholder={placeholder}
      aria-label={placeholder}
    />
  );
}

function ReviewRow({
  label,
  value,
  onEdit,
  editLabel,
  last,
}: {
  label: string;
  value: string;
  onEdit: () => void;
  editLabel: string;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3",
        !last && "border-b border-white/10",
      )}
    >
      <span className="min-w-0 flex-1">
        <dt className={cn(t.meta, "text-[#B0B0B0]")}>{label}</dt>
        <dd className={cn(t.bodySm, "mt-0.5 truncate text-offwhite")}>
          {value}
        </dd>
      </span>
      <button
        type="button"
        onClick={onEdit}
        className={cn(
          t.meta,
          "flex min-h-12 shrink-0 items-center gap-1.5 text-yellow underline underline-offset-4",
        )}
      >
        <Pencil size={14} aria-hidden />
        {editLabel}
        <span className="sr-only">{` — ${label}`}</span>
      </button>
    </div>
  );
}

// ── A message that stays until it is answered ───────────────────────────────
// Not a toast. A toast that auto-dismisses after four seconds is a message
// somebody reading at their own pace will never see — and these three all say
// something the person may need to act on.

function Notice({
  icon: Icon,
  children,
  onDismiss,
}: {
  icon?: typeof CloudOff;
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <p
      role="status"
      className={cn(
        t.bodySm,
        "mt-3 flex items-start gap-2.5 rounded-xl border border-yellow/30 bg-yellow/[0.06] px-4 py-3 text-offwhite",
      )}
    >
      {Icon && (
        <Icon size={18} className="mt-0.5 shrink-0 text-yellow" aria-hidden />
      )}
      <span className="min-w-0 flex-1">{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-yellow underline underline-offset-4"
        >
          OK
        </button>
      )}
    </p>
  );
}
