"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useExperienceWorld } from "@/context/ExperienceWorldContext";
import { WORLD_PAGE } from "@/lib/worlds";

/**
 * Once you choose Curated, Curated IS your home.
 *
 * ── THIS COMPONENT HAS BEEN DELETED ONCE, AND IT WAS MY MISREADING ────────
 * The owner's first note read as "the homepage must stay the homepage", so
 * this was removed. What he actually meant was narrower: the AUTHENTIC half of
 * the switcher must land on the real homepage, and there must not be a second
 * Authentic page dressed as Curated. Both of those are still true — and they
 * are not in conflict with this.
 *
 * The requirement it serves is the one the owner stated plainly the second
 * time: choose Curated, tap Beaches, come back, and you should still be in
 * Curated. PERMANENTLY, until you press AUTHENTIC.
 *
 * ── WHY IT IS DONE HERE RATHER THAN IN EVERY BACK LINK ────────────────────
 * Every "home" link on this site points at "/" — the bottom nav, the back bars
 * on /browse, the brand mark in a dozen headers. Teaching each of them which
 * world the visitor is in would be a dozen chances to miss one. "/" answering
 * with your world fixes all of them at once, and any new link inherits it.
 *
 * ── WHY IT CANNOT FIGHT THE SWITCHER ──────────────────────────────────────
 * Pressing AUTHENTIC calls `choose("authentic")` BEFORE it navigates, so by the
 * time this runs on "/" the stored world is already Authentic and it does
 * nothing. The one ordering that would break — navigate first, store second —
 * is not what the switcher does.
 *
 * `replace`, not `push`, so the homepage never becomes a step the phone's back
 * gesture bounces off. And it waits for `ready`, so a first-time visitor — who
 * has chosen nothing — is never sent anywhere.
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
