"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, AlertTriangle, RefreshCw, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import PinPicker from "@/components/PinPicker";

// ── The shop's own details, edited by the shop (M98) ───────────────────────
//
// Until now every one of these fields went through the platform owner, not
// because anyone decided merchants shouldn't touch them but because `stores`
// grants authenticated SELECT only — the M8 control doing its job on the
// dangerous columns and taking the harmless ones with it.
//
// What is NOT here is as deliberate as what is: the shop's status, its web
// address, whether it is featured, and who owns it. Those belong to the
// platform, and the RPC ignores them even if this form were made to send them.

type Profile = {
  name: string;
  tagline: string | null;
  description: string | null;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  lat: number | null;
  lng: number | null;
  slug: string;
  status: string;
};

const input =
  "mt-1 w-full rounded-xl border border-white/10 bg-dark px-3 py-2.5 font-dm text-sm text-offwhite placeholder:text-muted focus:border-yellow/50 focus:outline-none";
const label = "block font-bebas text-[11px] tracking-[0.2em] text-muted";

export default function ShopProfileForm() {
  const [p, setP] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    fetch("/api/merchant/profile")
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b.error || "Couldn't load your shop.");
        return b;
      })
      .then((b) => { if (!cancelled) setP(b.profile); })
      .catch((e) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : "Couldn't load your shop."); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!p) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/merchant/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: p.name,
          tagline: p.tagline ?? "",
          description: p.description ?? "",
          address: p.address ?? "",
          phone: p.phone ?? "",
          whatsapp: p.whatsapp ?? "",
          lat: p.lat == null ? "" : String(p.lat),
          lng: p.lng == null ? "" : String(p.lng),
        }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || "Couldn't save.");
      toast.success("Shop details saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-2xl border border-red-500/25 bg-red-500/[0.05] p-6 text-center">
        <AlertTriangle className="mx-auto text-red-400" size={22} />
        <p className="mt-2 font-dm text-sm text-red-400">{loadError}</p>
        <Button variant="outline" className="mt-3" onClick={() => setReloadKey((k) => k + 1)}>
          <RefreshCw size={15} className="mr-1.5" /> Try again
        </Button>
      </div>
    );
  }

  if (!p) {
    return (
      <div className="space-y-3" aria-busy="true">
        <span className="sr-only">Loading…</span>
        <Skeleton className="h-32 w-full rounded-xl bg-white/[0.04]" />
        <Skeleton className="h-40 w-full rounded-xl bg-white/[0.04]" />
      </div>
    );
  }

  const set = (patch: Partial<Profile>) => setP({ ...p, ...patch });

  return (
    <form onSubmit={save} className="space-y-6">
      <fieldset className="rounded-2xl border border-white/10 bg-dark-card p-4">
        <legend className="px-1 font-bebas text-[11px] tracking-[0.3em] text-yellow">WHAT CUSTOMERS SEE</legend>
        <div className="mt-3 space-y-3">
          <div>
            <span className={label}>SHOP NAME</span>
            <input className={input} value={p.name} maxLength={200}
              onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div>
            <span className={label}>ONE LINE ABOUT YOU</span>
            <input className={input} value={p.tagline ?? ""} maxLength={200}
              placeholder="Handmade baskets from Rodrigues"
              onChange={(e) => set({ tagline: e.target.value })} />
          </div>
          <div>
            <span className={label}>DESCRIPTION</span>
            <Textarea className={input} rows={4} value={p.description ?? ""} maxLength={2000}
              onChange={(e) => set({ description: e.target.value })} />
          </div>
        </div>
      </fieldset>

      <fieldset className="rounded-2xl border border-white/10 bg-dark-card p-4">
        <legend className="px-1 font-bebas text-[11px] tracking-[0.3em] text-yellow">HOW TO REACH YOU</legend>
        <p className="mt-1 font-dm text-xs leading-relaxed text-muted">
          Your WhatsApp is shown to customers who cannot pay by bank transfer — many visitors have no
          local account, and without it they simply leave.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <span className={label}>PHONE</span>
            <input className={input} value={p.phone ?? ""} inputMode="tel" maxLength={40}
              onChange={(e) => set({ phone: e.target.value })} />
          </div>
          <div>
            <span className={label}>WHATSAPP</span>
            <input className={input} value={p.whatsapp ?? ""} inputMode="tel" maxLength={40}
              placeholder="+230 5xxx xxxx"
              onChange={(e) => set({ whatsapp: e.target.value })} />
          </div>
        </div>
        <div className="mt-3">
          <span className={label}>ADDRESS</span>
          <input className={input} value={p.address ?? ""} maxLength={300}
            placeholder="Port Mathurin market" onChange={(e) => set({ address: e.target.value })} />
        </div>
        {/* Was two boxes asking a shop owner for their own latitude, with the
            hint "Rodrigues is around -19.7". Five of six live shops had no pin,
            which is what that form was always going to produce. */}
        <div className="mt-3">
          <PinPicker
            lat={typeof p.lat === "number" ? p.lat : p.lat ? Number(p.lat) : null}
            lng={typeof p.lng === "number" ? p.lng : p.lng ? Number(p.lng) : null}
            onChange={(next) => set(next)}
          />
        </div>
      </fieldset>

      {/* Stated rather than hidden. A merchant who cannot find "close my shop"
          should be told where it lives, not left hunting for a control that
          was never theirs. */}
      <p className="font-dm text-xs leading-relaxed text-muted">
        Your web address (<span className="text-offwhite">/shop/{p.slug}</span>) and whether the shop is
        live are set by Roulé Rodrigues — message us if either needs to change.{" "}
        <Link href={`/shop/${p.slug}`} className="inline-flex items-center gap-1 text-yellow underline">
          See your shop <ExternalLink size={11} />
        </Link>
      </p>

      {error && <p role="alert" className="font-dm text-sm text-red-400">{error}</p>}

      <Button type="submit" disabled={saving || !p.name.trim()} className="w-full sm:w-auto">
        {saving ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : null}
        Save shop details
      </Button>
    </form>
  );
}
