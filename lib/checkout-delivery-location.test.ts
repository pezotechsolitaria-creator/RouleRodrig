import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { CHECKOUT_COPY } from "./checkout/copy.i18n";

// ── THE DELIVERY ORDER THAT COULD NOT BE PLACED ─────────────────────────────
//
// CheckoutForm gates submission on
//
//     const locationReady = !needsLocation || coords !== null;
//
// and until now the only thing on the page that could set `coords` was
// navigator.geolocation.getCurrentPosition(). Three ordinary people could
// therefore never complete a delivery order:
//
//   - anyone who declines the browser permission prompt
//   - anyone whose device returns no fix (desktop, or a phone indoors)
//   - anyone ordering to an address they are not standing at — from work to
//     home, from a hotel to a friend — which is not an edge case, it is a
//     large share of deliveries
//
// The product said so itself. The `unsupported` string read "This device can't
// share a location. Choose pickup instead": the documented remedy for a
// delivery order was to stop having it delivered.
//
// The fix is the component already built for /deliver and /taxi. These tests
// exist because the failure is invisible — the page renders perfectly, the
// button is simply never enabled — so nothing but an explicit check will catch
// it coming back.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const FORM = "components/checkout/CheckoutForm.tsx";
const LANGS = ["en", "fr", "cr"] as const;

describe("a delivery address can be given without GPS", () => {
  it("offers the map beside the GPS button, not only after it fails", () => {
    const src = read(FORM);
    expect(src).toContain("setPinning(true)");
    expect(src).toContain("c.form.location.pin.open");
    // Beside, not behind: the pin button must not be inside a branch that only
    // renders once locationError is set.
    const pinAt = src.indexOf("c.form.location.pin.open");
    const errAt = src.indexOf("{locationError && ");
    expect(pinAt).toBeGreaterThan(0);
    expect(pinAt).toBeLessThan(errAt);
  });

  it("sets the coordinates the submit gate actually reads", () => {
    // Anything else — a separate piece of state, a ref — would render the
    // button without unblocking it, which is the original bug wearing a map.
    const src = read(FORM);
    expect(src).toMatch(/onConfirm=\{\(\{ name, lat, lng \}\) => \{[\s\S]*?setCoords\(\{ lat, lng \}\)/);
  });

  it("feeds the pinned name into the directions the driver reads", () => {
    const src = read(FORM);
    expect(src).toContain("setDeliveryInstructions(name)");
    expect(src).toContain("initialName={deliveryInstructions}");
  });

  it("clears a stale permission error once a spot is pinned", () => {
    // Leaving "We couldn't get your location" on screen under a completed
    // answer tells somebody the thing they just did did not work.
    const src = read(FORM);
    expect(src).toMatch(/setCoords\(\{ lat, lng \}\)[\s\S]{0,200}setLocationError\(null\)/);
  });

  it("keeps Leaflet out of the checkout bundle until the sheet opens", () => {
    const src = read(FORM);
    expect(src).toMatch(/dynamic\(\(\) => import\("@\/components\/PinOnMap"\)/);
    expect(src).toContain("ssr: false");
  });
});

describe("the copy stops telling people to give up", () => {
  it("no longer answers a missing GPS with 'choose pickup instead'", () => {
    for (const l of LANGS) {
      const c = CHECKOUT_COPY[l].form.location;
      expect(c.unsupported.toLowerCase(), l).not.toMatch(/pickup|retrait|al pran li/);
    }
  });

  it("points at the map in every language, on both failure paths", () => {
    for (const l of LANGS) {
      const c = CHECKOUT_COPY[l].form.location;
      const map = l === "fr" ? "carte" : l === "cr" ? "kart" : "map";
      expect(c.unsupported.toLowerCase(), `${l}.unsupported`).toContain(map);
      expect(c.denied.toLowerCase(), `${l}.denied`).toContain(map);
    }
  });

  it("gives the sheet real words in all three languages", () => {
    for (const l of LANGS) {
      const pin = CHECKOUT_COPY[l].form.location.pin;
      for (const [k, v] of Object.entries(pin)) {
        expect(typeof v, `${l}.pin.${k}`).toBe("string");
        expect(String(v).trim(), `${l}.pin.${k}`).not.toBe("");
      }
    }
  });
});
