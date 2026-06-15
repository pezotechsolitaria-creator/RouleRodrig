import Link from "next/link";
import { Compass, Home } from "lucide-react";

export const metadata = { title: "Page not found · Roule Rodrigues" };

export default function NotFound() {
  return (
    <main className="min-h-screen bg-dark text-offwhite font-dm flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="w-14 h-14 rounded-2xl bg-yellow/10 flex items-center justify-center mx-auto mb-6">
          <Compass size={26} className="text-yellow" />
        </div>
        <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">ERROR 404</p>
        <h1 className="font-syne font-extrabold text-3xl mb-3">Lost on the island?</h1>
        <p className="text-muted text-sm mb-8">
          This page doesn&apos;t exist. Let&apos;s get you back on the road.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-yellow text-dark font-syne font-bold text-sm px-5 py-3 rounded-full hover:bg-yellow-dark transition-colors"
        >
          <Home size={15} /> Back home
        </Link>
      </div>
    </main>
  );
}
