"use client";

import { useState, useEffect } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { X } from "lucide-react";
import type { WhatsAppNumber } from "@/lib/defaults";

/**
 * Floating WhatsApp button — fixed bottom-right.
 * Supports MULTIPLE numbers: with one number it links directly; with two or
 * more it opens a small menu so the visitor taps the line they want
 * (e.g. Bookings vs Support), each opening that number's WhatsApp chat.
 * Hides entirely if no usable number is configured.
 */

function toLink(raw: string, message: string): string | null {
  if (!raw) return null;
  let href: string;
  if (raw.includes("http")) {
    href = raw;
  } else {
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 7) return null;
    href = `https://wa.me/${digits}`;
  }
  if (/x/i.test(href)) return null; // placeholder like 5XXX
  return href.includes("?") ? href : `${href}?text=${encodeURIComponent(message)}`;
}

export default function WhatsAppButton({
  phone = "",
  whatsapp = "",
  numbers = [],
  message = "Hi! I'm interested in renting a scooter on Rodrigues. Could you help me?",
}: {
  phone?: string;
  whatsapp?: string;
  numbers?: WhatsAppNumber[];
  message?: string;
}) {
  const { t } = useLanguage();
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 400);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Step aside while the Ti Roulé chat is open so we never cover its input.
  useEffect(() => {
    const onVis = (e: Event) => setChatOpen(!!(e as CustomEvent<{ open: boolean }>).detail?.open);
    window.addEventListener("tiroule:visibility", onVis);
    return () => window.removeEventListener("tiroule:visibility", onVis);
  }, []);

  // Build the list of valid WhatsApp targets
  const targets = (numbers ?? [])
    .map((n) => ({ label: n.label?.trim() || "WhatsApp", url: toLink(n.number, message) }))
    .filter((t): t is { label: string; url: string } => !!t.url);

  // Fall back to the single legacy number if no list configured
  if (targets.length === 0) {
    const fallback = toLink(whatsapp, message) ?? toLink(phone, message);
    if (fallback) targets.push({ label: "WhatsApp", url: fallback });
  }

  if (targets.length === 0) return null;

  const single = targets.length === 1;

  const fabGlyph = (
    <svg viewBox="0 0 32 32" width="30" height="30" fill="#fff" aria-hidden="true">
      <path d="M16.003 3C9.38 3 4 8.38 4 15.003c0 2.117.553 4.184 1.604 6.01L4 29l8.166-1.57a11.94 11.94 0 0 0 3.837.63h.003C22.623 28.06 28 22.68 28 16.057 28 9.433 22.626 3 16.003 3zm0 21.84h-.002a9.9 9.9 0 0 1-3.46-.62l-.247-.09-4.846.93.92-4.73-.16-.252a9.86 9.86 0 0 1-1.51-5.245c0-5.46 4.444-9.903 9.91-9.903 2.648 0 5.136 1.032 7.008 2.905a9.84 9.84 0 0 1 2.9 7.006c0 5.46-4.444 9.9-9.9 9.9zm5.43-7.41c-.297-.15-1.758-.868-2.03-.967-.272-.1-.47-.149-.668.149-.198.297-.767.967-.94 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.76-1.653-2.058-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.496.099-.198.05-.372-.025-.521-.074-.149-.668-1.611-.916-2.206-.241-.579-.486-.5-.668-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.073.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
    </svg>
  );

  const wrapVisibility = show && !chatOpen
    ? "opacity-100 translate-y-0 pointer-events-auto"
    : "opacity-0 translate-y-4 pointer-events-none";

  // ── Single number: direct link ──
  if (single) {
    return (
      <a
        href={targets[0].url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t.a11yMore.whatsappChat}
        className={`fixed bottom-[76px] right-5 z-[90] md:bottom-5 flex items-center justify-center w-14 h-14 rounded-full bg-[#25D366] shadow-[0_8px_30px_rgba(37,211,102,0.4)] transition-all duration-300 hover:scale-110 ${wrapVisibility}`}
      >
        {fabGlyph}
      </a>
    );
  }

  // ── Multiple numbers: expandable menu ──
  return (
    <div className={`fixed bottom-[76px] right-5 z-[90] md:bottom-5 flex flex-col items-end gap-3 transition-all duration-300 ${wrapVisibility}`}>
      {open && (
        <div className="flex flex-col gap-2 mb-1">
          {targets.map((t, i) => (
            <a
              key={i}
              href={t.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 bg-dark-card border border-[#25D366]/40 rounded-full pl-4 pr-2 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.5)] hover:border-[#25D366] transition-colors"
            >
              <span className="font-syne font-bold text-offwhite text-sm whitespace-nowrap">{t.label}</span>
              <span className="flex items-center justify-center w-9 h-9 rounded-full bg-[#25D366] shrink-0">
                <svg viewBox="0 0 32 32" width="18" height="18" fill="#fff" aria-hidden="true">
                  <path d="M16.003 3C9.38 3 4 8.38 4 15.003c0 2.117.553 4.184 1.604 6.01L4 29l8.166-1.57a11.94 11.94 0 0 0 3.837.63h.003C22.623 28.06 28 22.68 28 16.057 28 9.433 22.626 3 16.003 3z" />
                </svg>
              </span>
            </a>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close WhatsApp menu" : "Chat with us on WhatsApp"}
        className="flex items-center justify-center w-14 h-14 rounded-full bg-[#25D366] shadow-[0_8px_30px_rgba(37,211,102,0.4)] transition-transform duration-300 hover:scale-110"
      >
        {open ? <X size={26} color="#fff" /> : fabGlyph}
      </button>
    </div>
  );
}
