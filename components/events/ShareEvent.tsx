"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { eventDateTime } from "@/lib/events/format";

// The event page IS the marketing unit, and on this island the channel is
// WhatsApp — not search, not email. So sharing is a first-class control rather
// than a row of social icons nobody presses.
//
// The message is pre-written because an organiser forwarding a bare URL loses
// the two facts that make someone click: what it is and when. Native share is
// used where it exists (it offers WhatsApp first on a phone); the explicit
// WhatsApp button and a copy fallback cover desktop and anything unusual.
export default function ShareEvent({
  name,
  url,
  startsAt,
  timezone,
  venue,
}: {
  name: string;
  url: string;
  startsAt: string;
  timezone: string;
  venue: string | null;
}) {
  const [copied, setCopied] = useState(false);

  const message = `${name}\n${eventDateTime(startsAt, timezone)}${venue ? ` · ${venue}` : ""}\nReserve your ticket: ${url}`;

  async function share() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: name, text: message, url });
        return;
      } catch {
        // Cancelled or unsupported — fall through to copy.
      }
    }
    await copy();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the buttons below still work */
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-dark-card p-4">
      <p className="font-syne text-sm font-bold text-offwhite">Tell someone</p>
      <p className="mt-1 font-dm text-xs text-muted">
        Send it on WhatsApp — the date and place travel with the link.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-4 py-2 font-dm text-xs font-bold text-black transition-opacity hover:opacity-90"
        >
          <Share2 size={13} /> WhatsApp
        </a>
        <button
          type="button"
          onClick={() => void share()}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 font-dm text-xs font-bold text-offwhite transition-colors hover:border-yellow/50 hover:text-yellow"
        >
          <Share2 size={13} /> Share
        </button>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 font-dm text-xs font-bold text-offwhite transition-colors hover:border-yellow/50 hover:text-yellow"
        >
          {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
