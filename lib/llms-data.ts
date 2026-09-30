import "server-only";
import type { SiteContent } from "@/lib/defaults";
import { getContent } from "@/lib/content";
import { readTransferFares } from "@/lib/rides/fares";
import {
  isSeedContent,
  UNREAD_CONTENT,
  unreadLlmsData,
  type LlmsData,
  type LlmsFood,
} from "@/lib/llms-txt";

// ── THE READS BEHIND /llms.txt AND /llms-full.txt (SEO audit 2026-09-29 C8) ──
//
// The same sources the pages read, through the same functions:
//   · getContent()          the fleet, stays, experiences, contact, FAQ
//   · readTransferFares()   the airport price sheet /transfers publishes
//   · food_home + browse_food, the catalog /food shows
//   · listPublicEvents()    the events /events lists
//
// The catalog and events go through the COOKIELESS client, for the reason
// app/sitemap.ts spells out: the session client reads cookies, which turns a
// revalidated route dynamic, and the failure is silent. Each read is
// best-effort on its own — a failure costs its lines, never the file.

async function readFood(): Promise<LlmsFood | null> {
  try {
    const { createAnonClient } = await import("@/lib/supabase/anon");
    const { getFoodHome, browseFood } = await import("@/lib/food/queries");
    const anon = createAnonClient();
    const [home, dishes] = await Promise.all([getFoodHome(anon), browseFood(anon, { limit: 60 })]);
    if (!home) return null;
    return {
      kitchens: home.kitchens.map((k) => ({
        name: k.name,
        address: k.address,
        minNoticeHours: k.minNoticeHours,
      })),
      dishPrices: dishes.items.map((i) => i.price),
      deliveryEnabled: home.deliveryEnabled,
    };
  } catch {
    return null;
  }
}

/**
 * On sale = an event that has not ended or been cancelled and has a ticket
 * type to sell. /events said "Nothing on sale right now" while llms.txt
 * promised tickets (T20).
 */
async function readEventsOnSale(): Promise<boolean> {
  try {
    const { createAnonClient } = await import("@/lib/supabase/anon");
    const { listPublicEvents } = await import("@/lib/events/queries");
    const events = await listPublicEvents(createAnonClient());
    return events.some(
      (e) =>
        (e.phase === "upcoming" || e.phase === "in_progress") &&
        !e.cancelledAt &&
        e.ticketTypes.length > 0,
    );
  } catch {
    return false;
  }
}

/** The owner's content row, or UNREAD_CONTENT when what came back is the seed
 *  (getContent()'s answer to a failed read) or nothing at all. */
async function readContent(): Promise<SiteContent> {
  try {
    const content = await getContent();
    return isSeedContent(content) ? UNREAD_CONTENT : content;
  } catch {
    return UNREAD_CONTENT;
  }
}

/** The cheapest eSIM on sale, from the same public catalogue /esim renders. */
async function readEsimFrom(): Promise<number | null> {
  try {
    const { createAnonClient } = await import("@/lib/supabase/anon");
    const { data, error } = await createAnonClient().rpc("public_esim_listing", { p_country: "MU" });
    if (error || !data?.length) return null;
    return Math.min(...(data as { retail_eur_cents: number }[]).map((p) => p.retail_eur_cents));
  } catch {
    return null;
  }
}

/** eSIM destinations beyond Mauritius with a plan on sale (M224). */
async function readEsimWorld(): Promise<NonNullable<LlmsData["esimWorld"]>> {
  try {
    const [{ getLiveDestinations }, { DESTINATIONS, HOME_CODE, destinationPath }] = await Promise.all([
      import("@/lib/esim/service"),
      import("@/lib/esim/destinations"),
    ]);
    const live = new Map((await getLiveDestinations()).map((l) => [l.code, l]));
    return DESTINATIONS.filter((d) => d.code !== HOME_CODE && live.has(d.code)).map((d) => ({
      name: d.en,
      path: destinationPath(d, "en"),
      fromEurCents: live.get(d.code)!.fromEurCents,
    }));
  } catch {
    return [];
  }
}

export async function readLlmsData(siteUrl: string): Promise<LlmsData> {
  const [content, fares, food, eventsOnSale, esimFromEurCents, esimWorld] = await Promise.all([
    readContent(),
    readTransferFares(),
    readFood(),
    readEventsOnSale(),
    readEsimFrom(),
    readEsimWorld(),
  ]);
  return { siteUrl, content, fares, food, eventsOnSale, esimFromEurCents, esimWorld };
}

/**
 * The response both routes send, as text/plain. A read or a build that throws
 * falls back to unreadLlmsData(): the file still maps the site, without a
 * figure, rather than answering 500.
 */
export async function llmsResponse(
  siteUrl: string,
  build: (d: LlmsData) => string,
): Promise<Response> {
  let body: string;
  try {
    body = build(await readLlmsData(siteUrl));
  } catch {
    body = build(unreadLlmsData(siteUrl));
  }
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
