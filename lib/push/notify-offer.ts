import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { pushToOfferedDrivers } from "./send";
import { centsToDecimalString } from "@/lib/money";

// Called the moment an order is marked ready. M49's trigger has already created
// the delivery and fanned out the offers inside that same transaction, so by the
// time this runs there is something to announce.
//
// Deliberately not routed through the notification queue: that worker runs on a
// one-minute cron, and a delivery offer expires within the accept window. A
// minute of that window is too much to spend waiting for a poll. This fires
// inline instead, and never throws — a silent phone must not fail an order.
export async function notifyDriversOfNewOffer(orderId: string): Promise<void> {
  try {
    if (!hasServiceRole()) return;
    const admin = await getPrivileged();

    const { data, error } = await admin
      .from("deliveries")
      .select("id, status, driver_earning, store:stores(name)")
      .eq("order_id", orderId)
      .maybeSingle();

    if (error || !data) return;
    // Already claimed, cancelled, or never a network delivery — nothing to offer.
    if ((data as { status?: string }).status !== "searching_driver") return;

    const row = data as {
      id: string;
      driver_earning: number | null;
      store: { name?: string | null } | { name?: string | null }[] | null;
    };
    const store = Array.isArray(row.store) ? row.store[0] : row.store;
    const shop = store?.name ?? "a shop";
    const pay = row.driver_earning ? `Rs ${centsToDecimalString(row.driver_earning)}` : null;

    await pushToOfferedDrivers(row.id, {
      // The two things that decide whether they tap: what it pays, and how far.
      title: pay ? `New delivery — ${pay}` : "New delivery available",
      body: `Pick up from ${shop}. Open to accept before it goes to someone else.`,
      url: "/driver",
      // Per delivery, so three updates about one job replace each other.
      tag: `delivery:${row.id}`,
      urgent: true,
    });
  } catch (err) {
    console.error("notifyDriversOfNewOffer failed", { orderId, err });
  }
}
