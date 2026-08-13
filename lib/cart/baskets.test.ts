import { describe, it, expect } from "vitest";
import {
  addToBaskets, setQuantity, clearBaskets, countItems, prune, migrateStored, isBasket,
  type Basket,
} from "./baskets";

const honey = (items: Basket["items"] = [{ variantId: "v-honey", quantity: 1 }]): Basket => ({
  storeId: "s-miel", storeName: "Miel de Rodrigues", items,
});
const craft = (items: Basket["items"] = [{ variantId: "v-basket", quantity: 1 }]): Basket => ({
  storeId: "s-vannerie", storeName: "Atelier Vannerie", items,
});

describe("addToBaskets — the marketplace", () => {
  it("opens a SECOND basket for a second shop instead of refusing", () => {
    const { baskets, result } = addToBaskets(
      [honey()],
      { storeId: "s-vannerie", storeName: "Atelier Vannerie", variantId: "v-basket", quantity: 1 },
      true,
    );
    expect(result).toBe("ok");
    expect(baskets).toHaveLength(2);
    expect(baskets.map((b) => b.storeId)).toEqual(["s-miel", "s-vannerie"]);
  });

  it("merges a repeat add into the existing line rather than duplicating it", () => {
    const { baskets } = addToBaskets(
      [honey()],
      { storeId: "s-miel", storeName: "Miel de Rodrigues", variantId: "v-honey", quantity: 2 },
      true,
    );
    expect(baskets).toHaveLength(1);
    expect(baskets[0].items).toEqual([{ variantId: "v-honey", quantity: 3 }]);
  });

  it("keeps each shop's lines in its own basket", () => {
    let state: Basket[] = [];
    state = addToBaskets(state, { storeId: "s-miel", storeName: "Miel", variantId: "v-honey", quantity: 1 }, true).baskets;
    state = addToBaskets(state, { storeId: "s-vannerie", storeName: "Vannerie", variantId: "v-basket", quantity: 3 }, true).baskets;
    expect(state.find((b) => b.storeId === "s-miel")!.items).toHaveLength(1);
    expect(state.find((b) => b.storeId === "s-vannerie")!.items[0].quantity).toBe(3);
  });

  it("refreshes a renamed shop's label instead of leaving a stale one", () => {
    const { baskets } = addToBaskets(
      [honey()],
      { storeId: "s-miel", storeName: "Miel de Rodrigues (Mont Lubin)", variantId: "v-honey", quantity: 1 },
      true,
    );
    expect(baskets[0].storeName).toBe("Miel de Rodrigues (Mont Lubin)");
  });

  it("ignores a nonsense quantity rather than writing it", () => {
    const { baskets } = addToBaskets([honey()], { storeId: "s-miel", storeName: "Miel", variantId: "v-x", quantity: 0 }, true);
    expect(baskets[0].items).toHaveLength(1);
  });
});

describe("addToBaskets — food and ticketing still hold one seller", () => {
  it("refuses a second kitchen so the caller can offer a swap", () => {
    const { baskets, result } = addToBaskets(
      [honey()],
      { storeId: "k-other", storeName: "Chez Banane", variantId: "v-curry", quantity: 1 },
      false,
    );
    expect(result).toBe("conflict");
    expect(baskets).toEqual([honey()]);
  });

  it("still accepts more from the SAME kitchen", () => {
    const { result } = addToBaskets(
      [honey()],
      { storeId: "s-miel", storeName: "Miel", variantId: "v-two", quantity: 1 },
      false,
    );
    expect(result).toBe("ok");
  });

  it("accepts the first seller into an empty domain", () => {
    const { result, baskets } = addToBaskets([], { storeId: "k1", storeName: "K", variantId: "v", quantity: 1 }, false);
    expect(result).toBe("ok");
    expect(baskets).toHaveLength(1);
  });
});

describe("setQuantity", () => {
  it("finds the basket by variant, so the caller cannot name the wrong shop", () => {
    const state = [honey(), craft()];
    const next = setQuantity(state, "v-basket", 5);
    expect(next.find((b) => b.storeId === "s-vannerie")!.items[0].quantity).toBe(5);
    expect(next.find((b) => b.storeId === "s-miel")!.items[0].quantity).toBe(1);
  });

  it("removing the last line removes the basket with it", () => {
    const next = setQuantity([honey(), craft()], "v-honey", 0);
    expect(next.map((b) => b.storeId)).toEqual(["s-vannerie"]);
  });

  it("leaves everything alone for a variant that is not in any basket", () => {
    const state = [honey(), craft()];
    expect(setQuantity(state, "v-ghost", 4)).toEqual(state);
  });
});

describe("clearBaskets", () => {
  it("clears ONE shop when told which", () => {
    expect(clearBaskets([honey(), craft()], "s-miel").map((b) => b.storeId)).toEqual(["s-vannerie"]);
  });

  it("clears the whole domain when told nothing", () => {
    expect(clearBaskets([honey(), craft()])).toEqual([]);
  });
});

describe("counting and pruning", () => {
  it("counts across every basket", () => {
    expect(countItems([honey([{ variantId: "a", quantity: 2 }]), craft([{ variantId: "b", quantity: 3 }])])).toBe(5);
  });

  it("drops baskets with nothing in them", () => {
    expect(prune([honey(), { storeId: "s-empty", storeName: "Empty", items: [] }])).toHaveLength(1);
  });
});

describe("migrateStored — nobody loses their shopping on a deploy", () => {
  it("lifts the one-object-per-domain layout into a list", () => {
    expect(migrateStored(null, honey())).toEqual([honey()]);
  });

  it("passes a current list through, dropping corrupt entries", () => {
    const stored = [honey(), { storeId: "", storeName: "broken", items: [] }, { nonsense: true }];
    expect(migrateStored(stored, null)).toEqual([honey()]);
  });

  it("returns null when there is genuinely nothing stored", () => {
    expect(migrateStored(null, null)).toBeNull();
    expect(migrateStored(undefined, "not a basket")).toBeNull();
  });

  it("does not mistake a half-written object for a basket", () => {
    expect(isBasket({ storeId: "s", items: [{ variantId: 1, quantity: "two" }] })).toBe(false);
    expect(isBasket({ storeId: "s", storeName: "S", items: [] })).toBe(true);
  });
});
