import { Loader2, X } from "lucide-react";
import { translations, type Language } from "@/lib/i18n";
import type { TiRouleLoadStatus } from "@/lib/tiroule-launcher";

// ── What a Ti Roulé tap shows while the chat is not here yet ────────────────
//
// Architecture review 2026-09-30, perf-a11y findings on the lazy split: the
// first tap now downloads the guide, and a slow or failed download used to
// show nothing at all. This is the answer GlobalTiRoule renders, from the
// status lib/tiroule-launcher.ts keeps. It takes the language as a prop and
// holds no hooks, so a test can render it and press its buttons without a DOM.
//
// The copy is local ({en, fr, cr}, not new lib/i18n keys); "Try again" and
// "Dismiss" reuse the shared common words so they read as they do elsewhere.

export const TI_ROULE_LOAD_COPY: Record<
  Language,
  { loading: string; offline: string; failed: string; reload: string }
> = {
  en: {
    loading: "Opening Ti Roulé…",
    offline:
      "You're offline, and Ti Roulé needs a connection to open. Try again once you're back online.",
    failed: "Ti Roulé didn't load. Reloading the page usually fixes it.",
    reload: "Reload page",
  },
  fr: {
    loading: "Ouverture de Ti Roulé…",
    offline:
      "Vous êtes hors ligne, et Ti Roulé a besoin d'une connexion pour s'ouvrir. Réessayez une fois reconnecté.",
    failed: "Ti Roulé ne s'est pas chargé. Recharger la page règle souvent le problème.",
    reload: "Recharger la page",
  },
  cr: {
    loading: "Ti Roulé pe ouver…",
    offline:
      "Ou pa konekte, ek Ti Roulé bizin enn koneksion pou ouver. Reseye kan ou rekonekte.",
    failed: "Ti Roulé pa finn sarze. Souvan si ou refres paz la, li regle.",
    reload: "Refres paz la",
  },
};

export default function TiRouleLoadNotice({
  status,
  lang,
  onRetry,
  onReload,
  onDismiss,
}: {
  status: TiRouleLoadStatus;
  lang: Language;
  onRetry: () => void;
  onReload: () => void;
  onDismiss: () => void;
}) {
  if (status === "idle") return null;
  const copy = TI_ROULE_LOAD_COPY[lang] ?? TI_ROULE_LOAD_COPY.en;
  const common = (translations[lang] ?? translations.en).common;
  const shown = status !== "waiting";
  const text = status === "waiting" ? "" : copy[status];
  const failed = status === "offline" || status === "failed";

  return (
    // Above the floating tab bar on phones (its 3.875rem plus the same
    // safe-area padding, see BottomNav), and z-50 to sit over its z-40.
    // While "waiting" this is an empty, click-through box: the live region is
    // already in the page when its text arrives, so a screen reader reads it.
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.625rem+max(0.75rem,env(safe-area-inset-bottom)))] z-50 flex justify-center px-4 md:bottom-6">
      <div
        className={
          shown
            ? "pointer-events-auto flex min-h-14 w-full max-w-sm items-center gap-2 rounded-2xl border border-white/12 bg-dark/90 py-1.5 pl-4 pr-1.5 shadow-[0_16px_44px_-12px_rgba(0,0,0,0.75)] backdrop-blur-xl"
            : undefined
        }
      >
        {status === "loading" && (
          <Loader2
            aria-hidden
            className="h-4 w-4 shrink-0 animate-spin text-yellow motion-reduce:animate-none"
          />
        )}
        <p
          role="status"
          aria-live="polite"
          className="min-w-0 flex-1 font-dm text-sm leading-snug text-offwhite"
        >
          {text}
        </p>
        {status === "offline" && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-yellow px-4 font-dm text-sm font-semibold text-dark"
          >
            {common.tryAgain}
          </button>
        )}
        {status === "failed" && (
          <button
            type="button"
            onClick={onReload}
            className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-yellow px-4 font-dm text-sm font-semibold text-dark"
          >
            {copy.reload}
          </button>
        )}
        {failed && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={common.dismiss}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-offwhite"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
