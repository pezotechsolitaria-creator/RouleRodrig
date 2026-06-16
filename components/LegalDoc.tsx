import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// Shared presentational wrapper for legal pages (server component).
export default function LegalDoc({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-dark text-offwhite font-dm">
      <div className="max-w-3xl mx-auto px-6 py-12 md:py-16">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-muted hover:text-yellow text-sm transition-colors mb-10"
        >
          <ArrowLeft size={15} /> Roule Rodrigues
        </Link>

        <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">LEGAL</p>
        <h1
          className="font-syne font-extrabold text-offwhite uppercase leading-[1.02] mb-2"
          style={{ fontSize: "clamp(30px, 6vw, 52px)" }}
        >
          {title}
        </h1>
        <p className="text-muted/60 text-xs font-dm mb-8">Last updated: {updated}</p>

        {intro && <p className="text-muted/90 text-sm leading-relaxed mb-8">{intro}</p>}

        <div className="space-y-8">{children}</div>
      </div>
    </main>
  );
}

export function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-syne font-bold text-offwhite text-lg">{heading}</h2>
      <div className="space-y-3 text-muted/90 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="text-muted/90 text-sm leading-relaxed">{children}</p>;
}

export function UL({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc pl-5 space-y-1.5 text-muted/90 text-sm leading-relaxed marker:text-yellow/60">{children}</ul>;
}
