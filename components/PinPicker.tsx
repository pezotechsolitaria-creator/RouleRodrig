"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { Crosshair, Loader2, MapPin, MapPinOff, ExternalLink, X } from "lucide-react";
import { googleMapsLink, formatCoords, hasUsablePin, looksOffRodrigues } from "@/lib/orders/location";

// ── Setting the shop's pin, without typing decimals ─────────────────────────
//
// The merchant form and the admin editor both offered two boxes labelled
// "MAP LATITUDE" and "MAP LONGITUDE" with the hint "Rodrigues is around -19.7".
// Five of the island's six live shops have no pin, which is the predictable
// result: a shop owner standing in their shop does not know their latitude, and
// nothing on the form helped them find it.
//
// So the primary control is "Use my current location" — the one moment a phone
// knows the answer exactly, and a shop owner filling this in is usually AT the
// shop. Pasting a Google Maps link is the second path, because the other way
// people actually obtain coordinates is by dropping a pin in Maps and sharing
// it. The number boxes stay underneath for anyone who has the figures already.
//
// ── WHAT IT REFUSES TO DO ──────────────────────────────────────────────────
// It never guesses from the typed address. A geocoded village centroid looks
// exactly like a real pin and would send customers to the wrong end of a bay
// with full confidence — which is worse than the blank this replaces, because
// the blank is honest and the UI already says so.
export default function PinPicker({
  lat, lng, onChange, label = "SHOP PIN",
}: {
  lat: number | null;
  lng: number | null;
  onChange: (next: { lat: number | null; lng: number | null }) => void;
  label?: string;
}) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paste, setPaste] = useState("");

  const set = hasUsablePin(lat, lng);
  const suspicious = set && looksOffRodrigues(lat as number, lng as number);

  function locate() {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("This device cannot share a location. Paste a Google Maps link instead.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        onChange({
          // 5 decimals ≈ 1m. More digits is false precision from a phone GPS.
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5)),
        });
      },
      (err) => {
        setBusy(false);
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was refused. Allow it in your browser, or paste a Google Maps link."
            : "Could not get a location just now. Try again outdoors, or paste a Google Maps link.",
        );
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 },
    );
  }

  /**
   * Pull coordinates out of anything Google Maps hands a person.
   *
   * The three shapes that actually get pasted: an @lat,lng from the URL bar, a
   * ?q=/query= from a share sheet, and a bare "-19.68331, 63.41670" copied from
   * the pin card. A short maps.app.goo.gl link cannot be resolved here — it
   * needs a redirect the browser will not follow cross-origin — so that case is
   * named rather than silently failing.
   */
  function applyPaste() {
    setError(null);
    const text = paste.trim();
    if (!text) return;

    const at = text.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    const q = text.match(/[?&](?:q|query|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
    const bare = text.match(/^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/);
    const hit = at ?? q ?? bare;

    if (!hit) {
      setError(
        /goo\.gl|maps\.app/.test(text)
          ? "That short link hides the coordinates. Open it in Maps first, then copy the address bar."
          : "No coordinates found in that. Paste a Google Maps link, or two numbers like -19.68331, 63.41670.",
      );
      return;
    }
    const nextLat = Number(hit[1]);
    const nextLng = Number(hit[2]);
    if (!hasUsablePin(nextLat, nextLng)) {
      setError("Those coordinates are not valid.");
      return;
    }
    onChange({ lat: nextLat, lng: nextLng });
    setPaste("");
  }

  const input =
    "w-full rounded-xl border border-dark-border bg-dark px-3 py-2.5 font-dm text-sm text-offwhite placeholder:text-muted focus:border-yellow focus:outline-none";

  return (
    <div className="rounded-xl border border-white/10 bg-dark-card p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bebas text-[11px] tracking-[0.28em] text-muted">{label}</span>
        {set ? (
          <span className="inline-flex items-center gap-1 font-dm text-[11px] text-emerald-400">
            <MapPin size={12} /> Pin set
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 font-dm text-[11px] text-muted">
            <MapPinOff size={12} /> No pin
          </span>
        )}
      </div>

      <p className="mt-1.5 font-dm text-xs leading-relaxed text-muted">
        {set
          ? "Customers can tap your address and get directions straight to your door."
          : "Without a pin, customers only see the village name — not where your shop actually is."}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={locate}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-yellow px-3.5 py-2 font-dm text-xs font-bold text-dark transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Crosshair size={13} />}
          {set ? "Update from where I am" : "Use my current location"}
        </button>

        {set && (
          <>
            <a
              href={googleMapsLink(lat as number, lng as number)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 font-dm text-xs font-semibold text-offwhite hover:border-yellow/40 hover:text-yellow"
            >
              {t.common.checkIt} <ExternalLink size={12} />
            </a>
            <button
              type="button"
              onClick={() => onChange({ lat: null, lng: null })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 font-dm text-xs text-muted hover:border-red-400/40 hover:text-red-300"
            >
              <X size={12} /> Clear
            </button>
          </>
        )}
      </div>

      {set && (
        <p className="mt-2 font-dm text-[11px] tabular-nums text-muted">
          {formatCoords(lat as number, lng as number)}
        </p>
      )}

      {/* The two mistakes anyone typing coordinates makes, both of which point
          at the middle of an ocean and neither of which looks wrong. */}
      {suspicious && (
        <p className="mt-2 rounded-lg border border-orange-400/40 bg-orange-400/10 px-2.5 py-2 font-dm text-[11px] text-orange-200">
          That pin is not on Rodrigues. Check the minus sign on the latitude, and that the two numbers
          are the right way round.
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <input
          className={input}
          value={paste}
          placeholder="…or paste a Google Maps link"
          onChange={(e) => setPaste(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              applyPaste();
            }
          }}
        />
        <button
          type="button"
          onClick={applyPaste}
          disabled={!paste.trim()}
          className="shrink-0 rounded-xl border border-white/15 px-3 font-dm text-xs font-semibold text-offwhite disabled:opacity-40"
        >
          Use
        </button>
      </div>

      {error && <p className="mt-2 font-dm text-[11px] text-red-300">{error}</p>}
    </div>
  );
}
