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

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
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
