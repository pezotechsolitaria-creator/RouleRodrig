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
    if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) return;

    const supabase = createClient();
    const identify = (user: { id: string; email?: string | null }) => {
      if (identifiedUserId.current === user.id) return;

      if (identifiedUserId.current) posthog.reset();
      posthog.identify(user.id, user.email ? { email: user.email } : undefined);
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
