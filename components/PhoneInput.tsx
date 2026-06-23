"use client";

import { useEffect, useState } from "react";
import { Phone, CheckCircle } from "lucide-react";
import { isValidPhone } from "@/lib/phone";

// Curated list — Mauritius first, then the markets Rodrigues actually sees
// (Réunion, France, UK, Germany, Italy, India, South Africa…). Each carries a
// flag + dial code + name so guests never guess the right international prefix.
interface Country {
  iso: string;
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

interface Props {
  value: string;
  onChange: (full: string) => void;
  disabled?: boolean;
  placeholder?: string;
  inputClassName?: string;
}

/**
 * Phone field with an international country-code picker (flag + name + dial).
 * Emits the combined value, e.g. "+230 5912 3456". Defaults to Mauritius.
 */
export default function PhoneInput({ value, onChange, disabled, placeholder, inputClassName }: Props) {
  const [dialIso, setDialIso] = useState("MU");
  const [num, setNum] = useState("");

  // Reset the local number when the parent clears the field (e.g. after submit)
  useEffect(() => {
    if (!value) setNum("");
  }, [value]);

  const country = COUNTRIES.find((c) => c.iso === dialIso) ?? COUNTRIES[0];

  function emit(dial: string, local: string) {
    const clean = local.replace(/[^\d\s]/g, "").trim();
    onChange(clean ? `${dial} ${clean}` : "");
  }

  const hasInput = num.trim().length > 0;
  const valid = hasInput && isValidPhone(`${country.dial} ${num}`);
  const showError = hasInput && !valid;

  return (
    <div>
      <div className="flex gap-2">
        <div className="relative shrink-0">
          <select
            aria-label="Country code"
            value={dialIso}
            onChange={(e) => {
              setDialIso(e.target.value);
              const c = COUNTRIES.find((x) => x.iso === e.target.value);
              if (c) emit(c.dial, num);
            }}
            disabled={disabled}
            className="appearance-none h-full bg-dark-card border border-dark-border rounded-xl pl-3 pr-7 py-3.5 text-offwhite text-sm font-dm focus:border-yellow focus:outline-none transition-colors cursor-pointer max-w-[118px]"
          >
            {COUNTRIES.map((c) => (
              <option key={c.iso} value={c.iso}>
                {c.flag} {c.dial} {c.name}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted/60 text-xs">▾</span>
        </div>
        <div className="relative flex-1">
          <Phone size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted/50" />
          <input
            type="tel"
            inputMode="tel"
            placeholder={placeholder ?? "5912 3456"}
            value={num}
            onChange={(e) => {
              setNum(e.target.value);
              emit(country.dial, e.target.value);
            }}
            disabled={disabled}
            className={`${inputClassName ?? ""}${showError ? " !border-red-500/60" : valid ? " !border-green-500/50" : ""}`}
          />
          {valid && <CheckCircle size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-green-400" />}
        </div>
      </div>
      {showError && (
        <p className="text-red-400 font-dm text-[11px] mt-1.5">
          Enter a valid {country.name} number ({country.flag} {country.dial}).
        </p>
      )}
    </div>
  );
}
