"use client";

import { useState, useEffect } from "react";
import { ArrowRight, Megaphone } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { AnnouncementContent, AnnouncementItem } from "@/lib/defaults";

const BG: Record<string, string> = {
  yellow: "bg-yellow text-dark",
  green:  "bg-emerald-500 text-white",
  blue:   "bg-sky-500 text-white",
  red:    "bg-red-500 text-white",
};

export function announcementMessages(a: AnnouncementContent): AnnouncementItem[] {
  const items = (a.items ?? []).filter((m) => m.text?.trim());
  if (items.length) return items;
  return a.text?.trim() ? [{ text: a.text, link: a.link, linkText: a.linkText }] : [];
}

export default function AnnouncementBar({ announcement }: { announcement: AnnouncementContent }) {
  const messages = announcementMessages(announcement);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (messages.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % messages.length), 4500);
    return () => clearInterval(t);
  }, [messages.length]);

  if (!announcement.active || messages.length === 0) return null;

  const colorCls = BG[announcement.bgColor] ?? BG.yellow;
  const msg = messages[idx % messages.length];

  return (
    <div className={`fixed top-0 left-0 right-0 z-[60] h-11 overflow-hidden ${colorCls} shadow-md`}>
      {/* moving shine for attention */}
      <div className="pointer-events-none absolute inset-0 opacity-30">
        <div className="absolute -inset-y-2 -left-1/3 w-1/3 bg-white/30 blur-md animate-[marquee_3s_linear_infinite]" />
      </div>
      <div className="relative max-w-7xl mx-auto h-full flex items-center justify-center gap-3 px-10">
        <Megaphone size={15} className="shrink-0 animate-pulse" />
        <AnimatePresence mode="wait">
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
            className="flex items-center gap-2.5 text-sm font-dm font-semibold truncate"
          >
            <span className="truncate">{msg.text}</span>
            {msg.link && msg.linkText && (
              <a
                href={msg.link}
                className="flex items-center gap-1 font-bold underline underline-offset-2 hover:opacity-80 transition-opacity shrink-0"
              >
                {msg.linkText}
                <ArrowRight size={13} />
              </a>
            )}
          </motion.div>
        </AnimatePresence>

        {/* dots when multiple */}
        {messages.length > 1 && (
          <div className="absolute right-4 flex gap-1.5">
            {messages.map((_, i) => (
              <span
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-opacity ${i === idx ? "opacity-100" : "opacity-40"} bg-current`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
