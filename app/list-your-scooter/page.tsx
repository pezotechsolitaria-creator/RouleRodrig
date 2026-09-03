"use client";

import { useRef, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Wallet, CalendarCheck, ShieldCheck, Headphones,
  Send, Loader2, CheckCircle, AlertCircle, Upload, FileCheck, X,
  Bike, UtensilsCrossed, BedDouble, Compass, Sparkles,
  Car, Ticket, Package, Store, ArrowRight, Lock, Clock,
} from "lucide-react";
import BackLink from "@/components/BackLink";

type FormState = "idle" | "loading" | "success" | "error";
type ListingType =
  | "vehicle" | "restaurant" | "stay" | "activity" | "experience"
  | "taxi" | "event" | "delivery";

// ── What can actually be listed here, and on whose authority ────────────────
//
// The page is organised around one distinction that the product already
// enforces but never explained: SOME things you can set up yourself, and some
// things only the Roulé Rodrigues team can create.
//
//   * OPEN     — reviewed by a human, then set up for you. The normal path.
//   * APPROVAL — cannot be self-created ANYWHERE in the product, by design.
//                taxi_drivers is admin-insert-only; an event organiser exists
//                only once admin_create_organizer() mints one; and M45 states
//                that driver approval is an admin act. Applying is the only
//                way in, and it is a request, not a signup.
//
// Saying so plainly is the honest design. The previous version offered five
// categories and silently omitted the three that need vetting — so a taxi
// driver or an event organiser had no front door at all and the only route in
// was knowing the owner personally. That is obscurity, not vetting.
type Track = "open" | "approval";

const CATEGORIES: Record<ListingType, {
  label: string;
  icon: typeof Bike;
  noun: string;
  blurb: string;
  detailPlaceholder: string;
  needsVehicleDocs: boolean;
  track: Track;
  /** Shown on approval categories: what is actually checked, and what follows. */
  vetting?: string;
}> = {
  vehicle: {
    label: "Vehicle", icon: Bike, noun: "vehicle", track: "open",
    blurb: "Scooter, car or bike for rent",
    detailPlaceholder: "Which vehicle(s) & how many? (e.g. 2× Burgman 125, 1× Swift car)",
    needsVehicleDocs: true,
  },
  restaurant: {
    label: "Restaurant", icon: UtensilsCrossed, noun: "restaurant", track: "open",
    blurb: "A table worth travelling for",
    detailPlaceholder: "Tell us about your place — cuisine, seats, opening hours",
    needsVehicleDocs: false,
  },
  stay: {
    label: "Stay", icon: BedDouble, noun: "stay", track: "open",
    blurb: "Guesthouse, room or villa",
    detailPlaceholder: "Guesthouse / room / villa — how many guests, what's included",
    needsVehicleDocs: false,
  },
  activity: {
    label: "Activity", icon: Compass, noun: "activity", track: "open",
    blurb: "Kitesurf, diving, hiking & more",
    detailPlaceholder: "What activity? (e.g. kitesurfing lessons, snorkelling trips)",
    needsVehicleDocs: false,
  },
  experience: {
    label: "Experience", icon: Sparkles, noun: "experience", track: "open",
    blurb: "Guided tours and one-off days",
    detailPlaceholder: "Tell us about your experience or guided tour",
    needsVehicleDocs: false,
  },
  taxi: {
    label: "Taxi driver", icon: Car, noun: "taxi service", track: "approval",
    blurb: "Drive visitors around the island",
    detailPlaceholder: "Your vehicle, how many passengers, and the areas you cover",
    needsVehicleDocs: true,
    vetting:
      "You carry passengers, so we check your licence and insurance before you appear on the Taxi page. " +
      "Only our team can add a driver — there is no self-signup for this.",
  },
  event: {
    label: "Event organiser", icon: Ticket, noun: "event", track: "approval",
    blurb: "Sell tickets to your events",
    detailPlaceholder: "What kind of events, how often, and roughly what size?",
    needsVehicleDocs: false,
    vetting:
      "Tickets are sold through the Roulé Rodrigues account, so we are answerable for every event listed. " +
      "If we approve you, we create your organiser account and send the invite to your email — you cannot open one yourself.",
  },
  delivery: {
    label: "Delivery partner", icon: Package, noun: "delivery work", track: "approval",
    blurb: "Deliver marketplace orders",
    detailPlaceholder: "Your vehicle, the areas you can cover, and your usual hours",
    needsVehicleDocs: true,
    vetting:
      "You would be handling other people's goods and their cash on delivery, so this one is checked carefully. " +
      "Submitting this form creates a pending application only — approval is a separate decision by our team.",
  },
};

const OPEN_ORDER: ListingType[] = ["vehicle", "restaurant", "stay", "activity", "experience"];
const APPROVAL_ORDER: ListingType[] = ["taxi", "event", "delivery"];

// Benefits are phrased so they read true for ANY category, not just scooters.
const BENEFITS = [
  { icon: Wallet,        title: "Earn more from what you have", text: "Reach tourists actively planning their Rodrigues trip. You set the price; we bring the customers." },
  { icon: CalendarCheck, title: "We handle the enquiries",      text: "Bookings, availability and confirmations are managed for you — no missed messages." },
  { icon: ShieldCheck,   title: "You stay in control",          text: "You confirm each booking and deal with the guest directly. No commission taken upfront." },
  { icon: Headphones,    title: "Local support, 3 languages",   text: "We promote your listing and support customers in English, French & Kreol." },
];

// Uploads one file to the private applications bucket, returns its storage path.
async function uploadDoc(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/owner-upload", { method: "POST", body: fd });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || "Upload failed");
  }
  const { path } = (await res.json()) as { path: string };
  return path;
}

// Single-document upload slot (ID card / insurance).
function DocSlot({ label, hint, value, onChange, disabled }: {
  label: string; hint: string; value: string | null;
  onChange: (path: string | null) => void; disabled?: boolean;
}) {
  const { t } = useLanguage();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function pick(file: File) {
    setBusy(true); setErr(null);
    try { onChange(await uploadDoc(file)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Upload failed"); }
    finally { setBusy(false); }
  }
  return (
    <div>
      <p className="font-bebas text-muted text-[10px] tracking-[0.25em] mb-2">{label}</p>
      {value ? (
        <div className="flex items-center gap-2 bg-dark-card border border-green-500/30 rounded-xl px-4 py-3">
          <FileCheck size={16} className="text-green-400 shrink-0" />
          <span className="text-green-400 text-xs font-dm flex-1">Uploaded</span>
          <button type="button" onClick={() => onChange(null)} className="text-muted hover:text-red-400 p-1" aria-label={t.listing.removeFile}><X size={14} /></button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={busy || disabled}
          className="w-full flex items-center gap-2 bg-dark-card border border-dashed border-dark-border hover:border-yellow/50 text-muted hover:text-yellow rounded-xl px-4 py-3 text-xs font-dm transition-colors disabled:opacity-50"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
          {busy ? "Uploading…" : hint}
        </button>
      )}
      {err && <p className="text-red-400 text-[11px] font-dm mt-1">{err}</p>}
      <input ref={ref} type="file" accept="image/*,application/pdf" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ""; }} />
    </div>
  );
}

/** One selectable category. A card, not a pill — it has to carry a description. */
function CategoryCard({ type, active, onSelect }: {
  type: ListingType; active: boolean; onSelect: () => void;
}) {
  const { t } = useLanguage();
  const c = CATEGORIES[type];
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={`group relative flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-colors ${
        active
          ? "border-yellow bg-yellow/[0.07]"
          : "border-dark-border bg-dark-card hover:border-yellow/40"
      }`}
    >
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
          active ? "bg-yellow text-dark" : "bg-yellow/10 text-yellow"
        }`}
      >
        <c.icon size={19} />
      </span>
      <span className="font-syne text-sm font-bold text-offwhite">{c.label}</span>
      <span className="font-dm text-[11px] leading-snug text-muted">{c.blurb}</span>
      {/* The lock is the whole point of the second group — it must be visible
          before you commit to filling anything in, not after you submit. */}
      {c.track === "approval" && (
        <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 font-dm text-[10px] font-medium text-amber-400">
          <Lock size={9} /> {t.listing.approvalNeeded}
        </span>
      )}
    </button>
  );
}

export default function ListYourBusinessPage() {
  const { t } = useLanguage();
  const [type, setType] = useState<ListingType>("vehicle");
  const [state, setState] = useState<FormState>("idle");
  const [agreed, setAgreed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    owner_name: "", phone: "", email: "", business_name: "", location: "", details: "", message: "",
  });
  const [idCard, setIdCard] = useState<string | null>(null);
  const [insurance, setInsurance] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [photosBusy, setPhotosBusy] = useState(false);
  const photosRef = useRef<HTMLInputElement>(null);

  const cat = CATEGORIES[type];
  const isApproval = cat.track === "approval";

  // An organiser account is created against an email address (M43 keys the
  // invite on it), so for that one category an email is not optional.
  const emailRequired = type === "event";

  async function addPhotos(files: FileList) {
    setPhotosBusy(true); setErr(null);
    try {
      const uploaded: string[] = [];
      for (const f of Array.from(files).slice(0, 12)) uploaded.push(await uploadDoc(f));
      setPhotos((prev) => [...prev, ...uploaded].slice(0, 12));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setPhotosBusy(false);
    }
  }

  const input =
    "w-full bg-dark-card border border-dark-border rounded-xl px-4 py-3.5 text-offwhite text-sm font-dm placeholder:text-muted/50 focus:border-yellow focus:outline-none transition-colors";
  const labelCls = "mb-1.5 block font-dm text-xs text-muted";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!form.owner_name.trim() || !form.phone.trim()) return setErr("Please enter your name and phone number.");
    if (emailRequired && !form.email.trim()) {
      return setErr("An email address is required — your organiser invite is sent there.");
    }
    if (!agreed) return setErr("Please accept the Partner Agreement to continue.");

    setState("loading");
    try {
      const res = await fetch("/api/owner-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          listing_type: type,
          // Keep the legacy `scooters` field mirrored for vehicle listings so
          // nothing downstream that still reads it breaks.
          scooters: type === "vehicle" ? form.details : null,
          id_card: idCard,
          insurance,
          vehicle_photos: photos,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Something went wrong.");
      }
      setState("success");
      setForm({ owner_name: "", phone: "", email: "", business_name: "", location: "", details: "", message: "" });
      setIdCard(null); setInsurance(null); setPhotos([]);
      setAgreed(false);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Something went wrong.");
      setState("error");
    }
  }

  return (
    <main className="min-h-screen bg-dark text-offwhite font-dm">
      <div className="max-w-5xl mx-auto px-6 py-10 md:py-16">
        {/* Fallback /account: this is the partner front door, and /account is
            where it is offered ("Sell on the marketplace, drive for us, or run
            an event? Start here") and where the shop, driver and organiser
            dashboards an approved applicant is heading for actually live. */}
        <BackLink
          fallback="/account"
          iconSize={15}
          className="inline-flex items-center gap-2 text-muted hover:text-yellow text-sm transition-colors mb-10"
        >
          {" "}Back
        </BackLink>

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-12">
          <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">{t.listing.eyebrow}</p>
          <h1 className="font-syne font-extrabold uppercase leading-[0.95] mb-4" style={{ fontSize: "clamp(34px, 8vw, 72px)" }}>
            {t.listing.listIt}<br />{t.listing.getDiscovered}
          </h1>
          <p className="text-muted font-dm text-sm md:text-base max-w-xl leading-relaxed">
            Run something worth visiting on Rodrigues — a scooter, a table, a room, an experience?
            Get it in front of tourists actively planning their trip. We handle the enquiries; you stay in control.
          </p>
        </motion.div>

        {/* ── Already self-serve: the shop. Kept OUT of the application form on
            purpose — the marketplace has a real signup, and routing people
            through a slower human review to reach the same place would be a
            worse experience, not a safer one. ─────────────────────────────── */}
        <div className="mb-12 rounded-2xl border border-dark-border bg-gradient-to-br from-yellow/[0.07] to-transparent p-6 md:flex md:items-center md:gap-6">
          <span className="mb-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-yellow text-dark md:mb-0">
            <Store size={22} />
          </span>
          <div className="flex-1">
            <h2 className="font-syne text-lg font-bold text-offwhite">{t.listing.sellingProducts}</h2>
            <p className="mt-1 font-dm text-sm leading-relaxed text-muted">
              Honey, crafts, spices, anything you make or sell — the marketplace is self-serve.
              Create your shop, add products and take orders today. No application, no waiting.
            </p>
          </div>
          <Link
            href="/merchant/login"
            className="mt-4 inline-flex shrink-0 items-center gap-2 rounded-full bg-yellow px-5 py-3 font-syne text-sm font-bold text-dark transition-colors hover:bg-yellow-dark md:mt-0"
          >
            {t.listing.openShop} <ArrowRight size={15} />
          </Link>
        </div>

        {/* Category picker — two groups, because the difference is real */}
        <div role="tablist" aria-label={t.listing.whatToList} className="mb-12">
          <p className="font-bebas text-muted text-[10px] tracking-[0.3em] mb-3">
            {t.listing.whatToListLabel}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {OPEN_ORDER.map((t) => (
              <CategoryCard key={t} type={t} active={t === type} onSelect={() => { setType(t); setErr(null); }} />
            ))}
          </div>

          <div className="mt-8">
            <p className="font-bebas text-amber-400/80 text-[10px] tracking-[0.3em] mb-1.5">
              {t.listing.byApproval}
            </p>
            <p className="mb-3 max-w-2xl font-dm text-xs leading-relaxed text-muted">
              These three carry other people&rsquo;s passengers, money or goods, so nobody can set
              themselves up — our team creates the account after checking you out. Applying here is
              the only way in, and it is the right way in.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {APPROVAL_ORDER.map((t) => (
                <CategoryCard key={t} type={t} active={t === type} onSelect={() => { setType(t); setErr(null); }} />
              ))}
            </div>
          </div>
        </div>

        {/* Benefits */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-14">
          {BENEFITS.map((b, i) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="bg-dark-card border border-dark-border rounded-2xl p-5"
            >
              <div className="w-11 h-11 rounded-xl bg-yellow/10 flex items-center justify-center mb-4">
                <b.icon size={20} className="text-yellow" />
              </div>
              <h3 className="font-syne font-bold text-offwhite text-sm mb-1.5">{b.title}</h3>
              <p className="text-muted/80 text-xs leading-relaxed">{b.text}</p>
            </motion.div>
          ))}
        </div>

        {/* Application form */}
        <div className="max-w-xl">
          <h2 className="font-syne font-extrabold text-offwhite text-2xl mb-1">
            {isApproval ? `Apply: ${cat.label}` : `List your ${cat.noun}`}
          </h2>
          <p className="text-muted text-sm mb-6">
            {isApproval
              ? "Tell us about yourself. If it's a fit, we'll be in touch to set you up."
              : "Tell us the essentials and we'll be in touch to get you set up."}
          </p>

          {/* The honesty panel. It says what happens after submit, BEFORE the
              fields — a promise made after someone has already typed for five
              minutes is not a promise, it is an excuse. */}
          {isApproval && state !== "success" && (
            <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-4">
              <Lock size={16} className="mt-0.5 shrink-0 text-amber-400" />
              <div>
                <p className="font-syne text-sm font-bold text-amber-400">{t.listing.reviewedFirst}</p>
                <p className="mt-1 font-dm text-xs leading-relaxed text-offwhite/75">{cat.vetting}</p>
              </div>
            </div>
          )}

          {state === "success" ? (
            <div className="rounded-2xl border border-green-500/30 bg-green-500/10 px-5 py-5">
              <div className="flex items-start gap-3">
                <CheckCircle size={20} className="text-green-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-syne font-bold text-green-400">{t.listing.received}</p>
                  <p className="text-green-400/70 text-sm mt-1">
                    {isApproval
                      ? `Thank you — we review every ${cat.label.toLowerCase()} application by hand. We'll contact you on the number you gave us.`
                      : `Thank you — we'll contact you shortly to verify your ${cat.noun} and get your listing live.`}
                  </p>
                  <p className="mt-3 flex items-center gap-1.5 font-dm text-xs text-green-400/60">
                    <Clock size={12} /> {t.listing.notLiveYet}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ly-name" className={labelCls}>{t.listing.yourName} <span className="text-yellow">*</span></label>
                  <input id="ly-name" className={input} placeholder="Jean Marie" value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} disabled={state === "loading"} />
                </div>
                <div>
                  <label htmlFor="ly-phone" className={labelCls}>{t.listing.phone} <span className="text-yellow">*</span></label>
                  <input id="ly-phone" type="tel" className={input} placeholder="+230 5xxx xxxx" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={state === "loading"} />
                </div>
                <div>
                  <label htmlFor="ly-email" className={labelCls}>
                    Email {emailRequired ? <span className="text-yellow">*</span> : <span className="text-muted/60">(optional)</span>}
                  </label>
                  <input id="ly-email" type="email" className={input} placeholder="you@email.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={state === "loading"} />
                  {emailRequired && (
                    <p className="mt-1 font-dm text-[11px] text-muted/70">{t.listing.organiserInvite}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="ly-location" className={labelCls}>{t.listing.yourArea}</label>
                  <input id="ly-location" className={input} placeholder="e.g. Port Mathurin" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} disabled={state === "loading"} />
                </div>
              </div>

              {/* Business name matters for a place/restaurant/stay; optional for vehicles */}
              {type !== "vehicle" && (
                <div>
                  <label htmlFor="ly-business" className={labelCls}>{cat.label} name</label>
                  <input id="ly-business" className={input} placeholder={`Your ${cat.label.toLowerCase()} name`} value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} disabled={state === "loading"} />
                </div>
              )}

              <div>
                <label htmlFor="ly-details" className={labelCls}>{t.listing.tellUs}</label>
                <input id="ly-details" className={input} placeholder={cat.detailPlaceholder} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} disabled={state === "loading"} />
              </div>

              <div>
                <label htmlFor="ly-message" className={labelCls}>{t.listing.anythingElse}</label>
                <textarea id="ly-message" className={`${input} resize-none`} rows={3} placeholder={t.listing.optional} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} disabled={state === "loading"} />
              </div>

              {/* Photos — useful for every category */}
              <div>
                <p className="font-bebas text-muted text-[10px] tracking-[0.25em] mb-2">
                  {cat.needsVehicleDocs ? "VEHICLE PHOTOS" : "PHOTOS"}
                </p>
                <div className="flex flex-wrap gap-3">
                  {photos.map((_, i) => (
                    <div key={i} className="relative w-20 h-20 rounded-xl bg-dark-card border border-green-500/30 flex items-center justify-center">
                      <FileCheck size={20} className="text-green-400" />
                      <button type="button" onClick={() => setPhotos((p) => p.filter((_, idx) => idx !== i))} className="absolute -top-1.5 -right-1.5 bg-dark border border-dark-border rounded-full p-1 text-muted hover:text-red-400" aria-label={`Remove photo ${i + 1}`}>
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => photosRef.current?.click()} disabled={photosBusy || state === "loading"}
                    className="w-20 h-20 rounded-xl border-2 border-dashed border-dark-border hover:border-yellow/50 text-muted/60 hover:text-yellow flex flex-col items-center justify-center gap-1 transition-colors disabled:opacity-50">
                    {photosBusy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    <span className="text-[9px] font-dm">{photosBusy ? "…" : "Add"}</span>
                  </button>
                </div>
                <input ref={photosRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => { if (e.target.files?.length) addPhotos(e.target.files); e.target.value = ""; }} />
              </div>

              {/* Licence + insurance. Required in spirit for the categories that
                  carry people or goods, so the copy stops calling them optional
                  there — a taxi application without a licence cannot be approved
                  anyway, and saying "optional" only produces a rejected round trip. */}
              {cat.needsVehicleDocs && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <DocSlot
                      label={isApproval ? "DRIVING LICENCE" : "DRIVING LICENCE / ID (optional)"}
                      hint="Upload licence" value={idCard} onChange={setIdCard} disabled={state === "loading"} />
                    <DocSlot
                      label={isApproval ? "INSURANCE PAPERS" : "INSURANCE PAPERS (optional)"}
                      hint="Upload insurance" value={insurance} onChange={setInsurance} disabled={state === "loading"} />
                  </div>
                  <p className="text-muted/40 text-[11px] font-dm -mt-1">
                    {isApproval
                      ? "We can't approve this category without them, but you can send them later if you don't have them to hand. Stored privately, visible only to the Roule Rodrigues team."
                      : "Documents are stored privately and only visible to the Roule Rodrigues team."}
                  </p>
                </>
              )}

              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 w-4 h-4 accent-yellow shrink-0" disabled={state === "loading"} />
                <span className="font-dm text-xs leading-snug text-muted">
                  I agree to the{" "}
                  <Link href="/legal/owner-agreement" target="_blank" className="text-yellow hover:underline">{t.listing.partnerAgreement}</Link>.
                </span>
              </label>

              {err && (
                <p role="alert" className="flex items-center gap-2 text-red-400 text-sm font-dm">
                  <AlertCircle size={14} /> {err}
                </p>
              )}

              <button
                type="submit"
                disabled={state === "loading" || !agreed}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-yellow text-dark font-syne font-bold text-sm px-7 py-3.5 rounded-full hover:bg-yellow-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {state === "loading"
                  ? <><Loader2 size={15} className="animate-spin" /> Sending…</>
                  : <>{isApproval ? "Send application" : "Submit application"} <Send size={15} /></>}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
