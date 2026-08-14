"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellRing, Loader2 } from "lucide-react";

// ── Wake the shop when an order lands (M99) ────────────────────────────────
//
// Push existed for the customer, the platform owner and both kinds of driver.
// The MERCHANT — the person who has to cook the food or pack the box — had
// none. An order arrived, a notifications row was written, and the shop found
// out whenever somebody next opened the dashboard.
//
// Email is the wrong fallback: the free tier is ~400 messages a day shared with
// Supabase auth mail, so a busy kitchen emailing every order takes password
// resets down with it (M41). Push costs nothing and arrives in seconds.
//
// The two hard-won details from AdminPushSetup are carried over deliberately:
//
//  1. ALWAYS REBUILD the subscription rather than reusing an existing one. A
//     browser keeps a subscription that the push service has already retired,
//     so "alerts are on" can be true locally and dead in reality — that is
//     exactly how the owner's alerts said on for two days while delivering
//     nothing.
//  2. On iPhone, push is granted ONLY to a page installed to the Home Screen.
//     Saying so is the difference between a merchant who gets their orders and
//     one who thinks the site is broken.

// Uint8Array<ArrayBuffer>, not a bare Uint8Array: applicationServerKey wants a
// BufferSource backed by a real ArrayBuffer, and `Uint8Array.from` widens to
// ArrayBufferLike. Same signature as AdminPushSetup for the same reason.
function toBytes(key: string): Uint8Array<ArrayBuffer> {
  const padded = (key + "=".repeat((4 - (key.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export default function MerchantPushSetup() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Both pieces of state land TOGETHER, after an await.
  //
  // Setting them one at a time from the top of an effect is a synchronous
  // setState in an effect body — it cascades a render before the browser has
  // been asked anything, and eslint rejects it. Resolving the whole answer
  // first and committing it once is both quieter and simpler to read.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok =
        typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;
      let sub = false;
      if (ok) {
        try {
          const reg = await navigator.serviceWorker.ready;
          sub = Boolean(await reg.pushManager.getSubscription());
        } catch {
          sub = false;
        }
      } else {
        // Nothing to await on an unsupported browser, but the commit must still
        // happen off the synchronous path.
        await Promise.resolve();
      }
      if (cancelled) return;
      setSupported(ok);
      setSubscribed(sub);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      // iOS grants push only to an installed page. Check before asking, so the
      // merchant gets an instruction instead of a silent refusal.
      const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const installed =
        window.matchMedia?.("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (iOS && !installed) {
        setMsg({
          kind: "err",
          text: "On iPhone, first add this page to your Home Screen (Share → Add to Home Screen), open it from there, then press this again.",
        });
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMsg({
          kind: "err",
          text:
            permission === "denied"
              ? "Notifications are blocked for this site. Allow them in your browser settings, then reload."
              : "You closed the permission box — press the button again.",
        });
        return;
      }

      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
      if (!key) {
        setMsg({ kind: "err", text: "Alerts are not configured on this site yet." });
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      // Tear down first — see (1) above.
      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe().catch(() => {});
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toBytes(key),
      });

      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const res = await fetch("/api/merchant/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Do not leave a live browser subscription pointing at a server that
        // never recorded it — that is the "on but silent" state again.
        await sub.unsubscribe().catch(() => {});
        throw new Error(body.error || "Could not turn alerts on.");
      }
      setSubscribed(true);
      setMsg({ kind: "ok", text: "Alerts are on for this device. New orders will wake this phone." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Could not turn alerts on." });
    } finally {
      setBusy(false);
    }
  }, []);

  // A browser that cannot do push at all gets nothing rather than a dead
  // switch — there is no advice that would help.
  if (supported === false) return null;

  return (
    <div className="mt-7 rounded-2xl border border-white/10 bg-dark-card p-5">
      <p className="flex items-center gap-2 font-syne text-base font-bold text-offwhite">
        {subscribed ? <BellRing size={17} className="text-yellow" /> : <Bell size={17} className="text-muted" />}
        {subscribed ? "Order alerts are on" : "Get an alert when an order lands"}
      </p>
      <p className="mt-1.5 font-dm text-sm leading-relaxed text-muted">
        {subscribed
          ? "This device will ring for new orders. Turn it on for every phone that watches the shop."
          : "Without this, you only find out about an order when you next open this dashboard. It is free and takes one tap."}
      </p>

      {!subscribed && (
        <button
          onClick={() => void enable()}
          disabled={busy}
          className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-yellow px-5 font-syne text-sm font-bold text-dark disabled:opacity-50"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Bell size={15} />}
          Turn on order alerts
        </button>
      )}

      {msg && (
        <p
          role={msg.kind === "err" ? "alert" : "status"}
          className={`mt-2.5 font-dm text-xs leading-relaxed ${msg.kind === "err" ? "text-red-400" : "text-green-400"}`}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
