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
  TrendingUp,
  Users,
  ClipboardList,
  Eye,
} from "lucide-react";
import type {
  SiteContent,
  FleetItem,
  GalleryImage,
  TestimonialItem,
  PricingRow,
  MapLocation,
  AnnouncementContent,
} from "@/lib/defaults";
import type { ContactSubmission, Booking } from "@/lib/supabase/types";

type Section =
  | "dashboard"
  | "announcement"
  | "hero"
  | "fleet"
  | "pricing"
  | "contact"
  | "gallery"
  | "testimonials"
  | "branding"
  | "submissions"
  | "bookings"
  | "map";

const NAV: { id: Section; label: string; icon: React.ElementType; group?: string }[] = [
  { id: "dashboard",    label: "Dashboard",       icon: LayoutDashboard, group: "overview" },
  { id: "bookings",     label: "Bookings",         icon: BookOpen,        group: "overview" },
  { id: "submissions",  label: "Enquiries",        icon: Inbox,           group: "overview" },
  { id: "announcement", label: "Announcement",     icon: Megaphone,       group: "content" },
  { id: "hero",         label: "Hero",             icon: Sparkles,        group: "content" },
  { id: "fleet",        label: "Fleet",            icon: Bike,            group: "content" },
  { id: "pricing",      label: "Pricing",          icon: DollarSign,      group: "content" },
  { id: "contact",      label: "Contact Info",     icon: Phone,           group: "content" },
  { id: "gallery",      label: "Gallery",          icon: Images,          group: "content" },
  { id: "testimonials", label: "Reviews",          icon: Star,            group: "content" },
  { id: "branding",     label: "Branding & Social",icon: Share2,          group: "content" },
  { id: "map",          label: "Island Map",       icon: MapPin,          group: "content" },
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
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 border border-[#2a2a2a] hover:border-yellow text-offwhite/70 hover:text-yellow text-xs font-dm px-4 py-2 rounded-lg transition-colors disabled:opacity-40"
          >
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {uploading ? "Uploading…" : "Change Image"}
          </button>
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

// ── Dashboard overview ─────────────────────────────────────────────────────────

function DashboardView({ onNavigate }: { onNavigate: (s: Section) => void }) {
  const [stats, setStats] = useState<{
    bookings: number;
    pending: number;
    confirmed: number;
    enquiries: number;
  } | null>(null);
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

  const cards = [
    { label: "Total Bookings",  value: stats?.bookings ?? "—",  icon: BookOpen,     color: "text-yellow",   section: "bookings" as Section },
    { label: "Pending",          value: stats?.pending ?? "—",   icon: ClipboardList,color: "text-amber-400",section: "bookings" as Section },
    { label: "Confirmed",        value: stats?.confirmed ?? "—", icon: CheckCircle,  color: "text-green-400",section: "bookings" as Section },
    { label: "Enquiries",        value: stats?.enquiries ?? "—", icon: Inbox,        color: "text-blue-400", section: "submissions" as Section },
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
          <span>{a.text || "Your announcement text…"}</span>
          {a.linkText && <span className="font-bold underline">{a.linkText} →</span>}
        </div>
      )}

      <div className="space-y-5">
        <Field label="ANNOUNCEMENT TEXT">
          <TextInput
            value={a.text}
            onChange={(v) => set({ text: v })}
            placeholder="e.g. Book 3+ days and get a FREE helmet upgrade!"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="LINK URL (optional)">
            <TextInput value={a.link} onChange={(v) => set({ link: v })} placeholder="#booking" />
          </Field>
          <Field label="LINK TEXT (optional)">
            <TextInput value={a.linkText} onChange={(v) => set({ linkText: v })} placeholder="Book now" />
          </Field>
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

  return (
    <div className="space-y-8">
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
            label="SCOOTER IMAGE"
            src={scooter.image}
            onUpload={(p) => updateScooter(idx, { image: p })}
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

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      <Field label="WHATSAPP / PHONE">
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
            {s.scooter && (
              <span className="font-bebas text-[10px] tracking-[0.15em] bg-yellow/10 text-yellow px-2.5 py-1 rounded-full shrink-0">
                {s.scooter.toUpperCase()}
              </span>
            )}
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
  const router = useRouter();

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
    testimonials: { title: "Customer Reviews",    desc: "Add or remove customer testimonials shown on the site." },
    branding:     { title: "Branding & Social",   desc: "Upload your logo and link your social media pages." },
    submissions:  { title: "Enquiries",           desc: "Contact form submissions from customers." },
    bookings:     { title: "Bookings",            desc: "Booking requests from the website booking form." },
    map:          { title: "Island Map Locations",desc: "Manage the points of interest shown on the island guide map." },
  };

  const isAutoSave =
    section === "gallery" || section === "submissions" || section === "bookings" || section === "dashboard";

  // Group NAV items
  const overviewNav = NAV.filter((n) => n.group === "overview");
  const contentNav = NAV.filter((n) => n.group === "content");

  return (
    <div className="min-h-screen bg-[#080808] flex font-dm">
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 bg-dark-card border-r border-dark-border flex flex-col sticky top-0 h-screen">
        <div className="px-5 py-6 border-b border-dark-border">
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

        <nav className="flex-1 py-4 px-3 space-y-4 overflow-y-auto">
          {/* Overview group */}
          <div>
            <p className="font-bebas text-muted/40 text-[8px] tracking-[0.3em] px-3 mb-1">OVERVIEW</p>
            <div className="space-y-0.5">
              {overviewNav.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setSection(id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left ${
                    section === id
                      ? "bg-yellow/10 text-yellow"
                      : "text-muted hover:text-offwhite hover:bg-white/5"
                  }`}
                >
                  <Icon size={15} className="shrink-0" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Content group */}
          <div>
            <p className="font-bebas text-muted/40 text-[8px] tracking-[0.3em] px-3 mb-1">CONTENT</p>
            <div className="space-y-0.5">
              {contentNav.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setSection(id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left ${
                    section === id
                      ? "bg-yellow/10 text-yellow"
                      : "text-muted hover:text-offwhite hover:bg-white/5"
                  }`}
                >
                  <Icon size={15} className="shrink-0" />
                  {label}
                </button>
              ))}
            </div>
          </div>
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
      </aside>

      {/* ── Main ─────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-h-screen overflow-y-auto">
        <header className="sticky top-0 z-10 bg-[#080808]/90 backdrop-blur border-b border-dark-border px-8 py-4 flex items-center justify-between">
          <div>
            <p className="font-bebas text-yellow text-[10px] tracking-[0.3em]">
              {SECTION_TITLES[section].desc}
            </p>
            <h1 className="font-syne font-bold text-offwhite text-lg leading-tight">
              {SECTION_TITLES[section].title}
            </h1>
          </div>

          <button
            onClick={handleSave}
            disabled={saving || isAutoSave}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-syne font-bold transition-all disabled:cursor-not-allowed ${
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
            {saving ? "Saving…" : saved ? "Saved!" : saveError ? "Error" : "Save Changes"}
          </button>
        </header>

        <div className="flex-1 p-8 max-w-3xl">
          {section === "dashboard" && (
            <DashboardView onNavigate={setSection} />
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
          {section === "bookings" && <BookingsManager />}
          {section === "map" && (
            <MapEditor content={content} onChange={setContent} />
          )}
        </div>
      </main>
    </div>
  );
}
