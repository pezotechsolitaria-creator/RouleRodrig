import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ── A NEW ORDER REACHED NO PHONE (M168) ─────────────────────────────────────
//
// order_created stopped firing WhatsApp on purpose, and the reason was sound:
// "a message per order through a free hobby service ... buried the one alert
// that actually needs to interrupt someone". It was replaced with web push.
//
// But push dies with the browser — cleared site data, a phone that never added
// the PWA, a permission declined once and unaskable afterwards. In every one of
// those a new order was announced to nobody at all.
//
// ntfy has no per-message budget, so the objection that removed the WhatsApp
// does not apply to it. The alert comes back on a channel that can afford it.
//
// ── AND IT IS FILED BY WHAT THE STORE IS ───────────────────────────────────
// The staff slot subscribes to `food` and `deliveries` only. A kitchen order
// filed under `admin` would be invisible to the helper whose job it is; a shop
// order filed under `food` would put the owner's marketplace on the helper's
// phone. The category is the access-control boundary, not a label.

const ROOT = join(__dirname, "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const ORDER_PLACED = read("lib", "notifications", "order-placed.ts");

describe("a new order raises a phone alert", () => {
  it("queues order.placed alongside the push", () => {
    expect(ORDER_PLACED).toContain('type: "order.placed"');
    // The push stays. This is a second channel, not a replacement: push is
    // instant where it works, ntfy is what survives a closed browser.
    expect(ORDER_PLACED).toContain("pushToAdmins({");
  });

  it("files it by what the store IS", () => {
    expect(ORDER_PLACED).toContain(
      'category: store.kind === "kitchen" ? "food" : "admin"',
    );
    // ...which means the store query has to actually fetch kind.
    expect(ORDER_PLACED).toContain('.select("merchant_id, name, kind")');
  });

  it("fires once per order, not once per sweep", () => {
    expect(ORDER_PLACED).toContain("dedupeKey: `order.placed:${input.orderId}`");
  });

  it("cannot make a successful order look failed", () => {
    // The order is already committed by the time this runs.
    const block = ORDER_PLACED.slice(ORDER_PLACED.indexOf('type: "order.placed"'));
    expect(block.slice(0, 1400)).toContain(".catch(");
    expect(ORDER_PLACED).toContain("void enqueueNotification({");
  });
});

describe("the category boundary the staff slot depends on", () => {
  it("keeps food_ready under food, not system", () => {
    // M132 fixed exactly this once: filed under `system`, it never reached a
    // slot subscribed to `food` — which is the kitchen's own alert. If it
    // regresses, the helper stops being told the one thing that is theirs.
    for (const f of [
      ["app", "api", "admin", "food", "orders", "route.ts"],
      ["app", "api", "merchant", "orders", "[id]", "route.ts"],
    ]) {
      const src = read(...f);
      if (!src.includes('type: "food_ready"')) continue;
      const at = src.indexOf('type: "food_ready"');
      const near = src.slice(at, at + 900);
      expect(near, f.join("/")).toContain('category: "food"');
      expect(near, f.join("/")).not.toContain('category: "system"');
    }
  });

  it("keeps money out of the categories a helper can subscribe to", () => {
    // A helper's slot takes `deliveries` + `food`. Anything about money must
    // be filed somewhere else, or the boundary leaks on the first payment.
    const pay = read("app", "api", "merchant", "orders", "[id]", "confirm-payment", "route.ts");
    expect(pay).toContain('category: "payments"');
  });
});
