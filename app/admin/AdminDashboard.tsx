"use client";

import { toast } from "sonner";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { downloadBlob, downloadCsv, toCsv } from "@/lib/download";
// Static, unlike the partner page's dynamic import: the referral block here is
// rendered from an IIFE with no hooks available, and this is a password-gated
// admin bundle where ~20 KB more is immaterial.
import { qrSvgDocument, qrFilename } from "@/lib/qr-svg";
import {
  Sparkles,
  Bike,
  UtensilsCrossed,
  Compass,
  LayoutGrid,
  Waves,
  ShoppingBag,
  DollarSign,
  Phone,
  Images,
  LogOut,
  Save,
  CheckCircle,
  AlertCircle,
  Upload,
  Trash2,
  Loader2,
  Plus,
  Star,
  Share2,
  Inbox,
  RefreshCw,
  Mail,
  Calendar,
  LayoutDashboard,
  BookOpen,
  MapPin,
  Megaphone,
  BadgeCheck,
  Ban,
  ClipboardList,
  Eye,
  Handshake,
  Store,
  Truck,
  Wallet,
  UserCog,
  CalendarDays,
  Clock,
  Tag,
  ToggleLeft,
  ToggleRight,
  Copy,
  ExternalLink,
  Globe,
  Menu,
  X,
  MessageSquare,
  Car,
  Bus,
  HelpCircle,
  ChevronUp,
  ChevronDown,
  BedDouble,
  TrendingUp,
  UserPlus,
  FileCheck,
  Settings,
  MessageCircle,
  Boxes,
  Banknote,
  ChevronRight,
} from "lucide-react";
import type { TaxiDriver, TaxiDriverReview } from "@/lib/supabase/taxi-types";
import type {
  SiteContent,
  FleetItem,
  GalleryImage,
  TestimonialItem,
  PricingRow,
  MapLocation,
  WhatsAppNumber,
  PlannerActivity,
  RideRoute,
  VehicleCategory,
  VehicleType,
  UsefulContact,
  EventItem,
  Sponsor,
  TransportOption,
  FaqItem,
  RecommendedPlace,
  QuickAccessItem,
  HomeCard,
  HeroVideo,
} from "@/lib/defaults";
import { SERVICE_ONLY_CLEARED, hasServiceLeftovers, describeLeftovers } from "@/lib/places/service-fields";
import { DEFAULT_QUICK_ACCESS, DEFAULT_HOME_CARDS } from "@/lib/defaults";
import type { ContactSubmission, Booking, PlaceBooking, Partner, MarketplaceListing, ProductReview, WaitlistEntry } from "@/lib/supabase/types";
import { SITE_URL } from "@/lib/site";
import { MASCOT_POSES } from "@/lib/mascot";
import { parseVideoUrl, describeVideoUrl } from "@/lib/video";

type Section =
  | "dashboard"
  | "hero"
  | "promo"
  | "fleet"
  | "pricing"
  | "contact"
  | "gallery"
  | "testimonials"
  | "reviews"
  | "waitlist"
  | "planner"
  | "routes"
  | "events"
  | "useful"
  | "quickAccess"
  | "homeCards"
  | "sponsors"
  | "branding"
  | "submissions"
  | "bookings"
  | "place_bookings"
  | "leads"
  | "owners"
  | "map"
  | "partners"
  | "marketplace"
  | "taxi"
  | "gettingAround"
  | "faq"
  | "recommended"
  | "services"
  | "foodConcierge"
  | "experience"
  | "notifications"
  | "money";

const NAV: { id: Section; label: string; icon: React.ElementType; group?: string }[] = [
  // ── Daily business (operational inboxes) ──
  { id: "dashboard",    label: "Dashboard",       icon: LayoutDashboard, group: "overview" },
  // First in the list, above the four desks it summarises: "has anyone paid?"
  // used to mean opening all four and remembering.
  { id: "money",        label: "Money",            icon: Banknote,        group: "overview" },
  { id: "bookings",     label: "Bookings",         icon: BookOpen,        group: "overview" },
  { id: "place_bookings", label: "Stay & Activity Bookings", icon: BedDouble,  group: "overview" },
  { id: "submissions",  label: "Enquiries",        icon: Inbox,           group: "overview" },
  { id: "reviews",      label: "Customer Reviews", icon: MessageSquare,   group: "overview" },
  { id: "waitlist",     label: "Waitlist",         icon: Mail,            group: "overview" },
  { id: "notifications", label: "Alerts & Email",   icon: MessageSquare,   group: "overview" },
  // These four editors were fully built and rendered but had NO nav entry, so
  // they were unreachable — including two LIVE customer inboxes: "owners"
  // receives /list-your-scooter applications (with ID and insurance documents)
  // and "leads" logs every Food Concierge / Stay·Eat·Do / Taxi enquiry. The
  // sidebar search filters this same array, so they could not be found either.
  { id: "owners",       label: "Listing Applications", icon: FileCheck,   group: "overview" },
  { id: "leads",        label: "Concierge Leads",  icon: TrendingUp,      group: "overview" },
  { id: "marketplace",  label: "Business directory", icon: Store,          group: "overview" },
  { id: "partners",     label: "Partner Accounts", icon: UserPlus,        group: "overview" },

  // ── "What are you looking for?" — the homepage hub categories ──
  { id: "fleet",        label: "Vehicles",         icon: Bike,            group: "explore" },
  { id: "foodConcierge",label: "Food WhatsApp help", icon: UtensilsCrossed, group: "explore" },
  { id: "recommended",  label: "Accommodations & Activities",  icon: BedDouble,       group: "explore" },
  { id: "services",     label: "Massage · Fishing · Sea trips", icon: Waves,          group: "explore" },
  { id: "gettingAround",label: "Getting Around",   icon: Bus,             group: "explore" },
  { id: "events",       label: "What's On (notices)", icon: Calendar,      group: "explore" },
  { id: "taxi",         label: "Taxi & Transport",  icon: Car,             group: "explore" },

  // ── Homepage content ──
  { id: "hero",         label: "Hero",             icon: Sparkles,        group: "content" },
  { id: "map",          label: "Island Guide",     icon: MapPin,          group: "content" },
  { id: "planner",      label: "Trip Planner",     icon: Sparkles,        group: "content" },
  { id: "routes",       label: "Ride Routes",      icon: MapPin,          group: "content" },
  { id: "homeCards",    label: "Home Cards",       icon: LayoutGrid,      group: "content" },
  { id: "quickAccess",  label: "Home Tiles",       icon: Compass,         group: "content" },
  { id: "useful",       label: "Useful Numbers",   icon: Phone,           group: "content" },
  { id: "faq",          label: "FAQ",              icon: HelpCircle,      group: "content" },
  { id: "sponsors",     label: "Sponsors", icon: Handshake,    group: "content" },
  { id: "contact",      label: "Contact Info",     icon: Phone,           group: "content" },
  { id: "branding",     label: "Branding & Social",icon: Share2,          group: "content" },
];

// The merchant marketplace is administered on dedicated routes (they hold their
// own data and RPCs), so it cannot be a `Section` of this page. Listing the
// links here keeps them discoverable — previously /admin/subscriptions could
// only be reached by typing the URL.
const MARKETPLACE_LINKS: { href: string; label: string; icon: React.ElementType }[] = [
  // The studio no longer IS /admin — the Command Center is. First link goes home.
  { href: "/admin",                label: "Command Center",            icon: LayoutGrid },
  // Food first: it is the only one of these the owner opens every day, because
  // cookers have no dashboard of their own and the order queue lives here.
  { href: "/admin/food",           label: "Food Operations",           icon: UtensilsCrossed },
  // The same desk for every shop that is not a kitchen. Sits directly beside
  // Food because it is the same job on the other half of the platform, and
  // because a seller who cannot use a laptop is only tradeable if the owner
  // can take the order and fix the stock for them.
  { href: "/admin/marketplace",    label: "Shop Operations",           icon: Boxes },
  { href: "/admin/subscriptions",  label: "Merchants & Subscriptions", icon: Store },
  { href: "/admin/stores",         label: "Shops & Opening Hours",     icon: Clock },
  { href: "/admin/delivery-zones", label: "Delivery Areas & Fees",     icon: Truck },
  { href: "/admin/monetization",   label: "Monetization & Revenue",    icon: Wallet },
  { href: "/admin/notifications",  label: "WhatsApp Alerts",           icon: MessageCircle },
  { href: "/admin/deliveries",     label: "Delivery Control Centre",  icon: Truck },
  // Events, not marketplace — but this is the only link list on the dashboard,
  // and an organiser screen nobody can find is an organiser screen nobody uses.
  // Events come FIRST of the three: nothing else here is reachable until an
  // event exists, and until M61 nothing in the product could create one.
  { href: "/admin/events",         label: "Events",                    icon: CalendarDays },
  { href: "/admin/organizers",     label: "Event Organisers",          icon: UserCog },
  // Deliberately NOT filed under "Monetization & Revenue" above: that screen is
  // commission on marketplace order money. This is a service fee an organiser
  // owes Roulé Rodrigues, which never touches ticket money at all — putting the
  // two on one screen is the first step to netting them off somewhere.
  { href: "/admin/managed-ticketing", label: "Managed Ticketing Fees", icon: Handshake },
];

// ── Shared helpers ─────────────────────────────────────────────────────────────

// ── Admin writes must never be assumed to have landed ───────────────────────
// Most mutations in this file were `await fetch(...)` with no response check,
// followed by an unconditional optimistic state update — so a 500, or a 401
// from the 30-day session quietly expiring, left the UI showing "confirmed" /
// "approved" / "active" while the database was untouched. The owner would then
// tell a customer their booking was confirmed on the strength of a write that
// never happened. This returns false (and says so) instead of lying, so call
// sites can skip or revert their optimistic update.
async function adminWrite(input: string, init?: RequestInit): Promise<boolean> {
  try {
    const res = await fetch(input, init);
    if (res.ok) return true;
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    const detail = body?.error ? `\n\n${body.error}` : "";
    alert(
      res.status === 401
        ? "Your admin session has expired — please sign in again. Nothing was saved."
        : `That change could NOT be saved (error ${res.status}).${detail}`,
    );
    return false;
  } catch {
    alert("That change could NOT be saved — you appear to be offline. Nothing was changed.");
    return false;
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-bebas text-muted text-[10px] tracking-[0.25em] mb-1.5">{label}</p>
      {children}
    </div>
  );
}

const inputCls =
  "w-full bg-[#0e0e0e] border border-[#2a2a2a] rounded-xl px-4 py-3 text-offwhite text-sm font-dm placeholder:text-muted/40 hover:border-[#3a3a3a] focus:border-yellow focus:ring-2 focus:ring-yellow/15 focus:outline-none transition-all";

// DRAFT-AWARE. Reported as "the keyboard is locked": a comma-separated field
// ate every comma, a price refused a decimal point, and a coordinate refused a
// minus — on an island whose every latitude is negative.
//
// None of those were validation. Callers pass a value DERIVED from parsed state
// (`list.join(", ")`, `String(loc.lat)`), so each keystroke re-rendered the
// field from the parse of the previous one, and any half-typed text that did
// not parse cleanly was overwritten before the next character arrived. Typing
// "hat," split to ["hat", ""], dropped the empty, and came back as "hat".
//
// Fixed here rather than at each call site, because the same shape exists in
// fields nobody has reported yet. The input keeps its own text while focused
// and re-syncs from the parent only when it is not — so an edit from elsewhere
// still lands, and canonical formatting is applied on blur, but never
// mid-word.
function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  return (
    <input
      type={type}
      inputMode={inputMode}
      value={draft}
      onFocus={() => { focused.current = true; }}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(e.target.value);
      }}
      onBlur={() => {
        focused.current = false;
        setDraft(value);
      }}
      placeholder={placeholder}
      className={inputCls}
    />
  );
}

function Textarea({
  value,
  onChange,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className={`${inputCls} resize-none`}
    />
  );
}

// ── Translation fields (French / Creole) ────────────────────────────────────────
// A collapsible block that sits under any base (English) text field and lets the
// admin add optional French + Rodriguan Creole versions. When left empty, the site
// falls back to the English text — so nothing ever goes blank.
function TransFields({
  base,
  fr,
  cr,
  onFr,
  onCr,
  textarea = false,
  rows = 2,
}: {
  base?: string;
  fr?: string;
  cr?: string;
  onFr: (v: string) => void;
  onCr: (v: string) => void;
  textarea?: boolean;
  rows?: number;
}) {
  const [open, setOpen] = useState(false);
  const has = !!((fr && fr.trim()) || (cr && cr.trim()));
  return (
    <div className="rounded-xl border border-dashed border-[#2a2a2a] bg-[#0b0b0b] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="flex items-center gap-2 font-dm text-xs text-muted/70">
          <Globe size={12} className="text-yellow" />
          Translations · French &amp; Creole
          <span className={`text-[10px] ${has ? "text-green-400" : "text-muted/40"}`}>{has ? "· added" : "· optional"}</span>
        </span>
        {open ? <ChevronUp size={14} className="text-muted/60" /> : <ChevronDown size={14} className="text-muted/60" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3">
          <Field label="FRENCH">
            {textarea ? (
              <Textarea value={fr ?? ""} onChange={onFr} rows={rows} />
            ) : (
              <TextInput value={fr ?? ""} onChange={onFr} placeholder={base ? `EN: ${base}` : "French version"} />
            )}
          </Field>
          <Field label="CREOLE (KREOL RODRIGÉ)">
            {textarea ? (
              <Textarea value={cr ?? ""} onChange={onCr} rows={rows} />
            ) : (
              <TextInput value={cr ?? ""} onChange={onCr} placeholder={base ? `EN: ${base}` : "Creole version"} />
            )}
          </Field>
        </div>
      )}
    </div>
  );
}

// ── Hero videos ────────────────────────────────────────────────────────────
//
// Uploads do NOT go through /api/admin/upload like every other asset here. That
// route caps at 4 MB because a Vercel function body cannot exceed ~4.5 MB, and
// a hero clip is bigger than that even after compression. The route instead
// hands back a short-lived signed URL and the file goes from this browser
// straight to Supabase Storage, never touching a function.
function HeroVideosEditor({
  videos,
  onChange,
  onSessionExpired,
}: {
  videos: HeroVideo[];
  onChange: (v: HeroVideo[]) => void;
  onSessionExpired?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const list = videos ?? [];
  const add = (v: HeroVideo) => onChange([...list, v]);
  const patch = (i: number, p: Partial<HeroVideo>) =>
    onChange(list.map((v, j) => (j === i ? { ...v, ...p } : v)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  async function remove(i: number) {
    const v = list[i];
    onChange(list.filter((_, j) => j !== i));
    // Best-effort storage cleanup so the bucket does not fill with clips
    // nothing references. Only for files WE uploaded — a pasted URL is not ours
    // to delete.
    const m = /\/hero-video\/([^/?]+)$/.exec(v?.url ?? "");
    if (m) {
      try {
        await fetch(`/api/admin/hero-video?path=${encodeURIComponent(m[1])}`, { method: "DELETE" });
      } catch { /* the reference is already gone; an orphan is harmless */ }
    }
  }

  async function upload(file: File) {
    setBusy(true); setErr(null); setPct(0);
    try {
      const mint = await fetch("/api/admin/hero-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type, size: file.size }),
      });
      if (mint.status === 401) { onSessionExpired?.(); return; }
      const body = await mint.json().catch(() => ({}));
      if (!mint.ok) throw new Error(body.error || "Could not start the upload.");

      // XHR rather than fetch: this is the one upload on the site big enough
      // that a progress bar is the difference between "working" and "frozen"
      // on an island connection.
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", body.signedUrl, true);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setPct(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error(`Upload failed (${xhr.status}).`)));
        xhr.onerror = () => reject(new Error("Upload failed. Check your connection."));
        xhr.send(file);
      });

      add({ id: body.path, url: body.publicUrl, enabled: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false); setPct(0);
    }
  }

  return (
    <Field label="HERO VIDEOS">
      <p className="text-muted/60 text-[11px] font-dm mb-3 leading-relaxed">
        Plays behind the headline, muted and looping. The background image below stays as the
        poster — it is what shows while the video loads, and instead of it on a slow
        connection, on Data Saver, or for a visitor with reduced motion switched on.
        <br />
        <span className="text-yellow/70">Paste a YouTube or Vimeo link</span>, or upload a file.
        A YouTube link plays muted and looping with its controls hidden. Uploading an MP4 gives a
        cleaner result — no third-party player, and it fills the screen properly — but the link is
        the quickest route and works. An iPhone .MOV uploads fine, though some Android browsers
        refuse it. Keep clips short (10–20s) and under 64 MB.
        <br />
        A Google Drive or Facebook link is <span className="text-red-300">not</span> a video file
        and will not play.
      </p>

      <div className="space-y-2">
        {list.map((v, i) => (
          <div key={v.id || i} className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] bg-[#0d0d0d] p-2">
            {/* A YouTube link has no thumbnail a <video> can decode, so the
                preview showed a black box and told the owner nothing. The
                badge below is the real fix: it says what this link WILL do
                before the page ships. */}
            {parseVideoUrl(v.url).kind === "file" ? (
              <video src={v.url} muted playsInline preload="metadata"
                className="h-12 w-20 shrink-0 rounded bg-black object-cover" />
            ) : (
              <span className={`flex h-12 w-20 shrink-0 items-center justify-center rounded text-center font-bebas text-[9px] leading-tight tracking-widest ${
                describeVideoUrl(v.url).ok
                  ? "bg-yellow/10 text-yellow"
                  : "bg-red-500/10 text-red-300"
              }`}>
                {describeVideoUrl(v.url).label.toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-dm text-[11px] text-offwhite/70">{v.url}</p>
              {/* Never fail silently again. */}
              <p className={`mt-0.5 font-dm text-[10px] leading-snug ${
                describeVideoUrl(v.url).ok ? "text-muted" : "text-red-300"
              }`}>
                {describeVideoUrl(v.url).detail}
              </p>
              <label className="mt-1 flex cursor-pointer items-center gap-1.5 font-dm text-[10px] text-muted">
                <input type="checkbox" checked={v.enabled !== false}
                  onChange={(e) => patch(i, { enabled: e.target.checked })}
                  className="h-3 w-3 accent-yellow" />
                Show on the homepage
              </label>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                className="rounded border border-[#2a2a2a] px-2 py-1 text-[11px] text-muted hover:text-yellow disabled:opacity-30" aria-label="Move up">↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1}
                className="rounded border border-[#2a2a2a] px-2 py-1 text-[11px] text-muted hover:text-yellow disabled:opacity-30" aria-label="Move down">↓</button>
              <button type="button" onClick={() => void remove(i)}
                className="rounded border border-[#2a2a2a] px-2 py-1 text-muted hover:border-red-500/50 hover:text-red-400" aria-label="Remove video">
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {busy && (
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#2a2a2a]">
            <div className="h-full bg-yellow transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 font-dm text-[10px] text-muted">Uploading… {pct}%</p>
        </div>
      )}
      {err && <p className="mt-2 font-dm text-[11px] text-red-400">{err}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
          className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-4 py-2 font-dm text-xs text-offwhite/70 transition-colors hover:border-yellow hover:text-yellow disabled:opacity-40">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {busy ? "Uploading…" : "Upload video"}
        </button>
        <input ref={fileRef} type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
        <span className="font-dm text-[10px] text-muted/50">or paste a link</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/clip.mp4"
          className="min-w-[180px] flex-1 rounded-lg border border-[#2a2a2a] bg-[#0d0d0d] px-3 py-2 font-dm text-xs text-offwhite placeholder:text-muted/40 focus:border-yellow focus:outline-none" />
        <button type="button" disabled={!/^https:\/\/\S+$/.test(url.trim())}
          onClick={() => { add({ id: `u-${Date.now()}`, url: url.trim(), enabled: true }); setUrl(""); }}
          className="rounded-lg border border-[#2a2a2a] px-3 py-2 font-dm text-xs text-offwhite/70 transition-colors hover:border-yellow hover:text-yellow disabled:opacity-30">
          Add
        </button>
      </div>
    </Field>
  );
}

// ── Image picker ───────────────────────────────────────────────────────────────

function ImagePicker({
  src,
  onUpload,
  label,
  onSessionExpired,
}: {
  src: string;
  onUpload: (path: string) => void;
  label: string;
  onSessionExpired?: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      if (res.status === 401) {
        onSessionExpired?.();
        return;
      }
      if (res.ok) {
        const { path } = (await res.json()) as { path: string };
        onUpload(path);
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <Field label={label}>
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-[#0d0d0d] border border-[#2a2a2a] shrink-0">
          {src ? (
            <Image src={src} alt="preview" fill className="object-cover" unoptimized />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted">
              <Images size={20} />
            </div>
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 border border-[#2a2a2a] hover:border-yellow text-offwhite/70 hover:text-yellow text-xs font-dm px-4 py-2 rounded-lg transition-colors disabled:opacity-40"
            >
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {uploading ? "Uploading…" : src ? "Change" : "Upload"}
            </button>
            {src && (
              <button
                type="button"
                onClick={() => onUpload("")}
                className="flex items-center gap-1.5 border border-[#2a2a2a] hover:border-red-500/50 text-muted/60 hover:text-red-400 text-xs font-dm px-3 py-2 rounded-lg transition-colors"
              >
                <Trash2 size={12} /> Remove
              </button>
            )}
          </div>
          {src && (
            <p className="text-muted/50 text-[10px] font-dm mt-1.5 truncate max-w-[200px]">{src}</p>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </div>
    </Field>
  );
}

// ── Multi-image picker (galleries) ──────────────────────────────────────────────
// Upload several photos, reorder (first = cover), and delete any of them.

function MultiImagePicker({
  images,
  onChange,
  label,
  hint,
  onSessionExpired,
}: {
  images: string[];
  onChange: (imgs: string[]) => void;
  label: string;
  hint?: string;
  onSessionExpired?: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList) {
    setUploading(true);
    try {
      const uploaded: string[] = [];
      const rejected: string[] = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
        if (res.status === 401) {
          onSessionExpired?.();
          return;
        }
        if (res.ok) {
          const { path } = (await res.json()) as { path: string };
          uploaded.push(path);
        } else {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          rejected.push(`${file.name}: ${body.error ?? "upload failed"}`);
        }
      }
      if (uploaded.length) onChange([...images, ...uploaded]);
      // Anything the upload route refused — over 4 MB, or a format it does not
      // accept — used to disappear without a word: the owner picked six photos,
      // four appeared, and nothing said why. Say why.
      if (rejected.length) {
        toast.error(
          rejected.length === 1
            ? rejected[0]
            : `${rejected.length} photos were not added. ${rejected.join(" · ")}`,
          { duration: 8000 },
        );
      }
    } finally {
      setUploading(false);
    }
  }

  function removeAt(i: number) {
    onChange(images.filter((_, idx) => idx !== i));
  }
  function makeCover(i: number) {
    if (i === 0) return;
    const next = [...images];
    const [pic] = next.splice(i, 1);
    next.unshift(pic);
    onChange(next);
  }

  return (
    <Field label={label}>
      {hint && <p className="text-muted/50 text-[11px] font-dm -mt-1 mb-2.5">{hint}</p>}
      <div className="flex flex-wrap gap-3">
        {images.map((src, i) => (
          <div
            key={`${src}-${i}`}
            className="relative w-24 h-24 rounded-xl overflow-hidden bg-[#0d0d0d] border border-[#2a2a2a] group"
          >
            <Image src={src} alt={`photo ${i + 1}`} fill className="object-cover" unoptimized />
            {i === 0 && (
              <span className="absolute top-1 left-1 bg-yellow text-dark text-[8px] font-bebas tracking-[0.15em] px-1.5 py-0.5 rounded">
                COVER
              </span>
            )}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100">
              {i !== 0 && (
                <button
                  type="button"
                  onClick={() => makeCover(i)}
                  title="Make cover"
                  className="bg-white/15 hover:bg-yellow hover:text-dark text-white rounded-full p-1.5 transition-colors"
                >
                  <Star size={12} />
                </button>
              )}
              <button
                type="button"
                onClick={() => removeAt(i)}
                title="Remove"
                className="bg-white/15 hover:bg-red-500 text-white rounded-full p-1.5 transition-colors"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-24 h-24 rounded-xl border-2 border-dashed border-[#2a2a2a] hover:border-yellow/50 text-muted/60 hover:text-yellow flex flex-col items-center justify-center gap-1 transition-colors disabled:opacity-40"
        >
          {uploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
          <span className="text-[10px] font-dm">{uploading ? "Uploading…" : "Add photos"}</span>
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </Field>
  );
}

// ── Dashboard overview ─────────────────────────────────────────────────────────

function islandDate(offsetDays = 0): string {
  const now = new Date(Date.now() + 4 * 3600 * 1000 + offsetDays * 86400000);
  return now.toISOString().slice(0, 10);
}

function DashboardView({ onNavigate }: { onNavigate: (s: Section) => void }) {
  const [stats, setStats] = useState<{
    bookings: number;
    pending: number;
    confirmed: number;
    enquiries: number;
    revenue: number;
  } | null>(null);
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [places, setPlaces] = useState<PlaceBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    try {
      const [bRes, sRes, pRes] = await Promise.all([
        fetch("/api/admin/bookings"),
        fetch("/api/admin/submissions"),
        fetch("/api/admin/place-bookings"),
      ]);
      const bookings: Booking[] = bRes.ok ? await bRes.json() : [];
      const submissions: ContactSubmission[] = sRes.ok ? await sRes.json() : [];
      setAllBookings(bookings);
      setPlaces(pRes.ok ? await pRes.json() : []);
      setStats({
        bookings: bookings.length,
        pending: bookings.filter((b) => b.status === "pending").length,
        confirmed: bookings.filter((b) => b.status === "confirmed").length,
        enquiries: submissions.filter((s) => !s.handled).length,
        revenue: bookings
          .filter((b) => b.status === "confirmed" || b.status === "completed")
          .reduce((sum, b) => sum + (b.total_amount ?? 0), 0),
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const today = islandDate(0);
  const tomorrow = islandDate(1);
  const active = (b: Booking) => b.status === "pending" || b.status === "confirmed";
  const pickupsToday = allBookings.filter((b) => active(b) && b.start_date === today);
  const pickupsTomorrow = allBookings.filter((b) => active(b) && b.start_date === tomorrow);
  const returnsToday = allBookings.filter((b) => active(b) && b.end_date === today);
  const placeActive = (p: PlaceBooking) => p.status === "pending" || p.status === "confirmed";
  const checkinsToday = places.filter((p) => placeActive(p) && p.start_date === today);
  const hasAgenda = pickupsToday.length || returnsToday.length || pickupsTomorrow.length || checkinsToday.length;

  function waLink(b: Booking, kind: "pickup" | "return") {
    const digits = (b.phone ?? "").replace(/\D/g, "");
    const msg =
      kind === "pickup"
        ? `Hi ${b.name}, friendly reminder from Roule Rodrigues — your ${b.scooter} pickup is tomorrow. See you soon! 🛵`
        : `Hi ${b.name}, reminder from Roule Rodrigues — your ${b.scooter} is due back today. Thanks for riding with us! 💛`;
    return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
  }

  const cards = [
    { label: "Total Bookings",  value: stats?.bookings ?? "—",  icon: BookOpen,     color: "text-yellow",   section: "bookings"     as Section },
    { label: "Pending",          value: stats?.pending ?? "—",   icon: ClipboardList,color: "text-amber-400",section: "bookings"     as Section },
    { label: "Confirmed",        value: stats?.confirmed ?? "—", icon: CheckCircle,  color: "text-green-400",section: "bookings"     as Section },
    { label: "New Enquiries",    value: stats?.enquiries ?? "—", icon: Inbox,        color: "text-blue-400", section: "submissions"  as Section },
    { label: "Est. Revenue",     value: stats ? `Rs ${stats.revenue.toLocaleString()}` : "—", icon: DollarSign, color: "text-yellow", section: "bookings" as Section },
  ];

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-bebas text-yellow text-[10px] tracking-[0.3em] mb-1">OVERVIEW</p>
          <h2 className="font-syne font-bold text-offwhite text-xl">Business Dashboard</h2>
        </div>
        <button
          onClick={load}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-muted/60 hover:text-yellow font-dm text-xs transition-colors disabled:opacity-50"
        >
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 text-muted font-dm text-sm">
          <Loader2 size={16} className="animate-spin" /> Loading stats…
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.label}
                onClick={() => onNavigate(card.section)}
                className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-5 text-left hover:border-yellow/40 transition-colors group"
              >
                <div className="flex items-start justify-between mb-4">
                  <Icon size={18} className={card.color} />
                  <Eye size={12} className="text-muted/30 group-hover:text-yellow/40 transition-colors" />
                </div>
                <p className={`font-syne font-extrabold text-3xl ${card.color} mb-1`}>
                  {card.value}
                </p>
                <p className="font-dm text-muted text-xs">{card.label}</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Today's agenda */}
      {!loading && hasAgenda ? (
        <div>
          <p className="font-bebas text-muted text-[10px] tracking-[0.3em] mb-4">TODAY&apos;S AGENDA · {today}</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Deliver today */}
            <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-5">
              <p className="font-syne font-bold text-yellow text-sm mb-3 flex items-center gap-2">
                <Calendar size={14} /> Deliver today ({pickupsToday.length})
              </p>
              {pickupsToday.length === 0 ? (
                <p className="text-muted/40 font-dm text-xs">None.</p>
              ) : (
                <div className="space-y-2">
                  {pickupsToday.map((b) => (
                    <div key={b.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-dm text-offwhite text-sm truncate">
                          {b.name}{b.pickup_time && <span className="text-yellow font-medium"> · {fmtTime12(b.pickup_time)}</span>}
                        </p>
                        <p className="font-dm text-muted text-xs truncate">{b.scooter}{b.asset_label ? ` · ${b.asset_label}` : ""}</p>
                      </div>
                      {b.phone && (
                        <a href={waLink(b, "pickup")} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 bg-green-500/15 text-green-400 hover:bg-green-500/25 text-xs font-dm px-3 py-1.5 rounded-full transition-colors shrink-0">
                          <Phone size={11} /> WhatsApp
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Pickups tomorrow */}
            <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-5">
              <p className="font-syne font-bold text-amber-400 text-sm mb-3 flex items-center gap-2">
                <Calendar size={14} /> Pickups tomorrow ({pickupsTomorrow.length})
              </p>
              {pickupsTomorrow.length === 0 ? (
                <p className="text-muted/40 font-dm text-xs">None.</p>
              ) : (
                <div className="space-y-2">
                  {pickupsTomorrow.map((b) => (
                    <div key={b.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-dm text-offwhite text-sm truncate">{b.name}</p>
                        <p className="font-dm text-muted text-xs truncate">{b.scooter}{b.asset_label ? ` · ${b.asset_label}` : ""}</p>
                      </div>
                      {b.phone && (
                        <a
                          href={waLink(b, "pickup")}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 bg-green-500/15 text-green-400 hover:bg-green-500/25 text-xs font-dm px-3 py-1.5 rounded-full transition-colors shrink-0"
                        >
                          <Phone size={11} /> WhatsApp
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Returns today */}
            <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-5">
              <p className="font-syne font-bold text-blue-400 text-sm mb-3 flex items-center gap-2">
                <Calendar size={14} /> Returns today ({returnsToday.length})
              </p>
              {returnsToday.length === 0 ? (
                <p className="text-muted/40 font-dm text-xs">None.</p>
              ) : (
                <div className="space-y-2">
                  {returnsToday.map((b) => (
                    <div key={b.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-dm text-offwhite text-sm truncate">{b.name}</p>
                        <p className="font-dm text-muted text-xs truncate">{b.scooter}{b.asset_label ? ` · ${b.asset_label}` : ""}</p>
                      </div>
                      {b.phone && (
                        <a
                          href={waLink(b, "return")}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 bg-green-500/15 text-green-400 hover:bg-green-500/25 text-xs font-dm px-3 py-1.5 rounded-full transition-colors shrink-0"
                        >
                          <Phone size={11} /> WhatsApp
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Stay·Eat·Do check-ins today */}
            <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-5">
              <p className="font-syne font-bold text-green-400 text-sm mb-3 flex items-center gap-2">
                <Calendar size={14} /> Stay·Eat·Do today ({checkinsToday.length})
              </p>
              {checkinsToday.length === 0 ? (
                <p className="text-muted/40 font-dm text-xs">None.</p>
              ) : (
                <div className="space-y-2">
                  {checkinsToday.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-dm text-offwhite text-sm truncate">{p.name}</p>
                        <p className="font-dm text-muted text-xs truncate">{p.place_name}{p.time_slot ? ` · ${p.time_slot}` : ""}</p>
                      </div>
                      {p.phone && (
                        <a href={`https://wa.me/${p.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 bg-green-500/15 text-green-400 hover:bg-green-500/25 text-xs font-dm px-3 py-1.5 rounded-full transition-colors shrink-0">
                          <Phone size={11} /> WhatsApp
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Quick links */}
      <div>
        <p className="font-bebas text-muted text-[10px] tracking-[0.3em] mb-4">QUICK ACTIONS</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: "Manage Bookings",   desc: "View & update booking status",      section: "bookings" as Section,     icon: BookOpen },
            { label: "Edit Vehicles",     desc: "Toggle availability, update photos", section: "fleet" as Section,       icon: Bike },
            { label: "Read Enquiries",    desc: "Customer contact form messages",    section: "submissions" as Section,  icon: Inbox },
            { label: "Edit Island Guide", desc: "Add or remove map locations",        section: "map" as Section,          icon: MapPin },
            { label: "Trip Planner",      desc: "Edit day-by-day itinerary places",  section: "planner" as Section,      icon: Sparkles },
          ].map((q) => {
            const Icon = q.icon;
            return (
              <button
                key={q.label}
                onClick={() => onNavigate(q.section)}
                className="flex items-center gap-4 bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl px-4 py-3.5 text-left hover:border-yellow/40 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-yellow/10 flex items-center justify-center shrink-0">
                  <Icon size={14} className="text-yellow" />
                </div>
                <div>
                  <p className="font-dm text-offwhite text-sm font-medium">{q.label}</p>
                  <p className="font-dm text-muted text-xs">{q.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Section editors ────────────────────────────────────────────────────────────

function ExperienceEditor({
  content,
  onChange,
}: {
  content: SiteContent;
  onChange: (c: SiteContent) => void;
}) {
  const ex = content.experience;
  const set = (patch: Partial<typeof ex>) =>
    onChange({ ...content, experience: { ...ex, ...patch } });
  const show1 = ex.showImage1 !== false;
  const show2 = ex.showImage2 !== false;
  return (
    <div className="space-y-6">
      <p className="text-muted/70 text-sm font-dm">
        These are the two photos in the story section. The text is translated automatically. Turn a photo
        <strong className="text-offwhite"> OFF</strong> to hide it — the layout stays clean and professional
        without it (the &ldquo;three steps&rdquo; become a modern card row).
      </p>

      <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-5 space-y-4">
        <ToggleRow label="Show top photo" on={show1} onToggle={() => set({ showImage1: !show1 })} />
        {show1 && <ImagePicker label="TOP PHOTO (sunset or hero shot)" src={ex.image1} onUpload={(p) => set({ image1: p })} />}
      </div>

      <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-5 space-y-4">
        <ToggleRow label="Show process photo" on={show2} onToggle={() => set({ showImage2: !show2 })} />
        {show2 && <ImagePicker label="STEPS PHOTO (“Three steps to the open road”)" src={ex.image2} onUpload={(p) => set({ image2: p })} />}
      </div>

      <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-5">
        <ToggleRow
          label="Show “Our Scooters” photo gallery"
          on={content.galleryEnabled !== false}
          onToggle={() => onChange({ ...content, galleryEnabled: content.galleryEnabled === false })}
        />
      </div>

      <p className="text-muted/50 text-xs font-dm">Click Save Changes to publish.</p>
    </div>
  );
}

function ToggleRow({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-dm text-sm text-offwhite">{label}</span>
      <button
        type="button"
        onClick={onToggle}
        aria-label={on ? "On" : "Off"}
        className={`relative shrink-0 rounded-full transition-colors ${on ? "bg-yellow" : "bg-[#2a2a2a]"}`}
        style={{ height: "22px", width: "40px" }}
      >
        <span className={`absolute top-1 w-3.5 h-3.5 bg-white rounded-full transition-transform ${on ? "translate-x-[21px]" : "translate-x-1"}`} />
      </button>
    </div>
  );
}

function HeroEditor({
  content,
  onChange,
}: {
  content: SiteContent;
  onChange: (c: SiteContent) => void;
}) {
  const h = content.hero;
  const set = (patch: Partial<typeof h>) =>
    onChange({ ...content, hero: { ...h, ...patch } });
  const triple = (arr: [string, string, string] | undefined, i: number, v: string): [string, string, string] =>
    [0, 1, 2].map((j) => (j === i ? v : arr?.[j] ?? "")) as [string, string, string];

  return (
    <div className="space-y-5">
      {/* Video first: it is what a visitor sees, and the image below it now
          reads as the poster it has become rather than as the whole hero. */}
      <HeroVideosEditor
        videos={h.videos ?? []}
        onChange={(videos) => set({ videos })}
      />
      <ImagePicker
        label="BACKGROUND IMAGE (poster)"
        src={h.backgroundImage}
        onUpload={(p) => set({ backgroundImage: p })}
      />
      <Field label="EYEBROW TEXT">
        <TextInput value={h.eyebrow} onChange={(v) => set({ eyebrow: v })} />
        <div className="mt-2"><TransFields base={h.eyebrow} fr={h.eyebrowFr} cr={h.eyebrowCr} onFr={(v) => set({ eyebrowFr: v })} onCr={(v) => set({ eyebrowCr: v })} /></div>
      </Field>
      {[0, 1, 2].map((i) => (
        <Field key={i} label={`HEADLINE LINE ${i + 1}`}>
          <TextInput value={h.headline[i]} onChange={(v) => set({ headline: triple(h.headline, i, v) })} />
          <div className="mt-2">
            <TransFields
              base={h.headline[i]}
              fr={h.headlineFr?.[i]}
              cr={h.headlineCr?.[i]}
              onFr={(v) => set({ headlineFr: triple(h.headlineFr, i, v) })}
              onCr={(v) => set({ headlineCr: triple(h.headlineCr, i, v) })}
            />
          </div>
        </Field>
      ))}
      <Field label="SUBHEADLINE">
        <Textarea value={h.subheadline} onChange={(v) => set({ subheadline: v })} rows={2} />
        <div className="mt-2"><TransFields base={h.subheadline} fr={h.subheadlineFr} cr={h.subheadlineCr} onFr={(v) => set({ subheadlineFr: v })} onCr={(v) => set({ subheadlineCr: v })} textarea rows={2} /></div>
      </Field>
    </div>
  );
}

// ── Vehicle "kind" detection + sensible defaults per kind ──
// A category is identified by keyword so cars never inherit scooter info
// (helmet, 2 riders) and kayaks aren't "automatic". Owners can edit everything.
type VehicleKind = "scooter" | "car" | "kayak" | "bike" | "boat" | "other";
function vehicleKind(catId: string, label = ""): VehicleKind {
  const s = `${catId} ${label}`.toLowerCase();
  if (/scooter|moped|moto/.test(s)) return "scooter";
  if (/car|auto|suv|van|truck|4x4|jeep/.test(s)) return "car";
  if (/kayak|canoe|paddle|sup|board/.test(s)) return "kayak";
  if (/bike|bicycl|cycl|vtt|e-?bike/.test(s)) return "bike";
  if (/boat|catamaran|jet ?ski|pirogue|yacht/.test(s)) return "boat";
  return "other";
}
const KIND_DEFAULTS: Record<VehicleKind, { specs: string[]; included: string[]; noun: string; placeholder: string }> = {
  scooter: { noun: "scooter", specs: ["125cc Engine", "Automatic", "2 Riders", "Helmet Included"], included: ["2 helmets", "Lock & chain", "Full tank", "Local support 7/7"], placeholder: "125cc Engine, Automatic, 2 Riders, Helmet Included" },
  car:     { noun: "car",     specs: ["Air conditioning", "Automatic", "5 Seats", "4 Doors"],        included: ["Full tank of fuel", "Insurance", "Free delivery", "24/7 support"], placeholder: "Air conditioning, Automatic, 5 Seats, 4 Doors" },
  kayak:   { noun: "kayak",   specs: ["2 Seats", "Stable hull", "Paddles included", "Life jackets"], included: ["Paddles", "Life jackets", "Dry bag", "Safety briefing"],          placeholder: "2 Seats, Stable hull, Paddles included, Life jackets" },
  bike:    { noun: "bike",    specs: ["21 Gears", "Front suspension", "Adjustable seat", "Helmet"],  included: ["Helmet", "Repair kit", "Lock", "Local support"],                  placeholder: "21 Gears, Front suspension, Adjustable seat, Helmet" },
  boat:    { noun: "boat",    specs: ["Up to 6 people", "Outboard motor", "Sun canopy", "Life jackets"], included: ["Skipper", "Life jackets", "Fuel", "Cooler box"],              placeholder: "Up to 6 people, Outboard motor, Sun canopy, Life jackets" },
  other:   { noun: "vehicle", specs: [], included: [], placeholder: "e.g. key feature, capacity, transmission" },
};

// ── Body styles ────────────────────────────────────────────────────────────
//
// The id is what a fleet item stores and what the filter matches on, so it has
// to survive the owner renaming the label ("SUV" → "SUVs / 4x4") without
// orphaning every car tagged with it. Generated once, at creation, from the
// first label — never recomputed.
function slugifyType(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// Offered as one-tap chips, because the live site reads its categories from
// Supabase and will never see the seeded defaults in lib/defaults.ts. Without
// these the owner faces an empty box and has to invent the vocabulary himself.
const TYPE_SUGGESTIONS: Record<VehicleKind, string[]> = {
  car:     ["SUV", "Sedan", "Hatchback", "4x4", "Pick-up", "Van", "Minibus", "Convertible"],
  scooter: ["Automatic", "Manual", "125cc", "150cc+", "Electric"],
  bike:    ["City", "Mountain", "Electric", "Kids"],
  kayak:   ["Single", "Double", "Transparent"],
  boat:    ["With skipper", "Self-drive", "Catamaran", "Speedboat"],
  other:   [],
};

/** What delivery costs when the owner has never set a fee — the rule that was
 *  hardcoded until 2026-08-13, shown as the field's placeholder so "empty"
 *  never means "unknown". Mirrors lib/booking-pricing.ts deliveryFee(). */
function legacyDeliveryFee(catId: string): number {
  return catId === "car" ? 0 : 400;
}

/** Same idea for the deposit — mirrors lib/booking-pricing.ts depositPct(). */
function legacyDepositPct(catId: string): number {
  return catId === "car" ? 50 : 25;
}

function FleetEditor({
  content,
  onChange,
}: {
  content: SiteContent;
  onChange: (c: SiteContent) => void;
}) {
  // What the owner is typing into each category's "add a type" box, keyed by
  // category id. Local and uncommitted on purpose — a half-typed word must not
  // reach the content blob, where it would be one Save away from the live site.
  const [typeDraft, setTypeDraft] = useState<Record<string, string>>({});

  function updateScooter(idx: number, patch: Partial<FleetItem>) {
    const fleet = content.fleet.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    const pricing = content.pricing.map((row, i) =>
      i === idx && patch.name ? { ...row, name: patch.name } : row
    );
    onChange({ ...content, fleet, pricing });
  }

  // Add a vehicle directly into a chosen category, seeded with kind-correct
  // defaults so a new car shows car info — never scooter helmet/riders.
  function addVehicle(categoryId: string, label = "") {
    const kind = vehicleKind(categoryId, label);
    const def = KIND_DEFAULTS[kind];
    const id = `veh-${Date.now()}`;
    const name = `New ${label || def.noun}`;
    const newVehicle: FleetItem = {
      id,
      badge: "NEW",
      name,
      tagline: "Add a short tagline.",
      description: `Add a description for this ${def.noun}.`,
      image: "",
      price: "From Rs 0",
      unit: "/ day",
      available: true,
      category: categoryId,
      specs: [...def.specs],
      included: [...def.included],
    };
    const newRow: PricingRow = { name, prices: ["Rs 0", "Rs 0", "Rs 0"] };
    onChange({
      ...content,
      fleet: [...content.fleet, newVehicle],
      pricing: [...content.pricing, newRow],
    });
  }

  function removeScooter(idx: number) {
    onChange({
      ...content,
      fleet: content.fleet.filter((_, i) => i !== idx),
      pricing: content.pricing.filter((_, i) => i !== idx),
    });
  }

  // ── Vehicle categories ──
  const cats: VehicleCategory[] = content.vehicleCategories ?? [];
  const setCats = (next: VehicleCategory[]) =>
    onChange({ ...content, vehicleCategories: next });
  const updateCat = (idx: number, patch: Partial<VehicleCategory>) =>
    setCats(cats.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  const addCat = () =>
    setCats([...cats, { id: `cat-${Date.now()}`, label: "New Type", enabled: true }]);
  const removeCat = (idx: number) => setCats(cats.filter((_, i) => i !== idx));

  // ── Body styles inside a category ──
  const setTypes = (ci: number, next: VehicleType[]) => updateCat(ci, { types: next });
  const updateType = (ci: number, ti: number, patch: Partial<VehicleType>) =>
    setTypes(ci, (cats[ci].types ?? []).map((ty, i) => (i === ti ? { ...ty, ...patch } : ty)));
  const removeType = (ci: number, ti: number) =>
    setTypes(ci, (cats[ci].types ?? []).filter((_, i) => i !== ti));
  const addType = (ci: number, label: string) => {
    const existing = cats[ci].types ?? [];
    const id = slugifyType(label);
    if (!id || existing.some((ty) => ty.id === id)) return;
    setTypes(ci, [...existing, { id, label: label.trim(), enabled: true }]);
  };

  // ── Group the fleet by category so cars/kayaks never sit among scooters ──
  const rows = content.fleet.map((item, idx) => ({ item, idx }));
  const knownCatIds = new Set(cats.map((c) => c.id));
  const groupDefs: { id: string; label: string }[] = cats.map((c) => ({ id: c.id, label: c.label }));
  rows.forEach(({ item }) => {
    const c = item.category ?? "scooter";
    if (!knownCatIds.has(c) && !groupDefs.some((g) => g.id === c)) {
      groupDefs.push({ id: c, label: c });
    }
  });
  if (groupDefs.length === 0) groupDefs.push({ id: "scooter", label: "Scooter" });

  return (
    <div className="space-y-8">
      {/* ── Vehicle categories manager ── */}
      <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-6 space-y-4">
        <div>
          <p className="font-bebas text-yellow text-xs tracking-[0.3em]">VEHICLE CATEGORIES</p>
          <p className="text-muted/60 text-xs font-dm mt-1">
            Turn a category ON to show it on the website. Each one carries its own delivery charge
            and its own body styles — the filter customers use to narrow a page down to, say, SUVs.
          </p>
        </div>
        {/* One row per category, separated by hairlines rather than boxed as
            cards: this is a settings list, and a card per row would make eight
            equal-weight panels out of what the owner reads as a single table. */}
        <div className="divide-y divide-[#1e1e1e] border-y border-[#1e1e1e]">
          {cats.map((c, i) => {
            const kind = vehicleKind(c.id, c.label);
            const types = c.types ?? [];
            // Matched on the LABEL as well as the id. "Pick-up" slugifies to
            // "pick-up" while the seeded id is "pickup", so an id-only check
            // offered the owner a suggestion he already had — caught by
            // rendering the real panel, not by reading the code.
            const suggestions = TYPE_SUGGESTIONS[kind].filter(
              (s) =>
                !types.some(
                  (ty) =>
                    ty.id === slugifyType(s) ||
                    ty.label.trim().toLowerCase() === s.toLowerCase(),
                ),
            );
            const fallback = legacyDeliveryFee(c.id);
            const depositFallback = legacyDepositPct(c.id);
            return (
              <div key={c.id} className="py-4 space-y-3">
                {/* Wraps rather than squeezing: with all four controls on one
                    line a 375px phone left the category name an 83px slot, so
                    the fee drops to its own row instead of the name shrinking
                    to nothing. Measured in a real viewport, not assumed. */}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => updateCat(i, { enabled: !c.enabled })}
                    role="switch"
                    aria-checked={c.enabled}
                    className={`relative rounded-full transition-colors shrink-0 ${c.enabled ? "bg-yellow" : "bg-[#2a2a2a]"}`}
                    style={{ height: "22px", width: "40px" }}
                    aria-label={`${c.label}: ${c.enabled ? "shown on the website" : "hidden"}`}
                  >
                    <span className={`absolute top-1 w-3.5 h-3.5 bg-white rounded-full transition-transform ${c.enabled ? "translate-x-[21px]" : "translate-x-1"}`} />
                  </button>
                  <input
                    value={c.label}
                    onChange={(e) => updateCat(i, { label: e.target.value })}
                    aria-label="Category name"
                    className="flex-1 min-w-[150px] bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-offwhite text-sm font-dm focus:border-yellow focus:outline-none"
                  />
                  {/* Delivery & collection, for the whole rental — the same
                      figure the customer reads on the booking summary, so it is
                      labelled the way he says it out loud rather than as
                      "fee per leg". Empty is a real state: it means never set,
                      and the placeholder shows what is charged until it is. */}
                  <div className="relative shrink-0">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-dm text-xs text-muted/50">Rs</span>
                    <input
                      value={c.deliveryFee === undefined ? "" : String(c.deliveryFee)}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^\d]/g, "");
                        updateCat(i, { deliveryFee: raw === "" ? undefined : Math.min(99999, parseInt(raw, 10)) });
                      }}
                      inputMode="numeric"
                      placeholder={String(fallback)}
                      aria-label={`Delivery and collection charge for ${c.label}, in rupees`}
                      className="w-[104px] bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg pl-9 pr-3 py-2 text-offwhite text-sm font-dm tabular-nums placeholder:text-muted/35 focus:border-yellow focus:outline-none"
                    />
                  </div>
                  {/* Deposit that confirms a booking. Sits beside the delivery
                      fee because the two together are the whole answer to
                      "what does a customer pay before he arrives" — and the
                      owner asked for this one after seeing the other become
                      editable and the inconsistency in his own dashboard. */}
                  <div className="relative shrink-0">
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-dm text-xs text-muted/50">%</span>
                    <input
                      value={c.depositPct === undefined ? "" : String(c.depositPct)}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^\d]/g, "");
                        updateCat(i, {
                          depositPct:
                            raw === "" ? undefined : Math.min(100, Math.max(1, parseInt(raw, 10))),
                        });
                      }}
                      inputMode="numeric"
                      placeholder={String(legacyDepositPct(c.id))}
                      aria-label={`Deposit percentage that confirms a ${c.label} booking`}
                      className="w-[86px] bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg pl-3 pr-7 py-2 text-offwhite text-sm font-dm tabular-nums placeholder:text-muted/35 focus:border-yellow focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCat(i)}
                    className="text-muted/40 hover:text-red-400 transition-colors shrink-0"
                    aria-label={`Remove ${c.label}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <p className="pl-[52px] font-dm text-[11px] text-muted/45">
                  {c.deliveryFee === undefined
                    ? fallback === 0
                      ? "Delivery & collection: not set — it stays free, exactly as before."
                      : `Delivery & collection: not set — still charging the old rate of Rs ${fallback}.`
                    : c.deliveryFee === 0
                    ? "Delivery & collection: free — shown to the customer as “Free”."
                    : `Delivery & collection: Rs ${c.deliveryFee.toLocaleString("en-US")}, added once to the rental total.`}
                  {"  ·  "}
                  {c.depositPct === undefined
                    ? `Deposit: not set — still ${depositFallback}% to confirm, the rest at pickup.`
                    : c.depositPct === 100
                    ? "Deposit: 100% — the customer pays the whole rental to confirm, nothing at pickup."
                    : `Deposit: ${c.depositPct}% to confirm, the remaining ${100 - c.depositPct}% at pickup.`}
                </p>

                {/* Body styles. Tapping a chip turns that filter on or off for
                    the website; the × deletes it. Suggestions sit to the right,
                    visibly quieter, so the owner can build the list in four taps
                    without inventing the vocabulary. */}
                <div className="pl-[52px] flex flex-wrap items-center gap-1.5">
                  <span className="font-bebas text-muted/50 text-[10px] tracking-[0.2em] mr-1">TYPES</span>
                  {types.map((ty, ti) => (
                    <span
                      key={ty.id}
                      className={`inline-flex items-center gap-1 rounded-full border pl-2.5 pr-1 py-1 transition-colors ${
                        ty.enabled
                          ? "border-yellow/40 bg-yellow/10"
                          : "border-[#2a2a2a] bg-[#101010]"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => updateType(i, ti, { enabled: !ty.enabled })}
                        aria-pressed={ty.enabled}
                        title={ty.enabled ? "Offered as a filter — tap to hide" : "Hidden — tap to offer"}
                        className={`h-1.5 w-1.5 rounded-full shrink-0 ${ty.enabled ? "bg-yellow" : "bg-[#3a3a3a]"}`}
                      />
                      <input
                        value={ty.label}
                        onChange={(e) => updateType(i, ti, { label: e.target.value })}
                        aria-label={`${ty.label} name`}
                        style={{ width: `${Math.max(3, ty.label.length + 1)}ch` }}
                        className={`bg-transparent font-dm text-xs focus:outline-none ${ty.enabled ? "text-yellow" : "text-muted"}`}
                      />
                      <button
                        type="button"
                        onClick={() => removeType(i, ti)}
                        className="text-muted/40 hover:text-red-400 transition-colors px-1"
                        aria-label={`Remove ${ty.label}`}
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                  {suggestions.slice(0, 6).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => addType(i, s)}
                      className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#2f2f2f] px-2.5 py-1 font-dm text-xs text-muted/50 hover:border-yellow/40 hover:text-yellow transition-colors"
                    >
                      <Plus size={10} /> {s}
                    </button>
                  ))}
                  {/* Anything the suggestions don't cover. Enter commits, so
                      adding four styles never means four trips to the mouse. */}
                  <input
                    value={typeDraft[c.id] ?? ""}
                    onChange={(e) => setTypeDraft((d) => ({ ...d, [c.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      addType(i, typeDraft[c.id] ?? "");
                      setTypeDraft((d) => ({ ...d, [c.id]: "" }));
                    }}
                    onBlur={() => {
                      if (!(typeDraft[c.id] ?? "").trim()) return;
                      addType(i, typeDraft[c.id]);
                      setTypeDraft((d) => ({ ...d, [c.id]: "" }));
                    }}
                    placeholder="+ type…"
                    aria-label={`Add a body style to ${c.label}`}
                    className="w-24 rounded-full border border-transparent bg-transparent px-2.5 py-1 font-dm text-xs text-offwhite placeholder:text-muted/35 hover:border-[#2a2a2a] focus:border-yellow focus:outline-none transition-colors"
                  />
                  {types.length === 0 && suggestions.length === 0 && (
                    <span className="font-dm text-[11px] text-muted/35">
                      Nothing yet — this category shows every vehicle in one list.
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={addCat}
          className="flex items-center gap-2 text-xs font-dm text-muted/60 hover:text-yellow transition-colors"
        >
          <Plus size={13} /> Add category
        </button>
      </div>

      {groupDefs.map((g) => {
        const groupRows = rows.filter((r) => (r.item.category ?? "scooter") === g.id);
        const gnoun = KIND_DEFAULTS[vehicleKind(g.id, g.label)].noun;
        return (
        <div key={g.id} className="space-y-5">
          <div className="flex items-center justify-between border-b border-[#2a2a2a] pb-3">
            <p className="font-syne font-extrabold text-offwhite text-lg">
              {g.label}
              <span className="text-muted/50 text-sm font-dm font-normal ml-2">
                {groupRows.length} {groupRows.length === 1 ? "vehicle" : "vehicles"}
              </span>
            </p>
            <button
              type="button"
              onClick={() => addVehicle(g.id, g.label)}
              className="flex items-center gap-1.5 text-xs font-dm text-yellow/90 hover:text-yellow border border-yellow/30 hover:border-yellow/60 rounded-full px-3.5 py-1.5 transition-colors shrink-0"
            >
              <Plus size={13} /> Add {gnoun}
            </button>
          </div>

          {groupRows.length === 0 && (
            <p className="text-muted/40 font-dm text-xs italic py-1">
              No {gnoun}s yet — click &ldquo;Add {gnoun}&rdquo; to create one with the right setup.
            </p>
          )}

          {groupRows.map(({ item: scooter, idx }) => {
            const kind = vehicleKind(scooter.category ?? "scooter", g.label);
            const def = KIND_DEFAULTS[kind];
            return (
        <div
          key={scooter.id}
          className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-6 space-y-5"
        >
          <div className="flex items-center justify-between">
            <p className="font-bebas text-yellow text-xs tracking-[0.3em]">
              {g.label.toUpperCase()} — {scooter.name || "Untitled"}
            </p>
            <div className="flex items-center gap-4">
              {/* Availability toggle */}
              <button
                type="button"
                onClick={() => updateScooter(idx, { available: !scooter.available })}
                className={`flex items-center gap-2 text-xs font-dm px-3 py-1.5 rounded-full border transition-colors ${
                  scooter.available !== false
                    ? "border-green-500/40 text-green-400 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/40"
                    : "border-red-500/40 text-red-400 hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/40"
                }`}
              >
                {scooter.available !== false ? (
                  <><BadgeCheck size={12} /> Available</>
                ) : (
                  <><Ban size={12} /> Unavailable</>
                )}
              </button>
              {content.fleet.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeScooter(idx)}
                  className="flex items-center gap-1.5 text-xs font-dm text-muted/60 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={12} /> Remove
                </button>
              )}
            </div>
          </div>
          <ImagePicker
            label="COVER IMAGE"
            src={scooter.image}
            onUpload={(p) => updateScooter(idx, { image: p })}
          />
          <MultiImagePicker
            label="PHOTO GALLERY"
            hint="Add multiple angles — these appear in a carousel on the fleet card. First = cover (also sets the Cover Image above)."
            images={scooter.images ?? []}
            onChange={(imgs) => updateScooter(idx, { images: imgs, ...(imgs.length ? { image: imgs[0] } : {}) })}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="NAME">
              <TextInput
                value={scooter.name}
                onChange={(v) => updateScooter(idx, { name: v })}
              />
            </Field>
            <Field label="BADGE">
              <TextInput
                value={scooter.badge}
                onChange={(v) => updateScooter(idx, { badge: v })}
                placeholder="e.g. PREMIUM"
              />
            </Field>
            <Field label="TAGLINE">
              <TextInput
                value={scooter.tagline}
                onChange={(v) => updateScooter(idx, { tagline: v })}
              />
            </Field>
            <Field label="PRICE">
              <TextInput
                value={scooter.price}
                onChange={(v) => updateScooter(idx, { price: v })}
                placeholder="e.g. From Rs 800"
              />
            </Field>
            <Field label="CATEGORY">
              <select
                value={scooter.category ?? "scooter"}
                // Moving a car to Scooters must drop "SUV" with it — body
                // styles belong to one category, and a stale tag would keep
                // this vehicle out of every filter on its new page.
                onChange={(e) => updateScooter(idx, { category: e.target.value, type: undefined })}
                className={`${inputCls} appearance-none`}
              >
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}{c.enabled ? "" : " (hidden)"}
                  </option>
                ))}
                {!cats.some((c) => c.id === (scooter.category ?? "scooter")) && (
                  <option value={scooter.category ?? "scooter"}>
                    {scooter.category ?? "scooter"}
                  </option>
                )}
              </select>
            </Field>
            {/* Body style. Only rendered once the category HAS styles: an
                empty dropdown on every scooter would be a question with no
                answers, and the filter it feeds does not exist until there are
                at least two of them anyway. */}
            {(cats.find((c) => c.id === (scooter.category ?? "scooter"))?.types ?? []).length > 0 && (
              <Field label="TYPE (what the filter narrows by)">
                <select
                  value={scooter.type ?? ""}
                  onChange={(e) => updateScooter(idx, { type: e.target.value || undefined })}
                  className={`${inputCls} appearance-none`}
                >
                  <option value="">— none —</option>
                  {(cats.find((c) => c.id === (scooter.category ?? "scooter"))?.types ?? []).map((ty) => (
                    <option key={ty.id} value={ty.id}>
                      {ty.label}{ty.enabled ? "" : " (filter off)"}
                    </option>
                  ))}
                  {/* A style tagged here and later deleted upstairs would
                      otherwise vanish from this dropdown and silently reset the
                      vehicle to "none" on the next save. */}
                  {scooter.type &&
                    !(cats.find((c) => c.id === (scooter.category ?? "scooter"))?.types ?? []).some((ty) => ty.id === scooter.type) && (
                      <option value={scooter.type}>{scooter.type} (removed)</option>
                    )}
                </select>
              </Field>
            )}
            <Field label="UNITS (how many you own)">
              <TextInput
                value={String(scooter.units ?? 1)}
                onChange={(v) => updateScooter(idx, { units: Math.max(1, parseInt(v.replace(/\D/g, ""), 10) || 1) })}
                placeholder="e.g. 3"
              />
            </Field>
          </div>
          <Field label="DESCRIPTION">
            <Textarea
              value={scooter.description}
              onChange={(v) => updateScooter(idx, { description: v })}
              rows={3}
            />
            <div className="mt-2 space-y-2">
              <TransFields base={scooter.tagline} fr={scooter.taglineFr} cr={scooter.taglineCr} onFr={(v) => updateScooter(idx, { taglineFr: v })} onCr={(v) => updateScooter(idx, { taglineCr: v })} />
              <TransFields base={scooter.description} fr={scooter.descriptionFr} cr={scooter.descriptionCr} onFr={(v) => updateScooter(idx, { descriptionFr: v })} onCr={(v) => updateScooter(idx, { descriptionCr: v })} textarea rows={3} />
            </div>
          </Field>

          {/* Category-appropriate spec chips + included items */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="SPECS (comma-separated chips)">
              <TextInput
                value={(scooter.specs ?? []).join(", ")}
                onChange={(v) => updateScooter(idx, { specs: v.split(",").map((s) => s.trim()).filter(Boolean) })}
                placeholder={def.placeholder}
              />
            </Field>
            <Field label="WHAT'S INCLUDED (comma-separated)">
              <TextInput
                value={(scooter.included ?? []).join(", ")}
                onChange={(v) => updateScooter(idx, { included: v.split(",").map((s) => s.trim()).filter(Boolean) })}
                placeholder={def.included.length ? def.included.join(", ") : "e.g. Full tank of fuel, Insurance, Free delivery"}
              />
            </Field>
          </div>
          {def.specs.length > 0 && (
            <div className="flex flex-wrap gap-2 -mt-2">
              <button
                type="button"
                onClick={() => updateScooter(idx, { specs: [...def.specs] })}
                className="text-[11px] font-dm text-muted/60 hover:text-yellow border border-[#2a2a2a] hover:border-yellow/40 rounded-full px-3 py-1 transition-colors"
              >
                ↻ Reset to {def.noun} specs
              </button>
              <button
                type="button"
                onClick={() => updateScooter(idx, { included: [...def.included] })}
                className="text-[11px] font-dm text-muted/60 hover:text-yellow border border-[#2a2a2a] hover:border-yellow/40 rounded-full px-3 py-1 transition-colors"
              >
                ↻ Reset to {def.noun} extras
              </button>
            </div>
          )}
          <p className="text-muted/40 font-dm text-[11px]">
            These show on the {def.noun} card &amp; detail view. Each category has its own info — a {def.noun} never shows scooter helmet/riders.
          </p>

          {/* Individual units — exact asset tracking */}
          <div className="border-t border-[#2a2a2a] pt-4">
            <p className="font-bebas text-muted text-[10px] tracking-[0.25em]">INDIVIDUAL UNITS (optional — exact tracking)</p>
            <p className="text-muted/40 font-dm text-[11px] mb-3">
              Add each physical {def.noun} (colour / plate). Bookings auto-assign a free one and you&apos;ll see exactly which. Overrides &ldquo;Units&rdquo; for availability.
            </p>
            <div className="space-y-2">
              {(scooter.assets ?? []).map((a, ai) => (
                <div key={a.id} className="flex items-center gap-2 flex-wrap bg-dark border border-[#2a2a2a] rounded-lg p-2">
                  <input
                    value={a.label}
                    onChange={(e) => updateScooter(idx, { assets: (scooter.assets ?? []).map((x, i) => (i === ai ? { ...x, label: e.target.value } : x)) })}
                    placeholder={`Label e.g. ${scooter.name || def.noun} #1`}
                    className="flex-1 min-w-[120px] bg-transparent border border-[#2a2a2a] rounded px-2 py-1.5 text-xs text-offwhite font-dm focus:border-yellow focus:outline-none"
                  />
                  <input
                    value={a.color ?? ""}
                    onChange={(e) => updateScooter(idx, { assets: (scooter.assets ?? []).map((x, i) => (i === ai ? { ...x, color: e.target.value } : x)) })}
                    placeholder="Colour"
                    className="w-24 bg-transparent border border-[#2a2a2a] rounded px-2 py-1.5 text-xs text-offwhite font-dm focus:border-yellow focus:outline-none"
                  />
                  <input
                    value={a.plate ?? ""}
                    onChange={(e) => updateScooter(idx, { assets: (scooter.assets ?? []).map((x, i) => (i === ai ? { ...x, plate: e.target.value } : x)) })}
                    placeholder="Plate"
                    className="w-24 bg-transparent border border-[#2a2a2a] rounded px-2 py-1.5 text-xs text-offwhite font-dm focus:border-yellow focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => updateScooter(idx, { assets: (scooter.assets ?? []).map((x, i) => (i === ai ? { ...x, active: x.active === false } : x)) })}
                    className={`font-bebas text-[9px] tracking-[0.15em] px-2.5 py-1.5 rounded-full border ${a.active === false ? "border-red-500/30 text-red-400/70" : "border-green-500/30 text-green-400"}`}
                  >
                    {a.active === false ? "OFF" : "ACTIVE"}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateScooter(idx, { assets: (scooter.assets ?? []).filter((_, i) => i !== ai) })}
                    className="text-muted/50 hover:text-red-400 transition-colors"
                    aria-label="Remove unit"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => updateScooter(idx, { assets: [...(scooter.assets ?? []), { id: `unit-${Date.now()}`, label: "", color: "", plate: "", active: true }] })}
              className="mt-2 flex items-center gap-2 text-xs font-dm text-muted/60 hover:text-yellow transition-colors"
            >
              <Plus size={13} /> Add unit
            </button>
          </div>
        </div>
            );
          })}
        </div>
        );
      })}

      <p className="text-muted/50 text-xs font-dm">
        Vehicles are grouped by category — use &ldquo;Add …&rdquo; in each group to create one already set up
        with the right info (cars get car specs, kayaks get kayak specs, never scooter helmet/riders).
        Need a new category like Cars or Kayaks? Add it at the top, then add vehicles into it. Adding or
        removing a vehicle also updates the pricing table.
      </p>
    </div>
  );
}

function PromoEditor({
  content,
  onChange,
}: {
  content: SiteContent;
  onChange: (c: SiteContent) => void;
}) {
  const slides = content.promoSlides ?? [];
  const update = (i: number, patch: Partial<(typeof slides)[number]>) =>
    onChange({ ...content, promoSlides: slides.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  const add = () =>
    onChange({ ...content, promoSlides: [...slides, { id: `promo-${Date.now()}`, title: "", subtitle: "", image: "", video: "", link: "", linkText: "", enabled: true }] });
  const remove = (i: number) => onChange({ ...content, promoSlides: slides.filter((_, idx) => idx !== i) });
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= slides.length) return;
    const next = [...slides];
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ ...content, promoSlides: next });
  };

  return (
    <div className="space-y-6">
      <p className="text-muted/60 text-xs font-dm">
        Rotating slides shown near the top of the homepage (they replaced the old stats). Use them to cross-promote
        Stay·Eat·Do, taxi, offers or announcements so mobile visitors don&apos;t miss them. Click Save Changes to publish.
      </p>
      {slides.map((s, i) => (
        <div key={s.id} className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-bebas text-yellow text-[10px] tracking-[0.3em]">SLIDE {i + 1}{s.title ? ` — ${s.title}` : ""}</p>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-muted/60 hover:text-yellow disabled:opacity-30 transition-colors">↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === slides.length - 1} className="text-muted/60 hover:text-yellow disabled:opacity-30 transition-colors">↓</button>
              <button
                type="button"
                onClick={() => update(i, { enabled: !s.enabled })}
                className={`font-bebas text-[9px] tracking-[0.15em] px-2.5 py-1 rounded-full border ${s.enabled !== false ? "border-green-500/30 text-green-400" : "border-[#2a2a2a] text-muted/60"}`}
              >
                {s.enabled !== false ? "SHOWN" : "HIDDEN"}
              </button>
              <button type="button" onClick={() => remove(i)} className="text-muted/50 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
            </div>
          </div>
          <ImagePicker label="IMAGE (or video poster)" src={s.image} onUpload={(p) => update(i, { image: p })} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="EYEBROW (small label, optional)"><TextInput value={s.eyebrow ?? ""} onChange={(v) => update(i, { eyebrow: v })} placeholder="e.g. ISLAND TIP" /></Field>
            <Field label="VIDEO URL (optional, .mp4)"><TextInput value={s.video ?? ""} onChange={(v) => update(i, { video: v })} placeholder="https://…/clip.mp4" /></Field>
            <Field label="TITLE"><TextInput value={s.title} onChange={(v) => update(i, { title: v })} placeholder="e.g. Stay · Eat · Do" /></Field>
          </div>
          <Field label="SUBTITLE"><Textarea value={s.subtitle} onChange={(v) => update(i, { subtitle: v })} rows={2} /></Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="LINK"><TextInput value={s.link ?? ""} onChange={(v) => update(i, { link: v })} placeholder="/#recommended, /taxi, /#routes…" /></Field>
            <Field label="BUTTON TEXT"><TextInput value={s.linkText ?? ""} onChange={(v) => update(i, { linkText: v })} placeholder="Explore" /></Field>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-[#2a2a2a] hover:border-yellow/50 text-muted/60 hover:text-yellow rounded-2xl py-5 text-sm font-dm transition-colors"
      >
        <Plus size={16} /> Add Slide
      </button>
    </div>
  );
}

function PricingEditor({
  content,
  onChange,
}: {
  content: SiteContent;
  onChange: (c: SiteContent) => void;
}) {
  function updatePrice(rowIdx: number, colIdx: number, val: string) {
    const pricing = content.pricing.map((row, ri) => {
      if (ri !== rowIdx) return row;
      const prices = [...row.prices] as [string, string, string];
      prices[colIdx] = val;
      return { ...row, prices };
    });
    onChange({ ...content, pricing });
  }

  const COLS = ["DAILY", "3 DAYS", "WEEKLY"];

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-xl border border-[#2a2a2a]">
        <table className="w-full min-w-[480px]">
          <thead>
            <tr className="border-b border-[#2a2a2a]">
              <th className="text-left px-5 py-3 font-bebas text-muted text-[10px] tracking-[0.2em]">
                MODEL
              </th>
              {COLS.map((c) => (
                <th
                  key={c}
                  className="px-5 py-3 font-bebas text-muted text-[10px] tracking-[0.2em] text-center"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {content.pricing.map((row, ri) => (
              <tr
                key={ri}
                className={ri < content.pricing.length - 1 ? "border-b border-[#2a2a2a]" : ""}
              >
                <td className="px-5 py-4 font-dm text-offwhite/70 text-sm">{row.name}</td>
                {row.prices.map((price, ci) => (
                  <td key={ci} className="px-3 py-2">
                    <input
                      type="text"
                      value={price}
                      onChange={(e) => updatePrice(ri, ci, e.target.value)}
                      className={`${inputCls} text-center`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted/60 text-xs font-dm">Columns: Daily rate / 3-day rate / Weekly rate</p>
    </div>
  );
}

function ContactEditor({
  content,
  onChange,
}: {
  content: SiteContent;
  onChange: (c: SiteContent) => void;
}) {
  const c = content.contact;
  const set = (patch: Partial<typeof c>) =>
    onChange({ ...content, contact: { ...c, ...patch } });

  const numbers: WhatsAppNumber[] = c.whatsappNumbers ?? [];
  const setNumbers = (list: WhatsAppNumber[]) => set({ whatsappNumbers: list });
  const updateNumber = (i: number, patch: Partial<WhatsAppNumber>) =>
    setNumbers(numbers.map((n, idx) => (idx === i ? { ...n, ...patch } : n)));
  const addNumber = () => setNumbers([...numbers, { label: "", number: "" }]);
  const removeNumber = (i: number) => setNumbers(numbers.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field label="MAIN PHONE">
          <TextInput
            value={c.phone}
            onChange={(v) => set({ phone: v })}
            placeholder="+230 5XXX XXXX"
          />
        </Field>
        <Field label="EMAIL">
          <TextInput
            value={c.email}
            onChange={(v) => set({ email: v })}
            placeholder="hello@example.com"
          />
        </Field>
        <Field label="LOCATION">
          <TextInput value={c.location} onChange={(v) => set({ location: v })} />
        </Field>
        <Field label="OPENING HOURS">
          <TextInput
            value={c.hours}
            onChange={(v) => set({ hours: v })}
            placeholder="Mon – Sun: 7:00 AM – 8:00 PM"
          />
        </Field>
      </div>

      {/* ── Multiple WhatsApp numbers ── */}
      <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-6 space-y-4">
        <div>
          <p className="font-bebas text-yellow text-xs tracking-[0.3em]">WHATSAPP NUMBERS</p>
          <p className="font-dm text-muted text-xs mt-1">
            Add one or more WhatsApp lines (e.g. Bookings, Support). The floating button shows
            them all — each opens that number&apos;s chat. Use full format <strong className="text-offwhite">+230 5XXX XXXX</strong>.
          </p>
        </div>

        {numbers.length === 0 && (
          <p className="font-dm text-muted/50 text-xs">No WhatsApp numbers yet — add one below.</p>
        )}

        {numbers.map((n, i) => (
          <div key={i} className="flex items-end gap-3">
            <div className="flex-1">
              <Field label="LABEL">
                <TextInput value={n.label} onChange={(v) => updateNumber(i, { label: v })} placeholder="e.g. Bookings" />
              </Field>
            </div>
            <div className="flex-1">
              <Field label="NUMBER">
                <TextInput value={n.number} onChange={(v) => updateNumber(i, { number: v })} placeholder="+230 5912 3456" />
              </Field>
            </div>
            <button
              type="button"
              onClick={() => removeNumber(i)}
              className="mb-3 text-muted/60 hover:text-red-400 transition-colors shrink-0"
              aria-label="Remove number"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={addNumber}
          className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-[#2a2a2a] hover:border-yellow/50 text-muted/60 hover:text-yellow rounded-xl py-3 text-sm font-dm transition-colors"
        >
          <Plus size={15} /> Add WhatsApp Number
        </button>
      </div>
    </div>
  );
}

function GalleryEditor({
  content,
  onChange,
  onSessionExpired,
  onSaved,
}: {
  content: SiteContent;
  onChange: (c: SiteContent) => void;
  onSessionExpired: () => void;
  onSaved?: (c: SiteContent) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList) {
    setUploading(true);
    const newImages: GalleryImage[] = [];
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      if (res.ok) {
        const { path } = (await res.json()) as { path: string };
        newImages.push({
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          src: path,
          alt: file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
          uploadedAt: new Date().toISOString(),
        });
      }
    }
    const updated = { ...content, gallery: [...content.gallery, ...newImages] };
    onChange(updated);
    const saveRes = await fetch("/api/admin/content", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    if (saveRes.status === 401) onSessionExpired();
    else if (saveRes.ok) onSaved?.(updated);
    setUploading(false);
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    const res = await fetch(`/api/admin/gallery?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      onChange({ ...content, gallery: content.gallery.filter((img) => img.id !== id) });
    }
    setDeleting(null);
  }

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="w-full border-2 border-dashed border-[#2a2a2a] hover:border-yellow/50 rounded-2xl py-10 flex flex-col items-center gap-3 transition-colors disabled:opacity-50"
      >
        {uploading ? (
          <Loader2 size={28} className="text-yellow animate-spin" />
        ) : (
          <Upload size={28} className="text-muted" />
        )}
        <span className="font-bebas text-muted tracking-[0.2em] text-sm">
          {uploading ? "UPLOADING…" : "CLICK TO ADD PHOTOS"}
        </span>
        <span className="font-dm text-muted/50 text-xs">
          JPG, PNG, WEBP — multiple files supported
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {content.gallery.length === 0 ? (
        <p className="text-center text-muted/50 font-dm text-sm py-6">
          No photos yet. Upload scooter photos above and they will appear on the website.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {content.gallery.map((img) => (
            <div
              key={img.id}
              className="group relative aspect-square rounded-xl overflow-hidden bg-[#0d0d0d] border border-[#2a2a2a]"
            >
              <Image
                src={img.src}
                alt={img.alt}
                fill
                className="object-cover"
                unoptimized
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button
                  onClick={() => handleDelete(img.id)}
                  disabled={deleting === img.id}
                  className="bg-red-500/90 hover:bg-red-600 text-white rounded-full p-2 transition-colors"
                  aria-label="Delete photo"
                >
                  {deleting === img.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-muted/50 text-xs font-dm">
        {content.gallery.length} photo{content.gallery.length !== 1 ? "s" : ""} •{" "}
        Gallery section appears automatically on the website when photos are added.
      </p>
    </div>
  );
}

function TestimonialsEditor({
  content,
  onChange,
}: {
  content: SiteContent;
  onChange: (c: SiteContent) => void;
}) {
  function updateReview(idx: number, patch: Partial<TestimonialItem>) {
    const testimonials = content.testimonials.map((t, i) =>
      i === idx ? { ...t, ...patch } : t
    );
    onChange({ ...content, testimonials });
  }

  function addReview() {
    const newReview: TestimonialItem = {
      id: `review-${Date.now()}`,
      name: "",
      origin: "",
      rating: 5,
      text: "",
    };
    onChange({ ...content, testimonials: [...content.testimonials, newReview] });
  }

  function removeReview(idx: number) {
    onChange({
      ...content,
      testimonials: content.testimonials.filter((_, i) => i !== idx),
    });
  }

  return (
    <div className="space-y-6">
      {content.testimonials.length === 0 && (
        <p className="text-muted/50 font-dm text-sm py-4 text-center">
          No reviews yet. Add your first customer review below.
        </p>
      )}

      {content.testimonials.map((review, idx) => (
        <div
          key={review.id}
          className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <p className="font-bebas text-yellow text-xs tracking-[0.3em]">REVIEW {idx + 1}</p>
            <button
              type="button"
              onClick={() => removeReview(idx)}
              className="flex items-center gap-1.5 text-xs font-dm text-muted/60 hover:text-red-400 transition-colors"
            >
              <Trash2 size={12} /> Remove
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="CUSTOMER NAME">
              <TextInput
                value={review.name}
                onChange={(v) => updateReview(idx, { name: v })}
                placeholder="e.g. Sophie Laurent"
              />
            </Field>
            <Field label="ORIGIN (CITY, COUNTRY)">
              <TextInput
                value={review.origin}
                onChange={(v) => updateReview(idx, { origin: v })}
                placeholder="e.g. Paris, France"
              />
            </Field>
          </div>

          <Field label="RATING (1–5 STARS)">
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => updateReview(idx, { rating: n })}
                  className="transition-transform hover:scale-110"
                  aria-label={`${n} star${n !== 1 ? "s" : ""}`}
                >
                  <Star
                    size={22}
                    className={n <= review.rating ? "fill-yellow text-yellow" : "text-muted/30"}
                  />
                </button>
              ))}
            </div>
          </Field>

          <Field label="REVIEW TEXT">
            <Textarea
              value={review.text}
              onChange={(v) => updateReview(idx, { text: v })}
              rows={3}
            />
          </Field>
        </div>
      ))}

      <button
        type="button"
        onClick={addReview}
        className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-[#2a2a2a] hover:border-yellow/50 text-muted/60 hover:text-yellow rounded-2xl py-5 text-sm font-dm transition-colors"
      >
        <Plus size={16} /> Add Review
      </button>

      <p className="text-muted/50 text-xs font-dm">
        Reviews are hidden automatically if none are added. Click Save Changes to publish.
      </p>
    </div>
  );
}

function BrandingEditor({
  content,
  onChange,
}: {
  content: SiteContent;
  onChange: (c: SiteContent) => void;
}) {
  const s = content.social;
  const b = content.branding;
  const setSocial = (patch: Partial<typeof s>) =>
    onChange({ ...content, social: { ...s, ...patch } });
  const setBranding = (patch: Partial<typeof b>) =>
    onChange({ ...content, branding: { ...b, ...patch } });

  return (
    <div className="space-y-8">
      {/* Logo */}
      <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-6 space-y-4">
        <p className="font-bebas text-yellow text-xs tracking-[0.3em]">LOGO</p>
        <ImagePicker
          label="LOGO IMAGE"
          src={b.logo}
          onUpload={(p) => setBranding({ logo: p })}
        />
        {b.logo && (
          <button
            type="button"
            onClick={() => setBranding({ logo: "" })}
            className="text-xs font-dm text-muted/50 hover:text-red-400 transition-colors flex items-center gap-1"
          >
            <Trash2 size={11} /> Remove logo (use text instead)
          </button>
        )}
        <p className="text-muted/50 text-xs font-dm">
          Upload your logo to replace the text in the navbar and footer. PNG with transparent
          background works best.
        </p>
      </div>

      {/* Mascot — Ti Roulé */}
      <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-6 space-y-4">
        <p className="font-bebas text-yellow text-xs tracking-[0.3em]">MASCOT — TI ROULÉ</p>
        <ImagePicker
          label="MASCOT IMAGE"
          src={b.mascotImage ?? ""}
          onUpload={(p) => setBranding({ mascotImage: p })}
        />
        {b.mascotImage && (
          <button
            type="button"
            onClick={() => setBranding({ mascotImage: "" })}
            className="text-xs font-dm text-muted/50 hover:text-red-400 transition-colors flex items-center gap-1"
          >
            <Trash2 size={11} /> Remove mascot
          </button>
        )}
        <p className="text-muted/50 text-xs font-dm">
          Upload your Ti Roulé character (a single character cut out on a transparent background works best).
          This is his <span className="text-offwhite/70">default</span> pose — he becomes the floating
          island-guide chat that greets visitors and points them to the trip planner, food concierge,
          island guide, vehicles and taxis.
        </p>

        {/* Expression poses — the chat assistant swaps between these as it talks */}
        <div className="pt-2 border-t border-[#2a2a2a] space-y-4">
          <p className="font-bebas text-yellow/80 text-[11px] tracking-[0.25em]">TI ROULÉ POSES (OPTIONAL)</p>
          <p className="text-muted/50 text-xs font-dm -mt-2">
            Upload the expressions you generated. The assistant animates between them — e.g. “thinking”
            while typing, “pointing” when giving directions, “excited” when it finds you something. Any
            pose you skip falls back to the default above, so add as many or as few as you like.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {MASCOT_POSES.map((pose) => {
              const poses = b.mascotPoses ?? {};
              const setPose = (url: string) =>
                setBranding({ mascotPoses: { ...poses, [pose.key]: url } });
              const clearPose = () => {
                const next = { ...poses };
                delete next[pose.key];
                setBranding({ mascotPoses: next });
              };
              return (
                <div key={pose.key} className="space-y-1.5">
                  <ImagePicker label={pose.label} src={poses[pose.key] ?? ""} onUpload={setPose} />
                  {poses[pose.key] && (
                    <button
                      type="button"
                      onClick={clearPose}
                      className="text-[10px] font-dm text-muted/50 hover:text-red-400 transition-colors flex items-center gap-1"
                    >
                      <Trash2 size={10} /> Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Social links */}
      <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-6 space-y-5">
        <p className="font-bebas text-yellow text-xs tracking-[0.3em]">SOCIAL MEDIA LINKS</p>
        <Field label="INSTAGRAM URL">
          <TextInput
            value={s.instagram}
            onChange={(v) => setSocial({ instagram: v })}
            placeholder="https://instagram.com/yourpage"
          />
        </Field>
        <Field label="FACEBOOK URL">
          <TextInput
            value={s.facebook}
            onChange={(v) => setSocial({ facebook: v })}
            placeholder="https://facebook.com/yourpage"
          />
        </Field>
        <Field label="TIKTOK URL">
          <TextInput
            value={s.tiktok}
            onChange={(v) => setSocial({ tiktok: v })}
            placeholder="https://tiktok.com/@yourpage"
          />
        </Field>
        <Field label="WHATSAPP LINK">
          <TextInput
            value={s.whatsapp}
            onChange={(v) => setSocial({ whatsapp: v })}
            placeholder="https://wa.me/2305XXXXXXX"
          />
        </Field>
        <p className="text-muted/50 text-xs font-dm">
          Leave a field empty to hide that icon from the footer. Links open in a new tab.
        </p>
      </div>
    </div>
  );
}

// ── Submissions viewer ─────────────────────────────────────────────────────────

function SubmissionsViewer() {
  const [submissions, setSubmissions] = useState<ContactSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [filter, setFilter] = useState<"new" | "handled" | "all">("new");

  async function setHandled(id: string, handled: boolean) {
    setSubmissions((prev) => prev.map((s) => (s.id === id ? { ...s, handled } : s)));
    const ok = await adminWrite("/api/admin/submissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, handled }),
    });
    // Revert — an enquiry wrongly shown as handled is one nobody answers.
    if (!ok) setSubmissions((prev) => prev.map((s) => (s.id === id ? { ...s, handled: !handled } : s)));
  }

  async function remove(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/submissions?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.ok) setSubmissions((prev) => prev.filter((s) => s.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/admin/submissions");
      if (!res.ok) throw new Error();
      setSubmissions(await res.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="text-yellow animate-spin" />
      </div>
    );

  if (error)
    return (
      <div className="text-center py-20">
        <p className="text-red-400 font-dm text-sm mb-4">Failed to load submissions.</p>
        <button
          onClick={load}
          className="flex items-center gap-2 text-yellow font-dm text-sm mx-auto hover:text-yellow-dark transition-colors"
        >
          <RefreshCw size={14} /> Try again
        </button>
      </div>
    );

  if (submissions.length === 0)
    return (
      <div className="text-center py-20">
        <Inbox size={36} className="text-muted/30 mx-auto mb-4" />
        <p className="text-muted/50 font-dm text-sm">No enquiries yet.</p>
        <p className="text-muted/30 font-dm text-xs mt-1">
          When customers fill in the contact form, their messages appear here.
        </p>
      </div>
    );

  const newCount = submissions.filter((s) => !s.handled).length;
  const shown = submissions.filter((s) =>
    filter === "all" ? true : filter === "handled" ? s.handled : !s.handled,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {([
            ["new", `NEW (${newCount})`],
            ["handled", `HANDLED (${submissions.length - newCount})`],
            ["all", `ALL (${submissions.length})`],
          ] as const).map(([f, label]) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`font-bebas text-[10px] tracking-[0.12em] px-3 py-1.5 rounded-full border transition-colors ${
                filter === f ? "bg-yellow text-dark border-yellow" : "border-[#2a2a2a] text-muted/70 hover:border-yellow/40 hover:text-yellow"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-muted/50 hover:text-yellow font-dm text-xs transition-colors"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="text-muted/40 font-dm text-sm text-center py-10">No {filter === "all" ? "" : filter} enquiries.</p>
      ) : shown.map((s) => (
        <div
          key={s.id}
          className={`bg-[#0d0d0d] border rounded-2xl p-5 space-y-3 transition-colors ${s.handled ? "border-[#1c1c1c] opacity-60" : "border-[#2a2a2a]"}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-syne font-bold text-offwhite text-sm">{s.name || "—"}</p>
              <p className="font-bebas text-muted text-[10px] tracking-[0.2em] mt-0.5">
                {new Date(s.created_at).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {s.scooter && (
                <span className="font-bebas text-[10px] tracking-[0.15em] bg-yellow/10 text-yellow px-2.5 py-1 rounded-full">
                  {s.scooter.toUpperCase()}
                </span>
              )}
              <button
                onClick={() => setHandled(s.id, !s.handled)}
                className={`font-bebas text-[9px] tracking-[0.12em] px-2.5 py-1 rounded-full border transition-colors ${
                  s.handled
                    ? "border-[#2a2a2a] text-muted/60 hover:text-yellow hover:border-yellow/40"
                    : "border-green-500/30 text-green-400 hover:bg-green-500/10"
                }`}
              >
                {s.handled ? "Reopen" : "✓ Handled"}
              </button>
              <button
                onClick={() => remove(s.id)}
                disabled={deleting === s.id}
                className="text-muted/30 hover:text-red-400 transition-colors"
                aria-label="Delete enquiry"
              >
                {deleting === s.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {s.email && (
              <a
                href={`mailto:${s.email}`}
                className="flex items-center gap-1.5 text-xs font-dm text-muted hover:text-yellow transition-colors"
              >
                <Mail size={11} /> {s.email}
              </a>
            )}
            {s.phone && (
              <a
                href={`https://wa.me/${s.phone.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-dm text-muted hover:text-yellow transition-colors"
              >
                <Phone size={11} /> {s.phone}
              </a>
            )}
            {s.dates && (
              <span className="flex items-center gap-1.5 text-xs font-dm text-muted">
                <Calendar size={11} /> {s.dates}
              </span>
            )}
          </div>

          {s.message && (
            <p className="text-offwhite/60 font-dm text-xs leading-relaxed border-t border-[#2a2a2a] pt-3">
              {s.message}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Bookings manager ───────────────────────────────────────────────────────────

function fmtTime12(t?: string | null): string {
  if (!t) return "";
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return t;
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; cls: string; dot: string }
> = {
  pending:   { label: "Checking",  cls: "bg-amber-400/10 text-amber-400 border-amber-400/30",   dot: "bg-amber-400"   },
  // M91 — availability confirmed with the partner, holding the vehicle until
  // payment_due_by. Gold, because it is the state that needs the customer to act.
  approved:  { label: "Awaiting payment", cls: "bg-yellow/10 text-yellow border-yellow/30",      dot: "bg-yellow"      },
  confirmed: { label: "Confirmed", cls: "bg-green-500/10 text-green-400 border-green-500/30",   dot: "bg-green-400"   },
  cancelled: { label: "Cancelled", cls: "bg-red-500/10   text-red-400   border-red-500/30",     dot: "bg-red-400"     },
  completed: { label: "Completed", cls: "bg-blue-500/10  text-blue-400  border-blue-500/30",    dot: "bg-blue-400"    },
};

// Booking reference (RR-XXXXXX = first 6 hex of the id). Same format the guest
// gets in their confirmation email + Manage-Booking lookup, so the owner can
// match someone who calls in quoting their code.
const bookingRef = (id: string) => "RR-" + id.replace(/-/g, "").slice(0, 6).toUpperCase();

// ── The availability decision (M91) ────────────────────────────────────────
//
// The owner rents vehicles he does not all own. Confirming one on the spot
// means occasionally taking money for a scooter the partner has already lent
// out, and every one of those becomes a refund — the PayPal fee, the exchange
// spread and the customer's trust, all gone.
//
// So he answers one question here before anybody pays. Approving RESERVES the
// vehicle (see lib/holds.ts) and emails a pay link with a deadline; declining
// sends his own words, immediately, rather than leaving the customer in
// "we're checking" forever.
function AvailabilityDecision({
  booking,
  busy,
  onDone,
}: {
  booking: Booking;
  busy: boolean;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<null | "approve" | "unavailable">(null);
  const [note, setNote] = useState("");
  const [hours, setHours] = useState("24");
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(decision: "approve" | "unavailable") {
    setWorking(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/bookings/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: booking.id,
          decision,
          note: decision === "unavailable" ? note : undefined,
          hours: decision === "approve" ? Number(hours) || 24 : undefined,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) { setErr(j.error ?? "That didn't work."); return; }
      setMode(null);
      setNote("");
      onDone();
    } catch {
      setErr("Network problem — try again.");
    } finally {
      setWorking(false);
    }
  }

  const disabled = busy || working;

  return (
    <div className="rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] p-3.5">
      <p className="font-bebas text-[9px] tracking-[0.2em] text-yellow">
        {booking.status === "approved" ? "HELD — WAITING FOR PAYMENT" : "IS IT AVAILABLE?"}
      </p>

      {booking.status === "approved" && booking.payment_due_by && (
        <p className="mt-1 font-dm text-[11px] text-muted/70">
          Reserved until {new Date(booking.payment_due_by).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.
          Nobody else is offered this vehicle until then.
        </p>
      )}

      {!mode && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setMode("approve")}
            className="inline-flex items-center gap-1.5 rounded-full border border-green-500/40 bg-green-500/10 px-3 py-1.5 font-syne text-[11px] font-bold text-green-400 transition-colors hover:bg-green-500/20 disabled:opacity-50"
          >
            <BadgeCheck size={12} /> {booking.status === "approved" ? "Extend the hold" : "Yes — it's available"}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setMode("unavailable")}
            className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1.5 font-syne text-[11px] font-bold text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
          >
            <Ban size={12} /> Not available
          </button>
        </div>
      )}

      {mode === "approve" && (
        <div className="mt-2.5 space-y-2">
          <label className="block font-dm text-[11px] text-muted">
            Hold it for
            <input
              value={hours}
              onChange={(e) => setHours(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              className="mx-2 w-14 rounded-lg border border-[#2a2a2a] bg-[#0d0d0d] px-2 py-1 text-center font-dm text-xs text-offwhite tabular-nums focus:border-yellow focus:outline-none"
            />
            hours, then release it
          </label>
          <p className="font-dm text-[11px] leading-relaxed text-muted/60">
            The customer is emailed a pay link and told this exact deadline. Until it passes, this vehicle is not
            offered to anyone else.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => submit("approve")}
              className="rounded-full bg-yellow px-3.5 py-1.5 font-syne text-[11px] font-bold text-dark transition-colors hover:bg-yellow-dark disabled:opacity-50"
            >
              {working ? "Sending…" : "Confirm & email the customer"}
            </button>
            <button type="button" onClick={() => setMode(null)} className="font-dm text-[11px] text-muted hover:text-offwhite">
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === "unavailable" && (
        <div className="mt-2.5 space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="What should the customer know? e.g. That scooter is out those dates, but the Avenis is free and the same price — want it?"
            className="w-full rounded-lg border border-[#2a2a2a] bg-[#0d0d0d] px-3 py-2 font-dm text-xs text-offwhite placeholder:text-muted/40 focus:border-yellow focus:outline-none"
          />
          <p className="font-dm text-[11px] leading-relaxed text-muted/60">
            Sent to the customer word for word, with a reminder that they were not charged. Leave it blank and we send
            a polite default.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => submit("unavailable")}
              className="rounded-full border border-red-500/40 bg-red-500/10 px-3.5 py-1.5 font-syne text-[11px] font-bold text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
            >
              {working ? "Sending…" : "Tell the customer"}
            </button>
            <button type="button" onClick={() => setMode(null)} className="font-dm text-[11px] text-muted hover:text-offwhite">
              Cancel
            </button>
          </div>
        </div>
      )}

      {err && <p className="mt-2 font-dm text-[11px] text-red-400">{err}</p>}
    </div>
  );
}

// ── Money: everyone waiting on a decision about a payment ──────────────────
//
// Read-only on purpose. Each desk keeps owning its own confirm/reject, because
// two code paths for one state change means the less-used one rots. This
// answers "has anyone paid?" in one screen and then points at the desk.
type MoneyRow = {
  kind: "vehicle" | "activity" | "order";
  id: string;
  reference: string;
  customer: string;
  item: string | null;
  amount: number | null;
  reportedAt: string | null;
  hasReceipt: boolean;
  desk: string;
};

function MoneyDesk({ onGo }: { onGo: (s: Section) => void }) {
  const [rows, setRows] = useState<MoneyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/money");
        if (!res.ok) throw new Error();
        const j = (await res.json()) as { rows: MoneyRow[] };
        if (live) setRows(j.rows ?? []);
      } catch {
        if (live) setError(true);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, []);

  const waited = (iso: string | null) => {
    if (!iso) return "";
    const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
    if (hours < 1) return "just now";
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const sectionFor = (k: MoneyRow["kind"]): Section =>
    k === "vehicle" ? "bookings" : k === "activity" ? "place_bookings" : "marketplace";

  if (loading) return <p className="font-dm text-sm text-muted/60">Checking every desk…</p>;
  if (error) return <p className="font-dm text-sm text-red-400">Could not load this right now.</p>;

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-[#2a2a2a] bg-[#0d0d0d] p-8 text-center">
        <Banknote size={22} className="mx-auto text-muted/40" />
        <p className="mt-3 font-syne font-bold text-offwhite">Nobody is waiting on you</p>
        <p className="mt-1 font-dm text-xs text-muted/60">
          Every reported payment has been dealt with. New ones appear here the moment a customer says they have paid.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="font-dm text-xs text-muted/60">
        {rows.length} {rows.length === 1 ? "person is" : "people are"} waiting for you to confirm a payment. Oldest first.
      </p>
      {rows.map((r) => (
        <div
          key={`${r.kind}-${r.id}`}
          className="rounded-2xl border border-[#2a2a2a] bg-[#0d0d0d] p-4 space-y-3"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="font-syne font-bold text-offwhite text-sm">{r.customer}</span>
            <span className="font-dm text-[11px] text-muted/60">{r.reference}</span>
            {r.item && <span className="font-dm text-[11px] text-muted/60">· {r.item}</span>}
            {r.amount != null && (
              <span className="font-syne font-bold text-yellow text-sm">Rs {r.amount.toLocaleString("en-US")}</span>
            )}
            <span className="ml-auto font-dm text-[11px] text-muted/50">{waited(r.reportedAt)}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {r.kind === "order" ? (
              // Orders keep their own receipt viewer on their own desk; sending
              // the owner there is better than a second signing endpoint that
              // would have to re-derive the same permissions.
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2a2a2a] px-2.5 py-1 font-dm text-[11px] text-muted/70">
                <FileCheck size={11} /> Proof attached — open it on the order
              </span>
            ) : (
              <BookingReceiptLink
                id={r.id}
                kind={r.kind === "activity" ? "place" : "vehicle"}
                hasReceipt={r.hasReceipt}
                reportedAt={r.reportedAt}
              />
            )}
            <button
              type="button"
              onClick={() => onGo(sectionFor(r.kind))}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#2a2a2a] px-2.5 py-1 font-dm text-[11px] text-muted transition-colors hover:border-yellow/40 hover:text-yellow"
            >
              Open in {r.desk} <ChevronRight size={11} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── The proof of payment, where the owner already looks (M83) ──────────────
//
// M78's lesson, applied ahead of time rather than after a complaint: an
// uploaded receipt that /admin does not render is the same as no receipt. This
// is rendered by BOTH booking managers from the same component so the two
// cannot drift into showing different things.
function BookingReceiptLink({ id, kind, hasReceipt, reportedAt }: {
  id: string;
  kind: "vehicle" | "place";
  /** Whether a file exists. The PATH itself never reaches the browser — the
   *  signed URL is minted on demand by /api/admin/booking-receipt from the id. */
  hasReceipt: boolean;
  reportedAt?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  // Nothing said is better than a misleading "no receipt" on a booking that
  // was paid by card and never needed one.
  if (!hasReceipt && !reportedAt) return null;

  async function open() {
    setBusy(true);
    setErr(false);
    try {
      const res = await fetch("/api/admin/booking-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, kind }),
      });
      const j = (await res.json()) as { url?: string };
      // A signed URL is short-lived, so it is fetched on demand and opened
      // immediately rather than rendered into the page as an href.
      if (res.ok && j.url) window.open(j.url, "_blank", "noopener,noreferrer");
      else setErr(true);
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      {hasReceipt ? (
        <button
          type="button"
          onClick={open}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full border border-yellow/40 bg-yellow/10 px-2.5 py-1 font-dm text-[11px] text-yellow transition-colors hover:bg-yellow/20 disabled:opacity-60"
        >
          <FileCheck size={11} /> {busy ? "Opening…" : "View payment proof"}
        </button>
      ) : (
        // Reported without a file: the customer pressed "I have paid" but sent
        // no slip. Worth saying, because it is a different situation from
        // silence and the owner will want to chase it.
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2a2a2a] px-2.5 py-1 font-dm text-[11px] text-muted/70">
          Says paid — no file attached
        </span>
      )}
      {err && <span className="font-dm text-[11px] text-red-400">Could not open it.</span>}
    </span>
  );
}

function BookingsManager({ fleet }: { fleet?: FleetItem[] }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | Booking["status"]>("all");
  const [q, setQ] = useState("");

  // Physical units for a given booking's model (for the reassign dropdown)
  function unitsFor(scooter: string) {
    const item = (fleet ?? []).find((f) => f.id === scooter || f.name === scooter);
    return item?.assets ?? [];
  }

  async function assignAsset(id: string, scooter: string, assetId: string) {
    const unit = unitsFor(scooter).find((a) => a.id === assetId);
    const asset_label = unit ? (unit.color ? `${unit.label} · ${unit.color}` : unit.label) : null;
    setUpdating(id);
    try {
      const ok = await adminWrite("/api/admin/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, asset_id: assetId || null, asset_label }),
      });
      if (!ok) return;
      setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, asset_id: assetId || null, asset_label } : b)));
    } finally {
      setUpdating(null);
    }
  }

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/admin/bookings");
      if (!res.ok) throw new Error();
      setBookings(await res.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    setUpdating(id);
    try {
      // Only reflect the new status once the server actually accepted it —
      // this is the value the owner reads back to a customer on the phone.
      const ok = await adminWrite("/api/admin/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!ok) return;
      setBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: status as Booking["status"] } : b))
      );
    } finally {
      setUpdating(null);
    }
  }

  async function deleteBooking(id: string) {
    if (!confirm("Delete this booking permanently? This cannot be undone.")) return;
    setUpdating(id);
    try {
      const res = await fetch("/api/admin/bookings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) setBookings((prev) => prev.filter((b) => b.id !== id));
    } finally {
      setUpdating(null);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="text-yellow animate-spin" />
      </div>
    );

  if (error)
    return (
      <div className="text-center py-20">
        <p className="text-red-400 font-dm text-sm mb-4">Failed to load bookings.</p>
        <button
          onClick={load}
          className="flex items-center gap-2 text-yellow font-dm text-sm mx-auto"
        >
          <RefreshCw size={14} /> Try again
        </button>
      </div>
    );

  if (bookings.length === 0)
    return (
      <div className="text-center py-20">
        <BookOpen size={36} className="text-muted/30 mx-auto mb-4" />
        <p className="text-muted/50 font-dm text-sm">No bookings yet.</p>
        <p className="text-muted/30 font-dm text-xs mt-1">
          Booking requests from the website will appear here.
        </p>
      </div>
    );

  const query = q.trim().toLowerCase();
  const shown = bookings.filter((b) => {
    if (filter !== "all" && b.status !== filter) return false;
    if (!query) return true;
    return (
      b.name.toLowerCase().includes(query) ||
      bookingRef(b.id).toLowerCase().includes(query) ||
      b.scooter.toLowerCase().includes(query) ||
      (b.email ?? "").toLowerCase().includes(query) ||
      (b.phone ?? "").toLowerCase().includes(query) ||
      (b.asset_label ?? "").toLowerCase().includes(query)
    );
  });
  const counts = { all: bookings.length } as Record<string, number>;
  for (const b of bookings) counts[b.status] = (counts[b.status] ?? 0) + 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(["all", "pending", "confirmed", "completed", "cancelled"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`font-bebas text-[10px] tracking-[0.12em] px-3 py-1.5 rounded-full border transition-colors ${
                filter === f ? "bg-yellow text-dark border-yellow" : "border-[#2a2a2a] text-muted/70 hover:border-yellow/40 hover:text-yellow"
              }`}
            >
              {f.toUpperCase()} ({counts[f] ?? 0})
            </button>
          ))}
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-muted/50 hover:text-yellow font-dm text-xs transition-colors"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by reference (RR-…), name, scooter, email, phone…"
        className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-sm text-offwhite font-dm placeholder:text-muted/40 focus:border-yellow focus:outline-none transition-colors"
      />

      {shown.length === 0 ? (
        <p className="text-muted/40 font-dm text-sm text-center py-10">No bookings match your filter.</p>
      ) : shown.map((b) => {
        const sc = STATUS_CONFIG[b.status] ?? STATUS_CONFIG.pending;
        return (
          <div
            key={b.id}
            className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-5 space-y-4"
          >
            {/* Header row */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-syne font-bold text-offwhite text-sm">{b.name}</p>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(bookingRef(b.id))}
                    title="Copy booking reference"
                    className="font-mono text-[10px] text-yellow/90 bg-yellow/10 hover:bg-yellow/20 px-1.5 py-0.5 rounded transition-colors"
                  >
                    {bookingRef(b.id)}
                  </button>
                </div>
                <p className="font-bebas text-muted text-[10px] tracking-[0.2em] mt-0.5">
                  {new Date(b.created_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`flex items-center gap-1.5 font-bebas text-[10px] tracking-[0.15em] border px-3 py-1 rounded-full ${sc.cls}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                  {sc.label}
                </span>
                <span className="font-bebas text-[10px] tracking-[0.15em] bg-yellow/10 text-yellow px-2.5 py-1 rounded-full">
                  {b.scooter.toUpperCase()}
                </span>
                {b.asset_label && (
                  <span className="font-bebas text-[10px] tracking-[0.15em] bg-green-500/10 text-green-400 px-2.5 py-1 rounded-full">
                    {b.asset_label}
                  </span>
                )}
              </div>
            </div>

            {/* Reassign which physical unit (only when units are defined) */}
            {unitsFor(b.scooter).length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bebas text-muted text-[9px] tracking-[0.2em]">ASSIGNED UNIT:</p>
                <select
                  value={b.asset_id ?? ""}
                  disabled={updating === b.id}
                  onChange={(e) => assignAsset(b.id, b.scooter, e.target.value)}
                  className="bg-dark border border-[#2a2a2a] rounded-lg px-2.5 py-1 text-xs text-offwhite font-dm focus:border-yellow focus:outline-none"
                >
                  <option value="">Choose automatically</option>
                  {unitsFor(b.scooter).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}{a.color ? ` · ${a.color}` : ""}{a.active === false ? " (off)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Booking details */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <p className="font-bebas text-muted text-[9px] tracking-[0.2em]">PICKUP</p>
                <p className="font-dm text-offwhite text-xs mt-0.5">
                  {new Date(b.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  {b.pickup_time && <span className="text-yellow"> · {fmtTime12(b.pickup_time)}</span>}
                </p>
              </div>
              <div>
                <p className="font-bebas text-muted text-[9px] tracking-[0.2em]">RETURN</p>
                <p className="font-dm text-offwhite text-xs mt-0.5">
                  {new Date(b.end_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  {b.return_time && <span className="text-yellow"> · {fmtTime12(b.return_time)}</span>}
                </p>
              </div>
              <div>
                <p className="font-bebas text-muted text-[9px] tracking-[0.2em]">DURATION</p>
                <p className="font-dm text-offwhite text-xs mt-0.5">
                  {b.days} day{b.days !== 1 ? "s" : ""}
                </p>
              </div>
              {b.total_price && (
                <div>
                  <p className="font-bebas text-muted text-[9px] tracking-[0.2em]">ESTIMATED</p>
                  <p className="font-dm text-yellow text-xs font-bold mt-0.5">{b.total_price}</p>
                </div>
              )}
            </div>

            {/* Contact */}
            <div className="flex flex-wrap gap-x-5 gap-y-1.5">
              {b.email && (
                <a
                  href={`mailto:${b.email}`}
                  className="flex items-center gap-1.5 text-xs font-dm text-muted hover:text-yellow transition-colors"
                >
                  <Mail size={11} /> {b.email}
                </a>
              )}
              {b.phone && (
                <a
                  href={`https://wa.me/${b.phone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs font-dm text-muted hover:text-yellow transition-colors"
                >
                  <Phone size={11} /> {b.phone}
                </a>
              )}
            </div>

            <BookingReceiptLink
              id={b.id}
              kind="vehicle"
              hasReceipt={!!b.payment_receipt_path}
              reportedAt={b.payment_reported_at}
            />

            {b.message && (
              <p className="text-offwhite/60 font-dm text-xs leading-relaxed border-t border-[#2a2a2a] pt-3">
                {b.message}
              </p>
            )}

            {/* ── M91: the availability decision ──────────────────────────
                The two buttons that replace confirming a vehicle he has not
                checked. Approve RESERVES it and emails a pay link with a
                deadline; Not available emails the customer straight away with
                his reason. Shown only while the answer is still open — once a
                booking is paid or cancelled there is nothing to decide. */}
            {(b.status === "pending" || b.status === "approved") && (
              <AvailabilityDecision
                booking={b}
                busy={updating === b.id}
                onDone={load}
              />
            )}

            {/* Status actions */}
            <div className="flex items-center gap-2 pt-2 flex-wrap">
              <p className="font-bebas text-muted text-[9px] tracking-[0.2em] mr-1">UPDATE STATUS:</p>
              {(["pending", "approved", "confirmed", "cancelled", "completed"] as const).map((s) => {
                const cfg = STATUS_CONFIG[s];
                return (
                  <button
                    key={s}
                    disabled={b.status === s || updating === b.id}
                    onClick={() => updateStatus(b.id, s)}
                    className={`flex items-center gap-1.5 font-bebas text-[9px] tracking-[0.12em] border px-2.5 py-1 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      b.status === s ? cfg.cls : "border-[#2a2a2a] text-muted/60 hover:border-yellow/40 hover:text-yellow"
                    }`}
                  >
                    {updating === b.id ? <Loader2 size={10} className="animate-spin" /> : <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />}
                    {cfg.label}
                  </button>
                );
              })}
              {/* Delete — clear once a booking is completed or cancelled */}
              <button
                disabled={updating === b.id}
                onClick={() => deleteBooking(b.id)}
                title="Delete this booking permanently"
                className="flex items-center gap-1.5 font-bebas text-[9px] tracking-[0.12em] border border-red-500/30 text-red-400/80 px-2.5 py-1 rounded-full transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed ml-auto"
              >
                <Trash2 size={10} /> Delete
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Stay · Eat · Do reservations manager ────────────────────────────────────────

function PlaceBookingsManager() {
  const [rows, setRows] = useState<PlaceBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | PlaceBooking["status"]>("all");
  const [q, setQ] = useState("");

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/admin/place-bookings");
      if (!res.ok) throw new Error();
      setRows(await res.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    setUpdating(id);
    try {
      const ok = await adminWrite("/api/admin/place-bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!ok) return;
      setRows((prev) => prev.map((b) => (b.id === id ? { ...b, status: status as PlaceBooking["status"] } : b)));
    } finally {
      setUpdating(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this reservation permanently? This cannot be undone.")) return;
    setUpdating(id);
    try {
      const res = await fetch("/api/admin/place-bookings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) setRows((prev) => prev.filter((b) => b.id !== id));
    } finally {
      setUpdating(null);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading)
    return <div className="flex items-center justify-center py-20"><Loader2 size={28} className="text-yellow animate-spin" /></div>;

  if (error)
    return (
      <div className="text-center py-20">
        <p className="text-red-400 font-dm text-sm mb-4">Failed to load reservations.</p>
        <button onClick={load} className="flex items-center gap-2 text-yellow font-dm text-sm mx-auto"><RefreshCw size={14} /> Try again</button>
      </div>
    );

  if (rows.length === 0)
    return (
      <div className="text-center py-20">
        <BedDouble size={36} className="text-muted/30 mx-auto mb-4" />
        <p className="text-muted/50 font-dm text-sm">No Stay·Eat·Do reservations yet.</p>
        <p className="text-muted/30 font-dm text-xs mt-1">Enable “On-site booking” on a listing in Stay·Eat·Do to take reservations.</p>
      </div>
    );

  const query = q.trim().toLowerCase();
  const shown = rows.filter((b) => {
    if (filter !== "all" && b.status !== filter) return false;
    if (!query) return true;
    return (
      b.name.toLowerCase().includes(query) ||
      b.place_name.toLowerCase().includes(query) ||
      (b.email ?? "").toLowerCase().includes(query) ||
      (b.phone ?? "").toLowerCase().includes(query)
    );
  });
  const counts = { all: rows.length } as Record<string, number>;
  for (const b of rows) counts[b.status] = (counts[b.status] ?? 0) + 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(["all", "pending", "confirmed", "completed", "cancelled"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`font-bebas text-[10px] tracking-[0.12em] px-3 py-1.5 rounded-full border transition-colors ${
                filter === f ? "bg-yellow text-dark border-yellow" : "border-[#2a2a2a] text-muted/70 hover:border-yellow/40 hover:text-yellow"
              }`}
            >
              {f.toUpperCase()} ({counts[f] ?? 0})
            </button>
          ))}
        </div>
        <button onClick={load} className="flex items-center gap-1.5 text-muted/50 hover:text-yellow font-dm text-xs transition-colors"><RefreshCw size={12} /> Refresh</button>
      </div>
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name, place, email, phone…"
        className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-sm text-offwhite font-dm placeholder:text-muted/40 focus:border-yellow focus:outline-none transition-colors"
      />

      {shown.length === 0 ? (
        <p className="text-muted/40 font-dm text-sm text-center py-10">No reservations match your filter.</p>
      ) : shown.map((b) => {
        const sc = STATUS_CONFIG[b.status] ?? STATUS_CONFIG.pending;
        const sameDay = b.start_date === b.end_date;
        return (
          <div key={b.id} className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="font-syne font-bold text-offwhite text-sm">{b.name}</p>
                <p className="font-bebas text-muted text-[10px] tracking-[0.2em] mt-0.5">
                  {new Date(b.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`flex items-center gap-1.5 font-bebas text-[10px] tracking-[0.15em] border px-3 py-1 rounded-full ${sc.cls}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />{sc.label}
                </span>
                <span className="font-bebas text-[10px] tracking-[0.15em] bg-yellow/10 text-yellow px-2.5 py-1 rounded-full">{b.place_name}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <p className="font-bebas text-muted text-[9px] tracking-[0.2em]">{sameDay ? "DATE" : "FROM"}</p>
                <p className="font-dm text-offwhite text-xs mt-0.5">{new Date(b.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>
              </div>
              {!sameDay && (
                <div>
                  <p className="font-bebas text-muted text-[9px] tracking-[0.2em]">TO</p>
                  <p className="font-dm text-offwhite text-xs mt-0.5">{new Date(b.end_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>
                </div>
              )}
              {b.time_slot && (
                <div>
                  <p className="font-bebas text-muted text-[9px] tracking-[0.2em]">TIME</p>
                  <p className="font-dm text-offwhite text-xs mt-0.5">{b.time_slot}</p>
                </div>
              )}
              {b.quantity > 0 && (
                <div>
                  <p className="font-bebas text-muted text-[9px] tracking-[0.2em]">
                    {b.category === "hotel" ? "ROOMS" : b.category === "restaurant" ? "PARTY" : "PEOPLE"}
                  </p>
                  <p className="font-dm text-offwhite text-xs mt-0.5">{b.quantity}</p>
                </div>
              )}
              {b.guests != null && (
                <div>
                  <p className="font-bebas text-muted text-[9px] tracking-[0.2em]">GUESTS</p>
                  <p className="font-dm text-offwhite text-xs mt-0.5">{b.guests}</p>
                </div>
              )}
              {b.category && (
                <div>
                  <p className="font-bebas text-muted text-[9px] tracking-[0.2em]">TYPE</p>
                  <p className="font-dm text-offwhite text-xs mt-0.5 capitalize">{b.category}</p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-dm text-muted">
              {b.email && <a href={`mailto:${b.email}`} className="hover:text-yellow transition-colors flex items-center gap-1"><Mail size={11} /> {b.email}</a>}
              {b.phone && <a href={`https://wa.me/${b.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="hover:text-yellow transition-colors flex items-center gap-1"><MessageSquare size={11} /> {b.phone}</a>}
            </div>
            {b.message && <p className="font-dm text-muted/80 text-xs bg-dark border border-[#2a2a2a] rounded-lg p-3">{b.message}</p>}

            <BookingReceiptLink
              id={b.id}
              kind="place"
              hasReceipt={!!b.payment_receipt_path}
              reportedAt={b.payment_reported_at}
            />

            <div className="flex items-center gap-2 pt-2 flex-wrap">
              <p className="font-bebas text-muted text-[9px] tracking-[0.2em] mr-1">UPDATE STATUS:</p>
              {(["pending", "confirmed", "cancelled", "completed"] as const).map((s) => {
                const cfg = STATUS_CONFIG[s];
                return (
                  <button
                    key={s}
                    disabled={b.status === s || updating === b.id}
                    onClick={() => updateStatus(b.id, s)}
                    className={`flex items-center gap-1.5 font-bebas text-[9px] tracking-[0.12em] border px-2.5 py-1 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      b.status === s ? cfg.cls : "border-[#2a2a2a] text-muted/60 hover:border-yellow/40 hover:text-yellow"
                    }`}
                  >
                    {updating === b.id ? <Loader2 size={10} className="animate-spin" /> : <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />}
                    {cfg.label}
                  </button>
                );
              })}
              <button
                disabled={updating === b.id}
                onClick={() => remove(b.id)}
                title="Delete this reservation permanently"
                className="flex items-center gap-1.5 font-bebas text-[9px] tracking-[0.12em] border border-red-500/30 text-red-400/80 px-2.5 py-1 rounded-full transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed ml-auto"
              >
                <Trash2 size={10} /> Delete
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Map locations editor ───────────────────────────────────────────────────────

const CATEGORIES: MapLocation["category"][] = [
  "beach", "viewpoint", "restaurant", "landmark", "activity", "gas", "shop",
];

function MapEditor({
  content,
  onChange,
}: {
  content: SiteContent;
  onChange: (c: SiteContent) => void;
}) {
  function updateLoc(idx: number, patch: Partial<MapLocation>) {
    const mapLocations = content.mapLocations.map((l, i) =>
      i === idx ? { ...l, ...patch } : l
    );
    onChange({ ...content, mapLocations });
  }

  function addLoc() {
    const newLoc: MapLocation = {
      id: `loc-${Date.now()}`,
      name: "New Location",
      description: "Add a description.",
      category: "landmark",
      lat: -19.7,
      lng: 63.41,
    };
    onChange({ ...content, mapLocations: [...content.mapLocations, newLoc] });
  }

  function removeLoc(idx: number) {
    onChange({
      ...content,
      mapLocations: content.mapLocations.filter((_, i) => i !== idx),
    });
  }

  return (
    <div className="space-y-6">
      <p className="text-muted/70 font-dm text-xs leading-relaxed">
        Add, edit or remove points of interest shown on the Island Guide map. Coordinates use
        decimal degrees (e.g. latitude <strong className="text-offwhite">-19.6811</strong>,
        longitude <strong className="text-offwhite">63.4147</strong>).
      </p>

      {content.mapLocations.map((loc, idx) => (
        <div
          key={loc.id}
          className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <p className="font-bebas text-yellow text-xs tracking-[0.3em]">
              LOCATION {idx + 1} — {loc.name}
            </p>
            <button
              type="button"
              onClick={() => removeLoc(idx)}
              className="flex items-center gap-1.5 text-xs font-dm text-muted/60 hover:text-red-400 transition-colors"
            >
              <Trash2 size={12} /> Remove
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="NAME">
              <TextInput
                value={loc.name}
                onChange={(v) => updateLoc(idx, { name: v })}
                placeholder="e.g. Pointe Cotton"
              />
              <div className="mt-2"><TransFields base={loc.name} fr={loc.nameFr} cr={loc.nameCr} onFr={(v) => updateLoc(idx, { nameFr: v })} onCr={(v) => updateLoc(idx, { nameCr: v })} /></div>
            </Field>
            <Field label="CATEGORY">
              <select
                value={loc.category}
                onChange={(e) =>
                  updateLoc(idx, { category: e.target.value as MapLocation["category"] })
                }
                className={`${inputCls} appearance-none`}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="LATITUDE">
              <TextInput
                value={String(loc.lat)}
                onChange={(v) => {
                  // parseFloat("-") is NaN and `|| 0` turned it into 0, so the
                  // minus never survived — and Rodrigues sits at -19.7, so no
                  // valid latitude could be typed at all. Ignore text that is
                  // not yet a number instead of overwriting with zero.
                  const n = Number(v.trim());
                  if (v.trim() !== "" && Number.isFinite(n)) updateLoc(idx, { lat: n });
                }}
                placeholder="-19.6811"
              />
            </Field>
            <Field label="LONGITUDE">
              <TextInput
                value={String(loc.lng)}
                onChange={(v) => {
                  const n = Number(v.trim());
                  if (v.trim() !== "" && Number.isFinite(n)) updateLoc(idx, { lng: n });
                }}
                placeholder="63.4147"
              />
            </Field>
          </div>

          <Field label="DESCRIPTION">
            <Textarea
              value={loc.description}
              onChange={(v) => updateLoc(idx, { description: v })}
              rows={2}
            />
            <div className="mt-2"><TransFields base={loc.description} fr={loc.descriptionFr} cr={loc.descriptionCr} onFr={(v) => updateLoc(idx, { descriptionFr: v })} onCr={(v) => updateLoc(idx, { descriptionCr: v })} textarea rows={2} /></div>
          </Field>

          <Field label="TI ROULÉ'S STORY (optional)">
            <Textarea
              value={loc.story ?? ""}
              onChange={(v) => updateLoc(idx, { story: v })}
              rows={3}
            />
            <p className="text-muted/50 text-[11px] font-dm mt-1">A short, warm story or history for this place — shown as a “Ti Roulé's story” you can expand and hear read aloud on the Island Guide.</p>
            <div className="mt-2"><TransFields base={loc.story ?? ""} fr={loc.storyFr} cr={loc.storyCr} onFr={(v) => updateLoc(idx, { storyFr: v })} onCr={(v) => updateLoc(idx, { storyCr: v })} textarea rows={3} /></div>
          </Field>

          <MultiImagePicker
            label="PHOTOS (gallery shown when the dot is clicked)"
            hint="Add as many angles as you like — the first photo is the cover shown in the location list."
            images={loc.images ?? (loc.image ? [loc.image] : [])}
            onChange={(imgs) => updateLoc(idx, { images: imgs, image: imgs[0] ?? "" })}
          />
        </div>
      ))}

      <button
        type="button"
        onClick={addLoc}
        className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-[#2a2a2a] hover:border-yellow/50 text-muted/60 hover:text-yellow rounded-2xl py-5 text-sm font-dm transition-colors"
      >
        <Plus size={16} /> Add Location
      </button>
    </div>
  );
}

// ── Trip Planner activities editor ──────────────────────────────────────────────

const PLANNER_TYPES: PlannerActivity["type"][] = ["beach", "culture", "adventure", "viewpoint", "food"];
const PLANNER_SLOTS: PlannerActivity["slot"][] = ["morning", "lunch", "afternoon", "evening"];

function PlannerEditor({
  content,
  onChange,
}: {
  content: SiteContent;
  onChange: (c: SiteContent) => void;
}) {
  const activities = content.plannerActivities ?? [];

  function update(idx: number, patch: Partial<PlannerActivity>) {
    onChange({
      ...content,
      plannerActivities: activities.map((a, i) => (i === idx ? { ...a, ...patch } : a)),
    });
  }
  function add() {
    const newAct: PlannerActivity = {
      id: `place-${Date.now()}`,
      name: "New Place",
      emoji: "📍",
      type: "beach",
      slot: "morning",
      duration: "1–2 hrs",
      description: "",
      tip: "",
      image: "",
    };
    onChange({ ...content, plannerActivities: [...activities, newAct] });
  }
  function remove(idx: number) {
    onChange({ ...content, plannerActivities: activities.filter((_, i) => i !== idx) });
  }

  return (
    <div className="space-y-6">
      <p className="text-muted/70 font-dm text-xs leading-relaxed">
        These are the real Rodrigues places the AI Trip Planner arranges into day-by-day itineraries.
        Edit the names, descriptions and tips, and add a photo to each — the planner still builds the
        schedule automatically based on the visitor&apos;s days and interests.
      </p>

      {activities.map((act, idx) => (
        <div key={act.id} className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-bebas text-yellow text-xs tracking-[0.3em]">
              {act.emoji} {act.name || `PLACE ${idx + 1}`}
            </p>
            <button
              type="button"
              onClick={() => remove(idx)}
              className="flex items-center gap-1.5 text-xs font-dm text-muted/60 hover:text-red-400 transition-colors"
            >
              <Trash2 size={12} /> Remove
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="NAME">
              <TextInput value={act.name} onChange={(v) => update(idx, { name: v })} placeholder="e.g. Trou d'Argent Beach" />
              <div className="mt-2"><TransFields base={act.name} fr={act.nameFr} cr={act.nameCr} onFr={(v) => update(idx, { nameFr: v })} onCr={(v) => update(idx, { nameCr: v })} /></div>
            </Field>
            <Field label="CATEGORY">
              <select
                value={act.type}
                onChange={(e) => update(idx, { type: e.target.value as PlannerActivity["type"] })}
                className={`${inputCls} appearance-none`}
              >
                {PLANNER_TYPES.map((tp) => (
                  <option key={tp} value={tp}>{tp.charAt(0).toUpperCase() + tp.slice(1)}</option>
                ))}
              </select>
            </Field>
            <Field label="TIME OF DAY">
              <select
                value={act.slot}
                onChange={(e) => update(idx, { slot: e.target.value as PlannerActivity["slot"] })}
                className={`${inputCls} appearance-none`}
              >
                {PLANNER_SLOTS.map((sl) => (
                  <option key={sl} value={sl}>{sl.charAt(0).toUpperCase() + sl.slice(1)}</option>
                ))}
              </select>
            </Field>
            <Field label="DURATION">
              <TextInput value={act.duration} onChange={(v) => update(idx, { duration: v })} placeholder="e.g. 2–3 hrs" />
            </Field>
          </div>

          <Field label="DESCRIPTION">
            <Textarea value={act.description} onChange={(v) => update(idx, { description: v })} rows={2} />
            <div className="mt-2"><TransFields base={act.description} fr={act.descriptionFr} cr={act.descriptionCr} onFr={(v) => update(idx, { descriptionFr: v })} onCr={(v) => update(idx, { descriptionCr: v })} textarea rows={2} /></div>
          </Field>
          <Field label="INSIDER TIP">
            <Textarea value={act.tip} onChange={(v) => update(idx, { tip: v })} rows={2} />
            <div className="mt-2"><TransFields base={act.tip} fr={act.tipFr} cr={act.tipCr} onFr={(v) => update(idx, { tipFr: v })} onCr={(v) => update(idx, { tipCr: v })} textarea rows={2} /></div>
          </Field>

          <MultiImagePicker
            label="PHOTOS (shown in the itinerary)"
            hint="The first is the cover. Tapping it opens the rest."
            images={act.images?.length ? act.images : act.image ? [act.image] : []}
            onChange={(imgs) => update(idx, { images: imgs, image: imgs[0] ?? "" })}
          />
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-[#2a2a2a] hover:border-yellow/50 text-muted/60 hover:text-yellow rounded-2xl py-5 text-sm font-dm transition-colors"
      >
        <Plus size={16} /> Add Place
      </button>

      <p className="text-muted/50 text-xs font-dm">
        Category and time-of-day help the planner slot each place correctly (e.g. a beach in the morning,
        a viewpoint at sunset). Click Save Changes to publish.
      </p>
    </div>
  );
}

// ── Ride Routes editor ──────────────────────────────────────────────────────────

const ROUTE_DIFFICULTY: RideRoute["difficulty"][] = ["Easy", "Moderate", "Advanced"];

function RideRoutesEditor({
  content,
  onChange,
}: {
  content: SiteContent;
  onChange: (c: SiteContent) => void;
}) {
  const routes = content.rideRoutes ?? [];

  function update(idx: number, patch: Partial<RideRoute>) {
    onChange({ ...content, rideRoutes: routes.map((r, i) => (i === idx ? { ...r, ...patch } : r)) });
  }
  function add() {
    const newRoute: RideRoute = {
      id: `route-${Date.now()}`,
      name: "New Route",
      description: "",
      distance: "20 km",
      duration: "2 hrs",
      difficulty: "Easy",
      stops: "",
      mapsUrl: "",
      image: "",
    };
    onChange({ ...content, rideRoutes: [...routes, newRoute] });
  }
  function remove(idx: number) {
    onChange({ ...content, rideRoutes: routes.filter((_, i) => i !== idx) });
  }

  return (
    <div className="space-y-6">
      <p className="text-muted/70 font-dm text-xs leading-relaxed">
        Curated scenic routes shown on the website. Each card links straight to Google Maps. List stops
        one per line. Tip: open the route in Google Maps, copy the share link, and paste it below.
      </p>

      {routes.map((r, idx) => (
        <div key={r.id} className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <p className="font-bebas text-yellow text-xs tracking-[0.3em]">{(r.kind ?? "ride") === "hike" ? "TRAIL" : "ROUTE"} {idx + 1} — {r.name}</p>
              {r.featured && (
                <span className="flex items-center gap-1 font-bebas text-[9px] tracking-[0.15em] bg-yellow/10 text-yellow border border-yellow/30 px-2 py-0.5 rounded-full">
                  <Star size={8} className="fill-yellow" /> FEATURED
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => update(idx, { featured: !r.featured })}
                className={`flex items-center gap-1.5 text-xs font-dm px-3 py-1.5 rounded-full border transition-colors ${r.featured ? "border-yellow/40 text-yellow bg-yellow/10" : "border-[#2a2a2a] text-muted/60 hover:border-yellow/30 hover:text-yellow"}`}
              >
                <Star size={11} /> {r.featured ? "Featured" : "Feature"}
              </button>
              <button
                type="button"
                onClick={() => remove(idx)}
                className="flex items-center gap-1.5 text-xs font-dm text-muted/60 hover:text-red-400 transition-colors"
              >
                <Trash2 size={12} /> Remove
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="NAME">
              <TextInput value={r.name} onChange={(v) => update(idx, { name: v })} placeholder="e.g. Sunset Coastal Loop" />
              <div className="mt-2">
                <TransFields base={r.name} fr={r.nameFr} cr={r.nameCr} onFr={(v) => update(idx, { nameFr: v })} onCr={(v) => update(idx, { nameCr: v })} />
              </div>
            </Field>
            <Field label="TYPE">
              <select
                value={r.kind ?? "ride"}
                onChange={(e) => update(idx, { kind: e.target.value as RideRoute["kind"] })}
                className={`${inputCls} appearance-none`}
              >
                <option value="ride">Scooter ride</option>
                <option value="hike">Hiking or adventure trail</option>
              </select>
            </Field>
            <Field label="DIFFICULTY">
              <select
                value={r.difficulty}
                onChange={(e) => update(idx, { difficulty: e.target.value as RideRoute["difficulty"] })}
                className={`${inputCls} appearance-none`}
              >
                {ROUTE_DIFFICULTY.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </Field>
            <Field label="DISTANCE">
              <TextInput value={r.distance} onChange={(v) => update(idx, { distance: v })} placeholder="e.g. 34 km" />
            </Field>
            <Field label="DURATION">
              <TextInput value={r.duration} onChange={(v) => update(idx, { duration: v })} placeholder="e.g. 2–3 hrs" />
            </Field>
          </div>

          <Field label="DESCRIPTION">
            <Textarea value={r.description} onChange={(v) => update(idx, { description: v })} rows={2} />
            <div className="mt-2">
              <TransFields base={r.description} fr={r.descriptionFr} cr={r.descriptionCr} onFr={(v) => update(idx, { descriptionFr: v })} onCr={(v) => update(idx, { descriptionCr: v })} textarea rows={2} />
            </div>
          </Field>
          <Field label="STOPS (one per line)">
            <Textarea value={r.stops} onChange={(v) => update(idx, { stops: v })} rows={4} />
          </Field>
          <Field label="GOOGLE MAPS LINK">
            <TextInput value={r.mapsUrl} onChange={(v) => update(idx, { mapsUrl: v })} placeholder="https://maps.google.com/..." />
          </Field>

          <MultiImagePicker
            label="ROUTE PHOTOS"
            hint="The first is the cover shown on the card. Add the viewpoints along the way."
            images={r.images?.length ? r.images : r.image ? [r.image] : []}
            onChange={(imgs) => update(idx, { images: imgs, image: imgs[0] ?? "" })}
          />
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-[#2a2a2a] hover:border-yellow/50 text-muted/60 hover:text-yellow rounded-2xl py-5 text-sm font-dm transition-colors"
      >
        <Plus size={16} /> Add Route
      </button>

      <p className="text-muted/50 text-xs font-dm">Click Save Changes to publish your routes.</p>
    </div>
  );
}

// ── Useful contacts editor ──────────────────────────────────────────────────────

const CONTACT_CATS: UsefulContact["category"][] = ["emergency", "taxi", "other"];

function UsefulContactsEditor({
  content,
  onChange,
}: {
  content: SiteContent;
  onChange: (c: SiteContent) => void;
}) {
  const list = content.usefulContacts ?? [];
  const set = (next: UsefulContact[]) => onChange({ ...content, usefulContacts: next });
  const update = (i: number, patch: Partial<UsefulContact>) =>
    set(list.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const add = () =>
    set([...list, { id: `uc-${Date.now()}`, category: "taxi", label: "", number: "", note: "" }]);
  const remove = (i: number) => set(list.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-4">
      <p className="text-muted/70 font-dm text-xs leading-relaxed">
        Emergency, taxi and other useful contacts. These show on the website grouped by type, each as a
        tap-to-call number. Entries with a placeholder number (XXXX) stay hidden until you set a real one.
      </p>
      {list.map((c, i) => (
        <div key={c.id} className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-bebas text-yellow text-xs tracking-[0.3em]">{c.label || "CONTACT"}</p>
            <button type="button" onClick={() => remove(i)} className="flex items-center gap-1.5 text-xs font-dm text-muted/60 hover:text-red-400 transition-colors">
              <Trash2 size={12} /> Remove
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="TYPE">
              <select value={c.category} onChange={(e) => update(i, { category: e.target.value as UsefulContact["category"] })} className={`${inputCls} appearance-none`}>
                {CONTACT_CATS.map((cat) => (
                  <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
                ))}
              </select>
            </Field>
            <Field label="LABEL">
              <TextInput value={c.label} onChange={(v) => update(i, { label: v })} placeholder="e.g. Police, Taxi Jean" />
            </Field>
            <Field label="NUMBER">
              <TextInput value={c.number} onChange={(v) => update(i, { number: v })} placeholder="e.g. 999 or +230 5XXX XXXX" />
            </Field>
            <Field label="NOTE (optional)">
              <TextInput value={c.note ?? ""} onChange={(v) => update(i, { note: v })} placeholder="e.g. 24/7, Port Mathurin" />
            </Field>
          </div>
        </div>
      ))}
      <button type="button" onClick={add} className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-[#2a2a2a] hover:border-yellow/50 text-muted/60 hover:text-yellow rounded-2xl py-5 text-sm font-dm transition-colors">
        <Plus size={16} /> Add Contact
      </button>
      <p className="text-muted/50 text-xs font-dm">Click Save Changes to publish.</p>
    </div>
  );
}

// ── Stay · Eat · Do (Recommended places) editor ───────────────────────────────────

const RECOMMENDED_CATEGORIES: RecommendedPlace["category"][] = ["hotel", "restaurant", "activity"];
const RECOMMENDED_LABEL: Record<RecommendedPlace["category"], string> = {
  hotel: "Hotel or guesthouse",
  restaurant: "Restaurant",
  activity: "Activity",
};

function RecommendedEditor({
  content,
  onChange,
}: {
  content: SiteContent;
  onChange: (c: SiteContent) => void;
}) {
  const rec = content.recommended;
  const set = (patch: Partial<typeof rec>) => onChange({ ...content, recommended: { ...rec, ...patch } });
  const updateItem = (i: number, patch: Partial<RecommendedPlace>) =>
    set({ items: rec.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) });
  const addItem = () =>
    set({ items: [...rec.items, { id: `rec-${Date.now()}`, category: "hotel", name: "", description: "", image: "" }] });
  const removeItem = (i: number) => set({ items: rec.items.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-5">
        <div>
          <p className="font-syne font-bold text-offwhite text-sm">Show Accommodations &amp; Activities</p>
          <p className="text-muted/60 text-xs font-dm mt-0.5">Individual Accommodation and Activity tiles on the homepage hub. (Restaurants are handled by the Food Concierge.)</p>
        </div>
        <button
          type="button"
          onClick={() => set({ enabled: !rec.enabled })}
          className="text-muted/60 hover:text-yellow transition-colors"
          title={rec.enabled ? "Visible" : "Hidden"}
        >
          {rec.enabled ? <ToggleRight size={26} className="text-green-400" /> : <ToggleLeft size={26} />}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Field label="SECTION TITLE">
          <TextInput value={rec.title} onChange={(v) => set({ title: v })} />
        </Field>
        <Field label="SUBTITLE">
          <TextInput value={rec.subtitle} onChange={(v) => set({ subtitle: v })} />
        </Field>
      </div>

      {rec.items.map((it, i) => (
        <div key={it.id} className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="font-bebas text-yellow text-xs tracking-[0.3em]">{it.name || `PLACE ${i + 1}`}</p>
              {it.featured && (
                <span className="flex items-center gap-1 font-bebas text-[9px] tracking-[0.15em] bg-yellow/10 text-yellow border border-yellow/30 px-2 py-0.5 rounded-full">
                  <Star size={8} className="fill-yellow" /> SPONSORED
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => updateItem(i, { featured: !it.featured })}
                className={`flex items-center gap-1.5 text-xs font-dm px-3 py-1.5 rounded-full border transition-colors ${it.featured ? "border-yellow/40 text-yellow bg-yellow/10" : "border-[#2a2a2a] text-muted/60 hover:border-yellow/30 hover:text-yellow"}`}
              >
                <Star size={11} /> {it.featured ? "Sponsored" : "Make sponsored"}
              </button>
              <button type="button" onClick={() => removeItem(i)} className="flex items-center gap-1.5 text-xs font-dm text-muted/60 hover:text-red-400 transition-colors">
                <Trash2 size={12} /> Remove
              </button>
            </div>
          </div>
          {/* Leftovers from a listing that used to be a massage/fishing/boat
              service. They are invisible on the site now, but they are still in
              the data and there is nowhere else to delete them from — this
              editor never had these fields, and the services editor only lists
              rows that still carry a service tag. */}
          {!it.serviceType && hasServiceLeftovers(it) && (
            <div className="rounded-xl border border-orange-400/25 bg-orange-400/[0.06] px-4 py-3">
              <p className="font-dm text-xs text-orange-200">
                This listing still carries details that only belong to a massage, fishing trip or
                sea trip{describeLeftovers(it) ? ` — ${describeLeftovers(it)}` : ""}. They are not
                shown to customers.
              </p>
              <button
                type="button"
                onClick={() => updateItem(i, SERVICE_ONLY_CLEARED)}
                className="mt-2 rounded-lg border border-orange-400/40 px-3 py-1.5 font-dm text-xs text-orange-100 transition-colors hover:border-orange-300 hover:bg-orange-400/10"
              >
                Remove them
              </button>
            </div>
          )}

          <MultiImagePicker
            label="PHOTOS"
            hint="Add as many as you like. The first one is the cover — hover a photo to make it the cover or remove it."
            images={it.images?.length ? it.images : it.image ? [it.image] : []}
            onChange={(imgs) => updateItem(i, { images: imgs, image: imgs[0] ?? "" })}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="NAME">
              <TextInput value={it.name} onChange={(v) => updateItem(i, { name: v })} placeholder="e.g. Le Récif Hotel" />
            </Field>
            <Field label="CATEGORY">
              <select
                value={it.category}
                onChange={(e) => {
                  // Leaving "Activity" drops the service tag AND everything that
                  // only means something alongside it. Clearing the tag alone was
                  // not enough: a guesthouse kept "4h" and "up to 10" from when it
                  // was briefly an activity, and no editor anywhere could reach
                  // those fields to remove them — they live in the massage /
                  // fishing / boat screen, which lists nothing without a tag.
                  const category = e.target.value as RecommendedPlace["category"];
                  updateItem(i, {
                    category,
                    ...(category !== "activity" ? SERVICE_ONLY_CLEARED : {}),
                  });
                }}
                className={`${inputCls} appearance-none`}
              >
                {RECOMMENDED_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{RECOMMENDED_LABEL[c]}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="DESCRIPTION">
            <Textarea value={it.description} onChange={(v) => updateItem(i, { description: v })} rows={2} />
            <div className="mt-2">
              <TransFields base={it.description} fr={it.descriptionFr} cr={it.descriptionCr} onFr={(v) => updateItem(i, { descriptionFr: v })} onCr={(v) => updateItem(i, { descriptionCr: v })} textarea rows={2} />
            </div>
          </Field>
          <Field label="HIGHLIGHTS (comma-separated — shown in the detail view)">
            <TextInput
              value={(it.highlights ?? []).join(", ")}
              onChange={(v) => updateItem(i, { highlights: v.split(",").map((s) => s.trim()).filter(Boolean) })}
              placeholder="e.g. Sea view, Free breakfast, Pool, Air-con"
            />
          </Field>
          <Field label="WHATSAPP NUMBER (adds an enquiry button)">
            <TextInput value={it.whatsapp ?? ""} onChange={(v) => updateItem(i, { whatsapp: v })} placeholder="+230 5XXX XXXX" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="LINK (website or Google Maps, optional)">
              <TextInput value={it.link ?? ""} onChange={(v) => updateItem(i, { link: v })} placeholder="https://..." />
            </Field>
            <Field label="BUTTON TEXT (optional)">
              <TextInput value={it.linkText ?? ""} onChange={(v) => updateItem(i, { linkText: v })} placeholder="e.g. Book now, or View on map" />
            </Field>
          </div>
          {/* On-site reservations (live calendar) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center justify-between bg-dark border border-[#2a2a2a] rounded-xl px-4 py-3">
              <div>
                <p className="font-dm text-offwhite text-sm">On-site booking</p>
                <p className="text-muted/50 text-[11px] font-dm">
                  {it.category === "hotel"
                    ? "Date-range booking with a live rooms calendar"
                    : it.category === "restaurant"
                    ? "Table reservations by date + time slot"
                    : "Single-day booking with seats per date"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => updateItem(i, { bookable: !it.bookable })}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${it.bookable ? "bg-yellow" : "bg-[#2a2a2a]"}`}
                aria-label="Toggle on-site booking"
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${it.bookable ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
            {it.bookable && (
              <Field
                label={
                  it.category === "hotel"
                    ? "TOTAL ROOMS"
                    : it.category === "restaurant"
                    ? "SEATS PER TIME SLOT"
                    : "SPOTS PER DATE"
                }
              >
                <TextInput
                  value={it.capacity != null ? String(it.capacity) : ""}
                  onChange={(v) => updateItem(i, { capacity: parseInt(v) || undefined })}
                  placeholder="1"
                  type="number"
                />
              </Field>
            )}
          </div>
          {it.category === "activity" && (
            <div className="flex items-center justify-between gap-3 bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl px-4 py-3">
              <div>
                <p className="font-dm text-offwhite text-sm">Guided tour</p>
                <p className="text-muted/50 text-[11px] font-dm">Show under &ldquo;Guided Tours&rdquo; in the hub instead of Activities</p>
              </div>
              <button
                type="button"
                onClick={() => updateItem(i, { isTour: !it.isTour })}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${it.isTour ? "bg-yellow" : "bg-[#2a2a2a]"}`}
                aria-label="Toggle guided tour"
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${it.isTour ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
          )}
          {/* WHICH bookable service this is. This one field is what puts an
              activity into the massage / fishing / sea-trip marketplace at
              /experiences/*, all of which run on this same booking engine.
              Nothing is inferred from the name — guessing would file a
              restaurant called "The Boat House" under sea trips. */}
          {it.category === "activity" && (
            <Field label="SERVICE TYPE (puts it in its own marketplace at /experiences)">
              <select
                value={it.serviceType ?? ""}
                onChange={(e) =>
                  updateItem(i, { serviceType: (e.target.value || undefined) as typeof it.serviceType })
                }
                className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl px-4 py-3 font-dm text-sm text-offwhite focus:border-yellow/50 focus:outline-none"
              >
                <option value="">Not a listed service — stays in Stay·Eat·Do</option>
                <option value="massage">💆 Massage — /experiences/massage</option>
                <option value="fishing">🎣 Fishing trip — /experiences/fishing</option>
                <option value="boat">⛵ Sea trip — /experiences/boat</option>
              </select>
            </Field>
          )}
          {it.serviceType && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="DURATION (MINUTES)">
                <TextInput
                  value={it.durationMinutes != null ? String(it.durationMinutes) : ""}
                  onChange={(v) => updateItem(i, { durationMinutes: parseInt(v) || undefined })}
                  placeholder="e.g. 60 or 300"
                />
              </Field>
              <Field label="MAX GUESTS PER TRIP">
                <TextInput
                  value={it.maxGuests != null ? String(it.maxGuests) : ""}
                  onChange={(v) => updateItem(i, { maxGuests: parseInt(v) || undefined })}
                  placeholder="e.g. 6"
                />
              </Field>
            </div>
          )}
          {it.serviceType && (
            <Field label="WHO RUNS IT — captain, therapist or skipper (optional)">
              <TextInput
                value={it.providerName ?? ""}
                onChange={(v) => updateItem(i, { providerName: v })}
                placeholder="e.g. Captain Jean"
              />
            </Field>
          )}
          {it.bookable && it.category !== "hotel" && (
            <Field label="TIME SLOTS (comma-separated — leave blank for whole-day)">
              <TextInput
                value={(it.timeSlots ?? []).join(", ")}
                onChange={(v) => updateItem(i, { timeSlots: v.split(",").map((s) => s.trim()).filter(Boolean) })}
                placeholder="e.g. 12:30, 19:00, 20:30"
              />
            </Field>
          )}
          {it.bookable && (
            <Field label="PRICE NOTE (optional — shown in the booking form)">
              <TextInput value={it.priceNote ?? ""} onChange={(v) => updateItem(i, { priceNote: v })} placeholder="e.g. from Rs 2,500 / night" />
            </Field>
          )}
          {it.bookable && (
            <Field label="PRICE — PAID IN FULL TO CONFIRM (Rs — 0 or blank = request only, no online payment)">
              <TextInput
                value={it.depositAmount != null ? String(it.depositAmount) : ""}
                onChange={(v) => updateItem(i, { depositAmount: parseInt(v) || undefined })}
                placeholder="0"
                type="number"
              />
            </Field>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={addItem}
        className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-[#2a2a2a] hover:border-yellow/50 text-muted/60 hover:text-yellow rounded-2xl py-5 text-sm font-dm transition-colors"
      >
        <Plus size={16} /> Add Place
      </button>
      <p className="text-muted/50 text-xs font-dm">Click Save Changes to publish.</p>
    </div>
  );
}

// ── Massage · Fishing · Sea trips ───────────────────────────────────────────────
//
// The owner's words: "I JUST WANT TO BE ABLE TO ADD MASSAGE, FISH, SORTIES DE MER
// ON ADMIN BECAUSE IT WAS IMPOSSIBLE BEFORE."
//
// He was right, and the reason is worth writing down. Every field these services
// need already existed — but to reach them you had to open a section called
// "Accommodations & Activities", press "Add Place", change a category dropdown to
// "Activity", and only THEN did a "Service type" select appear. Nobody looking for
// "add a massage" would ever walk that path. The capability existed; the doorway
// did not.
//
// So this is a doorway, not a new engine. It writes into exactly the same
// content.recommended.items array, saved by the same Save Changes button, and
// therefore inherits the whole booking engine — per-date capacity, time slots,
// deposit-to-confirm, holds — that has run Stay·Eat·Do for months. Three buttons
// create a correctly-shaped item; every field is visible with no hidden
// conditionals.
//
// The split with the Stay·Eat·Do editor is by SERVICE TYPE: anything with one
// lives here, anything without lives there. Clearing the type in the header moves
// the item back, which is stated in the UI rather than left to be discovered.

const SERVICE_KINDS = [
  {
    key: "massage" as const,
    emoji: "💆",
    label: "Massage",
    blurb: "Therapist, treatment, duration, price",
    route: "/experiences/massage",
    defaults: { durationMinutes: 60, maxGuests: 1, capacity: 6 },
    placeholders: {
      name: "e.g. Massage relaxant aux huiles de coco",
      provider: "e.g. Marie-Claude",
      meeting: "e.g. At your hotel, or Cabinet Pointe Coton",
      included: "Oils, towels, 10 min consultation",
      slots: "09:00, 11:00, 14:00, 16:00",
    },
  },
  {
    key: "fishing" as const,
    emoji: "🎣",
    label: "Fishing trip",
    blurb: "Captain, boat, hours at sea, spots",
    route: "/experiences/fishing",
    defaults: { durationMinutes: 300, maxGuests: 6, capacity: 1 },
    placeholders: {
      name: "e.g. Sortie pêche au gros — demi-journée",
      provider: "e.g. Capitaine Jean-Noël",
      meeting: "e.g. Port Sud-Est jetty, by the fuel pump",
      included: "Rods, bait, ice box, water, licence",
      slots: "06:00, 13:00",
    },
  },
  {
    key: "boat" as const,
    emoji: "⛵",
    label: "Sortie de mer",
    blurb: "Boat trip, island hop, snorkelling",
    route: "/experiences/boat",
    defaults: { durationMinutes: 240, maxGuests: 10, capacity: 1 },
    placeholders: {
      name: "e.g. Sortie Île aux Cocos avec déjeuner",
      provider: "e.g. Skipper Rico",
      meeting: "e.g. Pointe Coton beach, in front of the hotel",
      included: "Boat, skipper, snorkel gear, lunch, drinks",
      slots: "08:30",
    },
  },
];

function ServicesEditor({
  content,
  onChange,
}: {
  content: SiteContent;
  onChange: (c: SiteContent) => void;
}) {
  const items = content.recommended.items;

  // Real indices, not filtered ones. Editing by position in a filtered list is
  // how you end up renaming a hotel while trying to edit a boat trip.
  const rows = items
    .map((it, index) => ({ it, index }))
    .filter((r) => !!r.it.serviceType);

  const setItems = (next: RecommendedPlace[]) =>
    onChange({ ...content, recommended: { ...content.recommended, items: next } });
  const update = (index: number, patch: Partial<RecommendedPlace>) =>
    setItems(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  const remove = (index: number) => setItems(items.filter((_, i) => i !== index));

  function add(kind: (typeof SERVICE_KINDS)[number]) {
    // Created ready to sell: an activity, bookable, with a sane capacity. The
    // owner should have to type a name and a price, not discover three toggles.
    setItems([
      ...items,
      {
        id: `svc-${Date.now()}`,
        category: "activity",
        serviceType: kind.key,
        name: "",
        description: "",
        image: "",
        images: [],
        bookable: true,
        ...kind.defaults,
      },
    ]);
  }

  return (
    <div className="space-y-6">
      <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-6">
        <p className="font-syne font-bold text-offwhite text-sm">Bookable services</p>
        <p className="text-muted/60 text-xs font-dm mt-1 leading-relaxed">
          Massages, fishing trips and sea trips. Each one gets its own page on the site and takes
          real bookings — the same calendar and deposits as your rentals. Pick what you are adding:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          {SERVICE_KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => add(k)}
              className="text-left bg-dark border border-[#2a2a2a] hover:border-yellow/60 rounded-xl px-4 py-3.5 transition-colors group"
            >
              <span className="text-xl">{k.emoji}</span>
              <span className="block font-dm text-sm text-offwhite group-hover:text-yellow mt-1">
                Add a {k.label.toLowerCase()}
              </span>
              <span className="block font-dm text-[11px] text-muted/60 mt-0.5">{k.blurb}</span>
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 && (
        <div className="border-2 border-dashed border-[#2a2a2a] rounded-2xl py-12 text-center">
          <p className="font-dm text-sm text-muted/70">Nothing added yet.</p>
          <p className="font-dm text-xs text-muted/50 mt-1">
            Use one of the three buttons above. Your first one takes about two minutes.
          </p>
        </div>
      )}

      {rows.map(({ it, index }) => {
        const kind = SERVICE_KINDS.find((k) => k.key === it.serviceType) ?? SERVICE_KINDS[0];
        const ph = kind.placeholders;
        return (
          <div key={it.id} className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-bebas text-yellow text-xs tracking-[0.3em]">
                {kind.emoji} {it.name || `${kind.label.toUpperCase()} — UNNAMED`}
              </p>
              <div className="flex items-center gap-3">
                <a
                  href={kind.route}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-dm text-muted/60 hover:text-yellow transition-colors"
                >
                  View page
                </a>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="flex items-center gap-1.5 text-xs font-dm text-muted/60 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={12} /> Remove
                </button>
              </div>
            </div>

            <MultiImagePicker
              label="PHOTOS"
              hint="Add as many as you like — the boat, the treatment room, a good catch. The first is the cover; hover a photo to change that or delete it."
              images={it.images?.length ? it.images : it.image ? [it.image] : []}
              onChange={(imgs) => update(index, { images: imgs, image: imgs[0] ?? "" })}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="NAME">
                <TextInput value={it.name} onChange={(v) => update(index, { name: v })} placeholder={ph.name} />
              </Field>
              <Field label="TYPE OF SERVICE">
                <select
                  value={it.serviceType ?? ""}
                  onChange={(e) =>
                    update(index, {
                      serviceType: (e.target.value || undefined) as RecommendedPlace["serviceType"],
                    })
                  }
                  className={`${inputCls} appearance-none`}
                >
                  {SERVICE_KINDS.map((k) => (
                    <option key={k.key} value={k.key}>
                      {k.emoji} {k.label}
                    </option>
                  ))}
                  <option value="">None — move to Accommodations &amp; Activities</option>
                </select>
              </Field>
            </div>

            <Field label="DESCRIPTION">
              <Textarea
                value={it.description}
                onChange={(v) => update(index, { description: v })}
                rows={3}
              />
              <div className="mt-2">
                <TransFields
                  base={it.description}
                  fr={it.descriptionFr}
                  cr={it.descriptionCr}
                  onFr={(v) => update(index, { descriptionFr: v })}
                  onCr={(v) => update(index, { descriptionCr: v })}
                  textarea
                  rows={2}
                />
              </div>
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="WHO RUNS IT (captain, therapist, skipper)">
                <TextInput
                  value={it.providerName ?? ""}
                  onChange={(v) => update(index, { providerName: v })}
                  placeholder={ph.provider}
                />
              </Field>
              <Field label="WHERE TO MEET">
                <TextInput
                  value={it.meetingPoint ?? ""}
                  onChange={(v) => update(index, { meetingPoint: v })}
                  placeholder={ph.meeting}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Field label="HOW LONG (MINUTES)">
                <TextInput
                  type="number"
                  value={it.durationMinutes != null ? String(it.durationMinutes) : ""}
                  onChange={(v) => update(index, { durationMinutes: parseInt(v) || undefined })}
                  placeholder="60"
                />
              </Field>
              <Field label="PEOPLE PER TRIP">
                <TextInput
                  type="number"
                  value={it.maxGuests != null ? String(it.maxGuests) : ""}
                  onChange={(v) => update(index, { maxGuests: parseInt(v) || undefined })}
                  placeholder="6"
                />
              </Field>
              <Field label="TRIPS PER DAY">
                <TextInput
                  type="number"
                  value={it.capacity != null ? String(it.capacity) : ""}
                  onChange={(v) => update(index, { capacity: parseInt(v) || undefined })}
                  placeholder="1"
                />
              </Field>
            </div>

            <Field label="PRICE (shown on the card and in the booking form)">
              <TextInput
                value={it.priceNote ?? ""}
                onChange={(v) => update(index, { priceNote: v })}
                placeholder="e.g. Rs 1,200 per person"
              />
            </Field>

            <Field label="WHAT IS INCLUDED (separate with commas)">
              <TextInput
                value={(it.included ?? []).join(", ")}
                onChange={(v) =>
                  update(index, { included: v.split(",").map((x) => x.trim()).filter(Boolean) })
                }
                placeholder={ph.included}
              />
            </Field>

            <Field label="GOOD TO KNOW (separate with commas)">
              <TextInput
                value={(it.highlights ?? []).join(", ")}
                onChange={(v) =>
                  update(index, { highlights: v.split(",").map((x) => x.trim()).filter(Boolean) })
                }
                placeholder="e.g. Bring a hat, Not for under 6s, Cancel free 24h before"
              />
            </Field>

            <Field label="START TIMES (separate with commas — leave empty for all day)">
              <TextInput
                value={(it.timeSlots ?? []).join(", ")}
                onChange={(v) =>
                  update(index, { timeSlots: v.split(",").map((x) => x.trim()).filter(Boolean) })
                }
                placeholder={ph.slots}
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="PRICE — PAID IN FULL TO CONFIRM (Rs — leave 0 for request only)">
                <TextInput
                  type="number"
                  value={it.depositAmount != null ? String(it.depositAmount) : ""}
                  onChange={(v) => update(index, { depositAmount: parseInt(v) || undefined })}
                  placeholder="0"
                />
              </Field>
              <Field label="WHATSAPP (optional — adds an enquiry button)">
                <TextInput
                  value={it.whatsapp ?? ""}
                  onChange={(v) => update(index, { whatsapp: v })}
                  placeholder="+230 5XXX XXXX"
                />
              </Field>
            </div>

            <div className="flex items-center justify-between bg-dark border border-[#2a2a2a] rounded-xl px-4 py-3">
              <div>
                <p className="font-dm text-offwhite text-sm">Take bookings online</p>
                <p className="text-muted/50 text-[11px] font-dm">
                  {it.bookable
                    ? "Customers pick a date and book on the site."
                    : "Off — the page shows the details but no booking form."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => update(index, { bookable: !it.bookable })}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${it.bookable ? "bg-yellow" : "bg-[#2a2a2a]"}`}
                aria-label="Toggle online booking"
              >
                <span
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${it.bookable ? "translate-x-6" : "translate-x-1"}`}
                />
              </button>
            </div>
          </div>
        );
      })}

      <p className="text-muted/50 text-xs font-dm">
        Click Save Changes to publish. Bookings arrive in <strong className="text-muted/70">Stay &amp; Activity Bookings</strong>.
      </p>
    </div>
  );
}

// ── FAQ editor ──────────────────────────────────────────────────────────────────

function FaqEditor({
  content,
  onChange,
}: {
  content: SiteContent;
  onChange: (c: SiteContent) => void;
}) {
  const faq = content.faq;
  const set = (patch: Partial<typeof faq>) => onChange({ ...content, faq: { ...faq, ...patch } });
  const updateItem = (i: number, patch: Partial<FaqItem>) =>
    set({ items: faq.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) });
  const addItem = () =>
    set({ items: [...faq.items, { id: `faq-${Date.now()}`, question: "", answer: "" }] });
  const removeItem = (i: number) => set({ items: faq.items.filter((_, idx) => idx !== i) });
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= faq.items.length) return;
    const next = [...faq.items];
    [next[i], next[j]] = [next[j], next[i]];
    set({ items: next });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-5">
        <div>
          <p className="font-syne font-bold text-offwhite text-sm">Show the FAQ section</p>
          <p className="text-muted/60 text-xs font-dm mt-0.5">Answers common questions and improves SEO (rich results).</p>
        </div>
        <button
          type="button"
          onClick={() => set({ enabled: !faq.enabled })}
          className="text-muted/60 hover:text-yellow transition-colors"
          title={faq.enabled ? "Visible" : "Hidden"}
        >
          {faq.enabled ? <ToggleRight size={26} className="text-green-400" /> : <ToggleLeft size={26} />}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Field label="SECTION TITLE">
          <TextInput value={faq.title} onChange={(v) => set({ title: v })} />
        </Field>
        <Field label="SUBTITLE">
          <TextInput value={faq.subtitle} onChange={(v) => set({ subtitle: v })} />
        </Field>
      </div>

      {faq.items.map((it, i) => (
        <div key={it.id} className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-bebas text-yellow text-xs tracking-[0.3em]">Q{i + 1}</p>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="p-1 text-muted/50 hover:text-yellow disabled:opacity-20 transition-colors" title="Move up">
                <ChevronUp size={15} />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === faq.items.length - 1} className="p-1 text-muted/50 hover:text-yellow disabled:opacity-20 transition-colors" title="Move down">
                <ChevronDown size={15} />
              </button>
              <button type="button" onClick={() => removeItem(i)} className="flex items-center gap-1.5 text-xs font-dm text-muted/60 hover:text-red-400 transition-colors ml-2">
                <Trash2 size={12} /> Remove
              </button>
            </div>
          </div>
          <Field label="QUESTION">
            <TextInput value={it.question} onChange={(v) => updateItem(i, { question: v })} placeholder="e.g. Do I need a driving licence?" />
          </Field>
          <Field label="ANSWER">
            <Textarea value={it.answer} onChange={(v) => updateItem(i, { answer: v })} rows={3} />
          </Field>
        </div>
      ))}

      <button
        type="button"
        onClick={addItem}
        className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-[#2a2a2a] hover:border-yellow/50 text-muted/60 hover:text-yellow rounded-2xl py-5 text-sm font-dm transition-colors"
      >
        <Plus size={16} /> Add Question
      </button>
      <p className="text-muted/50 text-xs font-dm">Click Save Changes to publish.</p>
    </div>
  );
}

// ── Food Concierge editor ─────────────────────────────────────────────────────────

function FoodConciergeEditor({
  content,
  onChange,
}: {
  content: SiteContent;
  onChange: (c: SiteContent) => void;
}) {
  const fc = content.foodConcierge;
  const set = (patch: Partial<typeof fc>) => onChange({ ...content, foodConcierge: { ...fc, ...patch } });
  const updateStep = (i: number, patch: Partial<(typeof fc.steps)[number]>) =>
    set({ steps: fc.steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  const addStep = () => set({ steps: [...fc.steps, { id: `step-${Date.now()}`, title: "", text: "" }] });
  const removeStep = (i: number) => set({ steps: fc.steps.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-6">
      {/* How it works note */}
      <div className="bg-yellow/5 border border-yellow/20 rounded-2xl p-5">
        <p className="font-syne font-bold text-yellow text-sm mb-1">How this works</p>
        <p className="text-muted/80 text-xs font-dm leading-relaxed">
          On the homepage “What are you looking for?” hub, the <b>Food &amp; Dining</b> tile opens a
          premium page (<b>/food</b>) instead of a restaurant list. Visitors tell you what they want to
          eat on WhatsApp, and you recommend &amp; book a table — earning a commission from partner
          restaurants. Just set the WhatsApp number below; everything else has sensible defaults you can tweak.
        </p>
      </div>

      {/* Enable toggle */}
      <div className="flex items-center justify-between bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-5">
        <div>
          <p className="font-syne font-bold text-offwhite text-sm">Show the Food Concierge tile</p>
          <p className="text-muted/60 text-xs font-dm mt-0.5">Turn the “Food &amp; Dining” hub tile on or off.</p>
        </div>
        <button
          type="button"
          onClick={() => set({ enabled: !fc.enabled })}
          className="text-muted/60 hover:text-yellow transition-colors"
          title={fc.enabled ? "Visible" : "Hidden"}
        >
          {fc.enabled ? <ToggleRight size={26} className="text-green-400" /> : <ToggleLeft size={26} />}
        </button>
      </div>

      {/* Hub-tile cover photo */}
      <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-6">
        <ImagePicker
          src={fc.coverImage ?? ""}
          onUpload={(p) => set({ coverImage: p })}
          label="COVER PHOTO (Food &amp; Dining hub tile)"
        />
        <p className="text-muted/50 text-xs font-dm mt-2">Shown on the “Food &amp; Dining” tile on the homepage hub. A tasty local dish photo works well.</p>
      </div>

      {/* WhatsApp number — the key field */}
      <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-6 space-y-4">
        <Field label="WHATSAPP NUMBER FOR FOOD ENQUIRIES">
          <TextInput
            value={fc.whatsapp}
            onChange={(v) => set({ whatsapp: v })}
            placeholder="e.g. 23052501234 (country code, no + or spaces)"
          />
        </Field>
        <p className="text-muted/50 text-xs font-dm -mt-1">
          Include the country code (Mauritius = 230). Leave empty to fall back to your main business WhatsApp number.
        </p>
      </div>

      {/* Copy */}
      <div className="grid grid-cols-1 gap-4">
        <Field label="HEADLINE">
          <TextInput value={fc.title} onChange={(v) => set({ title: v })} />
        </Field>
        <Field label="SUB-LINE">
          <TextInput value={fc.subtitle} onChange={(v) => set({ subtitle: v })} />
        </Field>
        <Field label="INTRO PARAGRAPH">
          <Textarea value={fc.intro} onChange={(v) => set({ intro: v })} rows={4} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="BUTTON TEXT">
            <TextInput value={fc.buttonText} onChange={(v) => set({ buttonText: v })} />
          </Field>
          <Field label="PRE-FILLED WHATSAPP MESSAGE">
            <TextInput value={fc.prefill} onChange={(v) => set({ prefill: v })} />
          </Field>
        </div>
      </div>

      {/* Steps */}
      <div>
        <p className="font-bebas text-yellow text-xs tracking-[0.3em] mb-3">“HOW IT WORKS” STEPS</p>
        <div className="space-y-4">
          {fc.steps.map((s, i) => (
            <div key={s.id} className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-bebas text-yellow text-xs tracking-[0.3em]">STEP {i + 1}</p>
                <button type="button" onClick={() => removeStep(i)} className="flex items-center gap-1.5 text-xs font-dm text-muted/60 hover:text-red-400 transition-colors">
                  <Trash2 size={12} /> Remove
                </button>
              </div>
              <Field label="TITLE">
                <TextInput value={s.title} onChange={(v) => updateStep(i, { title: v })} />
              </Field>
              <Field label="TEXT">
                <Textarea value={s.text} onChange={(v) => updateStep(i, { text: v })} rows={2} />
              </Field>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addStep}
          className="mt-4 w-full flex items-center justify-center gap-2 border-2 border-dashed border-[#2a2a2a] hover:border-yellow/50 text-muted/60 hover:text-yellow rounded-2xl py-5 text-sm font-dm transition-colors"
        >
          <Plus size={16} /> Add Step
        </button>
      </div>
      <p className="text-muted/50 text-xs font-dm">Click Save Changes to publish.</p>
    </div>
  );
}

// ── Getting Around editor ─────────────────────────────────────────────────────────

const TRANSPORT_ICONS: TransportOption["icon"][] = ["bus", "taxi", "scooter", "car", "bike", "walk"];

function GettingAroundEditor({
  content,
  onChange,
}: {
  content: SiteContent;
  onChange: (c: SiteContent) => void;
}) {
  const ga = content.gettingAround;
  const set = (patch: Partial<typeof ga>) =>
    onChange({ ...content, gettingAround: { ...ga, ...patch } });
  const updateOpt = (i: number, patch: Partial<TransportOption>) =>
    set({ options: ga.options.map((o, idx) => (idx === i ? { ...o, ...patch } : o)) });
  const addOpt = () =>
    set({ options: [...ga.options, { id: `opt-${Date.now()}`, icon: "car", title: "", text: "" }] });
  const removeOpt = (i: number) => set({ options: ga.options.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-5">
        <div>
          <p className="font-syne font-bold text-offwhite text-sm">Show the “Getting Around” card</p>
          <p className="text-muted/60 text-xs font-dm mt-0.5">Bus / taxi / scooter comparison shown on the homepage.</p>
        </div>
        <button
          type="button"
          onClick={() => set({ enabled: !ga.enabled })}
          className="text-muted/60 hover:text-yellow transition-colors"
          title={ga.enabled ? "Visible" : "Hidden"}
        >
          {ga.enabled ? <ToggleRight size={26} className="text-green-400" /> : <ToggleLeft size={26} />}
        </button>
      </div>

      {/* Hub-tile cover photo */}
      <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-6">
        <ImagePicker
          src={ga.coverImage ?? ""}
          onUpload={(p) => set({ coverImage: p })}
          label="COVER PHOTO (Getting around hub tile)"
        />
        <p className="text-muted/50 text-xs font-dm mt-2">Shown on the “Getting around” tile on the homepage hub — e.g. a scooter on a coastal road.</p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Field label="SECTION TITLE">
          <TextInput value={ga.title} onChange={(v) => set({ title: v })} placeholder="e.g. Getting Around Rodrigues" />
          <div className="mt-2">
            <TransFields base={ga.title} fr={ga.titleFr} cr={ga.titleCr} onFr={(v) => set({ titleFr: v })} onCr={(v) => set({ titleCr: v })} />
          </div>
        </Field>
        <Field label="SUBTITLE">
          <TextInput value={ga.subtitle} onChange={(v) => set({ subtitle: v })} />
          <div className="mt-2">
            <TransFields base={ga.subtitle} fr={ga.subtitleFr} cr={ga.subtitleCr} onFr={(v) => set({ subtitleFr: v })} onCr={(v) => set({ subtitleCr: v })} />
          </div>
        </Field>
      </div>

      {ga.options.map((o, i) => (
        <div key={o.id} className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <p className="font-bebas text-yellow text-xs tracking-[0.3em]">{o.title || `OPTION ${i + 1}`}</p>
              {o.highlight && (
                <span className="flex items-center gap-1 font-bebas text-[9px] tracking-[0.15em] bg-yellow/10 text-yellow border border-yellow/30 px-2 py-0.5 rounded-full">
                  <Star size={8} className="fill-yellow" /> HIGHLIGHTED
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => updateOpt(i, { highlight: !o.highlight })}
                className={`flex items-center gap-1.5 text-xs font-dm px-3 py-1.5 rounded-full border transition-colors ${o.highlight ? "border-yellow/40 text-yellow bg-yellow/10" : "border-[#2a2a2a] text-muted/60 hover:border-yellow/30 hover:text-yellow"}`}
              >
                <Star size={11} /> {o.highlight ? "Highlighted" : "Highlight"}
              </button>
              <button type="button" onClick={() => removeOpt(i)} className="flex items-center gap-1.5 text-xs font-dm text-muted/60 hover:text-red-400 transition-colors">
                <Trash2 size={12} /> Remove
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="TITLE">
              <TextInput value={o.title} onChange={(v) => updateOpt(i, { title: v })} placeholder="e.g. Rent a Scooter" />
            </Field>
            <Field label="ICON">
              <select
                value={o.icon}
                onChange={(e) => updateOpt(i, { icon: e.target.value as TransportOption["icon"] })}
                className={`${inputCls} appearance-none`}
              >
                {TRANSPORT_ICONS.map((ic) => (
                  <option key={ic} value={ic}>{ic.charAt(0).toUpperCase() + ic.slice(1)}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="DESCRIPTION">
            <Textarea value={o.text} onChange={(v) => updateOpt(i, { text: v })} rows={3} />
            <div className="mt-2 space-y-2">
              <TransFields base={o.title} fr={o.titleFr} cr={o.titleCr} onFr={(v) => updateOpt(i, { titleFr: v })} onCr={(v) => updateOpt(i, { titleCr: v })} />
              <TransFields base={o.text} fr={o.textFr} cr={o.textCr} onFr={(v) => updateOpt(i, { textFr: v })} onCr={(v) => updateOpt(i, { textCr: v })} textarea rows={3} />
            </div>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="BUTTON LINK (optional)">
              <TextInput value={o.link ?? ""} onChange={(v) => updateOpt(i, { link: v })} placeholder="e.g. #booking or /taxi" />
            </Field>
            <Field label="BUTTON TEXT (optional)">
              <TextInput value={o.linkText ?? ""} onChange={(v) => updateOpt(i, { linkText: v })} placeholder="e.g. Rent a scooter" />
            </Field>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addOpt}
        className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-[#2a2a2a] hover:border-yellow/50 text-muted/60 hover:text-yellow rounded-2xl py-5 text-sm font-dm transition-colors"
      >
        <Plus size={16} /> Add Transport Option
      </button>
      <p className="text-muted/50 text-xs font-dm">Click Save Changes to publish.</p>
    </div>
  );
}

// ── Events editor ────────────────────────────────────────────────────────────────

// ── Home "What are you looking for?" tiles editor ────────────────────────────
const QA_ICONS = ["restaurant", "beach", "hiking", "fishing", "boat", "plane", "taxi", "viewpoint", "store", "event", "map", "planner", "guide", "scooter", "car", "stay", "compass"];

function QuickAccessEditor({
  content,
  onChange,
}: {
  content: SiteContent;
  onChange: (c: SiteContent) => void;
}) {
  const list = content.quickAccess ?? DEFAULT_QUICK_ACCESS;
  const set = (next: QuickAccessItem[]) => onChange({ ...content, quickAccess: next });
  const update = (i: number, patch: Partial<QuickAccessItem>) =>
    set(list.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const add = () => set([...list, { id: `qa-${Date.now()}`, label: "", href: "/", icon: "compass", enabled: true }]);
  const remove = (i: number) => set(list.filter((_, idx) => idx !== i));
  const move = (i: number, dir: number) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    set(next);
  };

  return (
    <div className="space-y-6">
      <p className="text-muted/70 font-dm text-xs leading-relaxed">
        The horizontal “What are you looking for?” tiles on the homepage. Add or remove tiles, rename them,
        pick an icon, and set where each one links. Reorder with the arrows; hide one without deleting it.
      </p>
      {list.map((it, i) => (
        <div key={it.id} className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="font-bebas text-yellow text-xs tracking-[0.3em]">{it.label || `TILE ${i + 1}`}</p>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="px-2 py-1 rounded-lg border border-[#2a2a2a] text-muted/70 hover:text-yellow disabled:opacity-30 text-xs">↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} className="px-2 py-1 rounded-lg border border-[#2a2a2a] text-muted/70 hover:text-yellow disabled:opacity-30 text-xs">↓</button>
              <button type="button" onClick={() => update(i, { enabled: it.enabled === false })} className={`px-3 py-1 rounded-full border text-xs font-dm transition-colors ${it.enabled === false ? "border-[#2a2a2a] text-muted/50" : "border-green-500/30 text-green-400 bg-green-500/10"}`}>{it.enabled === false ? "Hidden" : "Shown"}</button>
              <button type="button" onClick={() => remove(i)} className="flex items-center gap-1.5 text-xs font-dm text-muted/60 hover:text-red-400 transition-colors"><Trash2 size={12} /> Remove</button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="LABEL">
              <TextInput value={it.label} onChange={(v) => update(i, { label: v })} placeholder="e.g. Restaurants" />
            </Field>
            <Field label="LINK (URL)">
              <TextInput value={it.href} onChange={(v) => update(i, { href: v })} placeholder="e.g. /food" />
            </Field>
            <Field label="ICON">
              <select value={it.icon} onChange={(e) => update(i, { icon: e.target.value })} className={inputCls}>
                {QA_ICONS.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </Field>
          </div>
          <TransFields base={it.label} fr={it.labelFr} cr={it.labelCr} onFr={(v) => update(i, { labelFr: v })} onCr={(v) => update(i, { labelCr: v })} />
        </div>
      ))}
      <button type="button" onClick={add} className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-[#2a2a2a] hover:border-yellow/50 text-muted/60 hover:text-yellow rounded-2xl py-5 text-sm font-dm transition-colors">
        <Plus size={16} /> Add Tile
      </button>
      <p className="text-muted/50 text-xs font-dm">Click Save Changes to publish.</p>
    </div>
  );
}

// ── Home cards editor (the big photo cards) ──────────────────────────────────
const HC_ICONS = ["scooter", "car", "stay", "experience", "store", "tiroule", "restaurant", "beach", "compass"];
const HC_SOURCES = ["scooter", "car", "stays", "exp", "stores", "none"];
const HC_TINTS = ["amber", "teal", "indigo", "rose"];

function HomeCardsEditor({
  content,
  onChange,
}: {
  content: SiteContent;
  onChange: (c: SiteContent) => void;
}) {
  const list = content.homeCards ?? DEFAULT_HOME_CARDS;
  const set = (next: HomeCard[]) => onChange({ ...content, homeCards: next });
  const update = (i: number, patch: Partial<HomeCard>) =>
    set(list.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const add = () => set([...list, { id: `hc-${Date.now()}`, label: "", icon: "compass", imageSource: "none", action: "link", href: "/", tint: "amber", enabled: true }]);
  const remove = (i: number) => set(list.filter((_, idx) => idx !== i));
  const move = (i: number, dir: number) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    set(next);
  };

  return (
    <div className="space-y-6">
      <p className="text-muted/70 font-dm text-xs leading-relaxed">
        The big photo cards at the top of the homepage. Each card&apos;s photos auto-cycle through the real
        images of its “Photos from” category (managed in your Fleet / Places editors). Add, remove, reorder,
        rename, pick an icon &amp; colour, and set where it links — or make one open the Ti Roulé chat.
      </p>
      {list.map((it, i) => (
        <div key={it.id} className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="font-bebas text-yellow text-xs tracking-[0.3em]">{it.label || `CARD ${i + 1}`}</p>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="px-2 py-1 rounded-lg border border-[#2a2a2a] text-muted/70 hover:text-yellow disabled:opacity-30 text-xs">↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} className="px-2 py-1 rounded-lg border border-[#2a2a2a] text-muted/70 hover:text-yellow disabled:opacity-30 text-xs">↓</button>
              <button type="button" onClick={() => update(i, { popular: !it.popular })} className={`px-3 py-1 rounded-full border text-xs font-dm transition-colors ${it.popular ? "border-yellow/40 text-yellow bg-yellow/10" : "border-[#2a2a2a] text-muted/60"}`}>Popular</button>
              <button type="button" onClick={() => update(i, { enabled: it.enabled === false })} className={`px-3 py-1 rounded-full border text-xs font-dm transition-colors ${it.enabled === false ? "border-[#2a2a2a] text-muted/50" : "border-green-500/30 text-green-400 bg-green-500/10"}`}>{it.enabled === false ? "Hidden" : "Shown"}</button>
              <button type="button" onClick={() => remove(i)} className="flex items-center gap-1.5 text-xs font-dm text-muted/60 hover:text-red-400 transition-colors"><Trash2 size={12} /> Remove</button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="LABEL">
              <TextInput value={it.label} onChange={(v) => update(i, { label: v })} placeholder="e.g. Scooters" />
            </Field>
            <Field label="ACTION">
              <select value={it.action ?? "link"} onChange={(e) => update(i, { action: e.target.value as HomeCard["action"] })} className={inputCls}>
                <option value="link">Open a link</option>
                <option value="tiroule">Open Ti Roulé chat</option>
              </select>
            </Field>
            {(it.action ?? "link") === "link" && (
              <Field label="LINK (URL)">
                <TextInput value={it.href ?? ""} onChange={(v) => update(i, { href: v })} placeholder="e.g. /browse/scooter" />
              </Field>
            )}
            <Field label="ICON">
              <select value={it.icon} onChange={(e) => update(i, { icon: e.target.value })} className={inputCls}>
                {HC_ICONS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </Field>
            <Field label="PHOTOS FROM">
              <select value={it.imageSource} onChange={(e) => update(i, { imageSource: e.target.value })} className={inputCls}>
                {HC_SOURCES.map((k) => <option key={k} value={k}>{k === "exp" ? "experiences" : k}</option>)}
              </select>
            </Field>
            <Field label="COLOUR">
              <select value={it.tint ?? "amber"} onChange={(e) => update(i, { tint: e.target.value })} className={inputCls}>
                {HC_TINTS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </Field>
          </div>
          <TransFields base={it.label} fr={it.labelFr} cr={it.labelCr} onFr={(v) => update(i, { labelFr: v })} onCr={(v) => update(i, { labelCr: v })} />
        </div>
      ))}
      <button type="button" onClick={add} className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-[#2a2a2a] hover:border-yellow/50 text-muted/60 hover:text-yellow rounded-2xl py-5 text-sm font-dm transition-colors">
        <Plus size={16} /> Add Card
      </button>
      <p className="text-muted/50 text-xs font-dm">Click Save Changes to publish.</p>
    </div>
  );
}

function EventsEditor({
  content,
  onChange,
}: {
  content: SiteContent;
  onChange: (c: SiteContent) => void;
}) {
  const list = content.events ?? [];
  const set = (next: EventItem[]) => onChange({ ...content, events: next });
  const update = (i: number, patch: Partial<EventItem>) =>
    set(list.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const add = () =>
    set([...list, { id: `ev-${Date.now()}`, title: "", date: "", description: "", location: "", image: "" }]);
  const remove = (i: number) => set(list.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-6">
      <p className="text-muted/70 font-dm text-xs leading-relaxed">
        Festivals, markets and happenings around Rodrigues. The Events section is hidden on the website
        until you add at least one.
      </p>
      {list.map((ev, i) => (
        <div key={ev.id} className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <p className="font-bebas text-yellow text-xs tracking-[0.3em]">{ev.title || `EVENT ${i + 1}`}</p>
              {ev.featured && (
                <span className="flex items-center gap-1 font-bebas text-[9px] tracking-[0.15em] bg-yellow/10 text-yellow border border-yellow/30 px-2 py-0.5 rounded-full">
                  <Star size={8} className="fill-yellow" /> FEATURED
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => update(i, { featured: !ev.featured })}
                className={`flex items-center gap-1.5 text-xs font-dm px-3 py-1.5 rounded-full border transition-colors ${ev.featured ? "border-yellow/40 text-yellow bg-yellow/10" : "border-[#2a2a2a] text-muted/60 hover:border-yellow/30 hover:text-yellow"}`}
              >
                <Star size={11} /> {ev.featured ? "Featured" : "Feature"}
              </button>
              <button type="button" onClick={() => remove(i)} className="flex items-center gap-1.5 text-xs font-dm text-muted/60 hover:text-red-400 transition-colors">
                <Trash2 size={12} /> Remove
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="TITLE">
              <TextInput value={ev.title} onChange={(v) => update(i, { title: v })} placeholder="e.g. Fish Festival" />
            </Field>
            <Field label="DATE">
              <TextInput value={ev.date} onChange={(v) => update(i, { date: v })} placeholder="e.g. Every Saturday · 15 Aug 2026" />
            </Field>
            <Field label="LOCATION (optional)">
              <TextInput value={ev.location ?? ""} onChange={(v) => update(i, { location: v })} placeholder="e.g. Port Mathurin" />
            </Field>
          </div>
          <Field label="DESCRIPTION">
            <Textarea value={ev.description} onChange={(v) => update(i, { description: v })} rows={2} />
            <div className="mt-2 space-y-2">
              <TransFields base={ev.title} fr={ev.titleFr} cr={ev.titleCr} onFr={(v) => update(i, { titleFr: v })} onCr={(v) => update(i, { titleCr: v })} />
              <TransFields base={ev.description} fr={ev.descriptionFr} cr={ev.descriptionCr} onFr={(v) => update(i, { descriptionFr: v })} onCr={(v) => update(i, { descriptionCr: v })} textarea rows={2} />
            </div>
          </Field>
          <MultiImagePicker
            label="EVENT PHOTOS"
            hint="The first photo is the one shown on the card."
            images={ev.images?.length ? ev.images : ev.image ? [ev.image] : []}
            onChange={(imgs) => update(i, { images: imgs, image: imgs[0] ?? "" })}
          />
        </div>
      ))}
      <button type="button" onClick={add} className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-[#2a2a2a] hover:border-yellow/50 text-muted/60 hover:text-yellow rounded-2xl py-5 text-sm font-dm transition-colors">
        <Plus size={16} /> Add Event
      </button>
      <p className="text-muted/50 text-xs font-dm">Click Save Changes to publish.</p>
    </div>
  );
}

// ── Sponsors / ads editor ────────────────────────────────────────────────────────

function SponsorsEditor({
  content,
  onChange,
}: {
  content: SiteContent;
  onChange: (c: SiteContent) => void;
}) {
  const list = content.sponsors ?? [];
  const setList = (next: Sponsor[]) => onChange({ ...content, sponsors: next });
  const update = (i: number, patch: Partial<Sponsor>) =>
    setList(list.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const add = () =>
    setList([...list, { id: `sp-${Date.now()}`, name: "", image: "", link: "", enabled: true, featured: false }]);
  const remove = (i: number) => setList(list.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
  };

  return (
    <div className="space-y-6">
      {/* Master toggle */}
      <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-6 flex items-center justify-between">
        <div>
          <p className="font-syne font-bold text-offwhite text-sm">Show Sponsors Strip</p>
          <p className="font-dm text-muted text-xs mt-0.5">
            A row of sponsor logos near the footer. Sell these slots to local businesses.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange({ ...content, sponsorsEnabled: !content.sponsorsEnabled })}
          className={`relative w-11 h-6 rounded-full transition-colors ${content.sponsorsEnabled ? "bg-yellow" : "bg-[#2a2a2a]"}`}
        >
          <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${content.sponsorsEnabled ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      </div>

      {list.map((sp, i) => (
        <div key={sp.id} className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-bebas text-yellow text-xs tracking-[0.3em] truncate">{sp.name || `SPONSOR ${i + 1}`}</p>
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="Move up" className="text-muted/50 hover:text-yellow disabled:opacity-25 transition-colors">
                <ChevronUp size={16} />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} title="Move down" className="text-muted/50 hover:text-yellow disabled:opacity-25 transition-colors">
                <ChevronDown size={16} />
              </button>
              <button
                type="button"
                onClick={() => update(i, { featured: !sp.featured })}
                title="Official Partner badge"
                className={`inline-flex items-center gap-1 text-[11px] font-dm px-2.5 py-1 rounded-full border transition-colors ${sp.featured ? "border-yellow/50 text-yellow bg-yellow/10" : "border-[#2a2a2a] text-muted/50"}`}
              >
                <Star size={10} className={sp.featured ? "fill-yellow" : ""} /> {sp.featured ? "Official" : "Feature"}
              </button>
              <button
                type="button"
                onClick={() => update(i, { enabled: !sp.enabled })}
                className={`text-xs font-dm px-3 py-1 rounded-full border transition-colors ${sp.enabled ? "border-green-500/40 text-green-400" : "border-[#2a2a2a] text-muted/50"}`}
              >
                {sp.enabled ? "Shown" : "Hidden"}
              </button>
              <button type="button" onClick={() => remove(i)} className="text-muted/40 hover:text-red-400 transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="SPONSOR NAME">
              <TextInput value={sp.name} onChange={(v) => update(i, { name: v })} placeholder="e.g. Cotton Bay Hotel" />
            </Field>
            <Field label="CATEGORY (optional)">
              <TextInput value={sp.category ?? ""} onChange={(v) => update(i, { category: v })} placeholder="e.g. Hotel, Bank, Restaurant" />
            </Field>
          </div>
          <Field label="DESCRIPTION (optional)">
            <TextInput value={sp.description ?? ""} onChange={(v) => update(i, { description: v })} placeholder="One line about this partner" />
          </Field>
          <Field label="WEBSITE (optional)">
            <TextInput value={sp.link} onChange={(v) => update(i, { link: v })} placeholder="https://..." />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ImagePicker label="LOGO" src={sp.image} onUpload={(p) => update(i, { image: p })} />
            <ImagePicker label="BANNER (optional)" src={sp.banner ?? ""} onUpload={(p) => update(i, { banner: p })} />
          </div>
        </div>
      ))}

      <button type="button" onClick={add} className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-[#2a2a2a] hover:border-yellow/50 text-muted/60 hover:text-yellow rounded-2xl py-5 text-sm font-dm transition-colors">
        <Plus size={16} /> Add Sponsor
      </button>

      <div className="bg-yellow/5 border border-yellow/20 rounded-2xl p-5">
        <p className="font-syne font-bold text-offwhite text-sm mb-1">Monetisation tip</p>
        <p className="font-dm text-muted/70 text-xs leading-relaxed">
          Charge businesses a monthly fee (e.g. Rs 1,000–3,000) to display their logo here. Toggle the
          strip off in low season. Click Save Changes to publish.
        </p>
      </div>
    </div>
  );
}

// ── Partners manager ──────────────────────────────────────────────────────────

const PARTNER_TYPES = ["hotel", "guesthouse", "travel_agency", "other"] as const;

type PartnerForm = {
  name: string;
  type: Partner["type"];
  email: string;
  phone: string;
  partner_code: string;
  notes: string;
};

const emptyPartnerForm = (): PartnerForm => ({
  name: "", type: "hotel", email: "", phone: "",
  partner_code: "", notes: "",
});

function generateCode(name: string) {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join("-")
    .substring(0, 20) || `PARTNER-${Date.now().toString(36).toUpperCase()}`;
}

function PartnersManager() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PartnerForm>(emptyPartnerForm());
  const [editing, setEditing] = useState<string | null>(null); // partner id being edited
  const [showForm, setShowForm] = useState(false);
  const [commissionView, setCommissionView] = useState<string | null>(null); // partner id
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/partners");
      if (res.ok) setPartners(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function loadBookings() {
    setBookingsLoading(true);
    try {
      const res = await fetch("/api/admin/bookings");
      if (res.ok) setBookings(await res.json());
    } finally {
      setBookingsLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSave() {
    if (!form.name || !form.partner_code) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        commission_pct: 0,
        ...(editing ? { id: editing } : {}),
      };
      const res = await fetch("/api/admin/partners", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await load();
        setShowForm(false);
        setEditing(null);
        setForm(emptyPartnerForm());
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this partner?")) return;
    if (!(await adminWrite(`/api/admin/partners?id=${id}`, { method: "DELETE" }))) return;
    setPartners((prev) => prev.filter((p) => p.id !== id));
  }

  async function toggleActive(p: Partner) {
    const ok = await adminWrite("/api/admin/partners", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, active: !p.active }),
    });
    if (!ok) return;
    setPartners((prev) => prev.map((x) => x.id === p.id ? { ...x, active: !x.active } : x));
  }

  function openEdit(p: Partner) {
    setForm({
      name: p.name, type: p.type, email: p.email ?? "",
      phone: p.phone ?? "", partner_code: p.partner_code,
      notes: p.notes ?? "",
    });
    setEditing(p.id);
    setShowForm(true);
  }

  function openCommission(p: Partner) {
    setCommissionView(p.id);
    if (bookings.length === 0) loadBookings();
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  }

  if (commissionView) {
    const partner = partners.find((p) => p.id === commissionView);
    const partnerBookings = bookings.filter((b) => b.partner_code === partner?.partner_code);
    const totalRaw = partnerBookings.reduce((acc, b) => acc + (b.total_amount ?? 0), 0);

    return (
      <div className="space-y-6">
        <button
          onClick={() => setCommissionView(null)}
          className="flex items-center gap-2 text-sm font-dm text-muted hover:text-yellow transition-colors"
        >
          ← Back to Partners
        </button>

        <div>
          <p className="font-bebas text-yellow text-[10px] tracking-[0.3em] mb-1">REFERRAL REPORT</p>
          <h2 className="font-syne font-bold text-offwhite text-xl">{partner?.name}</h2>
          <p className="font-dm text-muted text-sm mt-1">
            Code: <span className="text-yellow font-mono">{partner?.partner_code}</span>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {[
            { label: "Bookings via this partner", value: partnerBookings.length },
            { label: "Total rental value (est.)", value: `Rs ${totalRaw.toLocaleString()}` },
          ].map((s) => (
            <div key={s.label} className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-5">
              <p className="font-syne font-extrabold text-yellow text-2xl mb-1">{s.value}</p>
              <p className="font-dm text-muted text-xs">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Referral toolkit ── */}
        {partner && (() => {
          const refLink = `${SITE_URL}/?ref=${partner.partner_code}`;
          const dashLink = `${SITE_URL}/partner?code=${partner.partner_code}`;
          // Drawn locally rather than fetched from api.qrserver.com, which sent
          // every referral link to a third party and returned a fixed-size PNG.
          // One SVG string feeds both the preview and the download, so the
          // poster the hotel prints is exactly what is shown here.
          const qrSvg = qrSvgDocument(refLink);
          const qr = `data:image/svg+xml;utf8,${encodeURIComponent(qrSvg)}`;
          const waShare = `https://wa.me/?text=${encodeURIComponent(`Rent a scooter on Rodrigues with Roule Rodrigues 🛵 Book here: ${refLink}`)}`;
          return (
            <div className="bg-[#0d0d0d] border border-yellow/20 rounded-2xl p-5">
              <p className="font-bebas text-yellow text-[10px] tracking-[0.3em] mb-1">REFERRAL TOOLKIT</p>
              <p className="font-dm text-muted/70 text-xs mb-4">
                Give the hotel their <strong className="text-offwhite">link or QR poster</strong>. Anyone who books
                after scanning/clicking it is <strong className="text-offwhite">automatically attributed</strong> — no
                code to remember.
              </p>
              <div className="flex flex-col md:flex-row gap-5">
                {/* QR */}
                <div className="flex flex-col items-center gap-2 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr} alt="Referral QR" className="w-36 h-36 rounded-xl bg-white p-1.5" />
                  <button
                    type="button"
                    onClick={() =>
                      // Saves the same SVG shown above. `download` is ignored on
                      // cross-origin URLs, which is why the old link to the
                      // qrserver image could only ever open it.
                      downloadBlob(
                        new Blob([qrSvg], { type: "image/svg+xml;charset=utf-8" }),
                        qrFilename(partner.partner_code),
                      )
                    }
                    className="text-xs font-dm text-muted hover:text-yellow transition-colors"
                  >
                    Download QR
                  </button>
                </div>
                {/* Link + actions */}
                <div className="flex-1 min-w-0 space-y-3">
                  <div>
                    <p className="font-bebas text-muted text-[9px] tracking-[0.25em] mb-1">REFERRAL LINK</p>
                    <div className="flex items-center gap-2 bg-dark border border-[#2a2a2a] rounded-lg px-3 py-2.5">
                      <span className="font-mono text-yellow text-xs truncate flex-1">{refLink}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => copyCode(refLink)}
                      className="flex items-center gap-1.5 text-xs font-dm border border-[#2a2a2a] hover:border-yellow/40 text-muted hover:text-yellow px-3 py-2 rounded-full transition-colors"
                    >
                      <Copy size={12} /> {copied === refLink ? "Copied!" : "Copy link"}
                    </button>
                    <a
                      href={waShare}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs font-dm bg-green-500/15 text-green-400 hover:bg-green-500/25 px-3 py-2 rounded-full transition-colors"
                    >
                      <MessageSquare size={12} /> Share on WhatsApp
                    </a>
                  </div>
                  <div>
                    <p className="font-bebas text-muted text-[9px] tracking-[0.25em] mb-1">PARTNER DASHBOARD (for the hotel)</p>
                    <div className="flex items-center gap-2 bg-dark border border-[#2a2a2a] rounded-lg px-3 py-2.5">
                      <span className="font-mono text-muted text-xs truncate flex-1">{dashLink}</span>
                      <button
                        onClick={() => copyCode(dashLink)}
                        className="shrink-0 text-muted hover:text-yellow transition-colors"
                        aria-label="Copy dashboard link"
                      >
                        {copied === dashLink ? <CheckCircle size={12} className="text-green-400" /> : <Copy size={12} />}
                      </button>
                    </div>
                    <p className="text-muted/40 text-[11px] font-dm mt-1">
                      Send this to the hotel so they can track their own referred bookings (no login).
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {bookingsLoading ? (
          <div className="flex items-center gap-2 text-muted font-dm text-sm">
            <Loader2 size={14} className="animate-spin" /> Loading bookings…
          </div>
        ) : partnerBookings.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-muted/50 font-dm text-sm">No bookings attributed to this partner yet.</p>
            <p className="text-muted/30 font-dm text-xs mt-1">
              Share their code <span className="font-mono text-yellow">{partner?.partner_code}</span> with them.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="font-bebas text-muted text-[10px] tracking-[0.3em]">ATTRIBUTED BOOKINGS</p>
            {partnerBookings.map((b) => (
              <div key={b.id} className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-dm text-offwhite text-sm font-medium">{b.name}</p>
                  <p className="font-dm text-muted text-xs">{b.scooter.toUpperCase()} · {b.days} days · {new Date(b.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – {new Date(b.end_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
                </div>
                <div className="text-right">
                  {b.total_price && <p className="font-syne font-bold text-yellow text-sm">{b.total_price}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-5">
          <p className="font-bebas text-yellow text-[10px] tracking-[0.3em] mb-3">SUMMARY (for printing)</p>
          <div className="font-dm text-sm space-y-1 text-offwhite/70">
            <p><strong className="text-offwhite">Partner:</strong> {partner?.name}</p>
            <p><strong className="text-offwhite">Code:</strong> {partner?.partner_code}</p>
            <p><strong className="text-offwhite">Bookings:</strong> {partnerBookings.length}</p>
            <p className="text-yellow font-bold text-base pt-2"><strong>Total rental value: Rs {totalRaw.toLocaleString()}</strong></p>
          </div>
          <button
            onClick={() => window.print()}
            className="mt-4 flex items-center gap-2 border border-[#2a2a2a] hover:border-yellow text-offwhite/70 hover:text-yellow px-4 py-2 rounded-lg text-xs font-dm transition-colors"
          >
            Print Report
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-bebas text-yellow text-[10px] tracking-[0.3em] mb-0.5">REFERRAL NETWORK</p>
          <p className="font-dm text-muted text-xs">Hotels and guesthouses that refer customers through their link.</p>
        </div>
        <button
          onClick={() => { setForm(emptyPartnerForm()); setEditing(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-yellow text-dark font-syne font-bold text-xs px-4 py-2 rounded-full hover:bg-yellow-dark transition-colors"
        >
          <Plus size={13} /> Add Partner
        </button>
      </div>

      {showForm && (
        <div className="bg-[#0d0d0d] border border-yellow/30 rounded-2xl p-6 space-y-5">
          <p className="font-bebas text-yellow text-xs tracking-[0.3em]">
            {editing ? "EDIT PARTNER" : "NEW PARTNER"}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="BUSINESS NAME">
              <TextInput
                value={form.name}
                onChange={(v) => setForm({ ...form, name: v, partner_code: form.partner_code || generateCode(v) })}
                placeholder="e.g. Chez Francine Guesthouse"
              />
            </Field>
            <Field label="TYPE">
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as Partner["type"] })}
                className={`${inputCls} appearance-none`}
              >
                {PARTNER_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                ))}
              </select>
            </Field>
            <Field label="EMAIL">
              <TextInput value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="contact@hotel.mu" />
            </Field>
            <Field label="PHONE">
              <TextInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="+230 5XXX XXXX" />
            </Field>
            <Field label="PARTNER CODE (unique)">
              <div className="flex gap-2">
                <TextInput
                  value={form.partner_code}
                  onChange={(v) => setForm({ ...form, partner_code: v.toUpperCase().replace(/[^A-Z0-9-]/g, "") })}
                  placeholder="e.g. CHEZ-FRANCINE"
                />
                <button
                  type="button"
                  onClick={() => setForm({ ...form, partner_code: generateCode(form.name) })}
                  className="shrink-0 border border-[#2a2a2a] hover:border-yellow text-muted hover:text-yellow px-3 rounded-xl text-xs font-dm transition-colors"
                >
                  Auto
                </button>
              </div>
            </Field>
          </div>
          <Field label="NOTES">
            <Textarea value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} rows={2} />
          </Field>
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !form.name || !form.partner_code}
              className="flex items-center gap-2 bg-yellow text-dark font-syne font-bold text-sm px-5 py-2.5 rounded-full hover:bg-yellow-dark disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {editing ? "Save Changes" : "Create Partner"}
            </button>
            <button
              onClick={() => { setShowForm(false); setEditing(null); setForm(emptyPartnerForm()); }}
              className="text-sm font-dm text-muted hover:text-offwhite transition-colors px-4"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-muted font-dm text-sm py-10">
          <Loader2 size={16} className="animate-spin" /> Loading partners…
        </div>
      ) : partners.length === 0 ? (
        <div className="text-center py-16">
          <Handshake size={36} className="text-muted/20 mx-auto mb-4" />
          <p className="text-muted/50 font-dm text-sm">No partners yet.</p>
          <p className="text-muted/30 font-dm text-xs mt-1">Add a hotel or guesthouse to start tracking referrals.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {partners.map((p) => (
            <div key={p.id} className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="font-syne font-bold text-offwhite text-sm">{p.name}</p>
                    <span className="font-bebas text-[9px] tracking-[0.15em] border border-[#2a2a2a] text-muted px-2 py-0.5 rounded-full">
                      {p.type.replace("_", " ").toUpperCase()}
                    </span>
                    {p.active ? (
                      <span className="flex items-center gap-1 text-green-400 text-[9px] font-bebas tracking-[0.15em]">
                        <BadgeCheck size={10} /> ACTIVE
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-red-400/70 text-[9px] font-bebas tracking-[0.15em]">
                        <Ban size={10} /> INACTIVE
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bebas text-[9px] tracking-[0.15em] text-muted">CODE:</span>
                      <span className="font-mono text-yellow text-xs font-bold">{p.partner_code}</span>
                      <button
                        onClick={() => copyCode(p.partner_code)}
                        className="text-muted/40 hover:text-yellow transition-colors"
                        aria-label="Copy code"
                      >
                        {copied === p.partner_code ? <CheckCircle size={11} className="text-green-400" /> : <Copy size={11} />}
                      </button>
                    </div>
                    {p.email && (
                      <a href={`mailto:${p.email}`} className="flex items-center gap-1 text-xs font-dm text-muted/50 hover:text-yellow transition-colors">
                        <Mail size={10} /> {p.email}
                      </a>
                    )}
                  </div>
                  {p.notes && <p className="text-muted/40 font-dm text-xs mt-1">{p.notes}</p>}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => openCommission(p)}
                    className="flex items-center gap-1.5 border border-[#2a2a2a] hover:border-yellow text-muted/60 hover:text-yellow px-3 py-1.5 rounded-lg text-xs font-dm transition-colors"
                  >
                    <ClipboardList size={11} /> Report
                  </button>
                  <button
                    onClick={() => openEdit(p)}
                    className="flex items-center gap-1.5 border border-[#2a2a2a] hover:border-yellow text-muted/60 hover:text-yellow px-3 py-1.5 rounded-lg text-xs font-dm transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => toggleActive(p)}
                    className="text-muted/40 hover:text-yellow transition-colors"
                    title={p.active ? "Deactivate" : "Activate"}
                  >
                    {p.active ? <ToggleRight size={18} className="text-green-400" /> : <ToggleLeft size={18} />}
                  </button>
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="text-muted/30 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-yellow/5 border border-yellow/20 rounded-2xl p-5">
        <p className="font-syne font-bold text-offwhite text-sm mb-2">How it works</p>
        <ol className="space-y-1.5">
          {[
            "Add a hotel or guesthouse partner and share their referral link.",
            "Share their unique code with them (e.g. CHEZ-FRANCINE).",
            "When guests book, they enter the code in the booking form.",
            "View the referral report to see the bookings each partner sent.",
            "Pay partners based on the report — click Print to create a paper record.",
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-2.5 text-xs font-dm text-muted/70">
              <span className="font-bebas text-yellow shrink-0">{i + 1}.</span>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ── Marketplace manager ────────────────────────────────────────────────────────

const MARKETPLACE_CATEGORIES = ["restaurant", "tour", "activity", "accommodation", "shopping"] as const;

type ListingForm = {
  business_name: string;
  category: MarketplaceListing["category"];
  description: string;
  offer: string;
  contact: string;
  website: string;
  image_url: string;
  images: string[];
  delivery: boolean;
  pickup: boolean;
  dine_in: boolean;
  whatsapp: string;
  hours: string;
  maps_url: string;
};

const emptyListingForm = (): ListingForm => ({
  business_name: "", category: "restaurant", description: "",
  offer: "", contact: "", website: "", image_url: "", images: [],
  delivery: false, pickup: false, dine_in: false,
  whatsapp: "", hours: "", maps_url: "",
});

function MarketplaceManager() {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ListingForm>(emptyListingForm());
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/marketplace");
      if (res.ok) setListings(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSave() {
    if (!form.business_name || !form.description || !form.offer) return;
    setSaving(true);
    try {
      const payload = { ...form, ...(editing ? { id: editing } : {}) };
      const res = await fetch("/api/admin/marketplace", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await load();
        setShowForm(false);
        setEditing(null);
        setForm(emptyListingForm());
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this listing?")) return;
    if (!(await adminWrite(`/api/admin/marketplace?id=${id}`, { method: "DELETE" }))) return;
    setListings((prev) => prev.filter((l) => l.id !== id));
  }

  async function toggleField(l: MarketplaceListing, field: "active" | "featured") {
    const ok = await adminWrite("/api/admin/marketplace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: l.id, [field]: !l[field] }),
    });
    setListings((prev) => prev.map((x) => x.id === l.id ? { ...x, [field]: !x[field] } : x));
  }

  function openEdit(l: MarketplaceListing) {
    setForm({
      business_name: l.business_name, category: l.category,
      description: l.description, offer: l.offer,
      contact: l.contact ?? "", website: l.website ?? "",
      image_url: l.image_url ?? "",
      images: l.images ?? [],
      delivery: l.delivery ?? false, pickup: l.pickup ?? false, dine_in: l.dine_in ?? false,
      whatsapp: l.whatsapp ?? "", hours: l.hours ?? "", maps_url: l.maps_url ?? "",
    });
    setEditing(l.id);
    setShowForm(true);
  }

  const CATEGORY_ICON: Record<string, React.ElementType> = {
    restaurant: UtensilsCrossed, tour: Compass, activity: Waves, accommodation: BedDouble, shopping: ShoppingBag,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-bebas text-yellow text-[10px] tracking-[0.3em] mb-0.5">LOCAL BUSINESS DEALS</p>
          <p className="font-dm text-muted text-xs">Restaurants, tours and activities that offer deals to your customers.</p>
        </div>
        <button
          onClick={() => { setForm(emptyListingForm()); setEditing(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-yellow text-dark font-syne font-bold text-xs px-4 py-2 rounded-full hover:bg-yellow-dark transition-colors"
        >
          <Plus size={13} /> Add Listing
        </button>
      </div>

      {showForm && (
        <div className="bg-[#0d0d0d] border border-yellow/30 rounded-2xl p-6 space-y-5">
          <p className="font-bebas text-yellow text-xs tracking-[0.3em]">
            {editing ? "EDIT LISTING" : "NEW LISTING"}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="BUSINESS NAME">
              <TextInput
                value={form.business_name}
                onChange={(v) => setForm({ ...form, business_name: v })}
                placeholder="e.g. La Belle Rodrigue Restaurant"
              />
            </Field>
            <Field label="CATEGORY">
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as MarketplaceListing["category"] })}
                className={`${inputCls} appearance-none`}
              >
                {MARKETPLACE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <MultiImagePicker
            label="PHOTOS"
            hint="First photo = cover shown on the card. Add multiple angles, dishes and views."
            images={form.images.length ? form.images : (form.image_url ? [form.image_url] : [])}
            onChange={(imgs) => setForm({ ...form, images: imgs, image_url: imgs[0] ?? "" })}
          />
          <Field label="DESCRIPTION">
            <Textarea
              value={form.description}
              onChange={(v) => setForm({ ...form, description: v })}
              rows={2}
              // placeholder prop not in Textarea — use default
            />
          </Field>
          <Field label="SPECIAL OFFER (what customers get)">
            <TextInput
              value={form.offer}
              onChange={(v) => setForm({ ...form, offer: v })}
              placeholder="e.g. 10% off your meal when you show your scooter rental receipt"
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="CONTACT (phone, shown on card)">
              <TextInput value={form.contact} onChange={(v) => setForm({ ...form, contact: v })} placeholder="+230 5XXX XXXX" />
            </Field>
            <Field label="WHATSAPP NUMBER (tap-to-chat)">
              <TextInput value={form.whatsapp} onChange={(v) => setForm({ ...form, whatsapp: v })} placeholder="+230 5XXX XXXX" />
            </Field>
            <Field label="OPENING AND CLOSING TIME">
              <TextInput value={form.hours} onChange={(v) => setForm({ ...form, hours: v })} placeholder="e.g. Mon–Sat 9:00–18:00" />
            </Field>
            <Field label="WEBSITE (optional)">
              <TextInput value={form.website} onChange={(v) => setForm({ ...form, website: v })} placeholder="https://..." />
            </Field>
          </div>
          <Field label="GOOGLE MAPS LINK (location)">
            <TextInput value={form.maps_url} onChange={(v) => setForm({ ...form, maps_url: v })} placeholder="https://maps.google.com/... or maps/dir link" />
          </Field>
          <Field label="SERVICE OPTIONS">
            <div className="flex flex-wrap gap-2.5">
              {([
                { key: "delivery", label: "Delivery" },
                { key: "pickup", label: "Pickup" },
                { key: "dine_in", label: "Dine-in" },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setForm({ ...form, [key]: !form[key] })}
                  className={`text-xs font-dm px-4 py-2 rounded-full border transition-colors ${
                    form[key]
                      ? "border-yellow/50 bg-yellow/10 text-yellow"
                      : "border-[#2a2a2a] text-muted/60 hover:border-yellow/30"
                  }`}
                >
                  {form[key] ? "✓ " : ""}{label}
                </button>
              ))}
            </div>
          </Field>
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !form.business_name || !form.description || !form.offer}
              className="flex items-center gap-2 bg-yellow text-dark font-syne font-bold text-sm px-5 py-2.5 rounded-full hover:bg-yellow-dark disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {editing ? "Save Changes" : "Add Listing"}
            </button>
            <button
              onClick={() => { setShowForm(false); setEditing(null); setForm(emptyListingForm()); }}
              className="text-sm font-dm text-muted hover:text-offwhite transition-colors px-4"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-muted font-dm text-sm py-10">
          <Loader2 size={16} className="animate-spin" /> Loading listings…
        </div>
      ) : listings.length === 0 ? (
        <div className="text-center py-16">
          <Store size={36} className="text-muted/20 mx-auto mb-4" />
          <p className="text-muted/50 font-dm text-sm">No listings yet.</p>
          <p className="text-muted/30 font-dm text-xs mt-1">Add a restaurant or tour operator to show deals to your customers.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {listings.map((l) => (
            <div key={l.id} className={`bg-[#0d0d0d] border rounded-2xl p-5 ${l.active ? "border-[#2a2a2a]" : "border-[#1a1a1a] opacity-60"}`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {(() => { const CatIcon = CATEGORY_ICON[l.category] ?? Store; return <CatIcon size={16} className="text-yellow shrink-0" />; })()}
                    <p className="font-syne font-bold text-offwhite text-sm">{l.business_name}</p>
                    {l.featured && (
                      <span className="font-bebas text-[9px] tracking-[0.15em] bg-yellow/10 text-yellow border border-yellow/20 px-2 py-0.5 rounded-full">
                        ★ FEATURED
                      </span>
                    )}
                    {!l.active && (
                      <span className="font-bebas text-[9px] tracking-[0.15em] text-muted/40 border border-muted/20 px-2 py-0.5 rounded-full">
                        HIDDEN
                      </span>
                    )}
                  </div>
                  <p className="text-muted font-dm text-xs mb-1 line-clamp-1">{l.description}</p>
                  <div className="flex items-center gap-1.5">
                    <Tag size={10} className="text-yellow shrink-0" />
                    <p className="text-yellow/80 font-dm text-xs">{l.offer}</p>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5">
                    {l.contact && (
                      <span className="text-muted/50 font-dm text-xs">{l.contact}</span>
                    )}
                    {l.website && (
                      <a href={l.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-muted/50 hover:text-yellow text-xs font-dm transition-colors">
                        <Globe size={10} /> Website
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleField(l, "featured")}
                    title={l.featured ? "Remove featured" : "Mark as featured"}
                    className={`text-xs font-dm px-2.5 py-1 rounded-full border transition-colors ${l.featured ? "border-yellow/40 text-yellow" : "border-[#2a2a2a] text-muted/40 hover:border-yellow/30"}`}
                  >
                    ★
                  </button>
                  <button
                    onClick={() => toggleField(l, "active")}
                    title={l.active ? "Hide from website" : "Show on website"}
                    className="text-muted/40 hover:text-yellow transition-colors"
                  >
                    {l.active ? <ToggleRight size={18} className="text-green-400" /> : <ToggleLeft size={18} />}
                  </button>
                  <button onClick={() => openEdit(l)} className="text-muted/40 hover:text-yellow transition-colors">
                    <Eye size={14} />
                  </button>
                  <button onClick={() => handleDelete(l.id)} className="text-muted/30 hover:text-red-400 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-yellow/5 border border-yellow/20 rounded-2xl p-5">
        <p className="font-syne font-bold text-offwhite text-sm mb-2">Monetisation tip</p>
        <p className="font-dm text-muted/70 text-xs leading-relaxed">
          Charge local businesses a monthly listing fee (e.g. Rs 500–2,000/month) to appear in the Deals section.
          Featured listings appear first. This can become a recurring income stream with very little effort.
        </p>
      </div>
    </div>
  );
}

// ── Customer reviews moderation ──────────────────────────────────────────────────

function ReviewsModeration() {
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/admin/reviews");
      if (!res.ok) throw new Error();
      setReviews(await res.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function setStatus(id: string, status: ProductReview["status"]) {
    setBusy(id);
    try {
      const ok = await adminWrite("/api/admin/reviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!ok) return;
      setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/admin/reviews?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setReviews((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setBusy(null);
    }
  }

  const counts = {
    pending: reviews.filter((r) => r.status === "pending").length,
    approved: reviews.filter((r) => r.status === "approved").length,
    rejected: reviews.filter((r) => r.status === "rejected").length,
  };
  const visible = reviews.filter((r) => r.status === tab);

  const TABS: { id: "pending" | "approved" | "rejected"; label: string }[] = [
    { id: "pending", label: "Pending" },
    { id: "approved", label: "Approved" },
    { id: "rejected", label: "Rejected" },
  ];

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="text-yellow animate-spin" />
      </div>
    );

  if (error)
    return (
      <div className="text-center py-20">
        <p className="text-red-400 font-dm text-sm mb-4">Failed to load reviews.</p>
        <button onClick={load} className="flex items-center gap-2 text-yellow font-dm text-sm mx-auto">
          <RefreshCw size={14} /> Try again
        </button>
      </div>
    );

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 font-dm text-sm px-4 py-2 rounded-full border transition-colors ${
              tab === t.id
                ? "border-yellow/50 bg-yellow/10 text-yellow"
                : "border-dark-border text-muted hover:text-offwhite"
            }`}
          >
            {t.label}
            <span
              className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${
                tab === t.id ? "bg-yellow text-dark" : "bg-[#1a1a1a] text-muted"
              }`}
            >
              {counts[t.id]}
            </span>
          </button>
        ))}
        <button
          onClick={load}
          className="ml-auto flex items-center gap-1.5 text-muted/50 hover:text-yellow font-dm text-xs transition-colors"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-16">
          <MessageSquare size={36} className="text-muted/20 mx-auto mb-4" />
          <p className="text-muted/50 font-dm text-sm">No {tab} reviews.</p>
          {tab === "pending" && (
            <p className="text-muted/30 font-dm text-xs mt-1">
              New reviews submitted by customers will appear here for your approval.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((r) => (
            <div key={r.id} className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-syne font-bold text-offwhite text-sm">{r.name}</p>
                    {r.origin && (
                      <span className="font-bebas text-muted text-[10px] tracking-[0.2em]">· {r.origin}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        size={13}
                        className={i < r.rating ? "fill-yellow text-yellow" : "text-muted/25"}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {r.scooter_name && (
                    <span className="font-bebas text-[10px] tracking-[0.15em] bg-yellow/10 text-yellow px-2.5 py-1 rounded-full">
                      {r.scooter_name}
                    </span>
                  )}
                  <span className="font-bebas text-muted text-[10px] tracking-[0.2em]">
                    {new Date(r.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>

              <p className="text-offwhite/70 font-dm text-sm leading-relaxed border-t border-[#2a2a2a] pt-3">
                {r.text}
              </p>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                {r.status !== "approved" && (
                  <button
                    disabled={busy === r.id}
                    onClick={() => setStatus(r.id, "approved")}
                    className="flex items-center gap-1.5 font-dm text-xs border border-green-500/40 text-green-400 hover:bg-green-500/10 px-3.5 py-2 rounded-full transition-colors disabled:opacity-40"
                  >
                    {busy === r.id ? <Loader2 size={12} className="animate-spin" /> : <BadgeCheck size={13} />}
                    Approve
                  </button>
                )}
                {r.status !== "rejected" && (
                  <button
                    disabled={busy === r.id}
                    onClick={() => setStatus(r.id, "rejected")}
                    className="flex items-center gap-1.5 font-dm text-xs border border-red-500/40 text-red-400 hover:bg-red-500/10 px-3.5 py-2 rounded-full transition-colors disabled:opacity-40"
                  >
                    {busy === r.id ? <Loader2 size={12} className="animate-spin" /> : <Ban size={13} />}
                    Reject
                  </button>
                )}
                {r.status === "rejected" && (
                  <button
                    disabled={busy === r.id}
                    onClick={() => remove(r.id)}
                    className="flex items-center gap-1.5 font-dm text-xs text-muted/50 hover:text-red-400 px-2 py-2 transition-colors disabled:opacity-40 ml-auto"
                  >
                    <Trash2 size={13} /> Delete permanently
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-yellow/5 border border-yellow/20 rounded-2xl p-5">
        <p className="font-syne font-bold text-offwhite text-sm mb-2">How reviews work</p>
        <p className="font-dm text-muted/70 text-xs leading-relaxed">
          Customers submit reviews from the website. They stay <strong className="text-offwhite">Pending</strong> and
          hidden until you <strong className="text-green-400">Approve</strong> them. Approved reviews appear publicly in
          the &ldquo;Share Your Ride&rdquo; section. Rejected reviews are never shown and can be deleted.
        </p>
      </div>
    </div>
  );
}

// ── Taxi & Transport manager ─────────────────────────────────────────────────

const VEHICLE_TYPES: TaxiDriver["vehicle_type"][] = ["car","minibus","van","scooter","other"];
const VEHICLE_LABELS: Record<string, string> = {
  car: "Car", minibus: "Minibus", van: "Van", scooter: "Scooter", other: "Other",
};

type DriverForm = {
  name: string; phone: string; whatsapp: string; photo: string; photos: string[];
  vehicle: string; vehicle_type: TaxiDriver["vehicle_type"];
  languages: string; areas: string; rate_from: string; notes: string;
};

const emptyDriverForm = (): DriverForm => ({
  name: "", phone: "", whatsapp: "", photo: "", photos: [], vehicle: "",
  vehicle_type: "car", languages: "", areas: "", rate_from: "", notes: "",
});

function TaxiManager() {
  const [drivers, setDrivers] = useState<TaxiDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<DriverForm>(emptyDriverForm());
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [reviews, setReviews] = useState<TaxiDriverReview[]>([]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/taxi");
      if (res.ok) setDrivers(await res.json());
    } finally { setLoading(false); }
  }
  async function loadReviews() {
    try {
      const res = await fetch("/api/admin/taxi-reviews");
      if (res.ok) setReviews(await res.json());
    } catch { /* ignore */ }
  }
  useEffect(() => { load(); loadReviews(); }, []);

  async function setReviewStatus(id: string, status: "approved" | "rejected") {
    await fetch("/api/admin/taxi-reviews", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  }
  async function deleteReview(id: string) {
    if (!confirm("Delete this review permanently?")) return;
    await fetch(`/api/admin/taxi-reviews?id=${id}`, { method: "DELETE" });
    setReviews((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleSave() {
    if (!form.name || !form.phone) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        languages: form.languages.split(",").map((s) => s.trim()).filter(Boolean),
        ...(editing ? { id: editing } : {}),
      };
      const res = await fetch("/api/admin/taxi", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) { await load(); setShowForm(false); setEditing(null); setForm(emptyDriverForm()); }
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this driver?")) return;
    await fetch(`/api/admin/taxi?id=${id}`, { method: "DELETE" });
    setDrivers((prev) => prev.filter((d) => d.id !== id));
  }

  async function toggle(d: TaxiDriver, field: "active" | "featured") {
    await fetch("/api/admin/taxi", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: d.id, [field]: !d[field] }),
    });
    setDrivers((prev) => prev.map((x) => x.id === d.id ? { ...x, [field]: !x[field] } : x));
  }

  function openEdit(d: TaxiDriver) {
    setForm({
      name: d.name, phone: d.phone, whatsapp: d.whatsapp ?? "",
      photo: d.photo ?? "", photos: d.photos ?? (d.photo ? [d.photo] : []),
      vehicle: d.vehicle, vehicle_type: d.vehicle_type,
      languages: (d.languages ?? []).join(", "),
      areas: d.areas, rate_from: d.rate_from ?? "", notes: d.notes ?? "",
    });
    setEditing(d.id);
    setShowForm(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-bebas text-yellow text-[10px] tracking-[0.3em] mb-0.5">DRIVER DIRECTORY</p>
          <p className="font-dm text-muted text-xs">
            Listed at <span className="text-offwhite/60 font-mono">/taxi</span> — tourists tap WhatsApp or call directly. No commission, no app.
          </p>
        </div>
        <button
          onClick={() => { setForm(emptyDriverForm()); setEditing(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-yellow text-dark font-syne font-bold text-xs px-4 py-2 rounded-full hover:bg-yellow-dark transition-colors"
        >
          <Plus size={13} /> Add Driver
        </button>
      </div>

      {/* Add / edit form */}
      {showForm && (
        <div className="bg-[#0d0d0d] border border-yellow/20 rounded-2xl p-6 space-y-5">
          <p className="font-bebas text-yellow text-[10px] tracking-[0.3em]">
            {editing ? "EDIT DRIVER" : "NEW DRIVER"}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="DRIVER NAME *">
              <TextInput value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="e.g. Jean-Pierre Morel" />
            </Field>
            <Field label="PHONE *">
              <TextInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="+230 5XXX XXXX" />
            </Field>
            <Field label="WHATSAPP (if different)">
              <TextInput value={form.whatsapp} onChange={(v) => setForm({ ...form, whatsapp: v })} placeholder="+230 5XXX XXXX" />
            </Field>
            <Field label="STARTING RATE">
              <TextInput value={form.rate_from} onChange={(v) => setForm({ ...form, rate_from: v })} placeholder="e.g. Rs 500" />
            </Field>
            <Field label="VEHICLE">
              <TextInput value={form.vehicle} onChange={(v) => setForm({ ...form, vehicle: v })} placeholder="e.g. Toyota Innova 7-seater" />
            </Field>
            <Field label="VEHICLE TYPE">
              <select
                value={form.vehicle_type}
                onChange={(e) => setForm({ ...form, vehicle_type: e.target.value as TaxiDriver["vehicle_type"] })}
                className={`${inputCls} appearance-none`}
              >
                {VEHICLE_TYPES.map((t) => (
                  <option key={t} value={t}>{VEHICLE_LABELS[t]}</option>
                ))}
              </select>
            </Field>
            <Field label="LANGUAGES (comma-separated)">
              <TextInput value={form.languages} onChange={(v) => setForm({ ...form, languages: v })} placeholder="English, French, Creole" />
            </Field>
          </div>

          <Field label="AREAS AND ROUTES COVERED">
            <Textarea value={form.areas} onChange={(v) => setForm({ ...form, areas: v })} rows={2}
            />
          </Field>

          <Field label="NOTES (optional)">
            <TextInput value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} placeholder="e.g. Airport specialist, night rides available" />
          </Field>

          <MultiImagePicker
            label="PHOTOS OF THE DRIVER AND VEHICLE"
            hint="The first is the one shown on the card. Add the car, the boot, the inside."
            images={form.photos?.length ? form.photos : form.photo ? [form.photo] : []}
            onChange={(imgs) => setForm({ ...form, photos: imgs, photo: imgs[0] ?? "" })}
          />

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !form.name || !form.phone}
              className="flex items-center gap-2 bg-yellow text-dark font-syne font-bold text-sm px-6 py-2.5 rounded-full hover:bg-yellow-dark transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {editing ? "Save Changes" : "Add Driver"}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditing(null); setForm(emptyDriverForm()); }}
              className="text-muted/60 hover:text-offwhite text-sm font-dm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Driver list */}
      {loading ? (
        <div className="flex items-center gap-3 text-muted text-sm py-8">
          <Loader2 size={16} className="animate-spin text-yellow" /> Loading drivers…
        </div>
      ) : drivers.length === 0 && !showForm ? (
        <div className="bg-dark-card border border-dark-border rounded-2xl p-10 text-center">
          <Car size={36} className="text-muted/20 mx-auto mb-3" />
          <p className="text-muted font-dm text-sm">No drivers yet. Add your first one above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {drivers.map((d) => (
            <div key={d.id} className={`bg-dark-card border rounded-2xl p-5 flex items-start gap-4 transition-colors ${d.featured ? "border-yellow/30" : "border-dark-border"}`}>
              {/* Photo thumbnail */}
              <div className="w-14 h-14 rounded-xl overflow-hidden bg-[#0d0d0d] border border-[#2a2a2a] shrink-0 flex items-center justify-center">
                {d.photo ? (
                  <Image src={d.photo} alt={d.name} width={56} height={56} className="object-cover w-full h-full" unoptimized />
                ) : (
                  <Car size={20} className="text-muted/30" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <p className="font-syne font-bold text-offwhite text-sm">{d.name}</p>
                  {d.featured && (
                    <span className="flex items-center gap-1 font-bebas text-[8px] tracking-[0.15em] bg-yellow/10 text-yellow border border-yellow/30 px-2 py-0.5 rounded-full">
                      <Star size={7} className="fill-yellow" /> FEATURED
                    </span>
                  )}
                  {!d.active && (
                    <span className="font-bebas text-[8px] tracking-[0.15em] text-red-400/70 border border-red-500/20 px-2 py-0.5 rounded-full">HIDDEN</span>
                  )}
                </div>
                <p className="text-muted text-xs font-dm">{d.vehicle} · {VEHICLE_LABELS[d.vehicle_type]}</p>
                <p className="text-muted/60 text-xs font-dm mt-0.5 truncate">{d.phone}{d.rate_from ? ` · From ${d.rate_from}` : ""}</p>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                <button
                  onClick={() => toggle(d, "featured")}
                  title={d.featured ? "Unfeature" : "Feature"}
                  className={`flex items-center gap-1 text-xs font-dm px-2.5 py-1.5 rounded-full border transition-colors ${d.featured ? "border-yellow/40 text-yellow bg-yellow/10" : "border-[#2a2a2a] text-muted/50 hover:text-yellow hover:border-yellow/30"}`}
                >
                  <Star size={10} />
                </button>
                <button
                  onClick={() => openEdit(d)}
                  className="text-xs font-dm border border-[#2a2a2a] hover:border-yellow text-muted/60 hover:text-yellow px-3 py-1.5 rounded-lg transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => toggle(d, "active")}
                  className="text-muted/40 hover:text-yellow transition-colors"
                  title={d.active ? "Hide" : "Show"}
                >
                  {d.active ? <ToggleRight size={18} className="text-green-400" /> : <ToggleLeft size={18} />}
                </button>
                <button
                  onClick={() => handleDelete(d.id)}
                  className="text-muted/30 hover:text-red-400 transition-colors"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-muted/40 text-xs font-dm">
        Drivers are shown at <span className="font-mono text-offwhite/40">/taxi</span>.
        Featured drivers appear first with a gold border. Toggle visibility with the switch.
      </p>

      {/* ── Driver reviews moderation ── */}
      <div className="pt-4 border-t border-[#1f1f1f]">
        <div className="flex items-center gap-2 mb-3">
          <Star size={13} className="text-yellow" />
          <p className="font-bebas text-yellow text-[10px] tracking-[0.3em]">DRIVER REVIEWS</p>
          {reviews.some((r) => r.status === "pending") && (
            <span className="font-bebas text-[9px] tracking-[0.15em] bg-yellow text-dark px-2 py-0.5 rounded-full">
              {reviews.filter((r) => r.status === "pending").length} PENDING
            </span>
          )}
        </div>

        {reviews.length === 0 ? (
          <p className="text-muted/50 text-xs font-dm">No driver reviews yet.</p>
        ) : (
          <div className="space-y-2.5">
            {reviews.map((r) => (
              <div key={r.id} className="bg-dark-card border border-dark-border rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} size={11} className={i < r.rating ? "fill-yellow text-yellow" : "text-muted/30"} />
                      ))}
                    </span>
                    {r.driver_name && (
                      <span className="font-bebas text-[9px] tracking-[0.15em] text-muted">→ {r.driver_name}</span>
                    )}
                    <span className={`font-bebas text-[8px] tracking-[0.15em] px-2 py-0.5 rounded-full ${
                      r.status === "approved" ? "bg-green-500/10 text-green-400"
                      : r.status === "rejected" ? "bg-red-500/10 text-red-400/70"
                      : "bg-yellow/10 text-yellow"
                    }`}>
                      {r.status.toUpperCase()}
                    </span>
                  </div>
                  <button onClick={() => deleteReview(r.id)} className="text-muted/30 hover:text-red-400 transition-colors shrink-0" title="Delete">
                    <Trash2 size={13} />
                  </button>
                </div>
                <p className="text-offwhite/80 text-sm font-dm leading-relaxed">{r.text}</p>
                <p className="text-muted text-xs font-dm mt-1.5">{r.name}{r.origin ? ` · ${r.origin}` : ""}</p>
                {r.status !== "approved" && (
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={() => setReviewStatus(r.id, "approved")}
                      className="flex items-center gap-1.5 text-xs font-dm bg-green-500/15 text-green-400 hover:bg-green-500/25 px-3 py-1.5 rounded-full transition-colors"
                    >
                      <CheckCircle size={12} /> Approve
                    </button>
                    {r.status !== "rejected" && (
                      <button
                        onClick={() => setReviewStatus(r.id, "rejected")}
                        className="flex items-center gap-1.5 text-xs font-dm border border-[#2a2a2a] text-muted/60 hover:text-red-400 hover:border-red-500/40 px-3 py-1.5 rounded-full transition-colors"
                      >
                        <Ban size={12} /> Reject
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Waitlist viewer ──────────────────────────────────────────────────────────

interface OwnerApplication {
  id: string;
  owner_name: string;
  phone: string;
  email: string | null;
  listing_type?: string | null;
  business_name?: string | null;
  details?: string | null;
  location: string | null;
  scooters: string | null;
  message: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  id_card_url?: string | null;
  insurance_url?: string | null;
  vehicle_photo_urls?: string[];
}

// Human label + colour for the listing category (matches the public form).
//
// Every value the form can send MUST appear here. The lookup below falls back
// to `vehicle`, so a missing entry does not render blank — it renders a
// confident, wrong "VEHICLE" badge, and a taxi application read as a scooter
// application is a decision made on false information.
const LISTING_BADGE: Record<string, { label: string; cls: string }> = {
  vehicle:    { label: "VEHICLE",    cls: "bg-sky-500/10 text-sky-400" },
  restaurant: { label: "RESTAURANT", cls: "bg-orange-500/10 text-orange-400" },
  stay:       { label: "STAY",       cls: "bg-violet-500/10 text-violet-400" },
  activity:   { label: "ACTIVITY",   cls: "bg-emerald-500/10 text-emerald-400" },
  experience: { label: "EXPERIENCE", cls: "bg-pink-500/10 text-pink-400" },
  // M47 — approval-only categories. Amber/red-leaning on purpose: each of these
  // ends in YOU creating an account or a driver record by hand, so they should
  // not look like the self-service categories in a glanced-at list.
  taxi:       { label: "TAXI",       cls: "bg-amber-500/10 text-amber-400" },
  event:      { label: "ORGANISER",  cls: "bg-fuchsia-500/10 text-fuchsia-400" },
  delivery:   { label: "DELIVERY",   cls: "bg-teal-500/10 text-teal-400" },
};

function OwnerApplicationsViewer() {
  const [list, setList] = useState<OwnerApplication[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/owner-applications");
      if (res.ok) setList(await res.json());
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function setStatus(id: string, status: "approved" | "rejected") {
    await fetch("/api/admin/owner-applications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    setList((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
  }
  async function remove(id: string) {
    if (!confirm("Delete this application permanently?")) return;
    await fetch(`/api/admin/owner-applications?id=${id}`, { method: "DELETE" });
    setList((prev) => prev.filter((a) => a.id !== id));
  }

  const fmt = (s: string) => {
    try { return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); } catch { return s; }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-muted text-sm py-10">
        <Loader2 size={16} className="animate-spin text-yellow" /> Loading applications…
      </div>
    );
  }
  if (list.length === 0) {
    return (
      <div className="bg-dark-card border border-dark-border rounded-2xl p-10 text-center">
        <UserPlus size={36} className="text-muted/20 mx-auto mb-3" />
        <p className="text-muted font-dm text-sm">No applications yet. Partners apply via the <span className="font-mono text-offwhite/40">/list-your-scooter</span> page — vehicles, restaurants, stays, activities and experiences, plus taxi drivers, event organisers and delivery partners, which only you can set up.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {list.map((a) => (
        <div key={a.id} className="bg-dark-card border border-dark-border rounded-2xl p-5">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-syne font-bold text-offwhite text-sm">{a.business_name || a.owner_name}</p>
                {(() => {
                  const b = LISTING_BADGE[a.listing_type ?? "vehicle"] ?? LISTING_BADGE.vehicle;
                  return <span className={`font-bebas text-[8px] tracking-[0.15em] px-2 py-0.5 rounded-full ${b.cls}`}>{b.label}</span>;
                })()}
                <span className={`font-bebas text-[8px] tracking-[0.15em] px-2 py-0.5 rounded-full ${
                  a.status === "approved" ? "bg-green-500/10 text-green-400"
                  : a.status === "rejected" ? "bg-red-500/10 text-red-400/70"
                  : "bg-yellow/10 text-yellow"
                }`}>{a.status.toUpperCase()}</span>
              </div>
              {a.business_name && <p className="text-muted/70 text-xs font-dm mt-0.5">Contact: {a.owner_name}</p>}
              <p className="text-muted text-xs font-dm mt-0.5">{fmt(a.created_at)}</p>
            </div>
            <button onClick={() => remove(a.id)} className="text-muted/30 hover:text-red-400 transition-colors shrink-0" title="Delete">
              <Trash2 size={14} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs font-dm text-offwhite/80 mb-3">
            <p><span className="text-muted">Phone:</span> <a href={`https://wa.me/${a.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="text-yellow hover:underline">{a.phone}</a></p>
            {a.email && <p><span className="text-muted">Email:</span> <a href={`mailto:${a.email}`} className="text-yellow hover:underline">{a.email}</a></p>}
            {a.location && <p><span className="text-muted">Area:</span> {a.location}</p>}
            {(a.details || a.scooters) && <p><span className="text-muted">Details:</span> {a.details || a.scooters}</p>}
          </div>
          {a.message && <p className="text-muted/80 text-sm font-dm italic mb-3">“{a.message}”</p>}

          {/* Documents (private — short-lived signed links) */}
          {(a.id_card_url || a.insurance_url || (a.vehicle_photo_urls && a.vehicle_photo_urls.length > 0)) && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {a.id_card_url && (
                <a href={a.id_card_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-dm bg-dark border border-[#2a2a2a] hover:border-yellow/40 text-muted hover:text-yellow px-3 py-1.5 rounded-full transition-colors">
                  <FileCheck size={12} /> View ID
                </a>
              )}
              {a.insurance_url && (
                <a href={a.insurance_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-dm bg-dark border border-[#2a2a2a] hover:border-yellow/40 text-muted hover:text-yellow px-3 py-1.5 rounded-full transition-colors">
                  <FileCheck size={12} /> View insurance
                </a>
              )}
              {(a.vehicle_photo_urls ?? []).map((u, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="w-12 h-12 rounded-lg overflow-hidden border border-[#2a2a2a] hover:border-yellow/40">
                  <img src={u} alt={`vehicle ${i + 1}`} className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          )}

          {a.status !== "approved" && (
            <div className="flex items-center gap-2">
              <button onClick={() => setStatus(a.id, "approved")} className="flex items-center gap-1.5 text-xs font-dm bg-green-500/15 text-green-400 hover:bg-green-500/25 px-3 py-1.5 rounded-full transition-colors">
                <CheckCircle size={12} /> Approve
              </button>
              {a.status !== "rejected" && (
                <button onClick={() => setStatus(a.id, "rejected")} className="flex items-center gap-1.5 text-xs font-dm border border-[#2a2a2a] text-muted/60 hover:text-red-400 hover:border-red-500/40 px-3 py-1.5 rounded-full transition-colors">
                  <Ban size={12} /> Reject
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

interface LeadSummary { target: string; kind: string; category: string | null; total: number; last30: number; }
interface LeadRecent { kind: string; target_name: string; category: string | null; type: string | null; ref: string | null; created_at: string; }
interface LeadData {
  totals: { all: number; last30: number; stayEatDo: number; taxi: number; food: number };
  summary: LeadSummary[];
  recent: LeadRecent[];
  misses?: { question: string; count: number; last: string }[];
}

function LeadsViewer() {
  const [data, setData] = useState<LeadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [missList, setMissList] = useState<{ question: string; count: number; last: string }[]>([]);

  useEffect(() => {
    fetch("/api/admin/leads")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { setData(d); if (d?.misses) setMissList(d.misses); })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const markAnswered = (q: string) => {
    setMissList((l) => l.filter((m) => m.question !== q));
    fetch("/api/admin/leads", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }) }).catch(() => {});
  };

  const kindLabel = (k: string) =>
    k === "taxi" ? "Taxi" : k === "food_concierge" ? "Food concierge" : "Accommodation & Activity";
  const fmt = (s: string) => {
    try { return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); } catch { return s; }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-muted text-sm py-10">
        <Loader2 size={16} className="animate-spin text-yellow" /> Loading leads…
      </div>
    );
  }
  if (!data || (data.totals.all === 0 && missList.length === 0)) {
    return (
      <div className="bg-dark-card border border-dark-border rounded-2xl p-10 text-center">
        <TrendingUp size={36} className="text-muted/20 mx-auto mb-3" />
        <p className="text-muted font-dm text-sm">No leads yet. When visitors tap the Food Concierge, “Book / Enquire” on a Stay·Eat·Do listing, or contact a taxi driver, it shows up here — with the craving &amp; budget they chose.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Ti Roulé — questions he couldn't answer (grow the knowledge base) */}
      {missList.length > 0 && (
        <div className="bg-dark-card border border-yellow/20 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-border flex items-center gap-2">
            <Sparkles size={13} className="text-yellow" />
            <p className="font-bebas text-yellow text-[10px] tracking-[0.3em]">TI ROULÉ — QUESTIONS TO ANSWER</p>
          </div>
          <div className="divide-y divide-dark-border">
            {missList.map((m) => (
              <div key={m.question} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-offwhite text-sm break-words">{m.question}</p>
                  <p className="text-muted text-xs">{m.count}× · {fmt(m.last)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => markAnswered(m.question)}
                  className="shrink-0 inline-flex items-center gap-1 text-xs font-dm text-green-400/90 hover:text-green-400 border border-green-500/30 hover:border-green-500/60 rounded-full px-3 py-1.5 transition-colors"
                >
                  <CheckCircle size={12} /> Answered
                </button>
              </div>
            ))}
          </div>
          <p className="px-5 py-2.5 text-muted/50 text-xs font-dm border-t border-dark-border">
            Questions visitors typed that Ti Roulé couldn&apos;t answer. Add them to his knowledge, then mark them Answered. (You also get this as a weekly email.)
          </p>
        </div>
      )}
      {/* Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: "Leads (last 30 days)", value: data.totals.last30 },
          { label: "Leads (all time)", value: data.totals.all },
          { label: "Food concierge", value: data.totals.food ?? 0 },
          { label: "Stay & Activity", value: data.totals.stayEatDo },
          { label: "Taxi", value: data.totals.taxi },
        ].map((s) => (
          <div key={s.label} className="bg-dark-card border border-dark-border rounded-2xl p-5">
            <p className="font-syne font-extrabold text-yellow text-2xl mb-1">{s.value}</p>
            <p className="font-dm text-muted text-xs">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Per-listing summary — what you invoice on */}
      <div className="bg-dark-card border border-dark-border rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-dark-border flex items-center justify-between">
          <p className="font-bebas text-yellow text-[10px] tracking-[0.3em]">LEADS BY LISTING</p>
          <p className="font-bebas text-muted/50 text-[9px] tracking-[0.2em]">30 DAYS · ALL TIME</p>
        </div>
        <div className="divide-y divide-dark-border">
          {data.summary.map((s, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="text-offwhite text-sm font-medium truncate">{s.target}</p>
                <p className="text-muted text-xs">{kindLabel(s.kind)}{s.category ? ` · ${s.category}` : ""}</p>
              </div>
              <div className="flex items-center gap-4 shrink-0 font-mono">
                <span className="text-yellow text-sm font-bold">{s.last30}</span>
                <span className="text-muted/60 text-xs">{s.total}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent activity */}
      <div>
        <p className="font-bebas text-yellow text-[10px] tracking-[0.3em] mb-3">RECENT ACTIVITY</p>
        <div className="bg-dark-card border border-dark-border rounded-2xl divide-y divide-dark-border overflow-hidden">
          {data.recent.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-5 py-2.5">
              <div className="min-w-0">
                <span className="text-offwhite/90 text-sm">{r.target_name}</span>
                <span className="text-muted/50 text-xs ml-2">
                  {kindLabel(r.kind)}
                  {r.kind === "food_concierge" && r.ref ? ` · ${r.ref}` : r.type ? ` · ${r.type}` : ""}
                </span>
              </div>
              <span className="text-muted/50 text-xs font-dm shrink-0">{fmt(r.created_at)}</span>
            </div>
          ))}
        </div>
        <p className="text-muted/40 text-xs font-dm mt-3">
          Bold = last 30 days, grey = all time. Use these counts to bill featured placements or pay-per-lead.
        </p>
      </div>
    </div>
  );
}

// ── WhatsApp alert (CallMeBot) settings ──────────────────────────────────────
function NotificationsEditor() {
  const [phone, setPhone] = useState("");
  const [apikey, setApikey] = useState("");
  const [apikeyHint, setApikeyHint] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/notifications");
        if (res.ok) {
          const d = await res.json();
          setPhone(d.phone || "");
          setApikeyHint(d.apikeyHint || "");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, apikey }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg({ ok: true, text: "Saved! Alerts now go to this number. Send a test to confirm." });
        setApikeyHint(apikey ? `••••${apikey.slice(-3)}` : apikeyHint);
        setApikey("");
      } else {
        setMsg({ ok: false, text: d.error || "Could not save." });
      }
    } catch {
      setMsg({ ok: false, text: "Network error — try again." });
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/notifications", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      setMsg(
        res.ok
          ? { ok: true, text: "Test sent — check WhatsApp on the configured number!" }
          : { ok: false, text: d.error || "Test failed." },
      );
    } catch {
      setMsg({ ok: false, text: "Network error — try again." });
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-yellow" /></div>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* How to switch to a new number */}
      <div className="bg-[#0d0d0d] border border-yellow/25 rounded-2xl p-6">
        <p className="font-bebas text-yellow text-xs tracking-[0.3em] mb-3">SWITCHING TO A NEW NUMBER — 2 MINUTES</p>
        <ol className="space-y-2.5 text-sm font-dm text-offwhite/85 list-decimal list-inside">
          <li>
            On the <strong>new phone</strong>, save this contact: <strong className="text-yellow">+34 644 84 71 89</strong> (CallMeBot).
          </li>
          <li>
            From that phone, send it this WhatsApp message:{" "}
            <em className="text-offwhite">&ldquo;I allow callmebot to send me messages&rdquo;</em>
          </li>
          <li>CallMeBot replies in a minute with your personal <strong>API key</strong> (a number).</li>
          <li>Enter the new number and that API key below, save, then send a test.</li>
        </ol>
        <p className="text-muted/50 font-dm text-xs mt-3">
          Each phone number has its own key — the old number&apos;s key won&apos;t work for a new number.
        </p>
      </div>

      {/* Settings */}
      <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-6 space-y-4">
        <Field label="WHATSAPP NUMBER (with country code, digits only)">
          <TextInput value={phone} onChange={setPhone} placeholder="e.g. 23058355588" />
        </Field>
        <Field label={apikeyHint ? `CALLMEBOT API KEY (current: ${apikeyHint} — enter a new one to replace)` : "CALLMEBOT API KEY"}>
          <TextInput value={apikey} onChange={setApikey} placeholder="e.g. 7133530" />
        </Field>

        {msg && (
          <p className={`flex items-center gap-2 text-sm font-dm ${msg.ok ? "text-green-400" : "text-red-400"}`}>
            {msg.ok ? <CheckCircle size={15} /> : <AlertCircle size={15} />} {msg.text}
          </p>
        )}

        <div className="flex flex-wrap gap-3 pt-1">
          <button
            onClick={save}
            disabled={saving || !phone || !apikey}
            className="flex items-center gap-2 bg-yellow text-dark font-syne font-bold text-sm px-5 py-2.5 rounded-full hover:bg-yellow-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save
          </button>
          <button
            onClick={sendTest}
            disabled={testing}
            className="flex items-center gap-2 border border-[#2a2a2a] hover:border-yellow/50 text-offwhite font-dm text-sm px-5 py-2.5 rounded-full transition-colors disabled:opacity-50"
          >
            {testing ? <Loader2 size={15} className="animate-spin" /> : <MessageSquare size={15} />} Send test message
          </button>
        </div>
        <p className="text-muted/40 font-dm text-[11px]">
          Alerts sent here: new bookings, Stay·Eat·Do reservations, and the daily deliver/collect digest.
        </p>
      </div>

      <EmailSettingsCard />
      <EmailDeliveryCard />
    </div>
  );
}

// ── Customer email (Brevo) settings ─────────────────────────────────────────
function EmailSettingsCard() {
  const [from, setFrom] = useState("");
  const [apikey, setApikey] = useState("");
  const [apikeyHint, setApikeyHint] = useState("");
  const [listId, setListId] = useState("");
  const [txListId, setTxListId] = useState("");
  const [testTo, setTestTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/email");
        if (res.ok) {
          const d = await res.json();
          setFrom(d.from || "");
          setListId(d.listId || "");
          setTxListId(d.transactionalListId || "");
          setApikeyHint(d.apikeyHint || "");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apikey, from, listId, transactionalListId: txListId }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg({ ok: true, text: "Saved! Send a test email below to confirm it works." });
        setApikeyHint(apikey ? "••••saved" : apikeyHint);
        setApikey("");
      } else {
        setMsg({ ok: false, text: d.error || "Could not save." });
      }
    } catch {
      setMsg({ ok: false, text: "Network error — try again." });
    } finally {
      setSaving(false);
    }
  }

  // `provider` pins the send to one provider with no failover, so a freshly
  // configured provider can actually be proven. Without it the test routes by
  // type and would succeed through the other one, proving nothing.
  async function sendTest(provider?: "resend" | "brevo") {
    setTesting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testTo, provider }),
      });
      const d = await res.json().catch(() => ({}));
      const via = provider ? ` via ${provider}` : "";
      setMsg(
        res.ok
          ? { ok: true, text: `Test email sent to ${testTo}${via} — check the inbox (and spam).` }
          : { ok: false, text: d.error || "Test failed." },
      );
    } catch {
      setMsg({ ok: false, text: "Network error — try again." });
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-yellow" /></div>;
  }

  return (
    <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-6 space-y-4">
      <div>
        <p className="font-bebas text-yellow text-xs tracking-[0.3em]">CUSTOMER EMAILS (BREVO)</p>
        <p className="text-muted/60 text-xs font-dm mt-1 leading-relaxed">
          Powers booking confirmations, reminders, feedback requests and the saved-list welcome.
          Free at brevo.com (300 emails/day) — verify a sender email under{" "}
          <strong className="text-offwhite/80">Brevo → Senders</strong>, create an API key under{" "}
          <strong className="text-offwhite/80">SMTP &amp; API</strong>, then paste both here.
        </p>
      </div>

      <Field label={apikeyHint ? `BREVO API KEY (current: ${apikeyHint} — paste a new one to replace)` : "BREVO API KEY (xkeysib-…)"}>
        <TextInput value={apikey} onChange={setApikey} placeholder="xkeysib-…" />
      </Field>
      <Field label="SENDER (must be verified in Brevo)">
        <TextInput value={from} onChange={setFrom} placeholder="Roule Rodrigues <you@gmail.com>" />
      </Field>
      <Field label="TRANSACTIONAL LIST ID (optional — everyone who books joins this list)">
        <TextInput value={txListId} onChange={setTxListId} placeholder="e.g. 4 (Brevo → Contacts → Lists)" />
      </Field>
      <Field label="MARKETING LIST ID (optional — ONLY people who opted in: waitlist and saved lists)">
        <TextInput value={listId} onChange={setListId} placeholder="e.g. 3 (Brevo → Contacts → Lists)" />
      </Field>
      <p className="text-muted/50 text-[11px] font-dm leading-relaxed">
        These must be two different lists. Booking a scooter is consent to hear about that booking —
        it is not consent to receive campaigns. Send promotions to the <strong className="text-offwhite/70">marketing</strong> list
        only; the <strong className="text-offwhite/70">transactional</strong> list is for lifecycle automations
        (confirmations, pre-trip reminders) and must never be used as a campaign audience.
      </p>

      {msg && (
        <p className={`flex items-center gap-2 text-sm font-dm ${msg.ok ? "text-green-400" : "text-red-400"}`}>
          {msg.ok ? <CheckCircle size={15} /> : <AlertCircle size={15} />} {msg.text}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          onClick={save}
          disabled={saving || !apikey || !from}
          className="flex items-center gap-2 bg-yellow text-dark font-syne font-bold text-sm px-5 py-2.5 rounded-full hover:bg-yellow-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <input
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="you@email.com"
            className="flex-1 bg-[#0d0d0d] border border-[#2a2a2a] rounded-full px-4 py-2.5 text-sm text-offwhite font-dm focus:border-yellow focus:outline-none"
          />
          <button
            onClick={() => sendTest("brevo")}
            disabled={testing || !testTo}
            className="flex items-center gap-2 border border-[#2a2a2a] hover:border-yellow/50 text-offwhite font-dm text-sm px-4 py-2.5 rounded-full transition-colors disabled:opacity-50 shrink-0"
          >
            {testing ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} Test via Brevo
          </button>
          {/* Separate button, not a dropdown: the whole point is to prove ONE
              named provider works, and a two-click control makes it easy to
              think you tested Resend when the selector was still on Brevo. */}
          <button
            onClick={() => sendTest("resend")}
            disabled={testing || !testTo}
            className="flex items-center gap-2 border border-[#2a2a2a] hover:border-yellow/50 text-offwhite font-dm text-sm px-4 py-2.5 rounded-full transition-colors disabled:opacity-50 shrink-0"
          >
            {testing ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} Test via Resend
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Email delivery: quota, reserve, and what is consuming it (M41) ──────────
// Deliberately actionable rather than decorative (§32 of the email brief): if
// usage is high, the panel names the email types responsible so traffic can be
// moved, and lists every send that did NOT arrive so nothing is silently lost.
interface QuotaWindowView {
  used: number;
  limit: number | null;
  remaining: number | null;
  percent: number | null;
  level: string;
}
interface ProviderUsageView {
  provider: "resend" | "brevo";
  enabled: boolean;
  configured: boolean;
  configReason?: string;
  day: QuotaWindowView;
  month: QuotaWindowView;
  level: string;
  usageKnown: boolean;
  blindSpot?: string;
}
interface ReserveView {
  provider: string;
  configuredDaily: number;
  configuredMonthly: number;
  onlyWhenActive: boolean;
  ticketingActive: boolean;
  ticketingKnown: boolean;
  activeEvents: number;
  protectedDaily: number;
  protectedMonthly: number;
  flexibleDaily: number | null;
  flexibleMonthly: number | null;
  estimatedRequirement: number | null;
  sufficient: boolean | null;
}
interface ActivityView {
  id: string;
  createdAt: string;
  emailType: string;
  provider: string | null;
  status: string;
  recipient: string;
  relatedType: string | null;
  relatedId: string | null;
  failureReason: string | null;
}
interface EmailOpsData {
  activeProvider: string;
  ownerAlerts?: { to: string; explicit: boolean };
  usage: { resend: ProviderUsageView; brevo: ProviderUsageView };
  reserve: ReserveView;
  todayTypes: { emailType: string; count: number }[];
  activity: ActivityView[];
  problems: ActivityView[];
  statuses: Record<string, number>;
  config: {
    defaultProvider: string;
    providers: Record<string, { enabled: boolean; dailyLimit: number | null; monthlyLimit: number | null }>;
    thresholds: { watch: number; warning: number; critical: number };
    reserves: { ticketing: { provider: string; daily: number; monthly: number; onlyWhenActive: boolean } };
  };
}

const LEVEL_STYLE: Record<string, { dot: string; text: string; label: string }> = {
  normal: { dot: "bg-green-400", text: "text-green-400", label: "Normal" },
  watch: { dot: "bg-yellow", text: "text-yellow", label: "Watch" },
  warning: { dot: "bg-orange-400", text: "text-orange-400", label: "Warning" },
  critical: { dot: "bg-red-400", text: "text-red-400", label: "Critical" },
  exhausted: { dot: "bg-red-500", text: "text-red-500", label: "Limit reached" },
  unconfigured: { dot: "bg-[#3a3a3a]", text: "text-muted/60", label: "Not configured" },
};

function levelStyle(l: string) {
  return LEVEL_STYLE[l] ?? LEVEL_STYLE.unconfigured;
}

function prettyType(t: string) {
  return t.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function QuotaBar({ w }: { w: QuotaWindowView }) {
  const pct = w.percent ?? 0;
  const s = levelStyle(w.level);
  return (
    <div className="h-1.5 rounded-full bg-[#1c1c1c] overflow-hidden">
      <div className={`h-full ${s.dot} transition-all`} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
    </div>
  );
}

function ProviderQuota({ u }: { u: ProviderUsageView }) {
  const s = levelStyle(u.configured ? u.level : "unconfigured");
  const windows: [string, QuotaWindowView][] = [
    ["today", u.day],
    ["this month", u.month],
  ];
  return (
    <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-bebas text-offwhite text-sm tracking-[0.2em]">{u.provider.toUpperCase()}</p>
        <span className={`flex items-center gap-1.5 text-[11px] font-dm ${s.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} /> {s.label}
        </span>
      </div>

      {!u.configured ? (
        <p className="text-muted/60 text-xs font-dm leading-relaxed">{u.configReason ?? "Not configured."}</p>
      ) : (
        <>
          {windows.map(([label, w]) =>
            w.limit === null ? (
              <p key={label} className="text-muted/50 text-[11px] font-dm">
                {w.used} sent {label} · no {label === "today" ? "daily" : "monthly"} limit set
              </p>
            ) : (
              <div key={label} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-offwhite font-dm text-sm">
                    {w.used} <span className="text-muted/50">/ {w.limit}</span>{" "}
                    <span className="text-muted/50 text-xs">{label}</span>
                  </span>
                  <span className="text-muted/60 font-dm text-[11px]">
                    {w.percent?.toFixed(0)}% · {w.remaining} left
                  </span>
                </div>
                <QuotaBar w={w} />
              </div>
            ),
          )}
          {!u.usageKnown && (
            <p className="text-orange-400/80 text-[11px] font-dm">
              Usage could not be read from the log — these numbers are not reliable right now.
            </p>
          )}
          {u.blindSpot && <p className="text-muted/45 text-[11px] font-dm leading-relaxed">{u.blindSpot}</p>}
        </>
      )}
    </div>
  );
}

function EmailDeliveryCard() {
  const [d, setD] = useState<EmailOpsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  // Editable settings — seeded from the server, never hard-coded here.
  const [resendDaily, setResendDaily] = useState("");
  const [resendMonthly, setResendMonthly] = useState("");
  const [brevoDaily, setBrevoDaily] = useState("");
  const [watch, setWatch] = useState("");
  const [warning, setWarning] = useState("");
  const [critical, setCritical] = useState("");
  const [reserveDaily, setReserveDaily] = useState("");
  const [reserveMonthly, setReserveMonthly] = useState("");
  const [reserveOnlyActive, setReserveOnlyActive] = useState(true);

  function seed(data: EmailOpsData) {
    setResendDaily(String(data.config.providers.resend?.dailyLimit ?? ""));
    setResendMonthly(String(data.config.providers.resend?.monthlyLimit ?? ""));
    setBrevoDaily(String(data.config.providers.brevo?.dailyLimit ?? ""));
    setWatch(String(data.config.thresholds.watch));
    setWarning(String(data.config.thresholds.warning));
    setCritical(String(data.config.thresholds.critical));
    setReserveDaily(String(data.config.reserves.ticketing.daily));
    setReserveMonthly(String(data.config.reserves.ticketing.monthly));
    setReserveOnlyActive(data.config.reserves.ticketing.onlyWhenActive);
  }

  async function load() {
    try {
      const res = await fetch("/api/admin/email");
      if (res.ok) {
        const data = (await res.json()) as EmailOpsData;
        setD(data);
        seed(data);
      }
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function saveConfig() {
    setSaving(true);
    setMsg(null);
    const n = (v: string) => (v.trim() === "" ? null : Number(v));
    try {
      const res = await fetch("/api/admin/email", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providers: {
            resend: { dailyLimit: n(resendDaily), monthlyLimit: n(resendMonthly) },
            brevo: { dailyLimit: n(brevoDaily) },
          },
          thresholds: { watch: Number(watch), warning: Number(warning), critical: Number(critical) },
          reserves: {
            ticketing: {
              daily: Number(reserveDaily),
              monthly: Number(reserveMonthly),
              onlyWhenActive: reserveOnlyActive,
            },
          },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg({ ok: true, text: "Saved. New limits apply to the next email sent." });
        await load();
      } else {
        setMsg({ ok: false, text: body.error || "Could not save." });
      }
    } catch {
      setMsg({ ok: false, text: "Network error — try again." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 size={20} className="animate-spin text-yellow" />
      </div>
    );
  }
  if (!d) return null;

  const r = d.reserve;

  return (
    <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-6 space-y-5">
      {/* Where the internal alerts land. This panel showed provider health,
          quota and every failure — and not one word about the address the
          owner's own alerts are sent to, which is why OWNER_EMAIL being unset
          went unnoticed for months while everything here looked healthy. */}
      {d.ownerAlerts && (
        <div
          className={`mb-5 rounded-xl border p-3.5 ${
            d.ownerAlerts.explicit
              ? "border-[#2a2a2a] bg-[#0d0d0d]"
              : "border-yellow/40 bg-yellow/[0.06]"
          }`}
        >
          <p className="font-bebas text-[10px] tracking-[0.25em] text-muted">YOUR ALERTS GO TO</p>
          <p className="mt-1 font-dm text-sm text-offwhite break-all">{d.ownerAlerts.to}</p>
          <p className="mt-1.5 font-dm text-[11px] leading-relaxed text-muted/70">
            {d.ownerAlerts.explicit ? (
              <>New bookings, reservations, the daily pickup and return reminders and reported payments all land here.</>
            ) : (
              <>
                No <code className="text-yellow/80">OWNER_EMAIL</code> is set, so this falls back to the site&apos;s
                contact address. Set <code className="text-yellow/80">OWNER_EMAIL</code> in Vercel and redeploy to send
                them to an inbox you read.
              </>
            )}
          </p>
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bebas text-yellow text-xs tracking-[0.3em]">EMAIL DELIVERY</p>
          <p className="text-muted/60 text-xs font-dm mt-1 leading-relaxed">
            Free-tier capacity across both providers. Emails currently go out via{" "}
            <strong className="text-offwhite/80">{d.activeProvider}</strong>.
          </p>
        </div>
        <button
          onClick={load}
          className="shrink-0 text-muted/60 hover:text-yellow transition-colors"
          title="Refresh"
          aria-label="Refresh email delivery stats"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ProviderQuota u={d.usage.brevo} />
        <ProviderQuota u={d.usage.resend} />
      </div>

      {/* ── Ticketing reserve ── */}
      <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="font-bebas text-offwhite text-sm tracking-[0.2em]">TICKETING RESERVE</p>
          <span
            className={`text-[11px] font-dm ${r.ticketingActive ? "text-yellow" : "text-muted/50"}`}
          >
            {r.ticketingActive
              ? `Active · ${r.activeEvents} event${r.activeEvents === 1 ? "" : "s"} on sale`
              : "Dormant · no events on sale"}
          </span>
        </div>
        <p className="text-muted/60 text-xs font-dm leading-relaxed">
          {r.ticketingActive ? (
            <>
              Holding <strong className="text-offwhite/80">{r.protectedDaily}/day</strong> and{" "}
              <strong className="text-offwhite/80">{r.protectedMonthly}/month</strong> of {r.provider} capacity for
              ticket emails. Other email may use {r.flexibleDaily ?? "∞"}/day.
            </>
          ) : (
            <>
              Configured at {r.configuredDaily}/day and {r.configuredMonthly}/month on {r.provider}, but nothing is
              held back — there are no published, uncancelled, upcoming events, so the full capacity stays available
              to normal traffic. It protects itself again automatically the moment an event goes on sale.
            </>
          )}
        </p>
        {!r.ticketingKnown && (
          <p className="text-orange-400/80 text-[11px] font-dm">
            Could not check for live events, so the reserve is being applied as a precaution.
          </p>
        )}
        {r.sufficient === false && (
          <p className="text-orange-400 text-xs font-dm leading-relaxed">
            ⚠ The reserve may be too small: about {r.estimatedRequirement} ticket emails are needed for the capacity
            still on sale, against {r.configuredMonthly} reserved. Raise it below, or move other email off{" "}
            {r.provider}.
          </p>
        )}
        {r.sufficient === true && (
          <p className="text-green-400/80 text-[11px] font-dm">
            Reserve looks sufficient — about {r.estimatedRequirement} ticket emails needed for the capacity still on
            sale.
          </p>
        )}
      </div>

      {/* ── What is consuming it ── */}
      {d.todayTypes.length > 0 && (
        <div className="space-y-2">
          <p className="font-bebas text-offwhite/70 text-xs tracking-[0.25em]">TOP EMAIL TYPES TODAY</p>
          <div className="space-y-1">
            {d.todayTypes.map((t) => (
              <div key={t.emailType} className="flex items-center justify-between gap-3 text-xs font-dm">
                <span className="text-muted/70 truncate">{prettyType(t.emailType)}</span>
                <span className="text-offwhite/80 shrink-0">{t.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Anything that did not arrive ── */}
      {d.problems.length > 0 && (
        <div className="space-y-2">
          <p className="font-bebas text-red-400/80 text-xs tracking-[0.25em]">NOT DELIVERED — NEEDS A LOOK</p>
          <div className="space-y-2">
            {d.problems.map((p) => (
              <div key={p.id} className="bg-[#160f0f] border border-red-900/40 rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs font-dm">
                  <span className="text-offwhite/80">{prettyType(p.emailType)}</span>
                  <span className="text-red-400/80 uppercase text-[10px] tracking-wider">{p.status}</span>
                </div>
                <p className="text-muted/60 text-[11px] font-dm break-all">
                  {p.recipient}
                  {p.relatedId ? ` · ${p.relatedType} ${p.relatedId}` : ""}
                </p>
                {p.failureReason && (
                  <p className="text-muted/50 text-[11px] font-dm leading-relaxed">{p.failureReason}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Recent activity ── */}
      <div className="space-y-2">
        <p className="font-bebas text-offwhite/70 text-xs tracking-[0.25em]">RECENT ACTIVITY</p>
        {d.activity.length === 0 ? (
          <p className="text-muted/50 text-xs font-dm">
            No emails logged yet. Every send from now on is recorded here.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[11px] font-dm min-w-[420px]">
              <tbody>
                {d.activity.map((a) => (
                  <tr key={a.id} className="border-b border-[#1c1c1c] last:border-0">
                    <td className="py-1.5 pr-2 text-muted/50 whitespace-nowrap align-top">
                      {new Date(a.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="py-1.5 pr-2 text-offwhite/80 align-top">{prettyType(a.emailType)}</td>
                    <td className="py-1.5 pr-2 text-muted/60 whitespace-nowrap align-top">{a.provider ?? "—"}</td>
                    <td
                      className={`py-1.5 pr-2 whitespace-nowrap align-top ${
                        a.status === "sent" ? "text-green-400/80" : "text-red-400/80"
                      }`}
                    >
                      {a.status}
                    </td>
                    <td className="py-1.5 text-muted/50 truncate max-w-[110px] align-top">
                      {a.relatedId ?? a.recipient}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Settings ── */}
      <div className="pt-1 border-t border-[#1c1c1c]">
        <button
          onClick={() => setShowConfig((v) => !v)}
          className="flex items-center gap-2 text-muted/70 hover:text-yellow transition-colors text-xs font-dm py-2"
        >
          <Settings size={14} /> {showConfig ? "Hide" : "Adjust"} limits, thresholds and the reserve
        </button>

        {showConfig && (
          <div className="space-y-3 pt-2">
            <p className="text-muted/50 text-[11px] font-dm leading-relaxed">
              Change these if a provider changes its free tier, or to move where capacity is protected. Leave a limit
              blank to mean &ldquo;no ceiling&rdquo; (a paid plan).
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="RESEND — EMAILS PER DAY">
                <TextInput value={resendDaily} onChange={setResendDaily} placeholder="100" />
              </Field>
              <Field label="RESEND — EMAILS PER MONTH">
                <TextInput value={resendMonthly} onChange={setResendMonthly} placeholder="3000" />
              </Field>
              <Field label="BREVO — EMAILS PER DAY">
                <TextInput value={brevoDaily} onChange={setBrevoDaily} placeholder="300" />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="WATCH %">
                <TextInput value={watch} onChange={setWatch} placeholder="70" />
              </Field>
              <Field label="WARNING %">
                <TextInput value={warning} onChange={setWarning} placeholder="80" />
              </Field>
              <Field label="CRITICAL %">
                <TextInput value={critical} onChange={setCritical} placeholder="90" />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={`TICKETING RESERVE / DAY (on ${r.provider})`}>
                <TextInput value={reserveDaily} onChange={setReserveDaily} placeholder="40" />
              </Field>
              <Field label={`TICKETING RESERVE / MONTH (on ${r.provider})`}>
                <TextInput value={reserveMonthly} onChange={setReserveMonthly} placeholder="300" />
              </Field>
            </div>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={reserveOnlyActive}
                onChange={(e) => setReserveOnlyActive(e.target.checked)}
                className="mt-0.5 accent-yellow"
              />
              <span className="text-muted/70 text-xs font-dm leading-relaxed">
                Only hold the reserve while events are actually on sale (recommended). Unticked, the capacity stays
                protected permanently even with no events — which just shrinks the pool available to everything else.
              </span>
            </label>

            {msg && (
              <p
                className={`flex items-center gap-2 text-sm font-dm ${msg.ok ? "text-green-400" : "text-red-400"}`}
              >
                {msg.ok ? <CheckCircle size={15} /> : <AlertCircle size={15} />} {msg.text}
              </p>
            )}

            <button
              onClick={saveConfig}
              disabled={saving}
              className="flex items-center gap-2 bg-yellow text-dark font-syne font-bold text-sm px-5 py-2.5 rounded-full hover:bg-yellow-dark transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save limits
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function WaitlistViewer() {
  const [list, setList] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/waitlist");
      if (res.ok) setList(await res.json());
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function remove(id: string) {
    await fetch(`/api/admin/waitlist?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setList((p) => p.filter((e) => e.id !== id));
  }

  function copyAll() {
    navigator.clipboard?.writeText(list.map((e) => e.email).join(", ")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function exportCsv() {
    const rows = [["email", "name", "source", "signed_up"]];
    list.forEach((e) =>
      rows.push([e.email, e.name ?? "", e.source ?? "", new Date(e.created_at).toISOString()])
    );
    // Was: a detached <a> clicked while never in the DOM (Firefox ignores that),
    // with revokeObjectURL on the very next line — which can destroy the blob
    // before the browser has finished reading it. Both fail silently, which is
    // exactly what "the download button does nothing" looks like.
    downloadCsv(toCsv(rows), `waitlist-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="text-yellow animate-spin" />
      </div>
    );

  if (list.length === 0)
    return (
      <div className="text-center py-20">
        <Mail size={36} className="text-muted/30 mx-auto mb-4" />
        <p className="text-muted/50 font-dm text-sm">No signups yet.</p>
        <p className="text-muted/30 font-dm text-xs mt-1">
          When people join from the website&apos;s &ldquo;Stay in the loop&rdquo; section, they appear here.
        </p>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
        <p className="text-muted/60 font-dm text-xs">{list.length} signup{list.length !== 1 ? "s" : ""}</p>
        <div className="flex items-center gap-2">
          <button onClick={copyAll} className="flex items-center gap-1.5 text-xs font-dm border border-[#2a2a2a] hover:border-yellow/40 text-muted hover:text-yellow px-3 py-1.5 rounded-full transition-colors">
            <Copy size={12} /> {copied ? "Copied!" : "Copy emails"}
          </button>
          <button onClick={exportCsv} className="flex items-center gap-1.5 text-xs font-dm border border-[#2a2a2a] hover:border-yellow/40 text-muted hover:text-yellow px-3 py-1.5 rounded-full transition-colors">
            <Share2 size={12} /> Export CSV
          </button>
          <button onClick={load} className="flex items-center gap-1.5 text-muted/50 hover:text-yellow font-dm text-xs transition-colors">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>
      <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl divide-y divide-[#1a1a1a]">
        {list.map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <a href={`mailto:${e.email}`} className="font-dm text-offwhite text-sm hover:text-yellow transition-colors truncate block">
                {e.email}
              </a>
              <p className="font-bebas text-muted/50 text-[10px] tracking-[0.15em] mt-0.5">
                {new Date(e.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>
            <button onClick={() => remove(e.id)} className="text-muted/30 hover:text-red-400 transition-colors shrink-0">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main dashboard ─────────────────────────────────────────────────────────────

export default function AdminDashboard({
  initialContent,
}: {
  initialContent: SiteContent;
}) {
  const [section, setSection] = useState<Section>("dashboard");

  // Deep links from the Command Center and the Ctrl+K palette:
  // /admin/content#bookings opens straight onto Bookings. Validated against
  // the real section list, because an unknown hash selecting a section that
  // does not exist would render an empty studio with no way to tell why.
  useEffect(() => {
    const apply = () => {
      const h = window.location.hash.slice(1);
      if (h && NAV.some((x) => x.id === h)) setSection(h as Section);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);
  const [content, setContent] = useState<SiteContent>(initialContent);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [navQuery, setNavQuery] = useState("");
  // "Needs attention" counts shown as sidebar badges.
  const [attention, setAttention] = useState<Partial<Record<Section, number>>>({});
  // Snapshot of the last-persisted content, to detect unsaved edits.
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(initialContent));
  const router = useRouter();

  const dirty = JSON.stringify(content) !== savedSnapshot;

  // Load pending counts on mount + when the tab regains focus, so the owner
  // sees at a glance what needs action (new bookings, unanswered enquiries…).
  useEffect(() => {
    let alive = true;
    async function loadAttention() {
      try {
        const [b, p, s, r] = await Promise.all([
          fetch("/api/admin/bookings").then((x) => (x.ok ? x.json() : [])),
          fetch("/api/admin/place-bookings").then((x) => (x.ok ? x.json() : [])),
          fetch("/api/admin/submissions").then((x) => (x.ok ? x.json() : [])),
          fetch("/api/admin/reviews").then((x) => (x.ok ? x.json() : [])),
        ]);
        if (!alive) return;
        setAttention({
          bookings: (Array.isArray(b) ? b : []).filter((x: { status?: string }) => x.status === "pending").length,
          place_bookings: (Array.isArray(p) ? p : []).filter((x: { status?: string }) => x.status === "pending").length,
          submissions: (Array.isArray(s) ? s : []).filter((x: { handled?: boolean }) => !x.handled).length,
          reviews: (Array.isArray(r) ? r : []).filter((x: { status?: string }) => x.status === "pending").length,
        });
      } catch {
        /* badges are best-effort */
      }
    }
    loadAttention();
    const onFocus = () => loadAttention();
    window.addEventListener("focus", onFocus);
    return () => { alive = false; window.removeEventListener("focus", onFocus); };
  }, []);

  // Warn before leaving (reload / close / navigate away) with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Selecting a section also closes the mobile drawer
  function selectSection(s: Section) {
    setSection(s);
    setMobileNavOpen(false);
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setSaveError(false);
    try {
      const res = await fetch("/api/admin/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(content),
      });
      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      if (!res.ok) throw new Error();
      setSavedSnapshot(JSON.stringify(content)); // edits are now persisted
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setSaveError(true);
      setTimeout(() => setSaveError(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  const SECTION_TITLES: Record<Section, { title: string; desc: string }> = {
    dashboard:    { title: "Dashboard",           desc: "Overview of bookings and enquiries." },
    hero:         { title: "Hero Section",        desc: "Edit the full-screen hero text and background image." },
    promo:        { title: "Promo Carousel",       desc: "Rotating slides near the top of the homepage — cross-promote Stay·Eat·Do, taxi, offers & announcements." },
    experience:   { title: "Experience Photos",   desc: "The two photos in the “Three Steps to the Open Road” story section." },
    fleet:        { title: "Vehicles",    desc: "Add, remove, or edit any vehicle (scooter, car, kayak…). Toggle availability." },
    pricing:      { title: "Pricing",             desc: "Update rental prices for all durations." },
    contact:      { title: "Contact Info",        desc: "Edit phone, email, location and opening hours." },
    gallery:      { title: "Photo Gallery",       desc: "Upload scooter photos — they appear as a gallery on the site." },
    testimonials: { title: "Featured Reviews",    desc: "Hand-picked testimonials you control and display on the site." },
    reviews:      { title: "Customer Reviews",    desc: "Approve or reject reviews submitted by customers." },
    branding:     { title: "Branding & Social",   desc: "Upload your logo and link your social media pages." },
    submissions:  { title: "Enquiries",           desc: "Contact form submissions from customers." },
    bookings:     { title: "Bookings",            desc: "Booking requests from the website booking form." },
    money:        { title: "Money",                 desc: "Everyone waiting for you to confirm a payment — rentals, activities, shops and food in one list, oldest first." },
    place_bookings: { title: "Stay & Activity Bookings", desc: "Reservation requests for hotels, restaurants & activities." },
    leads:        { title: "Listing Leads",       desc: "Food Concierge requests (with craving & budget), plus clicks & enquiries on your Stay·Eat·Do and Taxi listings — for demand tracking & commission follow-up." },
    owners:       { title: "Partner Applications",  desc: "Partners applying via /list-your-scooter to list a vehicle, restaurant, stay, activity or experience — or to become a taxi driver, event organiser or delivery partner, none of which anyone can create for themselves. Approving one is your cue to set them up in Taxi, Organisers or Delivery; the application itself grants nothing." },
    map:          { title: "Island Map Locations",desc: "Manage the points of interest shown on the island guide map." },
    waitlist:     { title: "Waitlist",            desc: "People who signed up for deals and island tips." },
    planner:      { title: "AI Trip Planner",     desc: "Edit the real places, photos and tips the planner uses to build itineraries." },
    routes:       { title: "Ride Routes",         desc: "Curated scenic scooter routes shown on the website with a Google Maps link." },
    gettingAround:{ title: "Getting Around",      desc: "The transport-options card (bus, taxi and scooter) shown in the island guide." },
    recommended:  { title: "Accommodations & Activities",     desc: "Curated hotels, restaurants & activities. Toggle the whole section on or off." },
    services:     { title: "Massage · Fishing · Sea trips",   desc: "Add a massage, a fishing trip or a sortie de mer. Each one gets its own page and takes bookings." },
    foodConcierge:{ title: "Food Concierge",       desc: "The WhatsApp food-recommendation service behind the “Food & Dining” hub tile. Set the WhatsApp number that food enquiries go to." },
    faq:          { title: "FAQ",                 desc: "Frequently asked questions shown on the site (also boosts SEO)." },
    events:       { title: "What’s On — notices",  desc: "A simple list of island happenings shown to visitors. These are ANNOUNCEMENTS, not ticket sales — ticketed events with capacity and QR check-in live under Ticketing." },
    homeCards:    { title: "Home Cards",          desc: "The big photo cards at the top of the homepage — add, remove, reorder, rename and re-point them (photos come from each card's category)." },
    quickAccess:  { title: "Home Tiles",          desc: "The “What are you looking for?” tiles on the homepage — add, remove, reorder and re-point them." },
    useful:       { title: "Useful Numbers",      desc: "Emergency, taxi and key local contacts — shown as tap-to-call." },
    sponsors:     { title: "Sponsors",      desc: "Paid sponsor logos shown near the footer. Toggle the whole strip on/off." },
    partners:     { title: "Hotel Partners",      desc: "Manage referral partners and track referrals." },
    marketplace:  { title: "Business directory",   desc: "A directory of local businesses shown on the website. Separate from the Shops marketplace, where merchants sell real products and take orders." },
    taxi:         { title: "Taxi & Transport",     desc: "Driver directory shown at /taxi — tourists tap WhatsApp or call directly." },
    notifications:{ title: "Alerts & Email",       desc: "Your WhatsApp alert number and the email service (Brevo) that sends customer confirmations — editable any time, no redeploy." },
  };

  const isAutoSave =
    section === "gallery" || section === "submissions" || section === "bookings" ||
    section === "place_bookings" || section === "money" ||
    section === "dashboard" || section === "partners" || section === "marketplace" ||
    section === "taxi" || section === "reviews" || section === "waitlist" ||
    section === "notifications";

  // Group NAV items — filtered by the sidebar quick-search
  const q = navQuery.trim().toLowerCase();
  const matches = (n: (typeof NAV)[number]) => !q || n.label.toLowerCase().includes(q);
  const overviewNav = NAV.filter((n) => n.group === "overview" && matches(n));
  const exploreNav  = NAV.filter((n) => n.group === "explore" && matches(n));
  const contentNav  = NAV.filter((n) => n.group === "content" && matches(n));
  const marketplaceLinks = MARKETPLACE_LINKS.filter((l) => !q || l.label.toLowerCase().includes(q));
  const nothingMatches = overviewNav.length + exploreNav.length + contentNav.length === 0;

  // Reusable nav-group renderer (shared by drawer)
  const renderNavGroup = (label: string, items: typeof NAV) => (
    <div>
      <p className="font-bebas text-muted/40 text-[8px] tracking-[0.3em] px-3 mb-1">{label}</p>
      <div className="space-y-0.5">
        {items.map(({ id, label, icon: Icon }) => {
          const badge = attention[id] ?? 0;
          return (
            <button
              key={id}
              onClick={() => selectSection(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left ${
                section === id
                  ? "bg-yellow/10 text-yellow"
                  : "text-muted hover:text-offwhite hover:bg-white/5"
              }`}
            >
              <Icon size={16} className="shrink-0" />
              <span className="flex-1 truncate">{label}</span>
              {badge > 0 && (
                <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-yellow text-dark text-[11px] font-syne font-bold flex items-center justify-center">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  const sidebarInner = (
    <>
      <div className="px-5 py-6 border-b border-dark-border flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-syne font-extrabold text-base text-offwhite uppercase tracking-tight leading-none">
              ROULE
            </span>
            <span className="w-px h-3.5 bg-dark-border" />
            <span className="font-bebas text-xs tracking-[0.2em] text-yellow leading-none">
              RODRIGUES
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-yellow" />
          </div>
          <p className="font-bebas text-muted text-[9px] tracking-[0.3em]">ADMIN</p>
        </div>
        {/* Close button — mobile only */}
        <button
          onClick={() => setMobileNavOpen(false)}
          className="lg:hidden text-muted hover:text-offwhite p-1 -mr-1"
          aria-label="Close menu"
        >
          <X size={20} />
        </button>
      </div>

      {/* Quick-search — jump to any of the 30 sections instantly */}
      <div className="px-3 pt-3">
        <input
          value={navQuery}
          onChange={(e) => setNavQuery(e.target.value)}
          placeholder="Find a section…"
          className="w-full bg-[#0d0d0d] border border-dark-border rounded-lg px-3 py-2 text-sm text-offwhite font-dm placeholder:text-muted/40 focus:border-yellow focus:outline-none"
        />
      </div>

      <nav className="flex-1 py-4 px-3 space-y-4 overflow-y-auto">
        {overviewNav.length > 0 && renderNavGroup("DAILY BUSINESS", overviewNav)}
        {exploreNav.length > 0 && renderNavGroup("WHAT ARE YOU LOOKING FOR?", exploreNav)}
        {contentNav.length > 0 && renderNavGroup("WEBSITE CONTENT", contentNav)}
        {/* The marketplace admin lives on its own routes rather than as sections
            of this page, so these are real links, not selectSection() calls. */}
        {marketplaceLinks.length > 0 && (
          <div>
            <p className="font-bebas text-muted/40 text-[8px] tracking-[0.3em] px-3 mb-1">MARKETPLACE</p>
            <div className="space-y-0.5">
              {marketplaceLinks.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left text-muted hover:text-offwhite hover:bg-white/5"
                >
                  <Icon size={16} className="shrink-0" />
                  <span className="flex-1 truncate">{label}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
        {nothingMatches && marketplaceLinks.length === 0 && (
          <p className="px-3 py-4 text-muted/40 text-xs font-dm">No section matches &ldquo;{navQuery}&rdquo;</p>
        )}
      </nav>

      <div className="px-3 py-4 border-t border-dark-border">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted hover:text-red-400 hover:bg-red-500/5 transition-colors"
        >
          <LogOut size={16} className="shrink-0" />
          Log out
        </button>
      </div>
    </>
  );

  const saveButton = (
    <div className="flex items-center gap-2.5 shrink-0">
      {dirty && !isAutoSave && !saving && !saved && (
        <span className="hidden sm:flex items-center gap-1.5 text-amber-400 text-xs font-dm whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> Unsaved changes
        </span>
      )}
      <button
        onClick={handleSave}
        disabled={saving || isAutoSave || !dirty}
        className={`flex items-center gap-2 px-4 sm:px-6 py-2.5 rounded-full text-sm font-syne font-bold transition-all disabled:cursor-not-allowed shrink-0 ${
          saved
            ? "bg-green-500/20 text-green-400 border border-green-500/30"
            : saveError
            ? "bg-red-500/20 text-red-400 border border-red-500/30"
            : dirty && !isAutoSave
            ? "bg-yellow text-dark hover:bg-yellow-dark ring-2 ring-yellow/50 ring-offset-2 ring-offset-[#080808]"
            : "bg-yellow text-dark hover:bg-yellow-dark disabled:opacity-40"
        }`}
      >
        {saving ? (
          <Loader2 size={14} className="animate-spin" />
        ) : saved ? (
          <CheckCircle size={14} />
        ) : saveError ? (
          <AlertCircle size={14} />
        ) : (
          <Save size={14} />
        )}
        <span className={isAutoSave ? "hidden sm:inline" : ""}>
          {saving ? "Saving…" : saved ? "Saved!" : saveError ? "Error" : isAutoSave ? "Auto-saved" : dirty ? "Save changes" : "All saved"}
        </span>
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#080808] flex font-dm">
      {/* ── Desktop sidebar (static) ──────────────────────────────── */}
      <aside className="hidden lg:flex w-56 shrink-0 bg-dark-card border-r border-dark-border flex-col sticky top-0 h-screen">
        {sidebarInner}
      </aside>

      {/* ── Mobile drawer + backdrop ──────────────────────────────── */}
      {mobileNavOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={`lg:hidden fixed top-0 left-0 z-50 w-[82%] max-w-[300px] h-full bg-dark-card border-r border-dark-border flex flex-col transition-transform duration-300 ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarInner}
      </aside>

      {/* ── Main ─────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-h-screen overflow-y-auto w-full min-w-0">
        <header className="sticky top-0 z-10 bg-[#080808]/90 backdrop-blur border-b border-dark-border px-4 sm:px-8 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Hamburger — mobile only */}
            <button
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden text-offwhite hover:text-yellow p-2 -ml-2 shrink-0"
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>
            <div className="min-w-0">
              <p className="font-bebas text-yellow text-[10px] tracking-[0.3em] hidden sm:block">
                {SECTION_TITLES[section].desc}
              </p>
              <h1 className="font-syne font-bold text-offwhite text-base sm:text-lg leading-tight truncate">
                {SECTION_TITLES[section].title}
              </h1>
            </div>
          </div>

          {saveButton}
        </header>

        <div className="flex-1 p-4 sm:p-6 lg:p-8 w-full max-w-3xl">
          {section === "dashboard" && (
            <DashboardView onNavigate={selectSection} />
          )}
          {section === "hero" && (
            <HeroEditor content={content} onChange={setContent} />
          )}
          {section === "promo" && (
            <PromoEditor content={content} onChange={setContent} />
          )}
          {section === "experience" && (
            <ExperienceEditor content={content} onChange={setContent} />
          )}
          {section === "fleet" && (
            <FleetEditor content={content} onChange={setContent} />
          )}
          {section === "pricing" && (
            <PricingEditor content={content} onChange={setContent} />
          )}
          {section === "contact" && (
            <ContactEditor content={content} onChange={setContent} />
          )}
          {section === "gallery" && (
            <>
              <GalleryEditor
                content={content}
                onChange={setContent}
                onSessionExpired={() => router.push("/admin/login")}
                onSaved={(c) => setSavedSnapshot(JSON.stringify(c))}
              />
              <p className="mt-4 text-muted/50 text-xs font-dm">
                Gallery photos are saved automatically — no need to click Save Changes.
              </p>
            </>
          )}
          {section === "testimonials" && (
            <TestimonialsEditor content={content} onChange={setContent} />
          )}
          {section === "branding" && (
            <BrandingEditor content={content} onChange={setContent} />
          )}
          {section === "submissions" && <SubmissionsViewer />}
          {section === "reviews" && <ReviewsModeration />}
          {section === "waitlist" && <WaitlistViewer />}
          {section === "notifications" && <NotificationsEditor />}
          {section === "leads" && <LeadsViewer />}
          {section === "owners" && <OwnerApplicationsViewer />}
          {section === "bookings" && <BookingsManager fleet={content.fleet} />}
          {section === "money" && <MoneyDesk onGo={setSection} />}
          {section === "place_bookings" && <PlaceBookingsManager />}
          {section === "map" && (
            <MapEditor content={content} onChange={setContent} />
          )}
          {section === "planner" && (
            <PlannerEditor content={content} onChange={setContent} />
          )}
          {section === "routes" && (
            <RideRoutesEditor content={content} onChange={setContent} />
          )}
          {section === "gettingAround" && (
            <GettingAroundEditor content={content} onChange={setContent} />
          )}
          {section === "faq" && (
            <FaqEditor content={content} onChange={setContent} />
          )}
          {section === "recommended" && (
            <RecommendedEditor content={content} onChange={setContent} />
          )}
          {section === "services" && (
            <ServicesEditor content={content} onChange={setContent} />
          )}
          {section === "foodConcierge" && (
            <FoodConciergeEditor content={content} onChange={setContent} />
          )}
          {section === "events" && (
            <EventsEditor content={content} onChange={setContent} />
          )}
          {section === "useful" && (
            <UsefulContactsEditor content={content} onChange={setContent} />
          )}
          {section === "quickAccess" && (
            <QuickAccessEditor content={content} onChange={setContent} />
          )}
          {section === "homeCards" && (
            <HomeCardsEditor content={content} onChange={setContent} />
          )}
          {section === "sponsors" && (
            <SponsorsEditor content={content} onChange={setContent} />
          )}
          {section === "partners" && <PartnersManager />}
          {section === "marketplace" && <MarketplaceManager />}
          {section === "taxi" && <TaxiManager />}
        </div>
      </main>
    </div>
  );
}
