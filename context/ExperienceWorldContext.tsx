"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  parseWorld,
  WORLD_COOKIE,
  WORLD_COOKIE_MAX_AGE,
  WORLD_COPY,
  WORLD_KEY,
  type World,
} from "@/lib/worlds";
import { applyTheme, THEME_KEY } from "@/components/ThemeToggle";

// ── WHO OWNS THE VISITOR'S CHOICE ───────────────────────────────────────────
//
// One provider, mounted once, holding the answer to "which Rodrigues am I in".
// Everything else reads it. The rules it enforces:
//
//   • Nothing is assumed on the server. The world lives in localStorage, which
//     the server cannot see, so the first render is deliberately world-less and
//     the real value arrives in an effect. Guessing would produce a
//     server/client mismatch, and a failed hydration attaches NO event
//     handlers — which is exactly how the Day/Night switch on the experiences
//     hub came to render perfectly and do nothing when pressed.
//
//   • Choosing a world sets the theme, because the world IS the light. See the
//     note at the top of lib/worlds.ts: the alternative was a third
//     independent switch and eight combinations to keep coherent.
//
//   • `ready` is separate from `world`. "Not chosen yet" and "not read yet"
//     look identical if you only have null, and the gateway must appear for the
//     first but never flash for the second.

type Ctx = {
  /** Never null once `ready` — everyone starts in Authentic. See below. */
  world: World | null;
  /** Has localStorage been read? Nothing should render a world before this. */
  ready: boolean;
  choose: (w: World) => void;
};

const ExperienceWorldContext = createContext<Ctx>({
  world: null,
  ready: false,
  choose: () => {},
});

/** Where everyone starts, unless they have chosen otherwise. */
const DEFAULT_WORLD: World = "authentic";

export function ExperienceWorldProvider({ children }: { children: React.ReactNode }) {
  const [world, setWorld] = useState<World | null>(null);
  const [ready, setReady] = useState(false);

  // Mirror the world onto <html> so CSS can scope to it. One attribute drives
  // both visual systems — the terracotta and the bronze — which means a new
  // surface inherits its world by existing inside the document rather than by
  // being handed a prop through six components that do not care.
  useEffect(() => {
    if (!world) return;
    applyWorld(world);
    // Restored sessions need the cookie too: a visitor who chose Curated before
    // this shipped has it in localStorage and not in a cookie, and would flash
    // forever until they pressed the switcher again.
    writeWorldCookie(world);
    // ── THE WORLD OWNS THE LIGHT, ON EVERY PATH ─────────────────────────────
    // choose() applied the theme, but the RESTORE path did not — so a returning
    // visitor got the world's attribute and copy over whatever ground the theme
    // key happened to hold. Authentic rendered its warm headline on the black
    // canvas, which is the one combination that makes the whole system look
    // like a rename rather than a world.
    //
    // Applying it here covers both paths at once, and it is idempotent, so
    // choosing a world still costs exactly one class toggle.
    applyTheme(WORLD_COPY[world].theme);
  }, [world]);

  useEffect(() => {
    let stored: World | null = null;
    try {
      stored = parseWorld(localStorage.getItem(WORLD_KEY));
    } catch {
      // Private mode, or storage disabled. A visitor who cannot be remembered
      // still gets a working site — they simply meet the gateway each time.
    }
    // ── NOBODY IS ASKED TO CHOOSE ─────────────────────────────────────────
    // The first-visit gateway is gone on the owner's instruction, and the
    // reasoning is sound: a full-screen question in front of the homepage taxes
    // every visitor — including the ones who came to rent a scooter — to serve
    // a preference most of them do not have yet. Authentic is also this site's
    // existing near-black identity, so defaulting to it means the change costs
    // a returning visitor nothing at all.
    //
    // Curated is now something a visitor DISCOVERS from the switcher in the
    // header, which is the right order: see the island first, be offered the
    // other way of seeing it second.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorld(stored ?? DEFAULT_WORLD);
    setReady(true);
  }, []);

  const choose = useCallback((w: World) => {
    setWorld(w);
    const theme = WORLD_COPY[w].theme;
    applyWorld(w);
    // BEFORE the caller navigates. The switcher chooses and then pushes in the
    // same handler, so the cookie is already correct when middleware sees the
    // request — which is the whole reason the redirect can be server-side.
    writeWorldCookie(w);
    try {
      localStorage.setItem(WORLD_KEY, w);
      // Written through to the theme key as well, so the pre-hydration script
      // in app/layout.tsx paints the right ground on the NEXT load before
      // React exists. Without this the visitor gets one frame of the wrong
      // world on every subsequent visit.
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* see above */
    }
    applyTheme(theme);
  }, []);

  const value = useMemo(() => ({ world, ready, choose }), [world, ready, choose]);

  return (
    <ExperienceWorldContext.Provider value={value}>
      {children}
    </ExperienceWorldContext.Provider>
  );
}

/** Stamp the world on the document. Safe to call repeatedly. */
function applyWorld(w: World) {
  document.documentElement.setAttribute("data-world", w);
}

/**
 * Mirror the choice into a cookie so middleware can route on it.
 *
 * `SameSite=Lax` because this is only ever read on a top-level navigation to
 * this site, and `Secure` only where there is a scheme to be secure on —
 * setting it on http://localhost silently drops the cookie and the redirect
 * would appear to be broken in development only.
 */
function writeWorldCookie(w: World) {
  try {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${WORLD_COOKIE}=${w}; path=/; max-age=${WORLD_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
  } catch {
    /* cookies disabled — the client still works, it just flashes as before */
  }
}

export function useExperienceWorld() {
  return useContext(ExperienceWorldContext);
}

/**
 * The world to PRESENT with. Falls back to Authentic — the near-black world
 * that is this site's existing identity — so a visitor whose storage is
 * unreadable sees Roule Rodrigues as it already looks rather than a stranger.
 */
export function useActiveWorld(): World {
  const { world } = useExperienceWorld();
  return world ?? DEFAULT_WORLD;
}
