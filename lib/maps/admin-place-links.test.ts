import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { isPoint, pinUrl, routeUrl } from "./nav";

const read = (p: string) => readFileSync(p, "utf8");

// ── "WHERE IS THIS, ACTUALLY" ───────────────────────────────────────────────
//
// Every operations surface showed a location as words and nothing else, while
// the coordinates sat unused in the same row. The words are often useless: a
// customer who taps "use my location" stores the label "Ma position actuelle",
// and on 9 Sept a real taxi request arrived reading exactly that with a precise
// GPS fix beside it that no screen displayed.

describe("a pin the desk can open", () => {
  it("points at the coordinates", () => {
    expect(pinUrl(-19.7343743540304, 63.4663899164507)).toBe(
      "https://www.google.com/maps/search/?api=1&query=-19.7343743540304,63.4663899164507",
    );
  });

  it("does NOT start turn-by-turn", () => {
    // The dispatcher is not going anywhere. Guidance from the office would be
    // absurd — this is the one place /maps/search/ is the right shape.
    expect(pinUrl(-19.7, 63.4)).not.toContain("dir_action=navigate");
  });

  it("the route link shows the journey without hijacking anything", () => {
    const u = routeUrl({ lat: -19.73, lng: 63.46 }, { lat: -19.71, lng: 63.43 });
    expect(u).toContain("origin=-19.73,63.46");
    expect(u).toContain("destination=-19.71,63.43");
    expect(u).not.toContain("dir_action=navigate");
  });

  it("half a coordinate is not a place", () => {
    expect(isPoint(-19.7, null)).toBe(false);
    expect(isPoint(0, 0)).toBe(false);
    expect(isPoint(-19.7343743540304, 63.4663899164507)).toBe(true);
  });
});

describe("the component degrades to plain text", () => {
  const src = read("components/admin/PlaceLink.tsx");

  it("a row with no pin renders as words, not a dead link", () => {
    // Ordinary for a request typed as an address. It must not read as broken.
    expect(src).toMatch(/if \(!isPoint\(lat, lng\)\)/);
    expect(src).toMatch(/<span className=\{className\}>\{text \|\| "—"\}<\/span>/);
  });

  it("the route link disappears unless BOTH ends are known", () => {
    expect(src).toMatch(/if \(!isPoint\(fromLat, fromLng\) \|\| !isPoint\(toLat, toLng\)\) return null;/);
  });

  it("it tells a screen reader what the link does", () => {
    expect(src).toMatch(/sr-only/);
  });

  it("a point outside Rodrigues still opens somewhere", () => {
    // The live map covers this island only, so liveMapHref refuses a fix from
    // anywhere else. Without a fallback that refusal would silently turn a
    // location the operator could previously open into three dead words.
    expect(src).toContain("pinUrl(");
    expect(src).toMatch(/live \?\? pinUrl\(/);
  });
});

describe("the link carries the whole trip, not the end that was clicked", () => {
  // The owner asked for both halves in one breath — "his exact location AND
  // WHERE HE IS GOING TO". `?to=` shipped once as dead code: liveMapHref
  // accepted toLat/toLng and not one caller passed them, so every focused map
  // drew a single pin and the destination stayed in the dispatcher's head.
  const src = read("components/admin/PlaceLink.tsx");

  it("PlaceLink forwards both ends to the URL builder", () => {
    expect(src).toMatch(/toLat: to\?\.lat, toLng: to\?\.lng, toLabel: to\?\.label,/);
  });

  it("every desk that knows both ends passes them", () => {
    const rides = read("app/admin/rides/RidesDesk.tsx");
    expect(rides).toContain("function rideTrip(");
    // Both ends of both surfaces: the queue row and the dispatch card.
    expect(rides.match(/journey=\{rideTrip\((?:r|ride)\)\}/g) ?? []).toHaveLength(4);

    const del = read("app/admin/deliveries/DeliveryBoard.tsx");
    expect(del).toContain("function liveTrip(");
    expect(del).toContain("function reqTrip(");
    expect(del.match(/journey=\{(?:liveTrip|reqTrip)\((?:d|r)\)\}/g) ?? []).toHaveLength(3);
  });

  it("the map page reads the focus back and draws both pins", () => {
    const page = read("app/admin/live/page.tsx");
    expect(page).toContain("readMapFocus");
    const map = read("components/admin/LiveOperationsMap.tsx");
    expect(map).toContain('kind: "pickup"');
    expect(map).toContain('kind: "dropoff"');
    // The pin the dispatcher clicked must not wait on the fleet request.
    expect(map).toContain("loading && !board && focusPins.length === 0");
    // And an empty fleet must not be ASSERTED before the fleet has arrived.
    expect(map).toMatch(/focusPins\.length > 0 && board && !err && visible\.length === 0/);
  });
});

describe("taxi and delivery use the same component", () => {
  it("the taxi desk links both ends and the route", () => {
    const src = read("app/admin/rides/RidesDesk.tsx");
    expect(src).toContain("PlaceLink");
    expect(src).toContain("RouteLink");
    expect(src).toMatch(/lat=\{ride\.pickup_lat\}/);
    expect(src).toMatch(/lat=\{ride\.dropoff_lat\}/);
    // The queue list too, not just the dispatch card.
    expect(src).toMatch(/lat=\{r\.pickup_lat\}/);
  });

  it("the delivery board does the same", () => {
    const src = read("app/admin/deliveries/DeliveryBoard.tsx");
    expect(src).toContain("PlaceLink");
    expect(src).toContain("RouteLink");
    expect(src).toMatch(/lat=\{r\.pickupLat\}/);
    expect(src).toMatch(/lat=\{d\.dropoffLat\}/);
  });

  it("both APIs actually send the coordinates", () => {
    // The whole thing is inert without them, and both were selecting them away.
    expect(read("app/api/admin/rides/route.ts")).toContain("pickup_lat, pickup_lng, dropoff_lat, dropoff_lng");
    const mig = read("supabase/migrations/20260909200000_m196_the_desk_can_see_where_too.sql");
    // Matched with the trailing comma, so this counts the two EMITTED keys
    // and not the triple-quoted guards that also mention the name.
    expect(mig.match(/''pickupLat'',/g) ?? []).toHaveLength(2);
  });

  it("food and marketplace share the URL builder", () => {
    // They already had a working pin link; what they did not share was the
    // shape of the URL, which existed in four hand-rolled copies.
    for (const f of [
      "app/admin/food/OrderQueue.tsx",
      "app/admin/marketplace/ShopOrderQueue.tsx",
    ]) {
      expect(read(f), f).toContain("pinUrl(");
      expect(read(f), f).not.toContain("google.com/maps/search/?api=1&query=");
    }
  });
});
