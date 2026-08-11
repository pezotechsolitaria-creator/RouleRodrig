"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X, Share, MoreVertical, Plus } from "lucide-react";
import { SITE_URL } from "@/lib/site";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "android" | "ios-safari" | "ios-other" | "desktop";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && "ontouchend" in document);
  if (isIOS) {
    const isSafari = /^((?!chrome|crios|fxios|edgios).)*safari/i.test(ua);
    return isSafari ? "ios-safari" : "ios-other";
  }
  if (/android/i.test(ua)) return "android";
  return "desktop";
}

/**
 * Always-available "Install" affordance. Unlike Chrome's flaky
 * beforeinstallprompt banner (fires once, then suppressed for ~90 days), this
 * button is persistent: it triggers the native install dialog when the browser
 * offers one, and otherwise opens clear per-platform instructions — so every
 * visitor on every phone can always install the app.
 */
export default function InstallAppButton({ variant = "chip" }: { variant?: "chip" | "menu" | "icon" }) {
  const [installed, setInstalled] = useState(false);
  const [hasNative, setHasNative] = useState(false);
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [open, setOpen] = useState(false);
  // document.body does not exist during SSR, so the portal can only mount on the
  // client. Gating on this rather than checking `typeof window` keeps the first
  // client render identical to the server's and avoids a hydration mismatch.
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) { setInstalled(true); return; }

    setPlatform(detectPlatform());
    setHasNative(!!(window as unknown as { __rrInstallEvent?: unknown }).__rrInstallEvent);

    const onInstallable = () => setHasNative(true);
    const onInstalled = () => { setInstalled(true); setOpen(false); };
    window.addEventListener("rr:installable", onInstallable);
    window.addEventListener("rr:installed", onInstalled);
    return () => {
      window.removeEventListener("rr:installable", onInstallable);
      window.removeEventListener("rr:installed", onInstalled);
    };
  }, []);

  if (installed) return null;

  // Always open the modal so a tap ALWAYS gives visible feedback (the old
  // behaviour called the native prompt directly, which silently did nothing
  // when the browser hadn't offered one). The native one-tap install lives
  // inside the modal.
  function handleClick() {
    setOpen(true);
  }

  async function installNow() {
    const evt = (window as unknown as { __rrInstallEvent?: BeforeInstallPromptEvent }).__rrInstallEvent;
    if (!evt) return;
    try {
      await evt.prompt();
      const choice = await evt.userChoice.catch(() => ({ outcome: "dismissed" as const }));
      (window as unknown as { __rrInstallEvent?: BeforeInstallPromptEvent | null }).__rrInstallEvent = null;
      if (choice.outcome === "accepted") { setInstalled(true); setOpen(false); }
    } catch {
      /* keep the manual steps visible */
    }
  }

  const trigger =
    variant === "menu" ? (
      <button
        onClick={handleClick}
        className="flex items-center gap-3 bg-yellow/10 text-yellow border border-yellow/30 font-syne font-bold text-lg px-8 py-4 rounded-full hover:bg-yellow/15 transition-colors"
      >
        <Download size={20} /> Install app
      </button>
    ) : variant === "icon" ? (
      <button
        onClick={handleClick}
        aria-label="Install the app"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-muted transition-colors hover:border-yellow/50 hover:text-yellow"
      >
        <Download size={16} />
      </button>
    ) : (
      <button
        onClick={handleClick}
        aria-label="Install the app"
        className="flex items-center gap-1.5 text-xs font-dm text-muted hover:text-yellow border border-dark-border hover:border-yellow/50 px-3 py-2 rounded-full transition-all duration-200"
      >
        <Download size={14} /> <span className="hidden lg:inline">Install app</span>
      </button>
    );

  return (
    <>
      {trigger}

      {/* Portal OUTSIDE, AnimatePresence INSIDE. The order is the whole bug.

          This previously rendered <AnimatePresence>{createPortal(…)}</…> and
          the modal never opened AT ALL, on any platform, for as long as it was
          live. AnimatePresence filters its children through
          React.isValidElement(), and a portal's $$typeof is REACT_PORTAL_TYPE
          rather than REACT_ELEMENT_TYPE — so isValidElement() returns false and
          framer-motion silently discards the portal. Measured on production:
          open=true, mounted=true, the onClick attached and firing, and zero
          DOM. No error, no warning. It arrived when the modal was portalled to
          <body> to escape a contained position:fixed.

          MapSection's lightbox already used this correct shape, which is what
          confirmed the diagnosis.

          test/animatepresence-portal.test.ts fails the build if the two are
          ever nested the wrong way round again, and e2e/install-app.spec.ts
          covers open / close / reopen and asserts nothing is left covering the
          viewport afterwards — a modal that fades out but fails to unmount
          leaves an invisible full-screen layer that swallows every click, and
          that is invisible to a screenshot.

          WHEN TESTING THIS LOCALLY: unregister the service worker and clear
          caches first. It caches the JS bundle, and it served three rounds of
          stale measurements here — including a convincing but entirely false
          "the modal will not close". */}
      {mounted && createPortal(
        <AnimatePresence>
          {open && (
          <motion.div
            key="install-modal"
            className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.97 }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
              /* The panel had NO height cap and NO scroll. Its content is taller
                 than a phone viewport, and the container anchors it with
                 items-end — so everything above the last step (the heading, the
                 earlier steps, and the install button itself) overflowed off the
                 TOP of the screen with no way to reach it. Reported as "can't
                 see the instructions or the download button", which is exactly
                 what an unscrollable overflowing modal looks like.

                 dvh rather than vh: under vh the mobile address bar counts as
                 viewport, so 100vh is TALLER than the visible area and the cap
                 would still clip. dvh tracks the real space. */
              className="relative max-h-[85dvh] w-full max-w-sm overflow-y-auto overscroll-contain bg-dark-card border border-dark-border rounded-3xl p-6"
            >
              <button onClick={() => setOpen(false)} aria-label="Close" className="absolute top-4 right-4 text-muted hover:text-offwhite transition-colors">
                <X size={20} />
              </button>

              <div className="flex items-center gap-3 mb-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icon-192.png" alt="" className="w-12 h-12 rounded-2xl" />
                <div>
                  <p className="font-syne font-extrabold text-offwhite text-base leading-tight">Install Roule Rodrigues</p>
                  <p className="font-dm text-muted text-xs">Add it to your home screen — opens like an app.</p>
                </div>
              </div>

              {/* One-tap install when the browser offers it */}
              {hasNative && (
                <div className="mb-5">
                  <button
                    onClick={installNow}
                    className="w-full flex items-center justify-center gap-2 bg-yellow text-dark font-syne font-bold text-sm py-3.5 rounded-full hover:bg-yellow-dark transition-colors"
                  >
                    <Download size={16} /> Install now
                  </button>
                  <p className="text-center font-dm text-muted/60 text-[11px] mt-2">or add it manually:</p>
                </div>
              )}

              <ol className="space-y-3">
                {platform === "ios-safari" && (
                  <>
                    <Step n={1}>Tap the <Share size={14} className="inline align-text-bottom text-yellow mx-0.5" /> <b className="text-offwhite">Share</b> button (bottom of Safari).</Step>
                    <Step n={2}>Scroll down and tap <b className="text-offwhite">&ldquo;Add to Home Screen&rdquo;</b> <Plus size={13} className="inline align-text-bottom text-yellow" />.</Step>
                    <Step n={3}>Tap <b className="text-offwhite">Add</b> — done!</Step>
                  </>
                )}
                {platform === "ios-other" && (
                  <>
                    <Step n={1}>Open <b className="text-offwhite">{SITE_URL.replace(/^https?:\/\//, "")}</b> in <b className="text-offwhite">Safari</b> (iPhone only installs from Safari).</Step>
                    <Step n={2}>Tap <Share size={14} className="inline align-text-bottom text-yellow mx-0.5" /> <b className="text-offwhite">Share</b> → <b className="text-offwhite">&ldquo;Add to Home Screen&rdquo;</b>.</Step>
                    <Step n={3}>Tap <b className="text-offwhite">Add</b> — done!</Step>
                  </>
                )}
                {platform === "android" && (
                  <>
                    <Step n={1}>Tap the <MoreVertical size={14} className="inline align-text-bottom text-yellow" /> <b className="text-offwhite">menu</b> (top-right of Chrome).</Step>
                    <Step n={2}>Tap <b className="text-offwhite">&ldquo;Install app&rdquo;</b> or <b className="text-offwhite">&ldquo;Add to Home screen&rdquo;</b>.</Step>
                    <Step n={3}>Confirm <b className="text-offwhite">Install</b> — done!</Step>
                  </>
                )}
                {platform === "desktop" && (
                  <>
                    <Step n={1}>Click the <Download size={14} className="inline align-text-bottom text-yellow" /> <b className="text-offwhite">install icon</b> in the address bar.</Step>
                    <Step n={2}>Or open the browser menu → <b className="text-offwhite">&ldquo;Install Roule Rodrigues&rdquo;</b>.</Step>
                    <Step n={3}>Confirm <b className="text-offwhite">Install</b> — done!</Step>
                  </>
                )}
              </ol>
            </motion.div>
          </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-yellow text-dark font-syne font-bold text-xs">{n}</span>
      <span className="font-dm text-offwhite/85 text-sm leading-relaxed">{children}</span>
    </li>
  );
}
