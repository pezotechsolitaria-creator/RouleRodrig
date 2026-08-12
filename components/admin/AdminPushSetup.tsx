"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellRing, Loader2, Send, Info, Check } from "lucide-react";

// Turn web push on for THIS device, and prove it works.
//
// Built after "web push not working" turned out to mean "there was no way to
// switch it on": every other toggle in the app is gated behind being a
// signed-in customer or an approved driver, and there were zero of both. A
// feature nobody can reach is indistinguishable from a broken one.

export default function AdminPushSetup() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [devices, setDevices] = useState(0);
  const [busy, setBusy] = useState<"on" | "test" | "off" | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const refresh = useCallback(async () => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(ok);
    if (!ok) return;
    setPermission(Notification.permission);
    try {
      const reg = await navigator.serviceWorker.ready;
      setSubscribed(Boolean(await reg.pushManager.getSubscription()));
    } catch {
      setSubscribed(false);
    }
    try {
      const res = await fetch("/api/admin/push", { cache: "no-store" });
      if (res.ok) setDevices((await res.json()).devices ?? 0);
    } catch {
      /* the count is informational */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function enable() {
    if (busy) return;
    setBusy("on");
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setMsg({ kind: "err", text: "You didn't allow notifications, so nothing can be sent." });
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
      if (!key) {
        setMsg({ kind: "err", text: "This deployment has no VAPID public key." });
        return;
      }
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(key) }));

      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const res = await fetch("/api/admin/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!res.ok) {
        // Do not leave a subscription the server never stored — that is exactly
        // the state that looks enabled and delivers nothing.
        await sub.unsubscribe().catch(() => {});
        const p = (await res.json().catch(() => null)) as { error?: string } | null;
        setMsg({ kind: "err", text: p?.error ?? "Could not turn alerts on." });
        return;
      }
      setMsg({ kind: "ok", text: "This device is now subscribed. Send a test to confirm." });
      await refresh();
    } catch (err) {
      console.error("admin push enable failed", err);
      setMsg({ kind: "err", text: "Could not turn alerts on." });
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    if (busy) return;
    setBusy("test");
    setMsg(null);
    try {
      const res = await fetch("/api/admin/push", { method: "PUT" });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; sent?: number; devices?: number; error?: string }
        | null;
      if (!res.ok || !body?.ok) {
        setMsg({ kind: "err", text: body?.error ?? "The test push did not go through." });
        return;
      }
      setMsg({
        kind: "ok",
        text: `Sent to ${body.sent} of ${body.devices} device${body.devices === 1 ? "" : "s"}. It should arrive in a second.`,
      });
    } finally {
      setBusy(null);
    }
  }

  async function disable() {
    if (busy) return;
    setBusy("off");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/admin/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setMsg(null);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  if (supported === null) return null;

  return (
    <section className="mb-6 rounded-2xl border border-white/10 bg-dark-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-syne text-sm font-bold">
            {subscribed ? <BellRing size={15} className="text-yellow" /> : <Bell size={15} className="text-muted" />}
            Alerts on this device {subscribed ? "— on" : "— off"}
          </p>
          <p className="mt-0.5 font-dm text-xs text-muted">
            {devices > 0
              ? `${devices} device${devices === 1 ? "" : "s"} subscribed. Critical alerts reach you with the app closed.`
              : "Turn this on to get critical alerts even with the app closed."}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {subscribed && (
            <button
              onClick={() => void test()}
              disabled={busy !== null}
              className="flex min-h-[44px] items-center gap-1.5 rounded-full border border-white/20 px-4 font-syne text-sm font-bold disabled:opacity-50"
            >
              {busy === "test" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Test
            </button>
          )}
          {permission !== "denied" && (
            <button
              onClick={() => void (subscribed ? disable() : enable())}
              disabled={busy !== null}
              className={`min-h-[44px] rounded-full px-5 font-syne text-sm font-bold disabled:opacity-50 ${
                subscribed ? "border border-white/20 text-offwhite" : "bg-yellow text-dark"
              }`}
            >
              {busy === "on" || busy === "off" ? (
                <Loader2 size={14} className="mx-auto animate-spin" />
              ) : subscribed ? (
                "Turn off"
              ) : (
                "Turn on"
              )}
            </button>
          )}
        </div>
      </div>

      {!supported && (
        <p className="mt-3 font-dm text-xs text-muted">
          This browser can&apos;t receive web push. On iPhone, add the site to your Home Screen first.
        </p>
      )}

      {permission === "denied" && (
        // Unrecoverable in-page: the prompt cannot be shown again once denied.
        <p className="mt-3 flex items-start gap-2 font-dm text-xs text-orange-300">
          <Info size={13} className="mt-0.5 shrink-0" />
          Notifications are blocked for this site. Tap the padlock in the address bar → Notifications → Allow,
          then reload.
        </p>
      )}

      {msg && (
        <p
          className={`mt-3 flex items-start gap-1.5 font-dm text-xs ${
            msg.kind === "ok" ? "text-green-400" : "text-red-400"
          }`}
        >
          {msg.kind === "ok" && <Check size={13} className="mt-0.5 shrink-0" />}
          {msg.text}
        </p>
      )}
    </section>
  );
}

// VAPID keys travel as URL-safe base64; subscribe() wants raw bytes. Backed by
// an explicit ArrayBuffer because applicationServerKey rejects the
// SharedArrayBuffer-compatible type the shorthand infers.
function toBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}
