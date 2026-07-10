"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

/**
 * Compact, premium back control at the top of every /browse page: a circular
 * back button + a breadcrumb (Explore / current category). One tap returns to
 * the "What are you looking for?" hub.
 */
export default function BrowseBackBar({ title }: { title: string }) {
  const { t } = useLanguage();
  return (
    <div className="max-w-7xl mx-auto px-6 pt-28 md:pt-32 pb-1">
      <Link href="/#explore" className="group inline-flex items-center gap-3">
        <span className="w-9 h-9 rounded-full border border-dark-border bg-dark-card text-muted flex items-center justify-center transition-colors group-hover:border-yellow/50 group-hover:text-yellow">
          <ArrowLeft size={16} />
        </span>
        <span className="font-dm text-sm">
          <span className="text-muted transition-colors group-hover:text-offwhite">{t.explore.back}</span>
          <span className="text-muted/30 mx-2">/</span>
          <span className="text-offwhite font-semibold">{title}</span>
        </span>
      </Link>
    </div>
  );
}
