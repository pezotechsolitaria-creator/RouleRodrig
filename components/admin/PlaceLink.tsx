import { MapPin, Route } from "lucide-react";
import { cn } from "@/lib/utils";
import { isPoint, pinUrl, routeUrl } from "@/lib/maps/nav";

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
// ── A PIN, NOT NAVIGATION ─────────────────────────────────────────────────
// lib/maps/nav.ts calls /maps/search/ the worst of its three shapes, and for a
// DRIVER it is — they want guidance and a pin costs two more taps. At a desk it
// is exactly right: the dispatcher is not going anywhere, they are answering
// "where is this person", and turn-by-turn from the office would be absurd.

export function PlaceLink({
  label,
  lat,
  lng,
  className,
}: {
  /** What the row says. Shown whether or not there is a pin behind it. */
  label: string | null | undefined;
  lat?: number | null;
  lng?: number | null;
  className?: string;
}) {
  const text = (label ?? "").trim();
  // No coordinates is the ordinary case for a request typed as an address, so
  // it must read as normal text and not as a broken link.
  if (!isPoint(lat, lng)) {
    return <span className={className}>{text || "—"}</span>;
  }
  return (
    <a
      href={pinUrl(lat as number, lng as number)}
      target="_blank"
      rel="noopener noreferrer"
      // The desk is a dense screen; the affordance is the underline on hover
      // plus the pin, not a button.
      className={cn(
        "inline-flex items-baseline gap-1 underline-offset-4 hover:text-yellow hover:underline",
        className,
      )}
      title={`${text || "This place"} — open the exact spot on a map`}
    >
      {text || "See on map"}
      <MapPin size={11} className="shrink-0 translate-y-px" aria-hidden />
      <span className="sr-only">— opens the exact spot on a map</span>
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
