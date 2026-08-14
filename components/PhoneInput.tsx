"use client";

import { useEffect, useRef, useState } from "react";
import { Phone, CheckCircle, ChevronDown, Search } from "lucide-react";
import { isValidPhoneNumber, parsePhoneNumberFromString, getExampleNumber, type CountryCode } from "libphonenumber-js";
import { absorbCountryCode } from "@/lib/phone";
import examples from "libphonenumber-js/examples.mobile.json";

// Curated list — Mauritius first, then the markets Rodrigues actually sees.
interface Country {
  iso: CountryCode;
  dial: string;
  name: string;
  flag: string;
}

const COUNTRIES: Country[] = [
  { iso: "MU", dial: "+230", name: "Mauritius", flag: "🇲🇺" },
  { iso: "RE", dial: "+262", name: "Réunion / Mayotte", flag: "🇷🇪" },
  { iso: "FR", dial: "+33", name: "France", flag: "🇫🇷" },
  { iso: "GB", dial: "+44", name: "United Kingdom", flag: "🇬🇧" },
  { iso: "DE", dial: "+49", name: "Germany", flag: "🇩🇪" },
  { iso: "IT", dial: "+39", name: "Italy", flag: "🇮🇹" },
  { iso: "ES", dial: "+34", name: "Spain", flag: "🇪🇸" },
  { iso: "CH", dial: "+41", name: "Switzerland", flag: "🇨🇭" },
  { iso: "BE", dial: "+32", name: "Belgium", flag: "🇧🇪" },
  { iso: "NL", dial: "+31", name: "Netherlands", flag: "🇳🇱" },
  { iso: "PT", dial: "+351", name: "Portugal", flag: "🇵🇹" },
  { iso: "AT", dial: "+43", name: "Austria", flag: "🇦🇹" },
  { iso: "IE", dial: "+353", name: "Ireland", flag: "🇮🇪" },
  { iso: "SE", dial: "+46", name: "Sweden", flag: "🇸🇪" },
  { iso: "NO", dial: "+47", name: "Norway", flag: "🇳🇴" },
  { iso: "DK", dial: "+45", name: "Denmark", flag: "🇩🇰" },
  { iso: "FI", dial: "+358", name: "Finland", flag: "🇫🇮" },
  { iso: "PL", dial: "+48", name: "Poland", flag: "🇵🇱" },
  { iso: "GR", dial: "+30", name: "Greece", flag: "🇬🇷" },
  { iso: "IN", dial: "+91", name: "India", flag: "🇮🇳" },
  { iso: "ZA", dial: "+27", name: "South Africa", flag: "🇿🇦" },
  { iso: "US", dial: "+1", name: "USA / Canada", flag: "🇺🇸" },
  { iso: "AU", dial: "+61", name: "Australia", flag: "🇦🇺" },
  { iso: "NZ", dial: "+64", name: "New Zealand", flag: "🇳🇿" },
  { iso: "CN", dial: "+86", name: "China", flag: "🇨🇳" },
  { iso: "HK", dial: "+852", name: "Hong Kong", flag: "🇭🇰" },
  { iso: "JP", dial: "+81", name: "Japan", flag: "🇯🇵" },
  { iso: "KR", dial: "+82", name: "South Korea", flag: "🇰🇷" },
  { iso: "SG", dial: "+65", name: "Singapore", flag: "🇸🇬" },
  { iso: "MY", dial: "+60", name: "Malaysia", flag: "🇲🇾" },
  { iso: "TH", dial: "+66", name: "Thailand", flag: "🇹🇭" },
  { iso: "ID", dial: "+62", name: "Indonesia", flag: "🇮🇩" },
  { iso: "AE", dial: "+971", name: "UAE", flag: "🇦🇪" },
  { iso: "SA", dial: "+966", name: "Saudi Arabia", flag: "🇸🇦" },
  { iso: "IL", dial: "+972", name: "Israel", flag: "🇮🇱" },
  { iso: "TR", dial: "+90", name: "Turkey", flag: "🇹🇷" },
  { iso: "RU", dial: "+7", name: "Russia", flag: "🇷🇺" },
  { iso: "BR", dial: "+55", name: "Brazil", flag: "🇧🇷" },
  { iso: "EG", dial: "+20", name: "Egypt", flag: "🇪🇬" },
  { iso: "MA", dial: "+212", name: "Morocco", flag: "🇲🇦" },
  { iso: "KE", dial: "+254", name: "Kenya", flag: "🇰🇪" },
  { iso: "MG", dial: "+261", name: "Madagascar", flag: "🇲🇬" },
  { iso: "SC", dial: "+248", name: "Seychelles", flag: "🇸🇨" },
];

// Example NATIONAL number (no country code, no trunk prefix) for the placeholder.
function placeholderFor(iso: CountryCode): string {
  try {
    const ex = getExampleNumber(iso, examples);
    if (!ex) return "Your number";
    return ex.formatInternational().replace(/^\+\d+\s*/, "") || "Your number";
  } catch {
    return "Your number";
  }
}

interface Props {
  value: string;
  onChange: (full: string) => void;
  disabled?: boolean;
  placeholder?: string;
  inputClassName?: string;
  /**
   * Id for the tel input, so a caller's <label htmlFor> actually attaches.
   *
   * Without it this field had NO accessible name at all — measured on
   * production, the computed name was empty. A screen reader announced an
   * unlabelled edit box in the middle of a booking form, which is a WCAG 4.1.2
   * failure and, more plainly, unusable.
   */
  id?: string;
}

// ── The input dresses itself unless told otherwise ──────────────────────────
//
// This used to render `className={inputClassName ?? ""}`, so a caller that
// passed none got a completely UNSTYLED input: no border, no background, no
// padding — a raw browser box between two properly-dressed fields, which on
// Android is a white-on-blue native control that reads as broken rather than
// merely plain. Every existing caller happened to pass a class, so the hole sat
// there unnoticed until /deliver became the first that did not.
//
// A default is the right fix rather than adding the class at that one call
// site: this component knows what it should look like, and the next form to use
// it should not have to know too. `inputClassName` still overrides completely,
// so every caller that already passes one is unaffected.
//
// pl-10 is not decoration — the phone glyph is absolutely positioned at left-4,
// and without the padding the digits run underneath it.
// Matches the vehicle booking form's field exactly — that is this site's
// established input, and the picker button beside it is already px-3 py-3.5, so
// anything shorter left the two visibly mismatched in height.
const DEFAULT_INPUT_CLASS =
  "w-full bg-dark-card border border-dark-border rounded-xl px-4 py-3.5 pl-10 text-offwhite text-sm font-dm placeholder:text-muted/50 focus:border-yellow focus:outline-none transition-colors";

/**
 * Phone field with a searchable country picker (flag + dial) and a national-only
 * input. Validates against the selected country's rules and emits a normalised
 * international number, e.g. "+230 5251 2345".
 */
export default function PhoneInput({ value, onChange, disabled, inputClassName, id }: Props) {
  const [dialIso, setDialIso] = useState<CountryCode>("MU");
  const [num, setNum] = useState("");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  // Reset the local number when the parent clears the field (e.g. after submit)
  useEffect(() => {
    if (!value) setNum("");
  }, [value]);

  // Close the dropdown on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const country = COUNTRIES.find((c) => c.iso === dialIso) ?? COUNTRIES[0];

  // Emit a normalised international number when valid; otherwise a best-effort
  // string so the parent's validation can still flag it.
  function emit(iso: CountryCode, local: string) {
    const clean = local.trim();
    if (!clean) return onChange("");
    const parsed = parsePhoneNumberFromString(clean, iso);
    if (parsed && parsed.isValid()) onChange(parsed.formatInternational());
    else {
      const dial = COUNTRIES.find((c) => c.iso === iso)?.dial ?? "";
      onChange(`${dial} ${clean.replace(/[^\d\s]/g, "").trim()}`);
    }
  }

  const hasInput = num.trim().length > 0;
  const valid = hasInput && isValidPhoneNumber(num, country.iso);
  const showError = hasInput && !valid;

  const filtered = COUNTRIES.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.dial.includes(q) || c.iso.toLowerCase().includes(q);
  });

  return (
    <div ref={wrapRef}>
      <div className="flex gap-2">
        {/* Country picker */}
        <div className="relative shrink-0">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen((o) => !o)}
            aria-label="Select country code"
            // Without these the button never announces that it opens anything,
            // or whether it is currently open.
            aria-haspopup="listbox"
            aria-expanded={open}
            className="flex items-center gap-1.5 h-full bg-dark-card border border-dark-border rounded-xl px-3 py-3.5 text-offwhite text-sm font-dm hover:border-yellow/50 focus:border-yellow focus:outline-none transition-colors"
          >
            <span className="text-base leading-none">{country.flag}</span>
            <span>{country.dial}</span>
            <ChevronDown size={14} className="text-muted/60" />
          </button>

          {open && (
            <div className="absolute z-50 mt-2 left-0 w-72 max-w-[80vw] bg-dark-card border border-dark-border rounded-xl shadow-2xl overflow-hidden">
              <div className="p-2 border-b border-dark-border relative">
                <Search size={13} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted/50" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  // A placeholder is not an accessible name.
                  aria-label="Search country"
                  placeholder="Search country…"
                  className="w-full bg-dark border border-dark-border rounded-lg pl-9 pr-3 py-2 text-sm text-offwhite font-dm focus:border-yellow focus:outline-none"
                />
              </div>
              <div className="max-h-60 overflow-y-auto">
                {filtered.map((c) => (
                  <button
                    key={c.iso}
                    type="button"
                    onClick={() => { setDialIso(c.iso); emit(c.iso, num); setOpen(false); setSearch(""); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-yellow/10 ${
                      c.iso === dialIso ? "bg-yellow/5 text-yellow" : "text-offwhite/85"
                    }`}
                  >
                    <span className="text-base">{c.flag}</span>
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="text-muted text-xs">{c.dial}</span>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="px-3 py-4 text-muted/50 text-xs text-center">No match</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* National number */}
        <div className="relative flex-1">
          <Phone size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted/50" />
          <input
            id={id}
            type="tel"
            inputMode="tel"
            // Lets a password manager or the browser fill this, and satisfies
            // WCAG 1.3.5 — none of this form's fields declared their purpose.
            autoComplete="tel"
            placeholder={placeholderFor(country.iso)}
            value={num}
            // A typed or pasted country code goes into the PICKER rather than
            // sitting in the box beside it. Without this, entering a number the
            // way it is printed on a card gave "+23058363401" next to a picker
            // already showing "+230" — it validated, but it read as the code
            // twice, which invites somebody to "fix" it by deleting digits.
            // absorbCountryCode returns null whenever there is nothing certain
            // to move, so ordinary typing is untouched.
            onChange={(e) => {
              const raw = e.target.value;
              const split = absorbCountryCode(raw, country.iso);
              if (split) {
                setDialIso(split.iso);
                setNum(split.national);
                emit(split.iso, split.national);
                return;
              }
              setNum(raw);
              emit(country.iso, raw);
            }}
            disabled={disabled}
            // The validation message below is visual only unless it is wired to
            // the field it describes.
            aria-invalid={showError || undefined}
            aria-describedby={showError && id ? `${id}-error` : undefined}
            className={`${inputClassName ?? DEFAULT_INPUT_CLASS}${showError ? " !border-red-500/60" : valid ? " !border-green-500/50" : ""}`}
          />
          {valid && <CheckCircle size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-green-400" />}
        </div>
      </div>
      {showError && (
        <p id={id ? `${id}-error` : undefined} className="text-red-400 font-dm text-[11px] mt-1.5">
          Enter a valid {country.name} number ({country.flag} {country.dial}) — no country code needed.
        </p>
      )}
    </div>
  );
}
