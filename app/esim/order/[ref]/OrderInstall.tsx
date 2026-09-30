"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Apple, Check, ChevronDown, Copy, Loader2, QrCode, Smartphone, LifeBuoy, AlertTriangle, MessageCircle } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import type { OrderView } from "@/lib/esim/service";
import { buildPickupQr } from "@/lib/orders/pickup-qr";
import { IOS_STEPS, ANDROID_STEPS } from "@/lib/esim/content";
import { esimTrack } from "@/lib/esim/analytics";
import { CONTACT_EMAIL } from "@/lib/site";
import { waLink } from "../../ui/scroll";
import { toUiLang, type UiLang } from "../../copy";

// ── The install page ─────────────────────────────────────────────────────────
//
// Built around one fact: MOST BUYERS ARE HOLDING THE PHONE THE eSIM IS FOR,
// and a phone cannot scan a QR code on its own screen. So the page leads with
// the one-tap install for the device it is open on (Apple's universal link on
// iPhone, Google's on Android), keeps the QR for "installing on another
// phone" and for desktops, and always shows the two manual codes with copy
// buttons — the path that works on every phone ever made.
//
// SHORT AND GUIDED (M226): one action for the device you are holding (the
// big QR with three steps on a computer, the one-tap button on a phone), the
// three things to do on landing, and everything else — manual codes, the
// full step list, the order details — folded, one tap away.

const T = {
  en: {
    preparing: "Preparing your eSIM…",
    preparingSub: "Payment received. Our supplier is issuing your eSIM — usually under a minute. This page updates by itself, and it will also arrive by email.",
    ready: "Your eSIM is ready",
    // Two lines at 375px (it was three): where the days start is the FAQ's
    // job; here the one instruction is "install now, on Wi-Fi".
    readySub: (email: string) => `Also sent to ${email}. Install it now, on Wi-Fi — your days start when you land.`,
    installIphone: "Install on this iPhone",
    installIphoneNote: "iOS 17.4 or later. Opens the iPhone's own eSIM screen.",
    installAndroid: "Install on this phone",
    installAndroidNote: "Pixel & recent Samsung. Nothing opened? Use “Enter it by hand”.",
    otherPhone: "Other phone? Show the QR code",
    scanTitle: "Scan with the phone you're travelling with",
    scanSub: "Settings → Mobile / Cellular → Add eSIM → Use QR code.",
    scanSteps: [
      "On the travel phone, open Settings → Add eSIM (under Mobile, Cellular or SIM manager)",
      "Choose “Use QR code” and scan this code",
      "Name it “Rodrigues” and choose it for mobile data",
    ],
    orderDetails: "Order details",
    manualTitle: "Enter it by hand",
    smdp: "SM-DP+ address",
    code: "Activation code",
    full: "Full code (Android “Enter activation code”)",
    copy: "Copy",
    copied: "Copied",
    stepsTitle: "Step by step",
    iphone: "iPhone",
    android: "Android",
    landTitle: "When you land",
    land: [
      "Switch the eSIM on, with Data Roaming — normal and free.",
      "Use it for mobile data; keep your SIM for calls and texts.",
      "Give it a minute to connect. If it doesn't, restart once.",
    ],
    once: "An eSIM installs only once: never delete it — switch it off instead.",
    order: "Order",
    plan: "Plan",
    paid: "Paid",
    expires: "Valid until",
    usage: "Data used",
    failed: "We're finishing your eSIM",
    failedSub: "Your payment is safe. A person on our team has been alerted: you'll receive your eSIM, or a full refund, within 24 hours. You don't need to do anything.",
    refunded: "This order was refunded",
    refundedSub: "The refund goes back to the card or PayPal account you paid with, usually within 3–5 working days.",
    notFound: "This link doesn't open an eSIM",
    notFoundSub: "Check you copied the whole link from your email, or find your eSIM with your order number and email.",
    find: "Find my eSIM",
    help: "Need help? Write to us with your order number",
    stampReady: "READY",
    stampPreparing: "PREPARING",
    stampOnIt: "ON IT",
    stampRefunded: "REFUNDED",
    pass: "DATA PASS",
    wa: "Ask us on WhatsApp",
    waMsg: (ref: string) => `Hello! A question about my eSIM ${ref}.`,
  },
  fr: {
    preparing: "Préparation de votre eSIM…",
    preparingSub: "Paiement reçu. Notre fournisseur émet votre eSIM — généralement en moins d'une minute. Cette page se met à jour toute seule, et l'eSIM arrive aussi par email.",
    ready: "Votre eSIM est prête",
    readySub: (email: string) => `Envoyée aussi à ${email}. Installez-la maintenant, en Wi-Fi — vos jours démarrent à l'arrivée.`,
    installIphone: "Installer sur cet iPhone",
    installIphoneNote: "iOS 17.4 ou plus récent. Ouvre l'écran eSIM de l'iPhone.",
    installAndroid: "Installer sur ce téléphone",
    installAndroidNote: "Pixel et Samsung récents. Rien ne s'ouvre ? « Saisir à la main ».",
    otherPhone: "Autre téléphone ? Afficher le QR code",
    scanTitle: "Scannez avec le téléphone du voyage",
    scanSub: "Réglages → Données cellulaires → Ajouter une eSIM → Code QR.",
    scanSteps: [
      "Sur le téléphone du voyage, ouvrez Réglages → Ajouter une eSIM (Données cellulaires, Réseaux mobiles ou Gestionnaire SIM)",
      "Choisissez « Code QR » et scannez ce code",
      "Nommez-la « Rodrigues » et choisissez-la pour les données",
    ],
    orderDetails: "Détails de la commande",
    manualTitle: "Saisir à la main",
    smdp: "Adresse SM-DP+",
    code: "Code d'activation",
    full: "Code complet (Android « Saisir le code d'activation »)",
    copy: "Copier",
    copied: "Copié",
    stepsTitle: "Pas à pas",
    iphone: "iPhone",
    android: "Android",
    landTitle: "À l'arrivée",
    land: [
      "Activez l'eSIM et son itinérance des données — normal et gratuit.",
      "Données mobiles : l'eSIM ; appels et SMS : votre SIM.",
      "Laissez-lui une minute. Sinon, redémarrez une fois.",
    ],
    once: "Une eSIM ne s'installe qu'une fois : ne la supprimez jamais, désactivez-la.",
    order: "Commande",
    plan: "Forfait",
    paid: "Payé",
    expires: "Valable jusqu'au",
    usage: "Données utilisées",
    failed: "Nous finalisons votre eSIM",
    failedSub: "Votre paiement est en sécurité. Notre équipe a été prévenue : vous recevrez votre eSIM, ou un remboursement intégral, dans les 24 heures. Vous n'avez rien à faire.",
    refunded: "Cette commande a été remboursée",
    refundedSub: "Le remboursement revient sur la carte ou le compte PayPal utilisé, généralement sous 3 à 5 jours ouvrés.",
    notFound: "Ce lien n'ouvre aucune eSIM",
    notFoundSub: "Vérifiez que vous avez copié le lien complet depuis votre email, ou retrouvez votre eSIM avec votre numéro de commande et votre email.",
    find: "Retrouver mon eSIM",
    help: "Besoin d'aide ? Écrivez-nous avec votre numéro de commande",
    stampReady: "PRÊTE",
    stampPreparing: "EN COURS",
    stampOnIt: "EN TRAITEMENT",
    stampRefunded: "REMBOURSÉE",
    pass: "PASS DATA",
    wa: "Écrivez-nous sur WhatsApp",
    waMsg: (ref: string) => `Bonjour ! Une question sur mon eSIM ${ref}.`,
  },
};

type Device = "ios" | "android" | "other";

function detectDevice(): Device {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

function fmtBytes(b: number): string {
  const gb = b / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(b / 1024 ** 2)} MB`;
}

export default function OrderInstall({
  initial,
  refParam,
  keyParam,
  lang: initialLang,
  whatsapp = null,
}: {
  initial: OrderView | null;
  refParam: string;
  keyParam: string | null;
  lang: UiLang;
  /** The business WhatsApp, for the help button. */
  whatsapp?: string | null;
}) {
  const { language, hasChosen } = useLanguage();
  // The order's own language wins until the visitor picks one on this device.
  const lang: UiLang = hasChosen ? toUiLang(language) : initialLang;
  const t = T[lang];
  const [view, setView] = useState<OrderView | null>(initial);
  const [device, setDevice] = useState<Device>("other");
  const [showQr, setShowQr] = useState(false);
  const [tab, setTab] = useState<"ios" | "android">("ios");

  useEffect(() => {
    const d = detectDevice();
    setDevice(d);
    setTab(d === "android" ? "android" : "ios");
    if (d === "other") setShowQr(true);
  }, []);

  // Poll while the wholesaler is still issuing the profile. Each poll also
  // nudges provisioning on the server, so this page IS the retry loop.
  const pending = view?.status === "paid" || view?.status === "provisioning";
  useEffect(() => {
    if (!pending || !keyParam) return;
    let stop = false;
    let delay = 3000;
    const tick = async () => {
      if (stop) return;
      try {
        const res = await fetch("/api/esim/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ref: refParam, key: keyParam }),
        });
        if (res.ok) {
          const next = (await res.json()) as OrderView;
          setView(next);
          if (next.status !== "paid" && next.status !== "provisioning") return;
        }
      } catch {
        /* keep polling */
      }
      delay = Math.min(delay * 1.4, 20_000);
      setTimeout(tick, delay);
    };
    const first = setTimeout(tick, delay);
    return () => {
      stop = true;
      clearTimeout(first);
    };
  }, [pending, refParam, keyParam]);

  const lpa = view?.activation?.lpa ?? null;
  const qr = useMemo(() => (lpa ? buildPickupQr(lpa) : null), [lpa]);

  if (!view) {
    return (
      <div className="mx-auto max-w-md px-5 pt-10 text-center">
        <AlertTriangle size={32} className="mx-auto text-yellow" aria-hidden />
        <h1 className="mt-4 font-syne text-2xl font-extrabold text-offwhite">{t.notFound}</h1>
        <p className="mt-2 font-dm text-sm text-muted">{t.notFoundSub}</p>
        <Link href="/esim#esim-find" className="mt-6 inline-flex min-h-12 items-center rounded-full bg-yellow px-6 font-syne text-sm font-bold text-dark">
          {t.find}
        </Link>
      </div>
    );
  }

  const summaryList = (
    <dl className="divide-y divide-white/10 rounded-2xl border border-white/10 px-4">
      {[
        [t.order, view.ref],
        [t.plan, `${lang === "en" ? view.destination.en : view.destination.fr} · ${lang === "en" ? view.planLabelEn : view.planLabelFr}`],
        [t.paid, view.priceLabel],
        ...(view.expiresAt && view.status === "delivered"
          ? [[t.expires, new Date(view.expiresAt).toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "long", year: "numeric" })]]
          : []),
        ...(view.usedBytes != null && view.totalBytes ? [[t.usage, `${fmtBytes(view.usedBytes)} / ${fmtBytes(view.totalBytes)}`]] : []),
      ].map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-4 py-3">
          <dt className="font-dm text-sm text-muted">{k}</dt>
          <dd className="text-right font-dm text-sm font-semibold text-offwhite">{v}</dd>
        </div>
      ))}
    </dl>
  );
  const summary = <div className="mt-8">{summaryList}</div>;

  // ── The pass itself: the page opens on the document you just bought ─────
  const home = view.destination.home;
  // Phone (M227): the title stands ABOVE a one-row pass. Inside the pass,
  // beside its stub, it wrapped to two lines of 1.55rem, and with the plan
  // line under it the header was 152px — MEASURED at 375×812, and the reason
  // "When you land" ended under the bottom nav.
  const passHeader = (title: string, stamp: string, live: boolean) => (
    <>
      <h1 className="font-syne text-[1.5rem] font-extrabold leading-tight text-offwhite [text-wrap:balance]">{title}</h1>
      <div className="relative mt-3 flex overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01)_60%),#111111]">
        <div className="min-w-0 flex-1 px-4 py-3">
          <p className="font-bebas text-[11px] leading-none tracking-[0.24em] text-muted">
            {t.pass} · {home ? "RRG" : view.destination.code}
          </p>
          <p className="mt-1.5 font-syne text-base font-bold leading-snug text-offwhite">
            {!home && <>{lang === "en" ? view.destination.en : view.destination.fr} · </>}
            {lang === "en" ? view.planLabelEn : view.planLabelFr}
          </p>
        </div>
        <span aria-hidden className="pointer-events-none absolute bottom-2.5 right-[6.5rem] top-2.5 border-l border-dashed border-white/15" />
        <span aria-hidden className="pointer-events-none absolute right-[6.5rem] top-0 h-3.5 w-3.5 -translate-y-1/2 translate-x-1/2 rounded-full border border-white/10 bg-dark" />
        <span aria-hidden className="pointer-events-none absolute bottom-0 right-[6.5rem] h-3.5 w-3.5 translate-x-1/2 translate-y-1/2 rounded-full border border-white/10 bg-dark" />
        <div className="flex w-[6.5rem] shrink-0 flex-col items-center justify-center gap-1.5 px-2 py-3 text-center">
          <span className="font-bebas text-[15px] leading-none tracking-[0.1em] text-offwhite">
            <span className="sr-only">{t.order} </span>
            {view.ref}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-bebas text-[11px] leading-none tracking-[0.18em] ${
              live ? "border-yellow/50 text-yellow" : "border-white/20 text-offwhite/80"
            }`}
          >
            {!live && stamp === t.stampPreparing && <Loader2 size={10} className="animate-spin" aria-hidden />}
            {stamp}
          </span>
        </div>
      </div>
    </>
  );
  const waHref = waLink(whatsapp, t.waMsg(view.ref));

  const helpLine = (
    <>
    {waHref && (
      <a
        href={waHref}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-white/12 font-dm text-sm text-offwhite/85 transition-colors hover:bg-white/5"
      >
        <MessageCircle size={16} aria-hidden /> {t.wa}
      </a>
    )}
    <p className="mt-4 flex items-start gap-2 font-dm text-sm text-muted">
      <LifeBuoy size={16} className="mt-0.5 shrink-0 text-yellow" aria-hidden />
      <span>
        {t.help} <b className="text-offwhite">{view.ref}</b> —{" "}
        <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`eSIM ${view.ref}`)}`} className="text-yellow/80 underline underline-offset-4 hover:text-yellow">
          {CONTACT_EMAIL}
        </a>
      </span>
    </p>
    </>
  );

  if (view.status === "paid" || view.status === "provisioning") {
    return (
      <div className="mx-auto max-w-md px-5 pt-6" role="status" aria-live="polite">
        {passHeader(t.preparing, t.stampPreparing, false)}
        <p className="mt-4 font-dm text-sm leading-relaxed text-offwhite/70">{t.preparingSub}</p>
        {summary}
        {helpLine}
      </div>
    );
  }

  if (view.status === "failed" || view.status === "refunded" || view.status === "cancelled" || !view.activation) {
    const refunded = view.status === "refunded";
    return (
      <div className="mx-auto max-w-md px-5 pt-6">
        {passHeader(refunded ? t.refunded : t.failed, refunded ? t.stampRefunded : t.stampOnIt, false)}
        <p className="mt-4 font-dm text-sm leading-relaxed text-offwhite/70">{refunded ? t.refundedSub : t.failedSub}</p>
        {summary}
        {helpLine}
      </div>
    );
  }

  const act = view.activation;
  const steps = tab === "ios" ? IOS_STEPS[lang] : ANDROID_STEPS[lang];

  // ── The QR, big, with the three steps that go with it ──────────────────
  // First thing on a computer; one tap away on a phone ("installing on
  // another phone"), because a phone cannot scan its own screen.
  const qrPanel = qr && (
    <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <p className="text-center font-syne text-base font-bold text-offwhite">{t.scanTitle}</p>
      <div className="mx-auto mt-4 w-full max-w-[18rem] rounded-2xl bg-white p-2.5">
        <svg viewBox={`0 0 ${qr.span} ${qr.span}`} role="img" aria-label="eSIM QR code" className="block h-auto w-full" shapeRendering="crispEdges">
          <rect width={qr.span} height={qr.span} fill="#fff" />
          <path transform={`translate(${qr.quiet} ${qr.quiet})`} d={qr.path} fill="#000" />
        </svg>
      </div>
      <ol className="mx-auto mt-5 max-w-[22rem] space-y-2.5">
        {t.scanSteps.map((s, i) => (
          <li key={s} className="flex items-start gap-3 font-dm text-sm leading-snug text-offwhite/85">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-yellow/40 font-syne text-[11px] font-bold text-yellow">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
    </div>
  );

  return (
    <div className="mx-auto max-w-md px-5 pt-6">
      {passHeader(t.ready, t.stampReady, true)}
      <p className="mt-3 font-dm text-sm leading-snug text-offwhite/70">
        {t.readySub(view.email)}
      </p>

      {/* ── The one action for the device this page is open on ─────────── */}
      {device === "ios" && (
        <div className="mt-5">
          <a
            href={act.appleUrl}
            onClick={() => esimTrack.installTapped({ method: "apple" })}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-yellow font-syne text-base font-bold text-dark shadow-[0_10px_36px_rgba(245,200,66,0.35)] transition-colors hover:bg-yellow-dark"
          >
            <Apple size={18} aria-hidden /> {t.installIphone}
          </a>
          <p className="mt-2 text-center font-dm text-xs text-muted [text-wrap:balance]">{t.installIphoneNote}</p>
        </div>
      )}
      {device === "android" && (
        <div className="mt-5">
          <a
            href={act.androidUrl}
            onClick={() => esimTrack.installTapped({ method: "android" })}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-yellow font-syne text-base font-bold text-dark shadow-[0_10px_36px_rgba(245,200,66,0.35)] transition-colors hover:bg-yellow-dark"
          >
            <Smartphone size={18} aria-hidden /> {t.installAndroid}
          </a>
          <p className="mt-2 text-center font-dm text-xs text-muted [text-wrap:balance]">{t.installAndroidNote}</p>
        </div>
      )}
      {device !== "other" && !showQr && (
        <button
          type="button"
          onClick={() => {
            setShowQr(true);
            esimTrack.installTapped({ method: "qr_shown" });
          }}
          className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-white/15 font-dm text-sm text-offwhite/90 hover:bg-white/5"
        >
          <QrCode size={16} aria-hidden /> {t.otherPhone}
        </button>
      )}
      {showQr && qrPanel}

      {/* ── On arrival: the three things that make it connect ──────────── */}
      <section className="mt-5 rounded-3xl border border-yellow/25 bg-yellow/[0.05] px-4 py-4" aria-labelledby="land">
        <h2 id="land" className="font-syne text-base font-bold text-offwhite">
          {t.landTitle}
        </h2>
        <ul className="mt-2.5 space-y-2">
          {t.land.map((l) => (
            <li key={l} className="flex items-start gap-2.5 font-dm text-sm leading-snug text-offwhite/90">
              <Check size={16} className="mt-0.5 shrink-0 text-yellow" aria-hidden />
              {l}
            </li>
          ))}
        </ul>
        <p className="mt-2.5 font-dm text-xs leading-snug text-muted">{t.once}</p>
      </section>

      {/* ── Everything else, folded: open only what you need ───────────── */}
      <div className="rr-esim-faq mt-5 divide-y divide-white/10 border-y border-white/10">
        <details className="group">
          <summary className={foldSummary}>
            {t.manualTitle}
            <ChevronDown size={16} className={foldChevron} aria-hidden />
          </summary>
          <div className="space-y-3 pb-4">
            <CopyField label={t.smdp} value={act.smdpAddress} t={t} onCopy={() => esimTrack.installTapped({ method: "copy_smdp" })} />
            <CopyField label={t.code} value={act.activationCode} t={t} onCopy={() => esimTrack.installTapped({ method: "copy_code" })} />
            {device !== "ios" && <CopyField label={t.full} value={act.lpa} t={t} onCopy={() => esimTrack.installTapped({ method: "copy_code" })} />}
          </div>
        </details>
        <details className="group">
          <summary className={foldSummary}>
            {t.stepsTitle}
            <ChevronDown size={16} className={foldChevron} aria-hidden />
          </summary>
          <div className="pb-4">
            <div role="tablist" className="inline-flex rounded-full border border-white/10 p-1">
              {(["ios", "android"] as const).map((k) => (
                <button
                  key={k}
                  role="tab"
                  type="button"
                  aria-selected={tab === k}
                  onClick={() => setTab(k)}
                  className={`min-h-10 rounded-full px-5 font-dm text-sm transition-colors ${tab === k ? "bg-yellow font-semibold text-dark" : "text-offwhite/80"}`}
                >
                  {k === "ios" ? t.iphone : t.android}
                </button>
              ))}
            </div>
            <ol className="mt-4 space-y-4" role="tabpanel">
              {steps.map((s, i) => (
                <li key={s.title} className="flex gap-3.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-yellow/40 font-syne text-xs font-bold text-yellow">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-syne text-[15px] font-bold text-offwhite">{s.title}</h3>
                    <p className="mt-0.5 font-dm text-sm leading-relaxed text-muted">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            {view.apn && (
              <p className="mt-4 font-dm text-xs text-muted">
                APN: <span className="font-mono text-offwhite/80">{view.apn}</span>
              </p>
            )}
          </div>
        </details>
        <details className="group">
          <summary className={foldSummary}>
            {t.orderDetails}
            <ChevronDown size={16} className={foldChevron} aria-hidden />
          </summary>
          <div className="pb-4">{summaryList}</div>
        </details>
      </div>

      {helpLine}
    </div>
  );
}

const foldSummary =
  "flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 font-syne text-[15px] font-bold text-offwhite transition-colors hover:text-yellow [&::-webkit-details-marker]:hidden";
const foldChevron = "shrink-0 text-offwhite/60 transition-transform duration-300 group-open:rotate-180";

function CopyField({
  label,
  value,
  t,
  onCopy,
}: {
  label: string;
  value: string;
  t: (typeof T)["en"];
  onCopy: () => void;
}) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      onCopy();
      setTimeout(() => setDone(false), 2000);
    } catch {
      /* the text is selectable anyway */
    }
  }
  return (
    <div className="rounded-2xl border border-white/10 bg-dark-card p-3.5">
      <p className="font-bebas text-[11px] tracking-[0.25em] text-muted">{label.toUpperCase()}</p>
      <div className="mt-1.5 flex items-center gap-3">
        <code className="min-w-0 flex-1 select-all break-all font-mono text-sm text-offwhite">{value}</code>
        <button
          type="button"
          onClick={copy}
          aria-label={`${t.copy} ${label}`}
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-yellow/30 bg-yellow/10 px-3.5 font-dm text-xs font-semibold text-yellow hover:bg-yellow/15"
        >
          {done ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
          {done ? t.copied : t.copy}
        </button>
      </div>
    </div>
  );
}
