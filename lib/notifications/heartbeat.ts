import "server-only";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { sendWhatsApp } from "./whatsapp";
import { formatWhatsAppMessage } from "./queue";

// ── Watching the watchman ──────────────────────────────────────────────────
//
// The 60-second notification worker runs on cron-job.org, OUTSIDE Vercel,
// because the plan caps this project at two once-daily crons. That external
// account is the single point of failure in the whole notification system: if
// it lapses, pauses, or its secret rotates, WhatsApp stops and delivery
// escalation stops — silently. The owner would find out from a customer.
//
// THE TRAP THIS AVOIDS. The obvious implementation — enqueue an alert saying
// "the worker is down" — cannot work: the queue is drained by the very worker
// being reported dead, so the alert sits in it forever. This sends INLINE,
// straight to CallMeBot, from the daily Vercel cron. It is the one message in
// the system that deliberately bypasses the queue.

type Stale = { name: string; last_ok_at: string; minutes_stale: number };

/**
 * Alert the owner about any heartbeat that has gone stale. Claims each one in
 * the same statement that reads it, so a stale worker produces one message a
 * day rather than one per check forever.
 *
 * Returns how many alerts were actually delivered. Never throws — this runs at
 * the end of a cron whose real work has already succeeded.
 */
export async function checkHeartbeats(staleMinutes = 15): Promise<{ stale: number; alerted: number }> {
  try {
    if (!hasServiceRole()) return { stale: 0, alerted: 0 };
    const admin = await getPrivileged();

    const { data, error } = await admin.rpc("claim_stale_heartbeats", {
      p_stale_minutes: staleMinutes,
    });
    if (error) {
      console.error("claim_stale_heartbeats failed", error);
      return { stale: 0, alerted: 0 };
    }

    const stale = (data ?? []) as Stale[];
    if (stale.length === 0) return { stale: 0, alerted: 0 };

    // Any active slot will do — this is an infrastructure alarm, not a
    // category-routed business notification. Prefer one that handles `system`
    // or `admin`, but fall back to whatever is configured rather than staying
    // silent because no slot claimed the right category.
    const { data: slots } = await admin
      .from("notification_slots")
      .select("phone, api_key, categories")
      .eq("is_active", true);

    type Slot = { phone: string | null; api_key: string | null; categories: string[] | null };
    const usable = ((slots ?? []) as Slot[]).filter((s) => s.phone && s.api_key);
    if (usable.length === 0) {
      console.error("heartbeat stale but no WhatsApp slot is configured", stale);
      return { stale: stale.length, alerted: 0 };
    }
    const target =
      usable.find((s) => s.categories?.some((c) => c === "system" || c === "admin")) ?? usable[0];

    let alerted = 0;
    for (const h of stale) {
      const hours = Math.floor(h.minutes_stale / 60);
      const since = hours >= 1 ? `${hours}h` : `${h.minutes_stale} min`;
      const message = formatWhatsAppMessage({
        title: "Notification worker is down",
        lines: [
          `No run for ${since} (${h.name}).`,
          "WhatsApp alerts and delivery escalation have stopped.",
          "Check the cron-job.org schedule is enabled and CRON_SECRET still matches.",
        ],
      });

      const result = await sendWhatsApp({
        phone: target.phone as string,
        apiKey: target.api_key as string,
        message,
      });
      if (result.ok) alerted += 1;
      else console.error("heartbeat alert failed to send", result);
    }

    return { stale: stale.length, alerted };
  } catch (err) {
    console.error("checkHeartbeats threw", err);
    return { stale: 0, alerted: 0 };
  }
}
