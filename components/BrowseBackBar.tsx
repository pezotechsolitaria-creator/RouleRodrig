"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

/**
 * WhatsApp-style back bar shown at the top of every /browse category page:
 * a one-tap return to the "What are you looking for?" hub, plus a breadcrumb
 * so visitors always know where they are.
 */
export default function BrowseBackBar({ title }: { title: string }) {
  const { t } = useLanguage();
  return (
    <div className="max-w-7xl mx-auto px-6 pt-28 md:pt-32">
      <Link
        href="/#explore"
        className="inline-flex items-center gap-2 font-syne font-bold text-sm text-muted hover:text-yellow transition-colors"
      >
        <ArrowLeft size={16} /> {t.explore.back}
        <span className="text-muted/30 mx-1">/</span>
        <span className="text-offwhite">{title}</span>
      </Link>
    </div>
  );
}
