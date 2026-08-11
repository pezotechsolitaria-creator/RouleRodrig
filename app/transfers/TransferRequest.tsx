"use client";

import { useMemo, useState } from "react";
import { Plane, MapPin, CalendarDays, Users, Luggage, MessageCircle, ArrowRight, Check } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

/**
 * Build a wa.me link from the owner's raw number/link + a message.
 *
 * Local rather than imported: lib/whatsapp.ts is the SERVER-only CallMeBot
 * sender for owner alerts and cannot be pulled into a client component. This
 * mirrors the identical helper in FoodConcierge and WhatsAppButton.
 */
function waLink(raw: string, message: string): string | null {
  if (!raw) return null;
  let href: string;
  if (raw.includes("http")) {
    href = raw.split("?")[0];
  } else {
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 7) return null;
    href = `https://wa.me/${digits}`;
  }
  if (/x/i.test(href)) return null; // a placeholder like 5XXX
  return `${href}?text=${encodeURIComponent(message)}`;
}

// ── TRANSFERS ARE NOT TAXIS ────────────────────────────────────────────────
//
// Both quick actions used to point at /taxi, which is a DIRECTORY of drivers
// you ring now. That page cannot answer "I land on Tuesday at 14:20 with three
// bags and a family of five", and a from/to/date form cannot answer "I need a
// ride in ten minutes". Two intents, two screens.
//
// ── WHY THIS IS A REQUEST AND NOT A BOOKING ────────────────────────────────
// There is no driver-assignment engine on this platform. Showing a "Confirmed"
// state that nothing enforces would be exactly the fake functionality this
// work is meant to avoid — the customer would arrive at an airport believing a
// car was coming. So this collects the journey properly, records it as a lead
// so it appears in Admin → Leads, and hands off to WhatsApp with every detail
// already written out. The owner confirms with a real driver.
//
// The structured record is also the evidence: if these requests arrive weekly,
// that is the argument for building real dispatch. If they do not, the platform
// was right not to.

const AIRPORT = "Plaine Corail Airport (RRG)";

const COMMON_FROM = [AIRPORT, "Port Mathurin", "Mon Limon", "Rivière Cocos"];
const COMMON_TO = ["Port Mathurin", AIRPORT, "Anse Ally", "Rodrigues hotel"];

export default function TransferRequest({ whatsapp }: { whatsapp?: string }) {
  const { language } = useLanguage();
  const fr = language === "fr";
  const T = (en: string, f: string) => (fr ? f : en);

  const today = new Date().toISOString().split("T")[0];
  const [from, setFrom] = useState(AIRPORT);
  const [to, setTo] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [passengers, setPassengers] = useState(2);
  const [bags, setBags] = useState(2);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [sent, setSent] = useState(false);

  const ready = from.trim() && to.trim() && date && time;

  const message = useMemo(
    () =>
      [
        T("Transfer request — Roulé Rodrigues", "Demande de transfert — Roulé Rodrigues"),
        "",
        `${T("From", "De")}: ${from}`,
        `${T("To", "À")}: ${to}`,
        `${T("Date", "Date")}: ${date}${time ? ` ${T("at", "à")} ${time}` : ""}`,
        `${T("Passengers", "Passagers")}: ${passengers}`,
        `${T("Luggage", "Bagages")}: ${bags}`,
        name.trim() ? `${T("Name", "Nom")}: ${name.trim()}` : "",
        notes.trim() ? `${T("Notes", "Remarques")}: ${notes.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [from, to, date, time, passengers, bags, name, notes, fr],
  );

  function submit() {
    if (!ready) return;
    // Fire-and-forget, exactly like the taxi and concierge CTAs: the WhatsApp
    // handoff must never wait on our own analytics, and a failed lead insert
    // must never cost the customer their request.
    void fetch("/api/leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "transfer",
        target: `${from} → ${to}`,
        type: "whatsapp",
        ref: `${date} ${time} · ${passengers}p · ${bags} bags`,
      }),
    }).catch(() => {});
    setSent(true);
    const href = waLink(whatsapp ?? "", message);
    // No number configured is not a dead end: the request is already recorded
    // as a lead, so the owner still sees it in admin.
    if (href) window.open(href, "_blank", "noopener,noreferrer");
  }

  const label = "block font-bebas text-[11px] tracking-[0.2em] text-muted";
  const field =
    "mt-1 w-full rounded-xl border border-white/10 bg-dark-card px-3.5 py-3 font-dm text-sm text-offwhite placeholder:text-muted focus:border-yellow/50 focus:outline-none";

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-5">
      <div className="space-y-4">
        <div>
          <span className={label}>{T("FROM", "DE")}</span>
          <div className="relative">
            <MapPin size={15} className="pointer-events-none absolute left-3.5 top-1/2 mt-0.5 -translate-y-1/2 text-muted" />
            <input
              list="transfer-from"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder={T("Airport, hotel, address…", "Aéroport, hôtel, adresse…")}
              className={`${field} pl-9`}
            />
          </div>
          <datalist id="transfer-from">
            {COMMON_FROM.map((x) => <option key={x} value={x} />)}
          </datalist>
        </div>

        <div>
          <span className={label}>{T("TO", "À")}</span>
          <div className="relative">
            <MapPin size={15} className="pointer-events-none absolute left-3.5 top-1/2 mt-0.5 -translate-y-1/2 text-yellow" />
            <input
              list="transfer-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={T("Where are you going?", "Où allez-vous ?")}
              className={`${field} pl-9`}
            />
          </div>
          <datalist id="transfer-to">
            {COMMON_TO.map((x) => <option key={x} value={x} />)}
          </datalist>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className={label}>{T("DATE", "DATE")}</span>
            <input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className={field} />
          </div>
          <div>
            <span className={label}>{T("TIME", "HEURE")}</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className={label}>
              <Users size={11} className="mr-1 inline" /> {T("PASSENGERS", "PASSAGERS")}
            </span>
            <input
              type="number" min={1} max={20} value={passengers}
              onChange={(e) => setPassengers(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)))}
              className={field}
            />
          </div>
          <div>
            <span className={label}>
              <Luggage size={11} className="mr-1 inline" /> {T("LUGGAGE", "BAGAGES")}
            </span>
            {/* Luggage is asked BECAUSE it decides the vehicle. A family of five
                with five suitcases is a van, not a car, and finding that out at
                the kerb is how a transfer goes wrong. */}
            <input
              type="number" min={0} max={20} value={bags}
              onChange={(e) => setBags(Math.max(0, Math.min(20, parseInt(e.target.value, 10) || 0)))}
              className={field}
            />
          </div>
        </div>

        <div>
          <span className={label}>{T("YOUR NAME", "VOTRE NOM")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
        </div>

        <div>
          <span className={label}>{T("ANYTHING ELSE?", "AUTRE CHOSE ?")}</span>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={T("Flight number, child seat, surfboard…", "Numéro de vol, siège enfant, planche…")}
            className={field}
          />
        </div>
      </div>

      <button
        onClick={submit}
        disabled={!ready}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-yellow px-5 py-4 font-dm text-base font-bold text-dark transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {sent ? <Check size={17} /> : <MessageCircle size={17} />}
        {sent ? T("Request sent", "Demande envoyée") : T("Request this transfer", "Demander ce transfert")}
      </button>

      {!ready && (
        <p className="mt-2 text-center font-dm text-xs text-muted">
          {T("Fill in where, when and what time.", "Indiquez le trajet, la date et l'heure.")}
        </p>
      )}
      {sent && (
        <p className="mt-2 text-center font-dm text-xs text-muted">
          {T(
            "We confirm your driver and price by WhatsApp — usually the same day.",
            "Nous confirmons le chauffeur et le prix par WhatsApp — généralement le jour même.",
          )}
        </p>
      )}
    </div>
  );
}
