"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

// Registers the service worker and shows a small "Install app" prompt on
// Android/Chrome when the browser fires beforeinstallprompt.
// (iOS Safari has no such event — users install via Share → Add to Home Screen.)

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PWARegister() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      // Don't nag if already dismissed this session
      if (sessionStorage.getItem("rr_install_dismissed") !== "1") setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // Hide if already installed
    window.addEventListener("appinstalled", () => setShow(false));

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setShow(false);
    setDeferred(null);
  }

  function dismiss() {
    setShow(false);
    try { sessionStorage.setItem("rr_install_dismissed", "1"); } catch {}
  }

  if (!show) return null;

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
