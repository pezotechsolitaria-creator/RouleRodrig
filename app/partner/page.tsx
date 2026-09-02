"use client";

import { useEffect, useState, useCallback } from "react";
import BackLink from "@/components/BackLink";
import {
  Building2,
  Search,
  Loader2,
  AlertCircle,
  TrendingUp,
  CheckCircle,
  Clock,
  Wallet,
  Copy,
  MessageSquare,
} from "lucide-react";
import { SITE_URL } from "@/lib/site";

type Recent = {
  scooter: string;
  start_date: string;
  end_date: string;
  days: number;
  amount: number | null;
  status: string;
  created_at: string;
};

type StatsResponse = {
  partner: { name: string; type: string; active: boolean };
  stats: {
    total: number;
    confirmed: number;
    pending: number;
    completed: number;
    cancelled: number;
    totalValue: number;
  };
  recent: Recent[];
};

const statusStyles: Record<string, string> = {
  confirmed: "text-green-400 bg-green-500/10",
  pending: "text-yellow bg-yellow/10",
  completed: "text-blue-400 bg-blue-500/10",
  cancelled: "text-red-400/70 bg-red-500/10",
};

function fmtDate(s: string): string {
  try {
    return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return s;
  }
}

export default function PartnerPage() {
  const [code, setCode] = useState("");
  const [data, setData] = useState<StatsResponse | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error" | "notfound">("idle");
  const [copied, setCopied] = useState(false);

  const lookup = useCallback(async (raw: string) => {
    const clean = raw.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 30);
    if (!clean) return;
    setState("loading");
    setData(null);
    try {
      const res = await fetch(`/api/partner/stats?code=${encodeURIComponent(clean)}`);
      if (res.status === 404) {
        setState("notfound");
        return;
      }
      if (!res.ok) throw new Error("failed");
      const json = (await res.json()) as StatsResponse;
      setData(json);
      setState("idle");
      try {
        localStorage.setItem("rr_partner_code", clean);
      } catch {
        /* ignore */
      }
    } catch {
      setState("error");
    }
  }, []);

  // Prefill from ?code= or a previously used code, then auto-load.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("code");
    let stored: string | null = null;
    try {
      stored = localStorage.getItem("rr_partner_code");
    } catch {
      /* ignore */
    }
    const initial = (fromUrl || stored || "").toUpperCase();
    if (initial) {
      setCode(initial);
      lookup(initial);
    }
  }, [lookup]);

  const refLink = data ? `${SITE_URL}/?ref=${code}` : "";

  // The QR is drawn locally instead of fetched from api.qrserver.com. That
  // handed every partner's referral link to a third party just to draw a
  // square, and returned a fixed-size PNG for something whose stated purpose is
  // printing a poster. Same SVG string feeds the image and the download, so
  // what a partner sees is exactly what they save.
  //
  // Built in an effect with a dynamic import so the encoder stays out of this
  // page's initial bundle; it is ~20 KB and most visitors never see a QR.
  const [qrSvg, setQrSvg] = useState("");

  useEffect(() => {
    if (!refLink) {
      setQrSvg("");
      return;
    }
    let alive = true;
    import("@/lib/qr-svg").then(({ qrSvgDocument }) => {
      if (alive) setQrSvg(qrSvgDocument(refLink));
    });
    return () => {
      alive = false;
    };
  }, [refLink]);

  // data: URL rather than a blob: — the CSP allows `img-src ... data:` and a
  // data URL needs no lifetime management.
  const qr = qrSvg ? `data:image/svg+xml;utf8,${encodeURIComponent(qrSvg)}` : "";
  const waShare = refLink
    ? `https://wa.me/?text=${encodeURIComponent(`Rent a scooter on Rodrigues with Roule Rodrigues 🛵 Book here: ${refLink}`)}`
    : "";

  // Built locally rather than saved from the api.qrserver.com <img>: the
  // `download` attribute is ignored on a cross-origin URL, so the old
  // "Open / download QR" link could only ever OPEN the image and leave the
  // partner to work the rest out. SVG because the stated use is printing it for
  // a reception desk. Dynamically imported so the encoder stays out of this
  // page's initial bundle — nobody pays for it until they click.
  // Saves the exact SVG already on screen, so the poster a partner prints is
  // byte-for-byte what they were shown.
  async function downloadQr() {
    if (!qrSvg) return;
    const [{ qrFilename }, { downloadBlob }] = await Promise.all([
      import("@/lib/qr-svg"),
      import("@/lib/download"),
    ]);
    downloadBlob(new Blob([qrSvg], { type: "image/svg+xml;charset=utf-8" }), qrFilename(code));
  }

  function copyLink() {
    if (!refLink) return;
    navigator.clipboard.writeText(refLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main className="min-h-screen bg-dark text-offwhite font-dm">
      <div className="max-w-5xl mx-auto px-6 py-10 md:py-16">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          {/* Fallback "/": this portal sits under no section — the site footer is
              its only link, and a partner usually arrives on a /partner?code=…
              link from outside, so the homepage is the site itself. NOT
              /list-your-scooter: an existing partner reading their earnings should
              not be backed into a pitch to sign up. */}
          <BackLink
            fallback="/"
            iconSize={15}
            className="flex items-center gap-2 text-muted hover:text-yellow text-sm transition-colors"
          >
            {" "}Back
          </BackLink>
          <span className="font-bebas text-yellow text-[10px] tracking-[0.3em]">PARTNER PORTAL</span>
        </div>

        <div className="mb-10">
          <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">REFERRAL DASHBOARD</p>
          <h1
            className="font-syne font-extrabold uppercase leading-[0.95]"
            style={{ fontSize: "clamp(32px, 7vw, 60px)" }}
          >
            Your referrals
          </h1>
          <p className="text-muted text-sm mt-3 max-w-lg">
            Enter your partner code to see every booking sent through your link.
            No login needed.
          </p>
        </div>

        {/* Code input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            lookup(code);
          }}
          className="flex flex-col sm:flex-row gap-3 mb-10 max-w-md"
        >
          <div className="relative flex-1">
            <Building2 size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted/50" />
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="YOUR-CODE"
              maxLength={30}
              className="w-full bg-dark-card border border-dark-border rounded-xl pl-10 pr-4 py-3.5 text-offwhite text-sm font-mono tracking-wider placeholder:text-muted/40 focus:border-yellow focus:outline-none transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={state === "loading" || !code}
            className="flex items-center justify-center gap-2 bg-yellow text-dark font-syne font-bold text-sm px-6 py-3.5 rounded-xl hover:bg-yellow-dark transition-colors disabled:opacity-60"
          >
            {state === "loading" ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            View
          </button>
        </form>

        {/* States */}
        {state === "notfound" && (
          <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-4 max-w-md">
            <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-syne font-bold text-red-400 text-sm">Code not found</p>
              <p className="text-red-400/70 text-xs mt-0.5">
                Double-check your partner code, or contact us to get set up.
              </p>
            </div>
          </div>
        )}
        {state === "error" && (
          <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-4 max-w-md">
            <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
            <p className="font-dm text-red-400/80 text-sm">Something went wrong. Please try again.</p>
          </div>
        )}

        {/* Results */}
        {data && (
          <div className="space-y-8">
            {/* Partner name */}
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-yellow/10 flex items-center justify-center">
                <Building2 size={20} className="text-yellow" />
              </div>
              <div>
                <p className="font-syne font-bold text-lg leading-tight">{data.partner.name}</p>
                <p className="text-muted text-xs capitalize">
                  {data.partner.type.replace("_", " ")}
                  {!data.partner.active && " · inactive"}
                </p>
              </div>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Total bookings", value: data.stats.total, icon: TrendingUp, accent: "text-offwhite" },
                { label: "Confirmed", value: data.stats.confirmed, icon: CheckCircle, accent: "text-green-400" },
                { label: "Completed", value: data.stats.completed, icon: CheckCircle, accent: "text-blue-400" },
                { label: "Rental value", value: `Rs ${data.stats.totalValue.toLocaleString()}`, icon: Wallet, accent: "text-yellow" },
              ].map((s) => (
                <div key={s.label} className="bg-dark-card border border-dark-border rounded-2xl p-5">
                  <s.icon size={16} className="text-muted/40 mb-3" />
                  <p className={`font-syne font-extrabold text-2xl mb-1 ${s.accent}`}>{s.value}</p>
                  <p className="text-muted text-xs">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Referral toolkit */}
            <div className="bg-dark-card border border-yellow/20 rounded-2xl p-5">
              <p className="font-bebas text-yellow text-[10px] tracking-[0.3em] mb-1">YOUR REFERRAL LINK</p>
              <p className="text-muted/70 text-xs mb-4">
                Share this link or print the QR for your reception. Every guest who uses it is
                counted automatically.
              </p>
              <div className="flex flex-col md:flex-row gap-5">
                <div className="flex flex-col items-center gap-2 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr} alt="Referral QR" className="w-32 h-32 rounded-xl bg-white p-1.5" />
                  <button
                    type="button"
                    onClick={downloadQr}
                    disabled={!qrSvg}
                    className="text-xs text-muted hover:text-yellow transition-colors disabled:opacity-40 disabled:hover:text-muted"
                  >
                    Download QR
                  </button>
                </div>
                <div className="flex-1 min-w-0 space-y-3">
                  <div className="flex items-center gap-2 bg-dark border border-dark-border rounded-lg px-3 py-2.5">
                    <span className="font-mono text-yellow text-xs truncate flex-1">{refLink}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={copyLink}
                      className="flex items-center gap-1.5 text-xs border border-dark-border hover:border-yellow/40 text-muted hover:text-yellow px-3 py-2 rounded-full transition-colors"
                    >
                      <Copy size={12} /> {copied ? "Copied!" : "Copy link"}
                    </button>
                    <a
                      href={waShare}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs bg-green-500/15 text-green-400 hover:bg-green-500/25 px-3 py-2 rounded-full transition-colors"
                    >
                      <MessageSquare size={12} /> Share on WhatsApp
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent bookings */}
            <div>
              <p className="font-bebas text-yellow text-[10px] tracking-[0.3em] mb-4 flex items-center gap-2">
                <Clock size={12} /> RECENT BOOKINGS
              </p>
              {data.recent.length === 0 ? (
                <div className="bg-dark-card border border-dark-border rounded-2xl p-8 text-center">
                  <p className="text-muted text-sm">No bookings yet — share your link to get started!</p>
                </div>
              ) : (
                <div className="bg-dark-card border border-dark-border rounded-2xl divide-y divide-dark-border overflow-hidden">
                  {data.recent.map((b, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 px-5 py-3.5">
                      <div className="min-w-0">
                        <p className="text-offwhite text-sm font-medium truncate">{b.scooter}</p>
                        <p className="text-muted text-xs">
                          {fmtDate(b.start_date)} – {fmtDate(b.end_date)} · {b.days} day{b.days !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {b.amount != null && (
                          <span className="text-offwhite/80 text-xs font-mono">Rs {b.amount.toLocaleString()}</span>
                        )}
                        <span className={`text-[10px] font-bebas tracking-[0.15em] px-2.5 py-1 rounded-full ${statusStyles[b.status] ?? "text-muted bg-white/5"}`}>
                          {b.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-muted/40 text-xs mt-4">
                Rental value is an estimate based on the booking requests sent through your link.
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
