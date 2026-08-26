"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  CalendarClock,
  CalendarDays,
  Clock,
  MessageCircle,
  Pencil,
  Phone,
  Zap,
  ShoppingBasket,
  UtensilsCrossed,
  Umbrella,
  Sofa,
} from "lucide-react";
import { toast } from "sonner";
import PhoneInput from "@/components/PhoneInput";
import PlacePicker from "@/components/PlacePicker";
import PhotoInput from "./PhotoInput";
import FindRequest from "./FindRequest";
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
  islandDate,
  maxBookableDate,
  slotHoursLabel,
  slotLabel,
  slotsFor,
  todayIsStillPossible,
  type ScheduleKind,
  type TimeSlot,
} from "@/lib/delivery/schedule";
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
// FOUR now. "When do you need it?" was never asked — delivery_requests had
// no column for it — so every request read to a driver as "now". See M152.
const SCREENS = 4;

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
  // NULL, like kind and item: "when" is the question this flow never asked, and
  // defaulting it to ASAP would answer it on the customer's behalf with the one
  // answer that puts the most pressure on a driver.
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind | null>(null);
  const [timeSlot, setTimeSlot] = useState<TimeSlot | null>(null);
  const [neededDate, setNeededDate] = useState("");
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [pickup, setPickup] = useState<RidePlace | null>(null);
  const [dropoff, setDropoff] = useState<RidePlace | null>(null);
  const [pickupNote, setPickupNote] = useState("");
  const [dropoffNote, setDropoffNote] = useState("");
  // ONE flag: the notes are a single affordance opening both fields, so a
  // second boolean would only ever be the same value under another name.
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

  // ── GOING TO A STEP MEANS GOING TO THE TOP OF IT ────────────────────────
  // Without this, tapping Continue two-thirds of the way down one screen drops
  // you two-thirds of the way down the next — mid-question, with the heading
  // above the fold. It reads as the page having jumped rather than advanced,
  // and it is the single jerkiest thing about a stepped form.
  const formRef = useRef<HTMLDivElement | null>(null);
  const goTo = useCallback((n: number) => {
    setScreen(n);
    const el = formRef.current;
    if (!el) return;
    // Land just UNDER the sticky site header, or the first line hides behind it.
    const y = el.getBoundingClientRect().top + window.scrollY - 68;
    window.scrollTo({
      top: Math.max(0, y),
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, []);

  // Which slots are still worth offering. Only TODAY is eroded by the clock —
  // and a DATE that happens to be today is the same thing wearing a different
  // hat, which is the case a "today" check alone would miss.
  const slotChoices = useMemo(() => {
    if (scheduleKind === null || scheduleKind === "asap") return [];
    const isToday =
      scheduleKind === "today" ||
      (scheduleKind === "date" && neededDate === islandDate());
    return slotsFor(isToday ? "today" : "tomorrow");
  }, [scheduleKind, neededDate]);

  // ASAP needs no time of day; everything else does. A dated request also needs
  // the date. Kept as one expression so the CTA and the gate cannot disagree.
  const whenDone =
    scheduleKind === "asap" ||
    (scheduleKind !== null &&
      timeSlot !== null &&
      (scheduleKind !== "date" || neededDate !== ""));

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
    2: whenDone,
    3:
      dropoff !== null &&
      (kind === "shop_and_deliver"
        ? !namesShop || pickup !== null
        : pickup !== null) &&
      name.trim().length >= 2 &&
      // Not "they typed something" — "the server will accept it".
      phoneE164 !== null &&
      (!isGuest || guestEmailValid),
    4: true,
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
    setScheduleKind(
      (["asap", "today", "tomorrow", "date"] as string[]).includes(
        d.scheduleKind,
      )
        ? (d.scheduleKind as ScheduleKind)
        : null,
    );
    setTimeSlot(
      (["any", "morning", "afternoon", "evening"] as string[]).includes(
        d.timeSlot,
      )
        ? (d.timeSlot as TimeSlot)
        : null,
    );
    setNeededDate(d.neededDate ?? "");
    setPhotoPath(d.photoPath);
    setPickup(d.pickup as RidePlace | null);
    setDropoff(d.dropoff as RidePlace | null);
    setPickupNote(d.pickupNote);
    setDropoffNote(d.dropoffNote);
    // Open if EITHER was filled, so a restored draft shows what it kept.
    setShowDropoffNote(Boolean(d.pickupNote || d.dropoffNote));
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
      scheduleKind: scheduleKind ?? "",
      timeSlot: timeSlot ?? "",
      neededDate,
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
    scheduleKind,
    timeSlot,
    neededDate,
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
    if (
      submitting ||
      !done[1] ||
      !done[2] ||
      !done[3] ||
      !kind ||
      !scheduleKind ||
      !phoneE164 ||
      !dropoff
    )
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
      // The CHOICE, never a timestamp. The server turns it into a window in
      // island time — a client that computes its own can send one in the past
      // or one ten years out, and every promise downstream is built on it.
      scheduleKind,
      timeSlot: timeSlot ?? "any",
      neededDate: scheduleKind === "date" ? neededDate : undefined,
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
      // NOT the question — that is the h2 six inches above the button, and
      // repeating it made the screen look like it was asking twice. Naming the
      // missing thing earns its place only when that thing is NOT the heading
      // you are looking at, which on a one-question screen it always is.
      if (!kind || !item) return { label: c.cta.next, disabled: true };
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
      if (!scheduleKind) return { label: c.cta.next, disabled: true };
      if (scheduleKind === "date" && !neededDate) {
        return { label: c.when.dateLabel, disabled: true };
      }
      if (!whenDone) return { label: c.cta.next, disabled: true };
      return { label: c.cta.next, disabled: false };
    }
    if (screen === 3) {
      if (!dropoff || !pickupDone) {
        return {
          label:
            kind === "shop_and_deliver"
              ? c.cta.missingDropoff
              : c.cta.missingWhere,
          disabled: true,
        };
      }
      if (!done[3]) return { label: c.cta.missingContact, disabled: true };
      return { label: c.cta.next, disabled: false };
    }
    return {
      label: submitting ? c.review.posting : c.review.post,
      disabled: submitting || !done[1] || !done[2] || !done[3],
    };
  })();

  const fleet = vehiclesFor(sizeClass, cargoKind);

  return (
    <>
      {/* ── ONE STICKY STRIP, WHERE THREE BLOCKS USED TO BE ──────────────
          MEASURED on a 375x812 phone: the required banner, the "Step 2 of 4"
          row and the progress dashes cost 170px, on EVERY screen, before a
          single question — out of a real budget of 534px once the sticky site
          header and the pinned action are taken off. That is a third of the
          screen spent on chrome four times over.

          They are one 84px bar now, and it is STICKY: it costs its height once
          instead of scrolling away and leaving somebody four steps in with no
          idea which step. Which is also the answer to "make the step easily
          noticeable" — a numbered stepper that is always on screen beats a
          bigger one that is not.

          top-16 puts it directly under AppPageHeader, which is sticky at 65px.
          If that header ever changes height these two overlap, so it is worth
          knowing they are a pair. */}
      <div
        ref={formRef}
        className="sticky top-16 z-20 -mx-5 border-b border-white/10 bg-dark/95 px-5 py-2 backdrop-blur-md"
      >
        <div className="flex items-center gap-3">
          <Stepper
            current={screen}
            total={SCREENS}
            label={c.progress(screen, SCREENS)}
          />
          {/* Always reachable, never blocking. Somebody the form is failing
              does not file a complaint — they close the tab, and nothing
              records that they tried. Rendered only when a number is actually
              configured: a tel: link to the empty string looks like a route
              out and is not one. */}
          {tel && (
            <a
              href={`tel:${tel}`}
              aria-label={c.help.call}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#6E6E6E] text-offwhite"
            >
              <Phone size={17} aria-hidden />
            </a>
          )}
          {wa && (
            <a
              href={`https://wa.me/${wa}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={c.help.whatsapp}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#6E6E6E] text-offwhite"
            >
              <MessageCircle size={17} aria-hidden />
            </a>
          )}
        </div>
        {/* The permanent required-field rule the owner asked for, kept as one
            line at the 16px floor. The long version is said once, on screen
            one, under the first question — repeated four times it was 74px of
            box on every screen for a sentence people read once. */}
        <p className={cn(t.meta, "mt-1.5 text-[#B0B0B0]")}>
          <span className="font-bold text-red-400" aria-hidden>
            *
          </span>{" "}
          {c.required.short}
        </p>
      </div>

      {restored && (
        <Notice onDismiss={() => setRestored(false)}>
          {c.offline.resumed}
        </Notice>
      )}
      {!online && <Notice icon={CloudOff}>{c.offline.banner}</Notice>}
      {queuedNotice && <Notice icon={CloudOff}>{c.offline.queued}</Notice>}

      <div className="mt-4">
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
          initial={reduced ? false : { opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
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

          {/* ── SCREEN 2 — when ──────────────────────────────────────────
              THE QUESTION THIS FLOW NEVER ASKED. delivery_requests had no
              column for it, so every request reached a driver reading as
              "now" — and the board, having nothing else to sort on, ordered
              by when the request was POSTED. That is how a job for Christmas
              came out above one needed this afternoon. See M152 and M153. */}
          {screen === 2 && (
            <section aria-labelledby="d-q2">
              <h2 id="d-q2" className={cn(t.question, "text-offwhite")}>
                {c.when.question}
              </h2>

              {scheduleKind === null ? (
                <fieldset className="mt-4">
                  {/* Distinct from the h2 above it — repeating the heading
                      verbatim made a screen reader announce the same sentence
                      twice, the same defect as screen 1's group. */}
                  <legend className="sr-only">
                    {`${c.when.kind.asap.label} / ${c.when.kind.today.label} / ${c.when.kind.tomorrow.label} / ${c.when.kind.date.label}`}
                  </legend>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { k: "asap" as const, icon: Zap },
                      { k: "today" as const, icon: Clock },
                      { k: "tomorrow" as const, icon: CalendarClock },
                      { k: "date" as const, icon: CalendarDays },
                    ]
                      // After 8pm every slot for today has closed, so the chip
                      // would be a dead target. Dropped rather than disabled:
                      // a control you cannot use is a question you have to
                      // read twice.
                      .filter((o) => o.k !== "today" || todayIsStillPossible())
                      .map((o) => (
                        <button
                          key={o.k}
                          type="button"
                          onClick={() => {
                            setScheduleKind(o.k);
                            setTimeSlot(o.k === "asap" ? "any" : null);
                          }}
                          className={cn(
                            recipe.cardButton,
                            "flex items-center gap-3 !p-3",
                          )}
                        >
                          <o.icon
                            size={22}
                            className="shrink-0 text-yellow"
                            aria-hidden
                          />
                          <span className="min-w-0">
                            <span
                              className={cn(
                                t.bodySm,
                                "block font-semibold text-offwhite",
                              )}
                            >
                              {c.when.kind[o.k].label}
                            </span>
                            <span
                              className={cn(t.meta, "block text-[#B0B0B0]")}
                            >
                              {c.when.kind[o.k].help}
                            </span>
                          </span>
                        </button>
                      ))}
                  </div>
                  {!todayIsStillPossible() && (
                    <p className={cn(t.meta, "mt-3 text-[#B0B0B0]")}>
                      {c.when.todayGone}
                    </p>
                  )}
                </fieldset>
              ) : (
                <>
                  <ChosenLine
                    icon={
                      scheduleKind === "asap"
                        ? Zap
                        : scheduleKind === "today"
                          ? Clock
                          : scheduleKind === "tomorrow"
                            ? CalendarClock
                            : CalendarDays
                    }
                    label={c.when.kind[scheduleKind].label}
                    change={c.edit}
                    onChange={() => {
                      setScheduleKind(null);
                      setTimeSlot(null);
                      setNeededDate("");
                    }}
                  />

                  {scheduleKind === "date" && (
                    <div className="mt-4">
                      <Label
                        htmlFor="d-date"
                        required
                        srMark={c.required.srMark}
                      >
                        {c.when.dateLabel}
                      </Label>
                      {/* min/max in ISLAND time, matching the server's horizon
                          exactly. A visitor whose phone is set to Paris would
                          otherwise be offered a "today" that is yesterday
                          here. */}
                      <input
                        id="d-date"
                        type="date"
                        value={neededDate}
                        min={islandDate()}
                        max={maxBookableDate()}
                        aria-required
                        onChange={(e) => {
                          setNeededDate(e.target.value);
                          setTimeSlot(null);
                        }}
                        className={recipe.field}
                      />
                      <p className={cn(t.meta, "mt-1.5 text-[#B0B0B0]")}>
                        {c.when.kind.date.help}
                      </p>
                    </div>
                  )}

                  {scheduleKind !== "asap" && (
                    <fieldset className="mt-4">
                      <legend className={cn(t.label, "mb-2 text-offwhite")}>
                        {c.when.slotQuestion}
                        <span className="font-bold text-red-400" aria-hidden>
                          {" *"}
                        </span>
                      </legend>
                      <div className="grid grid-cols-2 gap-2">
                        {slotChoices.map((sl) => {
                          const on = timeSlot === sl;
                          return (
                            <button
                              key={sl}
                              type="button"
                              onClick={() => setTimeSlot(sl)}
                              aria-pressed={on}
                              className={cn(
                                on
                                  ? recipe.cardButtonSelected
                                  : recipe.cardButton,
                                "!p-3",
                              )}
                            >
                              <span className="flex items-center justify-between gap-2">
                                <span
                                  className={cn(
                                    t.bodySm,
                                    "font-semibold text-offwhite",
                                  )}
                                >
                                  {slotLabel(sl, language)}
                                </span>
                                {on && (
                                  <Check
                                    size={16}
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
                                {slotHoursLabel(sl)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>
                  )}

                  {/* The promise a window makes, said once. */}
                  <p
                    className={cn(t.meta, "mt-4 text-[#B0B0B0]")}
                    aria-live="polite"
                  >
                    {c.when.helper}
                  </p>
                </>
              )}
            </section>
          )}

          {/* ── SCREEN 3 — where, and who ────────────────────────────── */}
          {screen === 3 && (
            <section aria-labelledby="d-q3">
              <h2 id="d-q3" className={cn(t.question, "text-offwhite")}>
                {c.where.question}
              </h2>

              <div className="mt-3 flex flex-col gap-2">
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
                        shortLabel={c.where.fromShort}
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
                      shortLabel={c.where.fromShort}
                      required
                      icon={MapPin}
                      value={pickup}
                      onPick={setPickup}
                      placeholder={c.where.searchPlaceholder}
                      copy={c.where}
                    />
                  </>
                )}

                <PlacePicker
                  label={c.where.dropoff}
                  shortLabel={c.where.toShort}
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
              </div>

              {/* Contact lives here rather than on its own screen, which is
                  what frees screen 3 to be a review — and it appears only once
                  the places are settled, so screen 2 is never asking three
                  questions at the same time. Nothing is hidden that is due:
                  the pinned button names whichever one is outstanding. */}
              {placesDone && (
                <>
                  {/* ONE column, and it stays that way. Side by side, the phone
                      field measured 54px wide with 36px of left padding - TWO
                      PIXELS for the number - because PhoneInput carries a
                      40-country selector this site genuinely needs (Reunion and
                      France are real customers here). A phone field you cannot
                      read is worse than a short scroll. The 88px came off the
                      notes instead; see the review screen. */}
                  <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
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
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {/* ── SCREEN 4 — review ────────────────────────────────────── */}
          {screen === 4 && (
            <section aria-labelledby="d-q4">
              <h2 id="d-q4" className={cn(t.question, "text-offwhite")}>
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
                  onEdit={() => goTo(1)}
                  editLabel={c.edit}
                />
                {kind === "shop_and_deliver" && budgetCents !== null && (
                  <ReviewRow
                    label={c.review.rowBudget}
                    value={`Rs ${(budgetCents / 100).toLocaleString("en-GB")}`}
                    onEdit={() => goTo(1)}
                    editLabel={c.edit}
                  />
                )}
                <ReviewRow
                  label={c.review.rowWhen}
                  value={
                    scheduleKind === "asap"
                      ? c.when.kind.asap.label
                      : [
                          c.when.kind[scheduleKind ?? "asap"].label,
                          timeSlot ? slotLabel(timeSlot, language) : "",
                          scheduleKind === "date" ? neededDate : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")
                  }
                  onEdit={() => goTo(2)}
                  editLabel={c.edit}
                />
                <ReviewRow
                  label={c.review.rowRoute}
                  value={`${pickup?.name ?? c.where.anywhere} → ${dropoff?.name ?? ""}`}
                  onEdit={() => goTo(3)}
                  editLabel={c.edit}
                />
                <ReviewRow
                  label={c.review.rowContact}
                  value={`${name.trim()} · ${phone.trim()}`}
                  onEdit={() => goTo(3)}
                  editLabel={c.edit}
                  last
                />
              </dl>

              {/* ── The notes, asked HERE ─────────────────────────
                  They were on the previous screen beside the places, competing
                  with the name, the phone and the email for a fold that could
                  not hold all five. A note about a gate colour is an
                  afterthought you have while checking your answers, not while
                  choosing a village — so it is asked on the screen made for
                  checking answers. */}
              {!showDropoffNote ? (
                <button
                  type="button"
                  onClick={() => setShowDropoffNote(true)}
                  className={cn(
                    t.meta,
                    "mt-3 flex min-h-10 items-center gap-1.5 self-start text-yellow underline underline-offset-4",
                  )}
                >
                  <Pencil size={14} aria-hidden />
                  {c.where.addNote}
                </button>
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  {kind !== "shop_and_deliver" && (
                    <input
                      value={pickupNote}
                      onChange={(e) => setPickupNote(e.target.value)}
                      className={recipe.field}
                      placeholder={c.where.pickupNote}
                      aria-label={c.where.pickupNote}
                    />
                  )}
                  <input
                    value={dropoffNote}
                    onChange={(e) => setDropoffNote(e.target.value)}
                    className={recipe.field}
                    placeholder={c.where.dropoffNote}
                    aria-label={c.where.dropoffNote}
                  />
                </div>
              )}

              {/* The four facts that decide whether somebody finishes. They
                    used to be three cards ABOVE the form, read by people who
                    had not yet decided to care. */}
              <ul className="mt-4 flex flex-col gap-2">
                {c.review.promises.slice(2).map((p) => (
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

      {/* ── "I already asked" ───────────────────────────────────────────
          MEASURED: as a sibling below the form this was the LAST element on
          the page and sat 71-138px under the fold on every screen but the
          first — so the page scrolled, on a form whose every step fitted.
          Measuring the form section instead of the page's real content bottom
          is what hid that.

          It belongs at the ENTRY anyway. Somebody three steps into describing
          a parcel is not looking for a request they posted last week, and the
          entry state has 158px of room to spare. */}
      {screen === 1 && kind === null && (
        <div className="mt-5">
          <FindRequest />
        </div>
      )}

      {/* ── The action, pinned ─────────────────────────────────────────── */}
      {/* Always in the thumb's reach, always saying what it will do. It clears
          the app's floating bottom nav, which owns the strip below it. */}
      {/* 80px of this used to be clearance for the floating tab bar. That bar
          is gone from this flow (lib/nav-scope.ts), so what is left is the
          button, its caption and the notch. 213px -> ~133px. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-dark/95 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center gap-2.5">
          {screen > 1 && (
            <button
              type="button"
              onClick={() => goTo(screen - 1)}
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
              screen === SCREENS ? void submit() : goTo(screen + 1)
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

/**
 * Where you are, as four numbers you can see without reading.
 *
 * The bar this sits in used to be a row of four flat dashes — honest, and
 * completely unnoticeable at 4px tall. The owner's words were "make step easily
 * noticeable", so: the current step is a filled amber disc a third larger than
 * the others and carries its number; finished steps carry a check; the ones
 * ahead are outlined. Three states, distinguishable by SHAPE and not only by
 * colour, because roughly one man in twelve here cannot rely on the amber.
 *
 * `aria-hidden` on the whole thing, with a single sentence for a screen reader
 * instead: "Step 2 of 4" said once is worth more than four list items whose
 * numbers have to be reassembled into a position.
 */
function Stepper({
  current,
  total,
  label,
}: {
  current: number;
  total: number;
  /** Translated. This said "Step 4 of 4" in English to a French reader. */
  label: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center">
      <span className="sr-only">{label}</span>
      <span className="flex flex-1 items-center" aria-hidden>
        {Array.from({ length: total }, (_, i) => i + 1).map((n) => {
          const done = n < current;
          const now = n === current;
          return (
            <span
              key={n}
              className={cn("flex items-center", n < total && "flex-1")}
            >
              <span
                className={cn(
                  "flex shrink-0 items-center justify-center rounded-full font-dm font-bold transition-all",
                  now
                    ? "h-8 w-8 bg-yellow text-[15px] text-dark shadow-[0_0_16px_-4px] shadow-yellow/60"
                    : done
                      ? "h-6 w-6 bg-yellow/85 text-dark"
                      : "h-6 w-6 border border-[#6E6E6E] text-[13px] text-[#B0B0B0]",
                )}
              >
                {done ? <Check size={13} strokeWidth={3} /> : n}
              </span>
              {n < total && (
                <span
                  className={cn(
                    "mx-1 h-0.5 flex-1 rounded-full transition-colors",
                    done ? "bg-yellow/85" : "bg-white/15",
                  )}
                />
              )}
            </span>
          );
        })}
      </span>
    </div>
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

  const twoDone =
    d.scheduleKind === "asap" ||
    (["today", "tomorrow", "date"].includes(d.scheduleKind) &&
      ["any", "morning", "afternoon", "evening"].includes(d.timeSlot) &&
      (d.scheduleKind !== "date" || Boolean(d.neededDate)));
  if (!twoDone) return 2;

  const pickupDone =
    d.kind === "shop_and_deliver"
      ? !d.namesShop || d.pickup !== null
      : d.pickup !== null;
  const threeDone =
    pickupDone &&
    d.dropoff !== null &&
    d.name.trim().length >= 2 &&
    toE164(d.phone) !== null &&
    (!isGuest || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()));
  if (!threeDone) return 3;

  return Number.isFinite(wanted) && wanted >= 1 && wanted <= SCREENS
    ? wanted
    : SCREENS;
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
        "flex items-center gap-3 px-4 py-2",
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
