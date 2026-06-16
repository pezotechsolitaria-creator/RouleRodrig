"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Sparkles,
  Bike,
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
} from "lucide-react";
import type { TaxiDriver, TaxiDriverReview } from "@/lib/supabase/taxi-types";
import type {
  SiteContent,
  FleetItem,
  GalleryImage,
  TestimonialItem,
  PricingRow,
  MapLocation,
  AnnouncementContent,
  AnnouncementItem,
  WhatsAppNumber,
  PlannerActivity,
  RideRoute,
  VehicleCategory,
  UsefulContact,
  EventItem,
  Sponsor,
  TransportOption,
  FaqItem,
  RecommendedPlace,
} from "@/lib/defaults";
import type { ContactSubmission, Booking, Partner, MarketplaceListing, ProductReview, WaitlistEntry } from "@/lib/supabase/types";
import { SITE_URL } from "@/lib/site";

type Section =
  | "dashboard"
  | "announcement"
  | "hero"
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
  | "sponsors"
  | "branding"
  | "submissions"
  | "bookings"
  | "leads"
  | "map"
  | "partners"
  | "marketplace"
  | "taxi"
  | "gettingAround"
  | "faq"
  | "recommended";

const NAV: { id: Section; label: string; icon: React.ElementType; group?: string }[] = [
  { id: "dashboard",    label: "Dashboard",       icon: LayoutDashboard, group: "overview" },
  { id: "bookings",     label: "Bookings",         icon: BookOpen,        group: "overview" },
  { id: "submissions",  label: "Enquiries",        icon: Inbox,           group: "overview" },
  { id: "reviews",      label: "Customer Reviews", icon: MessageSquare,   group: "overview" },
  { id: "waitlist",     label: "Waitlist",         icon: Mail,            group: "overview" },
  { id: "leads",        label: "Listing Leads",    icon: TrendingUp,      group: "overview" },
  { id: "partners",     label: "Partners",         icon: Handshake,       group: "business" },
  { id: "marketplace",  label: "Marketplace",      icon: Store,           group: "business" },
  { id: "taxi",         label: "Taxi & Transport",  icon: Car,             group: "business" },
  { id: "announcement", label: "Announcement",     icon: Megaphone,       group: "content" },
  { id: "hero",         label: "Hero",             icon: Sparkles,        group: "content" },
  { id: "fleet",        label: "Fleet",            icon: Bike,            group: "content" },
  { id: "pricing",      label: "Pricing",          icon: DollarSign,      group: "content" },
  { id: "contact",      label: "Contact Info",     icon: Phone,           group: "content" },
  { id: "gallery",      label: "Gallery",          icon: Images,          group: "content" },
  { id: "testimonials", label: "Featured Reviews", icon: Star,            group: "content" },
  { id: "branding",     label: "Branding & Social",icon: Share2,          group: "content" },
  { id: "map",          label: "Island Map",       icon: MapPin,          group: "content" },
  { id: "planner",      label: "Trip Planner",     icon: Sparkles,        group: "content" },
  { id: "routes",       label: "Ride Routes",      icon: MapPin,          group: "content" },
  { id: "gettingAround",label: "Getting Around",   icon: Bus,             group: "content" },
  { id: "recommended",  label: "Stay · Eat · Do",  icon: BedDouble,       group: "content" },
  { id: "faq",          label: "FAQ",              icon: HelpCircle,      group: "content" },
  { id: "events",       label: "Events",           icon: Calendar,        group: "content" },
  { id: "useful",       label: "Useful Numbers",   icon: Phone,           group: "content" },
  { id: "sponsors",     label: "Sponsors / Ads",   icon: Megaphone,       group: "content" },
];

// ── Shared helpers ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-bebas text-muted text-[10px] tracking-[0.25em] mb-1.5">{label}</p>
      {children}
    </div>
  );
}

const inputCls =
  "w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl px-4 py-3 text-offwhite text-sm font-dm placeholder:text-muted/40 focus:border-yellow focus:outline-none transition-colors";

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
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
        }
      }
      if (uploaded.length) onChange([...images, ...uploaded]);
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
  } | null>(null);
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [bRes, sRes] = await Promise.all([
          fetch("/api/admin/bookings"),
          fetch("/api/admin/submissions"),
        ]);
        const bookings: Booking[] = bRes.ok ? await bRes.json() : [];
        const submissions: ContactSubmission[] = sRes.ok ? await sRes.json() : [];
        setAllBookings(bookings);
        setStats({
          bookings: bookings.length,
          pending: bookings.filter((b) => b.status === "pending").length,
          confirmed: bookings.filter((b) => b.status === "confirmed").length,
          enquiries: submissions.length,
        });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const today = islandDate(0);
  const tomorrow = islandDate(1);
  const active = (b: Booking) => b.status === "pending" || b.status === "confirmed";
  const pickupsTomorrow = allBookings.filter((b) => active(b) && b.start_date === tomorrow);
  const returnsToday = allBookings.filter((b) => active(b) && b.end_date === today);

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
    { label: "Enquiries",        value: stats?.enquiries ?? "—", icon: Inbox,        color: "text-blue-400", section: "submissions"  as Section },
  ];

  return (
    <div className="space-y-10">
      <div>
        <p className="font-bebas text-yellow text-[10px] tracking-[0.3em] mb-1">OVERVIEW</p>
        <h2 className="font-syne font-bold text-offwhite text-xl">Business Dashboard</h2>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 text-muted font-dm text-sm">
          <Loader2 size={16} className="animate-spin" /> Loading stats…
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

      {/* Today's reminders — pickups tomorrow + returns today */}
      {!loading && (pickupsTomorrow.length > 0 || returnsToday.length > 0) && (
        <div>
          <p className="font-bebas text-muted text-[10px] tracking-[0.3em] mb-4">TODAY&apos;S REMINDERS</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                        <p className="font-dm text-muted text-xs truncate">{b.scooter}</p>
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
                        <p className="font-dm text-muted text-xs truncate">{b.scooter}</p>
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
          </div>
        </div>
      )}

      {/* Quick links */}
      <div>
        <p className="font-bebas text-muted text-[10px] tracking-[0.3em] mb-4">QUICK ACTIONS</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: "Manage Bookings",   desc: "View & update booking status",      section: "bookings" as Section,     icon: BookOpen },
            { label: "New Announcement",  desc: "Show a promo bar on the website",   section: "announcement" as Section, icon: Megaphone },
            { label: "Edit Fleet",        desc: "Toggle availability, update photos", section: "fleet" as Section,       icon: Bike },
            { label: "Read Enquiries",    desc: "Customer contact form messages",    section: "submissions" as Section,  icon: Inbox },
            { label: "Edit Island Map",   desc: "Add / remove map locations",        section: "map" as Section,          icon: MapPin },
            { label: "Upload Photos",     desc: "Add to the website gallery",        section: "gallery" as Section,      icon: Images },
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

// ── Announcement editor ────────────────────────────────────────────────────────

function AnnouncementEditor({
  content,
  onChange,
}: {
  content: SiteContent;
  onChange: (c: SiteContent) => void;
}) {
  const a = content.announcement;
  const set = (patch: Partial<AnnouncementContent>) =>
    onChange({ ...content, announcement: { ...a, ...patch } });

  // Multiple rotating messages (falls back to the legacy single message)
  const items: AnnouncementItem[] =
    a.items && a.items.length
      ? a.items
      : [{ text: a.text ?? "", link: a.link ?? "", linkText: a.linkText ?? "" }];
  const setItems = (next: AnnouncementItem[]) =>
    set({
      items: next,
      text: next[0]?.text ?? "",
      link: next[0]?.link ?? "",
      linkText: next[0]?.linkText ?? "",
    });
  const updateItem = (i: number, patch: Partial<AnnouncementItem>) =>
    setItems(items.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  const addItem = () => setItems([...items, { text: "", link: "", linkText: "" }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));

  const COLOR_OPTIONS = [
    { value: "yellow", label: "Yellow", cls: "bg-yellow" },
    { value: "green",  label: "Green",  cls: "bg-emerald-500" },
    { value: "blue",   label: "Blue",   cls: "bg-sky-500" },
    { value: "red",    label: "Red",    cls: "bg-red-500" },
  ];

  return (
    <div className="space-y-6">
      {/* Active toggle */}
      <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-6 flex items-center justify-between">
        <div>
          <p className="font-syne font-bold text-offwhite text-sm">Show Announcement Bar</p>
          <p className="font-dm text-muted text-xs mt-0.5">
            Display a coloured banner at the very top of the website
          </p>
        </div>
        <button
          type="button"
          onClick={() => set({ active: !a.active })}
          className={`relative w-11 h-6 rounded-full transition-colors ${a.active ? "bg-yellow" : "bg-[#2a2a2a]"}`}
        >
          <span
            className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${a.active ? "translate-x-6" : "translate-x-1"}`}
          />
        </button>
      </div>

      {/* Live preview */}
      {a.active && (
        <div
          className={`w-full rounded-xl py-2.5 px-5 text-center text-sm font-dm font-medium flex items-center justify-center gap-3 ${
            { yellow: "bg-yellow text-dark", green: "bg-emerald-500 text-white", blue: "bg-sky-500 text-white", red: "bg-red-500 text-white" }[a.bgColor] ?? "bg-yellow text-dark"
          }`}
        >
          <span>📣 {items[0]?.text || "Your announcement text…"}</span>
          {items[0]?.linkText && <span className="font-bold underline">{items[0].linkText} →</span>}
        </div>
      )}

      <div className="space-y-5">
        {/* Multiple messages */}
        <div>
          <p className="font-bebas text-muted text-[10px] tracking-[0.25em] mb-2">MESSAGES (rotate automatically)</p>
          <div className="space-y-3">
            {items.map((m, i) => (
              <div key={i} className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bebas text-yellow text-[10px] tracking-[0.25em]">MESSAGE {i + 1}</span>
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(i)} className="text-muted/50 hover:text-red-400 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <TextInput value={m.text} onChange={(v) => updateItem(i, { text: v })} placeholder="e.g. Book 3+ days and get a FREE helmet!" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <TextInput value={m.link} onChange={(v) => updateItem(i, { link: v })} placeholder="Link (e.g. #booking)" />
                  <TextInput value={m.linkText} onChange={(v) => updateItem(i, { linkText: v })} placeholder="Link text (e.g. Book now)" />
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addItem}
            className="mt-3 flex items-center gap-2 text-xs font-dm text-muted/60 hover:text-yellow transition-colors"
          >
            <Plus size={13} /> Add another message
          </button>
        </div>

        <Field label="COLOUR">
          <div className="flex gap-3 mt-1">
            {COLOR_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => set({ bgColor: opt.value })}
                className={`w-7 h-7 rounded-full ${opt.cls} transition-transform hover:scale-110 ${a.bgColor === opt.value ? "ring-2 ring-offset-2 ring-offset-[#0d0d0d] ring-white" : ""}`}
                aria-label={opt.label}
              />
            ))}
          </div>
        </Field>
      </div>

      <p className="text-muted/50 text-xs font-dm">
        Remember to click Save Changes after editing.
      </p>
    </div>
  );
}

// ── Section editors ────────────────────────────────────────────────────────────

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

  return (
    <div className="space-y-5">
      <ImagePicker
        label="BACKGROUND IMAGE"
        src={h.backgroundImage}
        onUpload={(p) => set({ backgroundImage: p })}
      />
      <Field label="EYEBROW TEXT">
        <TextInput value={h.eyebrow} onChange={(v) => set({ eyebrow: v })} />
      </Field>
      <Field label="HEADLINE LINE 1">
        <TextInput
          value={h.headline[0]}
          onChange={(v) => set({ headline: [v, h.headline[1], h.headline[2]] })}
        />
      </Field>
      <Field label="HEADLINE LINE 2">
        <TextInput
          value={h.headline[1]}
          onChange={(v) => set({ headline: [h.headline[0], v, h.headline[2]] })}
        />
      </Field>
      <Field label="HEADLINE LINE 3">
        <TextInput
          value={h.headline[2]}
          onChange={(v) => set({ headline: [h.headline[0], h.headline[1], v] })}
        />
      </Field>
      <Field label="SUBHEADLINE">
        <Textarea value={h.subheadline} onChange={(v) => set({ subheadline: v })} rows={2} />
      </Field>
    </div>
  );
}

function FleetEditor({
  content,
  onChange,
}: {
  content: SiteContent;
  onChange: (c: SiteContent) => void;
}) {
  function updateScooter(idx: number, patch: Partial<FleetItem>) {
    const fleet = content.fleet.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    const pricing = content.pricing.map((row, i) =>
      i === idx && patch.name ? { ...row, name: patch.name } : row
    );
    onChange({ ...content, fleet, pricing });
  }

  function addScooter() {
    const id = `scooter-${Date.now()}`;
    const newScooter: FleetItem = {
      id,
      badge: "NEW",
      name: "New Scooter",
      tagline: "Your new ride.",
      description: "Add a description for this scooter.",
      image: "/images/avenis-front.jpeg",
      price: "From Rs 0",
      unit: "/ day",
      available: true,
      category: content.vehicleCategories?.[0]?.id ?? "scooter",
    };
    const newRow: PricingRow = {
      name: "New Scooter",
      prices: ["Rs 0", "Rs 0", "Rs 0"],
    };
    onChange({
      ...content,
      fleet: [...content.fleet, newScooter],
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

  return (
    <div className="space-y-8">
      {/* ── Vehicle categories manager ── */}
      <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-6 space-y-4">
        <div>
          <p className="font-bebas text-yellow text-xs tracking-[0.3em]">VEHICLE CATEGORIES</p>
          <p className="text-muted/60 text-xs font-dm mt-1">
            Turn a category ON to show it on the website. Filter tabs appear automatically when more
            than one enabled category has vehicles.
          </p>
        </div>
        <div className="space-y-2.5">
          {cats.map((c, i) => (
            <div key={c.id} className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => updateCat(i, { enabled: !c.enabled })}
                className={`relative w-10 h-5.5 rounded-full transition-colors shrink-0 ${c.enabled ? "bg-yellow" : "bg-[#2a2a2a]"}`}
                style={{ height: "22px", width: "40px" }}
                aria-label={c.enabled ? "Enabled" : "Disabled"}
              >
                <span className={`absolute top-1 w-3.5 h-3.5 bg-white rounded-full transition-transform ${c.enabled ? "translate-x-[21px]" : "translate-x-1"}`} />
              </button>
              <input
                value={c.label}
                onChange={(e) => updateCat(i, { label: e.target.value })}
                className="flex-1 bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-offwhite text-sm font-dm focus:border-yellow focus:outline-none"
              />
              <span className={`text-[10px] font-bebas tracking-[0.15em] w-16 text-center ${c.enabled ? "text-green-400" : "text-muted/40"}`}>
                {c.enabled ? "SHOWN" : "HIDDEN"}
              </span>
              <button
                type="button"
                onClick={() => removeCat(i)}
                className="text-muted/40 hover:text-red-400 transition-colors shrink-0"
                aria-label="Remove category"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addCat}
          className="flex items-center gap-2 text-xs font-dm text-muted/60 hover:text-yellow transition-colors"
        >
          <Plus size={13} /> Add category
        </button>
      </div>

      {content.fleet.map((scooter, idx) => (
        <div
          key={scooter.id}
          className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-6 space-y-5"
        >
          <div className="flex items-center justify-between">
            <p className="font-bebas text-yellow text-xs tracking-[0.3em]">
              SCOOTER {idx + 1} — {scooter.name}
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
                onChange={(e) => updateScooter(idx, { category: e.target.value })}
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
          </Field>
        </div>
      ))}

      <button
        type="button"
        onClick={addScooter}
        className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-[#2a2a2a] hover:border-yellow/50 text-muted/60 hover:text-yellow rounded-2xl py-5 text-sm font-dm transition-colors"
      >
        <Plus size={16} /> Add Scooter
      </button>

      <p className="text-muted/50 text-xs font-dm">
        Click the status badge to toggle availability. Adding/removing a scooter also updates the pricing table.
      </p>
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
}: {
  content: SiteContent;
  onChange: (c: SiteContent) => void;
  onSessionExpired: () => void;
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-muted/50 font-dm text-xs">
          {submissions.length} enquir{submissions.length !== 1 ? "ies" : "y"}
        </p>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-muted/50 hover:text-yellow font-dm text-xs transition-colors"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {submissions.map((s) => (
        <div
          key={s.id}
          className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-5 space-y-3"
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

const STATUS_CONFIG: Record<
  string,
  { label: string; cls: string; dot: string }
> = {
  pending:   { label: "Pending",   cls: "bg-amber-400/10 text-amber-400 border-amber-400/30",   dot: "bg-amber-400"   },
  confirmed: { label: "Confirmed", cls: "bg-green-500/10 text-green-400 border-green-500/30",   dot: "bg-green-400"   },
  cancelled: { label: "Cancelled", cls: "bg-red-500/10   text-red-400   border-red-500/30",     dot: "bg-red-400"     },
  completed: { label: "Completed", cls: "bg-blue-500/10  text-blue-400  border-blue-500/30",    dot: "bg-blue-400"    },
};

function BookingsManager() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

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
      await fetch("/api/admin/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      setBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: status as Booking["status"] } : b))
      );
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-muted/50 font-dm text-xs">
          {bookings.length} booking{bookings.length !== 1 ? "s" : ""}
        </p>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-muted/50 hover:text-yellow font-dm text-xs transition-colors"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {bookings.map((b) => {
        const sc = STATUS_CONFIG[b.status] ?? STATUS_CONFIG.pending;
        return (
          <div
            key={b.id}
            className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-5 space-y-4"
          >
            {/* Header row */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="font-syne font-bold text-offwhite text-sm">{b.name}</p>
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
              </div>
            </div>

            {/* Booking details */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <p className="font-bebas text-muted text-[9px] tracking-[0.2em]">PICKUP</p>
                <p className="font-dm text-offwhite text-xs mt-0.5">
                  {new Date(b.start_date).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
                </p>
              </div>
              <div>
                <p className="font-bebas text-muted text-[9px] tracking-[0.2em]">RETURN</p>
                <p className="font-dm text-offwhite text-xs mt-0.5">
                  {new Date(b.end_date).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
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

            {b.message && (
              <p className="text-offwhite/60 font-dm text-xs leading-relaxed border-t border-[#2a2a2a] pt-3">
                {b.message}
              </p>
            )}

            {/* Status actions */}
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
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Map locations editor ───────────────────────────────────────────────────────

const CATEGORIES: MapLocation["category"][] = [
  "beach", "viewpoint", "restaurant", "landmark", "activity",
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
                onChange={(v) => updateLoc(idx, { lat: parseFloat(v) || 0 })}
                placeholder="-19.6811"
              />
            </Field>
            <Field label="LONGITUDE">
              <TextInput
                value={String(loc.lng)}
                onChange={(v) => updateLoc(idx, { lng: parseFloat(v) || 0 })}
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
          </Field>

          <ImagePicker
            label="PHOTO (shown when the dot is clicked)"
            src={loc.image ?? ""}
            onUpload={(p) => updateLoc(idx, { image: p })}
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
            </Field>
            <Field label="EMOJI">
              <TextInput value={act.emoji} onChange={(v) => update(idx, { emoji: v })} placeholder="🏖️" />
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
          </Field>
          <Field label="INSIDER TIP">
            <Textarea value={act.tip} onChange={(v) => update(idx, { tip: v })} rows={2} />
          </Field>

          <ImagePicker
            label="PHOTO (shown in the itinerary)"
            src={act.image ?? ""}
            onUpload={(p) => update(idx, { image: p })}
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
              <p className="font-bebas text-yellow text-xs tracking-[0.3em]">ROUTE {idx + 1} — {r.name}</p>
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
          </Field>
          <Field label="STOPS (one per line)">
            <Textarea value={r.stops} onChange={(v) => update(idx, { stops: v })} rows={4} />
          </Field>
          <Field label="GOOGLE MAPS LINK">
            <TextInput value={r.mapsUrl} onChange={(v) => update(idx, { mapsUrl: v })} placeholder="https://maps.google.com/..." />
          </Field>

          <ImagePicker
            label="ROUTE PHOTO"
            src={r.image ?? ""}
            onUpload={(p) => update(idx, { image: p })}
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
  hotel: "🏨 Hotel / Guesthouse",
  restaurant: "🍽️ Restaurant",
  activity: "🤿 Activity",
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
          <p className="font-syne font-bold text-offwhite text-sm">Show the “Stay · Eat · Do” section</p>
          <p className="text-muted/60 text-xs font-dm mt-0.5">Curated hotels, restaurants & activities on the homepage.</p>
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
          <ImagePicker label="PHOTO" src={it.image} onUpload={(p) => updateItem(i, { image: p })} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="NAME">
              <TextInput value={it.name} onChange={(v) => updateItem(i, { name: v })} placeholder="e.g. Le Récif Hotel" />
            </Field>
            <Field label="CATEGORY">
              <select
                value={it.category}
                onChange={(e) => updateItem(i, { category: e.target.value as RecommendedPlace["category"] })}
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
          </Field>
          <Field label="WHATSAPP NUMBER (enables the “Book / Enquire” button)">
            <TextInput value={it.whatsapp ?? ""} onChange={(v) => updateItem(i, { whatsapp: v })} placeholder="+230 5XXX XXXX" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="LINK (website or Google Maps, optional)">
              <TextInput value={it.link ?? ""} onChange={(v) => updateItem(i, { link: v })} placeholder="https://..." />
            </Field>
            <Field label="BUTTON TEXT (optional)">
              <TextInput value={it.linkText ?? ""} onChange={(v) => updateItem(i, { linkText: v })} placeholder="e.g. Book now / View on map" />
            </Field>
          </div>
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

      <div className="grid grid-cols-1 gap-4">
        <Field label="SECTION TITLE">
          <TextInput value={ga.title} onChange={(v) => set({ title: v })} placeholder="e.g. Getting Around Rodrigues" />
        </Field>
        <Field label="SUBTITLE">
          <TextInput value={ga.subtitle} onChange={(v) => set({ subtitle: v })} />
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
          </Field>
          <ImagePicker label="EVENT PHOTO" src={ev.image ?? ""} onUpload={(p) => update(i, { image: p })} />
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
    setList([...list, { id: `sp-${Date.now()}`, name: "", image: "", link: "", enabled: true }]);
  const remove = (i: number) => setList(list.filter((_, idx) => idx !== i));

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
          <div className="flex items-center justify-between">
            <p className="font-bebas text-yellow text-xs tracking-[0.3em]">{sp.name || `SPONSOR ${i + 1}`}</p>
            <div className="flex items-center gap-3">
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
              <TextInput value={sp.name} onChange={(v) => update(i, { name: v })} placeholder="e.g. Banque XYZ" />
            </Field>
            <Field label="LINK (optional)">
              <TextInput value={sp.link} onChange={(v) => update(i, { link: v })} placeholder="https://..." />
            </Field>
          </div>
          <ImagePicker label="LOGO" src={sp.image} onUpload={(p) => update(i, { image: p })} />
        </div>
      ))}

      <button type="button" onClick={add} className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-[#2a2a2a] hover:border-yellow/50 text-muted/60 hover:text-yellow rounded-2xl py-5 text-sm font-dm transition-colors">
        <Plus size={16} /> Add Sponsor
      </button>

      <div className="bg-yellow/5 border border-yellow/20 rounded-2xl p-5">
        <p className="font-syne font-bold text-offwhite text-sm mb-1">💡 Monetisation tip</p>
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
  commission_pct: string;
  notes: string;
};

const emptyPartnerForm = (): PartnerForm => ({
  name: "", type: "hotel", email: "", phone: "",
  partner_code: "", commission_pct: "10", notes: "",
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
        commission_pct: parseFloat(form.commission_pct) || 10,
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
    await fetch(`/api/admin/partners?id=${id}`, { method: "DELETE" });
    setPartners((prev) => prev.filter((p) => p.id !== id));
  }

  async function toggleActive(p: Partner) {
    await fetch("/api/admin/partners", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, active: !p.active }),
    });
    setPartners((prev) => prev.map((x) => x.id === p.id ? { ...x, active: !x.active } : x));
  }

  function openEdit(p: Partner) {
    setForm({
      name: p.name, type: p.type, email: p.email ?? "",
      phone: p.phone ?? "", partner_code: p.partner_code,
      commission_pct: String(p.commission_pct), notes: p.notes ?? "",
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
    const commission = Math.round(totalRaw * (partner?.commission_pct ?? 10) / 100);

    return (
      <div className="space-y-6">
        <button
          onClick={() => setCommissionView(null)}
          className="flex items-center gap-2 text-sm font-dm text-muted hover:text-yellow transition-colors"
        >
          ← Back to Partners
        </button>

        <div>
          <p className="font-bebas text-yellow text-[10px] tracking-[0.3em] mb-1">COMMISSION REPORT</p>
          <h2 className="font-syne font-bold text-offwhite text-xl">{partner?.name}</h2>
          <p className="font-dm text-muted text-sm mt-1">
            Code: <span className="text-yellow font-mono">{partner?.partner_code}</span> ·{" "}
            Commission: <span className="text-yellow">{partner?.commission_pct}%</span>
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Bookings via this partner", value: partnerBookings.length },
            { label: "Total rental value (est.)", value: `Rs ${totalRaw.toLocaleString()}` },
            { label: `Commission due (${partner?.commission_pct}%)`, value: `Rs ${commission.toLocaleString()}` },
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
          const qr = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=10&data=${encodeURIComponent(refLink)}`;
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
                  <a href={qr} target="_blank" rel="noopener noreferrer" className="text-xs font-dm text-muted hover:text-yellow transition-colors">
                    Open / download QR
                  </a>
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
                      Send this to the hotel so they can track their own bookings & earnings (no login).
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
                  {b.total_amount && <p className="font-dm text-green-400 text-xs">Commission: Rs {Math.round(b.total_amount * (partner?.commission_pct ?? 10) / 100).toLocaleString()}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-5">
          <p className="font-bebas text-yellow text-[10px] tracking-[0.3em] mb-3">INVOICE SUMMARY (for printing)</p>
          <div className="font-dm text-sm space-y-1 text-offwhite/70">
            <p><strong className="text-offwhite">Partner:</strong> {partner?.name}</p>
            <p><strong className="text-offwhite">Code:</strong> {partner?.partner_code}</p>
            <p><strong className="text-offwhite">Bookings:</strong> {partnerBookings.length}</p>
            <p><strong className="text-offwhite">Total rental value:</strong> Rs {totalRaw.toLocaleString()}</p>
            <p><strong className="text-offwhite">Commission rate:</strong> {partner?.commission_pct}%</p>
            <p className="text-yellow font-bold text-base pt-2"><strong>Amount due: Rs {commission.toLocaleString()}</strong></p>
          </div>
          <button
            onClick={() => window.print()}
            className="mt-4 flex items-center gap-2 border border-[#2a2a2a] hover:border-yellow text-offwhite/70 hover:text-yellow px-4 py-2 rounded-lg text-xs font-dm transition-colors"
          >
            🖨️ Print Report
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
          <p className="font-dm text-muted text-xs">Hotels and guesthouses that refer customers and earn commission.</p>
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
            <Field label="COMMISSION %">
              <TextInput
                value={form.commission_pct}
                onChange={(v) => setForm({ ...form, commission_pct: v })}
                placeholder="10"
                type="number"
              />
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
          <p className="text-muted/30 font-dm text-xs mt-1">Add a hotel or guesthouse to start tracking referral commissions.</p>
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
                    <span className="text-muted/40 text-xs font-dm">{p.commission_pct}% commission</span>
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
            "Add a hotel or guesthouse partner and set their commission percentage.",
            "Share their unique code with them (e.g. CHEZ-FRANCINE).",
            "When guests book, they enter the code in the booking form.",
            "View the Commission Report to see bookings and amounts due.",
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
    await fetch(`/api/admin/marketplace?id=${id}`, { method: "DELETE" });
    setListings((prev) => prev.filter((l) => l.id !== id));
  }

  async function toggleField(l: MarketplaceListing, field: "active" | "featured") {
    await fetch("/api/admin/marketplace", {
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

  const CATEGORY_EMOJI: Record<string, string> = {
    restaurant: "🍽️", tour: "🧭", activity: "🤿", accommodation: "🏡", shopping: "🛍️",
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
                    {CATEGORY_EMOJI[c]} {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <MultiImagePicker
            label="PHOTOS"
            hint="First photo = cover shown on the card. Add multiple angles / dishes / views."
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
            <Field label="OPENING HOURS / CLOSING TIME">
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
                    <span className="text-base">{CATEGORY_EMOJI[l.category] ?? "🏪"}</span>
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
      await fetch("/api/admin/reviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
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
  name: string; phone: string; whatsapp: string; photo: string;
  vehicle: string; vehicle_type: TaxiDriver["vehicle_type"];
  languages: string; areas: string; rate_from: string; notes: string;
};

const emptyDriverForm = (): DriverForm => ({
  name: "", phone: "", whatsapp: "", photo: "", vehicle: "",
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
      photo: d.photo ?? "", vehicle: d.vehicle, vehicle_type: d.vehicle_type,
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

          <Field label="AREAS / ROUTES COVERED">
            <Textarea value={form.areas} onChange={(v) => setForm({ ...form, areas: v })} rows={2}
            />
          </Field>

          <Field label="NOTES (optional)">
            <TextInput value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} placeholder="e.g. Airport specialist, night rides available" />
          </Field>

          <ImagePicker label="DRIVER / VEHICLE PHOTO" src={form.photo} onUpload={(p) => setForm({ ...form, photo: p })} />

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

interface LeadSummary { target: string; kind: string; category: string | null; total: number; last30: number; }
interface LeadRecent { kind: string; target_name: string; category: string | null; type: string | null; ref: string | null; created_at: string; }
interface LeadData {
  totals: { all: number; last30: number; stayEatDo: number; taxi: number };
  summary: LeadSummary[];
  recent: LeadRecent[];
}

function LeadsViewer() {
  const [data, setData] = useState<LeadData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/leads")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const kindLabel = (k: string) => (k === "taxi" ? "Taxi" : "Stay·Eat·Do");
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
  if (!data || data.totals.all === 0) {
    return (
      <div className="bg-dark-card border border-dark-border rounded-2xl p-10 text-center">
        <TrendingUp size={36} className="text-muted/20 mx-auto mb-3" />
        <p className="text-muted font-dm text-sm">No leads yet. When visitors tap “Book / Enquire” on a Stay·Eat·Do listing or contact a taxi driver, it shows up here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Leads (last 30 days)", value: data.totals.last30 },
          { label: "Leads (all time)", value: data.totals.all },
          { label: "Stay·Eat·Do", value: data.totals.stayEatDo },
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
                <span className="text-muted/50 text-xs ml-2">{kindLabel(r.kind)}{r.type ? ` · ${r.type}` : ""}</span>
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
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `waitlist-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
  const [content, setContent] = useState<SiteContent>(initialContent);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const router = useRouter();

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
    announcement: { title: "Announcement Bar",    desc: "Show a promotional banner at the top of the site." },
    hero:         { title: "Hero Section",        desc: "Edit the full-screen hero text and background image." },
    fleet:        { title: "Fleet / Scooters",    desc: "Add, remove, or edit scooters. Toggle availability." },
    pricing:      { title: "Pricing",             desc: "Update rental prices for all durations." },
    contact:      { title: "Contact Info",        desc: "Edit phone, email, location and opening hours." },
    gallery:      { title: "Photo Gallery",       desc: "Upload scooter photos — they appear as a gallery on the site." },
    testimonials: { title: "Featured Reviews",    desc: "Hand-picked testimonials you control and display on the site." },
    reviews:      { title: "Customer Reviews",    desc: "Approve or reject reviews submitted by customers." },
    branding:     { title: "Branding & Social",   desc: "Upload your logo and link your social media pages." },
    submissions:  { title: "Enquiries",           desc: "Contact form submissions from customers." },
    bookings:     { title: "Bookings",            desc: "Booking requests from the website booking form." },
    leads:        { title: "Listing Leads",       desc: "Clicks & enquiries on your Stay·Eat·Do and Taxi listings — for billing featured / pay-per-lead." },
    map:          { title: "Island Map Locations",desc: "Manage the points of interest shown on the island guide map." },
    waitlist:     { title: "Waitlist",            desc: "People who signed up for deals and island tips." },
    planner:      { title: "AI Trip Planner",     desc: "Edit the real places, photos and tips the planner uses to build itineraries." },
    routes:       { title: "Ride Routes",         desc: "Curated scenic scooter routes shown on the website with a Google Maps link." },
    gettingAround:{ title: "Getting Around",      desc: "The transport-options card (bus / taxi / scooter) shown in the island guide." },
    recommended:  { title: "Stay · Eat · Do",     desc: "Curated hotels, restaurants & activities. Toggle the whole section on or off." },
    faq:          { title: "FAQ",                 desc: "Frequently asked questions shown on the site (also boosts SEO)." },
    events:       { title: "Island Events",       desc: "Festivals, markets and happenings shown to visitors." },
    useful:       { title: "Useful Numbers",      desc: "Emergency, taxi and key local contacts — shown as tap-to-call." },
    sponsors:     { title: "Sponsors / Ads",      desc: "Paid sponsor logos shown near the footer. Toggle the whole strip on/off." },
    partners:     { title: "Hotel Partners",      desc: "Manage referral partners and track commission." },
    marketplace:  { title: "Marketplace / Deals", desc: "Local business listings shown to customers on the website." },
    taxi:         { title: "Taxi & Transport",     desc: "Driver directory shown at /taxi — tourists tap WhatsApp or call directly." },
  };

  const isAutoSave =
    section === "gallery" || section === "submissions" || section === "bookings" ||
    section === "dashboard" || section === "partners" || section === "marketplace" ||
    section === "taxi" || section === "reviews" || section === "waitlist";

  // Group NAV items
  const overviewNav = NAV.filter((n) => n.group === "overview");
  const businessNav = NAV.filter((n) => n.group === "business");
  const contentNav  = NAV.filter((n) => n.group === "content");

  // Reusable nav-group renderer (shared by drawer)
  const renderNavGroup = (label: string, items: typeof NAV) => (
    <div>
      <p className="font-bebas text-muted/40 text-[8px] tracking-[0.3em] px-3 mb-1">{label}</p>
      <div className="space-y-0.5">
        {items.map(({ id, label, icon: Icon }) => (
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
            {label}
          </button>
        ))}
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

      <nav className="flex-1 py-4 px-3 space-y-4 overflow-y-auto">
        {renderNavGroup("OVERVIEW", overviewNav)}
        {businessNav.length > 0 && renderNavGroup("BUSINESS", businessNav)}
        {renderNavGroup("CONTENT", contentNav)}
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
    <button
      onClick={handleSave}
      disabled={saving || isAutoSave}
      className={`flex items-center gap-2 px-4 sm:px-6 py-2.5 rounded-full text-sm font-syne font-bold transition-all disabled:cursor-not-allowed shrink-0 ${
        saved
          ? "bg-green-500/20 text-green-400 border border-green-500/30"
          : saveError
          ? "bg-red-500/20 text-red-400 border border-red-500/30"
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
        {saving ? "Saving…" : saved ? "Saved!" : saveError ? "Error" : "Save Changes"}
      </span>
    </button>
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
          {section === "announcement" && (
            <AnnouncementEditor content={content} onChange={setContent} />
          )}
          {section === "hero" && (
            <HeroEditor content={content} onChange={setContent} />
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
          {section === "leads" && <LeadsViewer />}
          {section === "bookings" && <BookingsManager />}
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
          {section === "events" && (
            <EventsEditor content={content} onChange={setContent} />
          )}
          {section === "useful" && (
            <UsefulContactsEditor content={content} onChange={setContent} />
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
