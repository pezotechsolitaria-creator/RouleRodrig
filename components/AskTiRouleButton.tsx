"use client";

import { MessageCircle } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

// Opens the Ti Roulé chat via the same event the hero button uses. Placed at the
// end of a blog article so the reader's journey continues: Google → blog →
// Ti Roulé → booking. Requires <TiRouleGuide> to be mounted on the page (it
// listens for "tiroule:open").
export default function AskTiRouleButton({
  labelEn = "Ask Ti Roulé to personalise this",
  labelFr = "Demander à Ti Roulé de personnaliser",
  labelCr = "Demann Ti Roulé personaliz sa",
}: {
  labelEn?: string;
  labelFr?: string;
  labelCr?: string;
}) {
  const { language } = useLanguage();
  const label = language === "fr" ? labelFr : language === "cr" ? labelCr : labelEn;
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("tiroule:open"))}
      className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-3 font-syne font-bold text-white text-sm transition-colors hover:bg-white/10 hover:border-white/40"
    >
      {label} <MessageCircle size={16} />
    </button>
  );
}
