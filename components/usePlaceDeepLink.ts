"use client";

import { useEffect, useRef } from "react";
import type { RecommendedPlace } from "@/lib/defaults";
import { PLACE_PARAM, placeAnchorId } from "@/lib/place-href";

// The other half of lib/place-href.ts. A link that names a place is only worth
// sending if the page it lands on opens that place, so both surfaces holding a
// PlaceDetailModal read the parameter through this one hook.
//
// Fires ONCE per page load. It deliberately does not clean the URL afterwards:
// the address stays shareable, which is the whole point of naming the item in
// it — the owner can send a customer straight to one trip.
export function usePlaceDeepLink(
  places: RecommendedPlace[],
  open: (p: RecommendedPlace) => void,
) {
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    const wanted = new URLSearchParams(window.location.search).get(PLACE_PARAM);
    if (!wanted) return;
    const target = places.find((p) => p.id === wanted);
    // Not on this page — a stale link, or the owner unpublished it. Leaving the
    // listing as it is beats opening something the visitor did not ask for.
    if (!target) return;

    done.current = true;
    // Scroll first, so closing the modal leaves them looking at the card they
    // tapped rather than at the top of a list they never chose.
    document
      .getElementById(placeAnchorId(target.id))
      ?.scrollIntoView({ block: "center" });
    open(target);
  }, [places, open]);
}
