"use client";

import { useState, useRef } from "react";
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
} from "lucide-react";
import type { SiteContent, FleetItem, GalleryImage, TestimonialItem, PricingRow } from "@/lib/defaults";

type Section = "hero" | "fleet" | "pricing" | "contact" | "gallery" | "testimonials" | "branding";

const NAV: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "hero", label: "Hero", icon: Sparkles },
  { id: "fleet", label: "Fleet", icon: Bike },
  { id: "pricing", label: "Pricing", icon: DollarSign },
  { id: "contact", label: "Contact", icon: Phone },
  { id: "gallery", label: "Gallery", icon: Images },
  { id: "testimonials", label: "Reviews", icon: Star },
  { id: "branding", label: "Branding & Social", icon: Share2 },
];

// ── Shared field components ───────────────────────────────────────────────────

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

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={inputCls}
    />
  );
}

function Textarea({ value, onChange, rows = 3 }: { value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className={`${inputCls} resize-none`}
    />
  );
}

// ── Image picker ─────────────────────────────────────────────────────────────

function ImagePicker({ src, onUpload, label, onSessionExpired }: { src: string; onUpload: (path: string) => void; label: string; onSessionExpired?: () => void }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      if (res.status === 401) { onSessionExpired?.(); return; }
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

// ── Section editors ───────────────────────────────────────────────────────────

function HeroEditor({ content, onChange }: { content: SiteContent; onChange: (c: SiteContent) => void }) {
  const h = content.hero;
  const set = (patch: Partial<typeof h>) => onChange({ ...content, hero: { ...h, ...patch } });

  return (
    <div className="space-y-5">
      <ImagePicker label="BACKGROUND IMAGE" src={h.backgroundImage} onUpload={(p) => set({ backgroundImage: p })} />
      <Field label="EYEBROW TEXT">
        <TextInput value={h.eyebrow} onChange={(v) => set({ eyebrow: v })} />
      </Field>
      <Field label="HEADLINE LINE 1">
        <TextInput value={h.headline[0]} onChange={(v) => set({ headline: [v, h.headline[1], h.headline[2]] })} />
      </Field>
      <Field label="HEADLINE LINE 2">
        <TextInput value={h.headline[1]} onChange={(v) => set({ headline: [h.headline[0], v, h.headline[2]] })} />
      </Field>
      <Field label="HEADLINE LINE 3">
        <TextInput value={h.headline[2]} onChange={(v) => set({ headline: [h.headline[0], h.headline[1], v] })} />
      </Field>
      <Field label="SUBHEADLINE">
        <Textarea value={h.subheadline} onChange={(v) => set({ subheadline: v })} rows={2} />
      </Field>
    </div>
  );
}

function FleetEditor({ content, onChange }: { content: SiteContent; onChange: (c: SiteContent) => void }) {
  function updateScooter(idx: number, patch: Partial<FleetItem>) {
    const fleet = content.fleet.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    // Keep pricing row name in sync when scooter name changes
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
        <div key={scooter.id} className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <p className="font-bebas text-yellow text-xs tracking-[0.3em]">
              SCOOTER {idx + 1} — {scooter.name}
            </p>
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
          <ImagePicker
            label="SCOOTER IMAGE"
            src={scooter.image}
            onUpload={(p) => updateScooter(idx, { image: p })}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="NAME">
              <TextInput value={scooter.name} onChange={(v) => updateScooter(idx, { name: v })} />
            </Field>
            <Field label="BADGE">
              <TextInput value={scooter.badge} onChange={(v) => updateScooter(idx, { badge: v })} placeholder="e.g. PREMIUM" />
            </Field>
            <Field label="TAGLINE">
              <TextInput value={scooter.tagline} onChange={(v) => updateScooter(idx, { tagline: v })} />
            </Field>
            <Field label="PRICE">
              <TextInput value={scooter.price} onChange={(v) => updateScooter(idx, { price: v })} placeholder="e.g. From Rs 800" />
            </Field>
          </div>
          <Field label="DESCRIPTION">
            <Textarea value={scooter.description} onChange={(v) => updateScooter(idx, { description: v })} rows={3} />
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
        Adding or removing a scooter here also updates the pricing table automatically.
      </p>
    </div>
  );
}

function PricingEditor({ content, onChange }: { content: SiteContent; onChange: (c: SiteContent) => void }) {
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
              <th className="text-left px-5 py-3 font-bebas text-muted text-[10px] tracking-[0.2em]">MODEL</th>
              {COLS.map((c) => (
                <th key={c} className="px-5 py-3 font-bebas text-muted text-[10px] tracking-[0.2em] text-center">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {content.pricing.map((row, ri) => (
              <tr key={ri} className={ri < content.pricing.length - 1 ? "border-b border-[#2a2a2a]" : ""}>
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

function ContactEditor({ content, onChange }: { content: SiteContent; onChange: (c: SiteContent) => void }) {
  const c = content.contact;
  const set = (patch: Partial<typeof c>) => onChange({ ...content, contact: { ...c, ...patch } });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      <Field label="WHATSAPP / PHONE">
        <TextInput value={c.phone} onChange={(v) => set({ phone: v })} placeholder="+230 5XXX XXXX" />
      </Field>
      <Field label="EMAIL">
        <TextInput value={c.email} onChange={(v) => set({ email: v })} placeholder="hello@example.com" />
      </Field>
      <Field label="LOCATION">
        <TextInput value={c.location} onChange={(v) => set({ location: v })} />
      </Field>
      <Field label="OPENING HOURS">
        <TextInput value={c.hours} onChange={(v) => set({ hours: v })} placeholder="Mon – Sun: 7:00 AM – 8:00 PM" />
      </Field>
    </div>
  );
}

function GalleryEditor({ content, onChange, onSessionExpired }: { content: SiteContent; onChange: (c: SiteContent) => void; onSessionExpired: () => void }) {
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
    const res = await fetch(`/api/admin/gallery?id=${encodeURIComponent(id)}`, { method: "DELETE" });
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
        {uploading ? <Loader2 size={28} className="text-yellow animate-spin" /> : <Upload size={28} className="text-muted" />}
        <span className="font-bebas text-muted tracking-[0.2em] text-sm">
          {uploading ? "UPLOADING…" : "CLICK TO ADD PHOTOS"}
        </span>
        <span className="font-dm text-muted/50 text-xs">JPG, PNG, WEBP — multiple files supported</span>
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
            <div key={img.id} className="group relative aspect-square rounded-xl overflow-hidden bg-[#0d0d0d] border border-[#2a2a2a]">
              <Image src={img.src} alt={img.alt} fill className="object-cover" unoptimized />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button
                  onClick={() => handleDelete(img.id)}
                  disabled={deleting === img.id}
                  className="bg-red-500/90 hover:bg-red-600 text-white rounded-full p-2 transition-colors"
                  aria-label="Delete photo"
                >
                  {deleting === img.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
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

function TestimonialsEditor({ content, onChange }: { content: SiteContent; onChange: (c: SiteContent) => void }) {
  function updateReview(idx: number, patch: Partial<TestimonialItem>) {
    const testimonials = content.testimonials.map((t, i) => (i === idx ? { ...t, ...patch } : t));
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
    onChange({ ...content, testimonials: content.testimonials.filter((_, i) => i !== idx) });
  }

  return (
    <div className="space-y-6">
      {content.testimonials.length === 0 && (
        <p className="text-muted/50 font-dm text-sm py-4 text-center">
          No reviews yet. Add your first customer review below.
        </p>
      )}

      {content.testimonials.map((review, idx) => (
        <div key={review.id} className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-6 space-y-4">
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
              <TextInput value={review.name} onChange={(v) => updateReview(idx, { name: v })} placeholder="e.g. Sophie Laurent" />
            </Field>
            <Field label="ORIGIN (CITY, COUNTRY)">
              <TextInput value={review.origin} onChange={(v) => updateReview(idx, { origin: v })} placeholder="e.g. Paris, France" />
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
            <Textarea value={review.text} onChange={(v) => updateReview(idx, { text: v })} rows={3} />
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

function BrandingEditor({ content, onChange }: { content: SiteContent; onChange: (c: SiteContent) => void }) {
  const s = content.social;
  const b = content.branding;
  const setSocial = (patch: Partial<typeof s>) => onChange({ ...content, social: { ...s, ...patch } });
  const setBranding = (patch: Partial<typeof b>) => onChange({ ...content, branding: { ...b, ...patch } });

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
          Upload your logo to replace the text in the navbar and footer. PNG with transparent background works best.
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

// ── Main dashboard ────────────────────────────────────────────────────────────

export default function AdminDashboard({ initialContent }: { initialContent: SiteContent }) {
  const [section, setSection] = useState<Section>("hero");
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
    hero: { title: "Hero Section", desc: "Edit the full-screen hero text and background image." },
    fleet: { title: "Fleet / Scooters", desc: "Add, remove, or edit scooters. Pricing updates automatically." },
    pricing: { title: "Pricing", desc: "Update rental prices for all durations." },
    contact: { title: "Contact Info", desc: "Edit phone, email, location and opening hours." },
    gallery: { title: "Photo Gallery", desc: "Upload scooter photos — they appear as a gallery on the site." },
    testimonials: { title: "Customer Reviews", desc: "Add or remove customer testimonials shown on the site." },
    branding: { title: "Branding & Social", desc: "Upload your logo and link your social media pages." },
  };

  const isAutoSave = section === "gallery";

  return (
    <div className="min-h-screen bg-[#080808] flex font-dm">
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 bg-dark-card border-r border-dark-border flex flex-col sticky top-0 h-screen">
        <div className="px-5 py-6 border-b border-dark-border">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-syne font-extrabold text-base text-offwhite uppercase tracking-tight leading-none">ROULE</span>
            <span className="w-px h-3.5 bg-dark-border" />
            <span className="font-bebas text-xs tracking-[0.2em] text-yellow leading-none">RODRIGUES</span>
            <span className="w-1.5 h-1.5 rounded-full bg-yellow" />
          </div>
          <p className="font-bebas text-muted text-[9px] tracking-[0.3em]">ADMIN</p>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left ${
                section === id ? "bg-yellow/10 text-yellow" : "text-muted hover:text-offwhite hover:bg-white/5"
              }`}
            >
              <Icon size={16} className="shrink-0" />
              {label}
            </button>
          ))}
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

      {/* ── Main ────────────────────────────────────────────────── */}
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
            {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <CheckCircle size={14} /> : saveError ? <AlertCircle size={14} /> : <Save size={14} />}
            {saving ? "Saving…" : saved ? "Saved!" : saveError ? "Error" : "Save Changes"}
          </button>
        </header>

        <div className="flex-1 p-8 max-w-3xl">
          {section === "hero" && <HeroEditor content={content} onChange={setContent} />}
          {section === "fleet" && <FleetEditor content={content} onChange={setContent} />}
          {section === "pricing" && <PricingEditor content={content} onChange={setContent} />}
          {section === "contact" && <ContactEditor content={content} onChange={setContent} />}
          {section === "gallery" && (
            <>
              <GalleryEditor content={content} onChange={setContent} onSessionExpired={() => router.push("/admin/login")} />
              <p className="mt-4 text-muted/50 text-xs font-dm">
                Gallery photos are saved automatically — no need to click Save Changes.
              </p>
            </>
          )}
          {section === "testimonials" && <TestimonialsEditor content={content} onChange={setContent} />}
          {section === "branding" && <BrandingEditor content={content} onChange={setContent} />}
        </div>
      </main>
    </div>
  );
}
