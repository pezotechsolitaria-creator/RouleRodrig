"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useExperienceWorld } from "@/context/ExperienceWorldContext";
import { WORLD_PAGE } from "@/lib/worlds";

/**
 * "/" is the front door of whichever world you are in.
 *
 * ── THE BUG THIS EXISTS TO KILL ────────────────────────────────────────────
 * The owner's report: from Curated, tap a quick action, then press the page's
 * back button — and you are in Authentic. Nothing was broken in the switcher;
 * the problem is that EVERY back link on this site goes to "/", and "/" was
 * always the Authentic page. One tap out of the curated world and you could
 * not get back into it except through the switcher.
 *
 * Fixing each back link would have meant teaching a dozen components which
 * world they are in. This fixes all of them at once: if you have chosen
 * Curated, "/" forwards you to /curated.
 *
 * `replace`, not `push` — the homepage must not become a step in the history
 * that the phone's back gesture bounces off. And it waits for `ready`, so a
 * visitor who has chosen nothing (everybody, on a first visit) is never
 * redirected anywhere.
 */
export default function WorldHomeGate() {
  const { world, ready } = useExperienceWorld();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!ready || pathname !== "/") return;
    const target = world ? WORLD_PAGE[world] : "/";
    if (target !== "/") router.replace(target);
  }, [ready, world, pathname, router]);

  return null;
}
