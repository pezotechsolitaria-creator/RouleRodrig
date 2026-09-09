import { MapPin, Route } from "lucide-react";
import { cn } from "@/lib/utils";
import { isPoint, pinUrl, routeUrl } from "@/lib/maps/nav";
import { liveMapHref } from "@/lib/maps/live-focus";

// ── WHERE IS THIS, ACTUALLY ─────────────────────────────────────────────────
//
// Every operations surface showed a location as a line of words and nothing
// else, while the coordinates sat unused in the same row.
//
// The words are often useless. A customer who taps "use my location" stores a
// label like "Ma position actuelle" — "my current location" — and on 9 Sept a
// real taxi request arrived reading exactly that, with a precise GPS fix beside
// it that no screen displayed. The dispatcher could not tell where to send a
// driver from a label meaning "here" written by somebody who is no longer
// there. The owner's words: "I can on admin dashboard to see his exact location
// by clicking on position actuelle".
//
// One component rather than an anchor hand-rolled per screen, because the
// point of the request was that taxi and delivery should behave the SAME. A
// surface added later gets this by using it.
//
// ── OUR MAP, NOT GOOGLE'S ─────────────────────────────────────────────────
// The label opens /admin/live focused on the point, not Google Maps. Google
// shows the spot and nothing else; the live map shows the spot WITH THE FLEET
// AROUND IT, and "who is near this" is the question a dispatcher is actually
// asking. That is the whole reason the desk has its own map.
//
// The route link beside it still goes to Google, deliberately: "how far is
// this, and how long" is a routing question our map does not answer and Google
// does. Two links, two different questions.
//
// ── BOTH ENDS, FROM EITHER END ────────────────────────────────────────────
// A row that knows both ends passes `journey`, and then EITHER label opens the
// map showing the whole trip. The owner asked for exactly this in one breath:
// "his exact location ... AND WHERE HE IS GOING TO". Answering only the half
// that was clicked would have made them click twice and hold the other half in
// their head.
//
// Which end was clicked deliberately does not change the link. The map frames
// every focus point it is given, so both clicks want the same picture; making
// them differ would only mean the operator saw less depending on which word
// they happened to hit.

/** One end of a job: what the row calls it, and where it actually is. */
type Place = {
  label?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export function PlaceLink({
  label,
  lat,
  lng,
  journey,
  className,
}: {
  /** What the row says. Shown whether or not there is a pin behind it. */
  label: string | null | undefined;
  lat?: number | null;
  lng?: number | null;
  /** Both ends of the job this place belongs to, when the row has them. Given
   *  it, the link shows the whole trip instead of the one end clicked. */
  journey?: { from?: Place | null; to?: Place | null } | null;
  className?: string;
}) {
  const text = (label ?? "").trim();
  // No coordinates is the ordinary case for a request typed as an address, so
  // it must read as normal text and not as a broken link.
  if (!isPoint(lat, lng)) {
    return <span className={className}>{text || "—"}</span>;
  }

  const from = journey?.from;
  const to = journey?.to;
  // Whole trip when the row knows it; this one end when it does not.
  const live = journey
    ? liveMapHref({
        lat: from?.lat, lng: from?.lng, label: from?.label,
        toLat: to?.lat, toLng: to?.lng, toLabel: to?.label,
      })
    : liveMapHref({ lat, lng, label: text });

  // ── OFF THE ISLAND ──────────────────────────────────────────────────────
  // Our fleet map covers Rodrigues, so liveMapHref refuses a fix from anywhere
  // else — a Mauritius-mainland coordinate, say. That refusal must not turn a
  // location the operator could previously open into three dead words. The
  // point is real; it is just not somewhere our drivers are. Google can show
  // it, so Google gets that one.
  const offIsland = live === null;
  const href = live ?? pinUrl(lat as number, lng as number);

  return (
    <a
      href={href}
      // A new tab on purpose: a dispatcher mid-dispatch must not lose the desk
      // and the row they were working.
      target="_blank"
      rel="noopener noreferrer"
      // The desk is a dense screen; the affordance is the underline on hover
      // plus the pin, not a button.
      className={cn(
        "inline-flex items-baseline gap-1 underline-offset-4 hover:text-yellow hover:underline",
        className,
      )}
      title={
        offIsland
          ? `${text || "This place"} — outside Rodrigues, so it opens in Google Maps`
          : `${text || "This place"} — open it on the live map, with the drivers around it`
      }
    >
      {text || "See on map"}
      <MapPin size={11} className="shrink-0 translate-y-px" aria-hidden />
      <span className="sr-only">
        {offIsland
          ? "— outside Rodrigues, opens in Google Maps"
          : "— opens the live operations map, focused here"}
      </span>
    </a>
  );
}

/**
 * The journey rather than either end of it.
 *
 * What a dispatcher is usually deciding is how far this job is and roughly how
 * long — a question neither pin answers on its own. No `dir_action=navigate`:
 * they are sitting at a desk, looking.
 */
export function RouteLink({
  fromLat,
  fromLng,
  toLat,
  toLng,
  className,
}: {
  fromLat?: number | null;
  fromLng?: number | null;
  toLat?: number | null;
  toLng?: number | null;
  className?: string;
}) {
  if (!isPoint(fromLat, fromLng) || !isPoint(toLat, toLng)) return null;
  return (
    <a
      href={routeUrl(
        { lat: fromLat as number, lng: fromLng as number },
        { lat: toLat as number, lng: toLng as number },
      )}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1 text-[#B0B0B0] underline-offset-4 hover:text-yellow hover:underline",
        className,
      )}
    >
      <Route size={12} aria-hidden /> See the route
    </a>
  );
}
