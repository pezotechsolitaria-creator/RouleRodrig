import {
  builtinBasemap,
  shouldFallBack,
  type BasemapId,
} from "./tiles";

// ── A GREY MAP IS THE WORST FAILURE THIS APP HAS ────────────────────────────
//
// Leaflet's answer to a tile it cannot fetch is to draw nothing. Whatever the
// cause — a metered quota spent, a rotated token, a URL restriction that stops
// matching a new preview domain — the customer watching their delivery sees a
// blank rectangle where the driver was, with no error, no retry and nothing to
// tap. The map does not look broken; it looks like the driver vanished.
//
// The free providers are still configured and still keyless, so there is always
// somewhere to go. This attaches that: count the failures, and past the limit
// swap the layer once.
//
// Kept out of tiles.ts deliberately. That module is imported by server code and
// stays free of Leaflet; this one needs the runtime to build the replacement
// layer, so the two are separate and only this one is client-only.

type Leaflet = typeof import("leaflet");
type LMap = import("leaflet").Map;
type LTileLayer = import("leaflet").TileLayer;

/**
 * Replace a failing overridden basemap with the free one it was configured over.
 *
 * Returns a teardown function. Safe to call for a built-in layer: shouldFallBack
 * refuses when there is nothing better to switch to, so the listener simply
 * never fires an action.
 */
export function guardTiles({
  L,
  map,
  layer,
  id,
  onSwap,
}: {
  L: Leaflet;
  map: LMap;
  layer: LTileLayer;
  id: BasemapId;
  /** Told the replacement layer, so a caller holding a ref can update it. */
  onSwap?: (next: LTileLayer) => void;
}): () => void {
  let errors = 0;
  // One way, once. Flapping between two providers as a connection recovers
  // redraws the whole map repeatedly, which reads as far more broken than
  // either provider having a bad minute.
  let swapped = false;

  const onError = () => {
    errors += 1;
    if (swapped || !shouldFallBack(id, errors)) return;
    swapped = true;

    const base = builtinBasemap(id).base;
    const next = L.tileLayer(base.url, {
      attribution: base.attribution,
      maxZoom: base.maxZoom,
      ...(base.maxNativeZoom ? { maxNativeZoom: base.maxNativeZoom } : {}),
      ...(base.subdomains ? { subdomains: base.subdomains } : {}),
    });

    // Add the replacement BEFORE removing the failed one. The other order
    // leaves a frame with no tile layer at all, which on a slow connection is
    // a visible flash of the empty map — the exact thing being prevented.
    next.addTo(map);
    map.removeLayer(layer);

    // Leaflet reads attribution off the layers present, so the credit corrects
    // itself: the footer stops naming a provider that is no longer drawing.
    onSwap?.(next);

    // Said once, quietly. Not a toast: the viewer does not need to know which
    // company is serving their tiles, and the owner needs to know the paid one
    // stopped answering.
    console.warn(
      `[tiles] ${id}: ${errors} tile errors from the configured provider — fell back to the built-in.`,
    );
  };

  layer.on("tileerror", onError);
  return () => layer.off("tileerror", onError);
}
