"use client";

import { useState, useEffect } from "react";

/**
 * Floating WhatsApp button — fixed bottom-right.
 * WhatsApp is the primary communication channel in Rodrigues, so this gives
 * visitors a one-tap way to reach the business with a pre-filled message.
 *
 * It resolves a number from either the explicit WhatsApp link or the contact
 * phone, and hides itself entirely if no usable number is configured.
 */
export default function WhatsAppButton({
  phone = "",
  whatsapp = "",
  message = "Hi! I'm interested in renting a scooter on Rodrigues. Could you help me?",
}: {
  phone?: string;
  whatsapp?: string;
  message?: string;
}) {
  const [show, setShow] = useState(false);

  // Reveal after a short scroll so it doesn't fight with the hero
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 400);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Build the wa.me link
  let href = "";
  if (whatsapp.trim()) {
    href = whatsapp.includes("http")
      ? whatsapp
      : `https://wa.me/${whatsapp.replace(/\D/g, "")}`;
  } else if (phone.trim()) {
    const digits = phone.replace(/\D/g, "");
    if (digits.length >= 7) href = `https://wa.me/${digits}`;
  }
  // Don't render if there is no real number (e.g. placeholder "5XXX")
  if (!href || /x/i.test(href)) return null;

  const url = href.includes("?")
    ? href
    : `${href}?text=${encodeURIComponent(message)}`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className={`fixed bottom-5 right-5 z-[90] flex items-center justify-center w-14 h-14 rounded-full bg-[#25D366] shadow-[0_8px_30px_rgba(37,211,102,0.4)] transition-all duration-300 hover:scale-110 ${
        show ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-4 pointer-events-none"
      }`}
    >
      {/* WhatsApp glyph */}
      <svg viewBox="0 0 32 32" width="30" height="30" fill="#fff" aria-hidden="true">
        <path d="M16.003 3C9.38 3 4 8.38 4 15.003c0 2.117.553 4.184 1.604 6.01L4 29l8.166-1.57a11.94 11.94 0 0 0 3.837.63h.003C22.623 28.06 28 22.68 28 16.057 28 9.433 22.626 3 16.003 3zm0 21.84h-.002a9.9 9.9 0 0 1-3.46-.62l-.247-.09-4.846.93.92-4.73-.16-.252a9.86 9.86 0 0 1-1.51-5.245c0-5.46 4.444-9.903 9.91-9.903 2.648 0 5.136 1.032 7.008 2.905a9.84 9.84 0 0 1 2.9 7.006c0 5.46-4.444 9.9-9.9 9.9zm5.43-7.41c-.297-.15-1.758-.868-2.03-.967-.272-.1-.47-.149-.668.149-.198.297-.767.967-.94 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.76-1.653-2.058-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.496.099-.198.05-.372-.025-.521-.074-.149-.668-1.611-.916-2.206-.241-.579-.486-.5-.668-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.073.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      </svg>
    </a>
  );
}
