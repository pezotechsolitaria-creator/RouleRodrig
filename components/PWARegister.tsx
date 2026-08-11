"use client";

import { useEffect, useRef } from "react";
import posthog from "posthog-js";
import { createClient } from "@/lib/supabase/client";

/**
 * Registers the service worker (required for installability + offline) and
 * synchronizes the browser analytics identity with the Supabase session.
 * The install UI lives in InstallAppButton (persistent, in the navbar) so it's
 * always discoverable.
 */
export default function PWARegister() {
  const identifiedUserId = useRef<string | null>(null);
  const cleanup = useRef<(() => void) | null>(null);

  // ── Register, and keep it UP TO DATE ──────────────────────────────────────
  //
  // Registering once was not enough. sw.js already calls skipWaiting() and
  // clients.claim(), so a new worker takes over as soon as the browser fetches
  // it — but an INSTALLED PWA that stays open for days may not re-fetch it, and
  // even after the new worker activates the open page keeps running the old
  // JavaScript until something reloads it.
  //
  // The visible symptom is a homepage that is simply wrong: the owner was still
  // being shown the pre-redesign hub hours after it had been replaced, and
  // nothing on screen suggested a reload would help. A cached shell that
  // silently disagrees with the deployed site is worse than an offline error,
  // because it looks like the product.
  //
  // So: check for a new worker on load and every time the app comes back to the
  // foreground, and reload ONCE when a new one takes control.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let reloading = false;
    // Was this page ALREADY controlled by a worker? On a first-ever visit it is
    // not, and the very first activation claims the page — which would fire
    // controllerchange and reload every new visitor for no reason, turning a
    // stale-cache fix into a worse first impression than the bug. Only an
    // UPGRADE (a worker replacing a worker) justifies a reload.
    const hadController = Boolean(navigator.serviceWorker.controller);

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        // An immediate check catches the common case: the app was reopened
        // after a deploy.
        registration.update().catch(() => {});

        const onVisible = () => {
          if (document.visibilityState === "visible") registration.update().catch(() => {});
        };
        document.addEventListener("visibilitychange", onVisible);
        cleanup.current = () => document.removeEventListener("visibilitychange", onVisible);
      })
      .catch(() => {});

    // Fires when the NEW worker has claimed this page. At that moment the
    // caches have been swapped underneath us, so the running bundle and the
    // served assets no longer necessarily match — one reload resolves it.
    //
    // The guard is not optional: without it a worker that keeps re-claiming
    // turns this into a reload loop, which is a far worse bug than the stale
    // page it was meant to fix.
    const onControllerChange = () => {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      cleanup.current?.();
    };
  }, []);

  useEffect(() => {
    // Same two accepted spellings as instrumentation-client.ts — if this guard
    // only checked one name, identify() would silently never run whenever the
    // token happened to be configured under the other.
    if (
      !process.env.NEXT_PUBLIC_POSTHOG_KEY &&
      !process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
    )
      return;

    const supabase = createClient();
    const identify = (user: { id: string }) => {
      if (identifiedUserId.current === user.id) return;

      if (identifiedUserId.current) posthog.reset();

      // The opaque Supabase UUID and nothing else. It was previously sending
      // the customer's email as a person property, which made it the only piece
      // of customer PII in PostHog — and person properties persist against the
      // profile rather than expiring with an event.
      //
      // The email bought nothing that the UUID does not: funnels, retention and
      // per-user debugging all key on the distinct id, and when support needs to
      // know WHO a user is, Supabase is the system of record and is already
      // authoritative. Given this app handles bookings, rentals, ticketing,
      // marketplace orders and payments, the default is minimisation.
      posthog.identify(user.id);
      identifiedUserId.current = user.id;
    };

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) identify(user);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        if (identifiedUserId.current) posthog.reset();
        identifiedUserId.current = null;
      } else if (session?.user) {
        identify(session.user);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  return null;
}
