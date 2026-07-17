"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft, Wallet, CalendarCheck, ShieldCheck, Headphones,
  Send, Loader2, CheckCircle, AlertCircle, Upload, FileCheck, X,
  Bike, UtensilsCrossed, BedDouble, Compass, Sparkles,
} from "lucide-react";

type FormState = "idle" | "loading" | "success" | "error";
type ListingType = "vehicle" | "restaurant" | "stay" | "activity" | "experience";

// Per-category config drives the whole form: which copy shows, what the "what
// are you listing" field asks, and whether vehicle-only fields (licence,
// insurance) appear. This is why the page is one component, not five — the flow
// is identical, only the words and two optional fields change.
const CATEGORIES: Record<ListingType, {
  label: string; icon: typeof Bike; noun: string;
  detailPlaceholder: string; needsVehicleDocs: boolean;
}> = {
  vehicle:    { label: "Vehicle",    icon: Bike,            noun: "vehicle",
                detailPlaceholder: "Which vehicle(s) & how many? (e.g. 2× Burgman 125, 1× Swift car)", needsVehicleDocs: true },
  restaurant: { label: "Restaurant", icon: UtensilsCrossed, noun: "restaurant",
                detailPlaceholder: "Tell us about your place — cuisine, seats, opening hours", needsVehicleDocs: false },
  stay:       { label: "Stay",       icon: BedDouble,       noun: "stay",
                detailPlaceholder: "Guesthouse / room / villa — how many guests, what's included", needsVehicleDocs: false },
  activity:   { label: "Activity",   icon: Compass,         noun: "activity",
                detailPlaceholder: "What activity? (e.g. kitesurfing lessons, snorkelling trips)", needsVehicleDocs: false },
  experience: { label: "Experience", icon: Sparkles,        noun: "experience",
                detailPlaceholder: "Tell us about your experience or guided tour", needsVehicleDocs: false },
};

const ORDER: ListingType[] = ["vehicle", "restaurant", "stay", "activity", "experience"];

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
          <button type="button" onClick={() => onChange(null)} className="text-muted hover:text-red-400" aria-label="Remove"><X size={14} /></button>
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

export default function ListYourBusinessPage() {
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!form.owner_name.trim() || !form.phone.trim()) return setErr("Please enter your name and phone number.");
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
        <Link href="/" className="inline-flex items-center gap-2 text-muted hover:text-yellow text-sm transition-colors mb-10">
          <ArrowLeft size={15} /> Roule Rodrigues
        </Link>

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-10">
          <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">PARTNER WITH US</p>
          <h1 className="font-syne font-extrabold uppercase leading-[0.95] mb-4" style={{ fontSize: "clamp(34px, 8vw, 72px)" }}>
            List it.<br />Get discovered.
          </h1>
          <p className="text-muted font-dm text-sm md:text-base max-w-xl leading-relaxed">
            Run something worth visiting on Rodrigues — a scooter, a car, a table, a room, an experience?
            Get it in front of tourists actively planning their trip. We handle the enquiries; you stay in control.
          </p>
        </motion.div>

        {/* Category picker — this is the "rework": one flow, five things you can list */}
        <div className="flex flex-wrap gap-2.5 mb-12" role="tablist" aria-label="What do you want to list?">
          {ORDER.map((t) => {
            const C = CATEGORIES[t];
            const active = t === type;
            return (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => { setType(t); setErr(null); }}
                className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-syne font-bold transition-colors ${
                  active
                    ? "bg-yellow text-dark"
                    : "bg-dark-card border border-dark-border text-muted hover:text-yellow hover:border-yellow/40"
                }`}
              >
                <C.icon size={16} /> {C.label}
              </button>
            );
          })}
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
            List your {cat.noun}
          </h2>
          <p className="text-muted text-sm mb-7">Tell us the essentials and we&rsquo;ll be in touch to get you set up.</p>

          {state === "success" ? (
            <div className="flex items-start gap-3 bg-green-500/10 border border-green-500/30 rounded-2xl px-5 py-5">
              <CheckCircle size={20} className="text-green-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-syne font-bold text-green-400">Application received!</p>
                <p className="text-green-400/70 text-sm mt-1">Thank you — we&rsquo;ll contact you shortly to verify your {cat.noun} and get your listing live.</p>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input className={input} placeholder="Your name *" value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} disabled={state === "loading"} />
                <input className={input} placeholder="Phone / WhatsApp *" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={state === "loading"} />
                <input className={input} placeholder="Email (optional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={state === "loading"} />
                <input className={input} placeholder="Your area (e.g. Port Mathurin)" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} disabled={state === "loading"} />
              </div>

              {/* Business name matters for a place/restaurant/stay; optional for vehicles */}
              {type !== "vehicle" && (
                <input className={input} placeholder={`${cat.label} name`} value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} disabled={state === "loading"} />
              )}

              <input className={input} placeholder={cat.detailPlaceholder} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} disabled={state === "loading"} />
              <textarea className={`${input} resize-none`} rows={3} placeholder="Anything else we should know?" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} disabled={state === "loading"} />

              {/* Photos — useful for every category */}
              <div>
                <p className="font-bebas text-muted text-[10px] tracking-[0.25em] mb-2">
                  {type === "vehicle" ? "VEHICLE PHOTOS" : "PHOTOS"}
                </p>
                <div className="flex flex-wrap gap-3">
                  {photos.map((_, i) => (
                    <div key={i} className="relative w-20 h-20 rounded-xl bg-dark-card border border-green-500/30 flex items-center justify-center">
                      <FileCheck size={20} className="text-green-400" />
                      <button type="button" onClick={() => setPhotos((p) => p.filter((_, idx) => idx !== i))} className="absolute -top-1.5 -right-1.5 bg-dark border border-dark-border rounded-full p-0.5 text-muted hover:text-red-400" aria-label="Remove">
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

              {/* Vehicle-only documents — irrelevant for a restaurant or a room */}
              {cat.needsVehicleDocs && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <DocSlot label="DRIVING LICENCE / ID (optional)" hint="Upload ID" value={idCard} onChange={setIdCard} disabled={state === "loading"} />
                    <DocSlot label="INSURANCE PAPERS (optional)" hint="Upload insurance" value={insurance} onChange={setInsurance} disabled={state === "loading"} />
                  </div>
                  <p className="text-muted/40 text-[11px] font-dm -mt-1">
                    Documents are stored privately and only visible to the Roule Rodrigues team.
                  </p>
                </>
              )}

              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 w-4 h-4 accent-yellow shrink-0" disabled={state === "loading"} />
                <span className="font-dm text-xs leading-snug text-muted">
                  I agree to the{" "}
                  <Link href="/legal/owner-agreement" target="_blank" className="text-yellow hover:underline">Partner Agreement</Link>.
                </span>
              </label>

              {err && (
                <p className="flex items-center gap-2 text-red-400 text-sm font-dm">
                  <AlertCircle size={14} /> {err}
                </p>
              )}

              <button
                type="submit"
                disabled={state === "loading" || !agreed}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-yellow text-dark font-syne font-bold text-sm px-7 py-3.5 rounded-full hover:bg-yellow-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {state === "loading" ? <><Loader2 size={15} className="animate-spin" /> Sending…</> : <>Submit application <Send size={15} /></>}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
