"use client";

// Browser half of web push. Kept away from the server sender so nothing here
// can drag `web-push` (a Node library) into a client bundle.

export type PushState = "unsupported" | "denied" | "off" | "on";

// The VAPID public key is public by definition — it is what identifies this
// server to the push service, and every subscriber receives it.
const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    PUBLIC_KEY.length > 0
  );
}

// The subscribe call wants raw bytes; VAPID keys travel as URL-safe base64.
// Backed by an explicit ArrayBuffer because `applicationServerKey` rejects the
// SharedArrayBuffer-compatible `Uint8Array<ArrayBufferLike>` the shorthand infers.
function toBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export async function currentPushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? "on" : "off";
  } catch {
    return "off";
  }
}

/**
 * Ask for permission and register. Returns the resulting state so the caller can
 * explain "denied" — which is unrecoverable in-page and needs browser settings.
 */
/**
 * Where the subscription is registered.
 *
 * Delivery drivers have a Supabase account, so /api/driver/push authenticates
 * them by session. A TAXI driver has no account at all — they are identified by
 * a token in their own link — so they register through a different route with
 * that token in the body. Same browser mechanics, different door: parameterised
 * here rather than copied, because a second copy of the subscribe/teardown
 * dance is a second place for "alerts say on but nothing arrives" to live.
 */
export type PushTarget = { url?: string; body?: Record<string, unknown> };

export async function enablePush(target: PushTarget = {}): Promise<{ state: PushState; error?: string }> {
  if (!pushSupported()) return { state: "unsupported" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { state: permission === "denied" ? "denied" : "off" };

  try {
    const reg = await navigator.serviceWorker.ready;
    // Reuse the existing subscription when there is one: re-subscribing yields
    // the same endpoint anyway, and the server treats it as idempotent.
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        // Required by every browser: no silent background pushes.
        userVisibleOnly: true,
        applicationServerKey: toBytes(PUBLIC_KEY),
      }));

    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    const res = await fetch(target.url ?? "/api/driver/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(target.body ?? {}), endpoint: json.endpoint, keys: json.keys }),
    });

    if (!res.ok) {
      // A subscription the server never stored would leave the driver believing
      // alerts are on, so it is torn down rather than left dangling.
      await sub.unsubscribe().catch(() => {});
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      return { state: "off", error: payload?.error ?? "Could not turn alerts on." };
    }

    return { state: "on" };
  } catch (err) {
    console.error("enablePush failed", err);
    return { state: "off", error: "Could not turn alerts on." };
  }
}

export async function disablePush(target: PushTarget = {}): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      // Tell the server first: if unsubscribe() succeeds and the DELETE does
      // not, the row survives as an endpoint that can never be delivered.
      await fetch(target.url ?? "/api/driver/push", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(target.body ?? {}), endpoint: sub.endpoint }),
      }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
    return "off";
  } catch {
    return "off";
  }
}
