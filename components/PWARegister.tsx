"use client";

import { useEffect, useState } from "react";
import { Download, X, Share } from "lucide-react";

// Registers the service worker and surfaces an install hint.
// - Android/Chrome: uses the native beforeinstallprompt event → one-tap install.
// - iOS Safari: that event never fires, so we detect iOS and show the manual
//   "Share → Add to Home Screen" instructions instead.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PWARegister() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<"none" | "android" | "ios">("none");

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    // Already installed? (standalone display mode) → never prompt
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS Safari exposes navigator.standalone
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const dismissed = sessionStorage.getItem("rr_install_dismissed") === "1";

    // ── Android / Chrome ──
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      if (!dismissed) setMode("android");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setMode("none"));

    // ── iOS detection (iPhone/iPad) ──
    const ua = window.navigator.userAgent;
    const isIOS =
      /iphone|ipad|ipod/i.test(ua) ||
      // iPadOS 13+ masquerades as Mac — detect touch + Mac
      (/macintosh/i.test(ua) && "ontouchend" in document);
    const isSafari = /^((?!chrome|crios|fxios|edgios).)*safari/i.test(ua);
    if (isIOS && isSafari && !dismissed) {
      // Show after a short delay so it doesn't fight with the language picker
      const tmr = setTimeout(() => setMode("ios"), 2500);
      return () => {
        clearTimeout(tmr);
        window.removeEventListener("beforeinstallprompt", onPrompt);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setMode("none");
    setDeferred(null);
  }

  function dismiss() {
    setMode("none");
    try { sessionStorage.setItem("rr_install_dismissed", "1"); } catch {}
  }

  if (mode === "none") return null;

  // ── Android: one-tap install chip ──
  if (mode === "android") {
    return (
      <div className="fixed bottom-24 right-5 z-[95] flex items-center gap-2 bg-dark-card border border-yellow/40 rounded-2xl pl-4 pr-2 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.5)] max-w-[260px]">
        <Download size={18} className="text-yellow shrink-0" />
        <button
          onClick={install}
          className="font-syne font-bold text-offwhite text-sm hover:text-yellow transition-colors text-left flex-1"
        >
          Install the app
        </button>
        <button onClick={dismiss} aria-label="Dismiss" className="text-muted hover:text-offwhite p-1">
          <X size={16} />
        </button>
      </div>
    );
  }

  // ── iOS: manual Add-to-Home-Screen instructions ──
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[95] w-[calc(100%-2rem)] max-w-sm bg-dark-card border border-yellow/40 rounded-2xl px-4 py-3.5 shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
      <div className="flex items-start gap-3">
        <Download size={20} className="text-yellow shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-syne font-bold text-offwhite text-sm">Install Roulé Rodrigues</p>
          <p className="font-dm text-muted text-xs mt-1 leading-relaxed">
            Tap <Share size={12} className="inline align-text-bottom text-yellow" /> <strong className="text-offwhite">Share</strong>, then{" "}
            <strong className="text-offwhite">“Add to Home Screen”</strong>.
          </p>
        </div>
        <button onClick={dismiss} aria-label="Dismiss" className="text-muted hover:text-offwhite p-1 -mt-1 -mr-1">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
