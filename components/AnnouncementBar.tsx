"use client";

import { useState } from "react";
import { X, ArrowRight } from "lucide-react";
import type { AnnouncementContent } from "@/lib/defaults";

const BG: Record<string, string> = {
  yellow: "bg-yellow text-dark",
  green:  "bg-emerald-500 text-white",
  blue:   "bg-sky-500 text-white",
  red:    "bg-red-500 text-white",
};

export default function AnnouncementBar({ announcement }: { announcement: AnnouncementContent }) {
  const [dismissed, setDismissed] = useState(false);

  if (!announcement.active || dismissed) return null;

  const colorCls = BG[announcement.bgColor] ?? BG.yellow;

  return (
    <div className={`relative z-50 w-full py-2.5 px-6 ${colorCls}`}>
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-3 text-sm font-dm font-medium">
        <span>{announcement.text}</span>
        {announcement.link && announcement.linkText && (
          <a
            href={announcement.link}
            className="flex items-center gap-1 font-bold underline underline-offset-2 hover:opacity-80 transition-opacity shrink-0"
          >
            {announcement.linkText}
            <ArrowRight size={13} />
          </a>
        )}
      </div>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss announcement"
        className="absolute right-4 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100 transition-opacity"
      >
        <X size={15} />
      </button>
    </div>
  );
}
