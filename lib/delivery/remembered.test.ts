import { describe, it, expect } from "vitest";
import {
  forgetContact,
  readContact,
  readPlaces,
  rememberContact,
  rememberPlace,
  type RememberedPlace,
} from "./remembered";

function fakeStore(seed: Record<string, string> = {}) {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    raw: m,
  };
}

const hostile = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

const PLACE = (over: Partial<RememberedPlace> = {}): RememberedPlace => ({
  id: "port-mathurin",
  name: "Port Mathurin",
  area: "Town centre",
  lat: -19.68,
  lng: 63.41,
  ...over,
});

describe("the phone remembers who is holding it", () => {
  it("gives the name and number back on the next request", () => {
    const s = fakeStore();
    rememberContact({ name: "Marie", phone: "+230 5712 3456", email: "M@Example.COM " }, s);
    const c = readContact(s);
    expect(c?.name).toBe("Marie");
    expect(c?.phone).toBe("+230 5712 3456");
    // Lower-cased on the way in: the address is a lookup key for a guest
    // getting back to their own request, and case must not be able to lose it.
    expect(c?.email).toBe("m@example.com");
  });

  it("treats a stored blank as nothing stored", () => {
    // Prefilling empty strings over empty strings helps nobody, and it would
    // make the "we remembered you" path fire on a form nobody has finished.
    const s = fakeStore();
    rememberContact({ name: "  ", phone: "", email: "" }, s);
    expect(readContact(s)).toBeNull();
  });

  it("forgets on request", () => {
    const s = fakeStore();
    rememberContact({ name: "Marie", phone: "+23057123456", email: "" }, s);
    forgetContact(s);
    expect(readContact(s)).toBeNull();
  });

  it("survives garbage and a blocked browser", () => {
    expect(readContact(fakeStore({ rr_delivery_contact: "{{{" }))).toBeNull();
    expect(readContact(fakeStore({ rr_delivery_contact: '"a string"' }))).toBeNull();
    expect(readContact(hostile)).toBeNull();
    expect(() => rememberContact({ name: "x", phone: "y", email: "" }, hostile)).not.toThrow();
  });
});

describe("the places you actually use", () => {
  it("puts the most recent first", () => {
    const s = fakeStore();
    rememberPlace(PLACE(), s);
    rememberPlace(PLACE({ id: "mont-lubin", name: "Mont Lubin" }), s);
    expect(readPlaces(s).map((p) => p.name)).toEqual(["Mont Lubin", "Port Mathurin"]);
  });

  it("moves a repeat to the top instead of storing it twice", () => {
    const s = fakeStore();
    rememberPlace(PLACE(), s);
    rememberPlace(PLACE({ id: "mont-lubin", name: "Mont Lubin" }), s);
    rememberPlace(PLACE(), s);
    expect(readPlaces(s).map((p) => p.name)).toEqual(["Port Mathurin", "Mont Lubin"]);
  });

  it("keys on the NAME, so two hand-typed addresses both survive", () => {
    // Everything typed by hand arrives with id "custom". Keying on the id would
    // let each new one overwrite the last, so a person who lives up a track
    // would never accumulate a single remembered place.
    const s = fakeStore();
    rememberPlace(PLACE({ id: "custom", name: "Chez Anita, Baie Malgache", lat: null, lng: null }), s);
    rememberPlace(PLACE({ id: "custom", name: "L'atelier, Camp du Roi", lat: null, lng: null }), s);
    expect(readPlaces(s)).toHaveLength(2);
  });

  it("refuses to remember a live GPS fix", () => {
    // "My current location" is not a place you can return to — the coordinates
    // were wherever somebody was standing that day. Top of the list, pointing
    // at last week.
    const s = fakeStore();
    rememberPlace(PLACE({ id: "gps", name: "My current location" }), s);
    expect(readPlaces(s)).toEqual([]);
  });

  it("keeps only the last four", () => {
    const s = fakeStore();
    for (const n of ["a", "b", "c", "d", "e", "f"]) {
      rememberPlace(PLACE({ id: n, name: n }), s);
    }
    expect(readPlaces(s).map((p) => p.name)).toEqual(["f", "e", "d", "c"]);
  });

  it("ignores nothing, and a place with no name", () => {
    const s = fakeStore();
    expect(rememberPlace(null, s)).toEqual([]);
    expect(rememberPlace(PLACE({ name: "   " }), s)).toEqual([]);
  });

  it("keeps the coordinates, which are the point", () => {
    // A remembered place with no lat/lng is a remembered STRING, and dispatch
    // had no origin to work from for exactly that reason (M145).
    const s = fakeStore();
    rememberPlace(PLACE(), s);
    expect(readPlaces(s)[0]).toMatchObject({ lat: -19.68, lng: 63.41 });
  });

  it("survives garbage and a blocked browser", () => {
    expect(readPlaces(fakeStore({ rr_delivery_places: "nope" }))).toEqual([]);
    expect(readPlaces(fakeStore({ rr_delivery_places: '{"a":1}' }))).toEqual([]);
    // A half-corrupt array keeps the good entries rather than dropping all.
    expect(
      readPlaces(fakeStore({ rr_delivery_places: JSON.stringify([PLACE(), { id: 1 }]) })),
    ).toHaveLength(1);
    expect(readPlaces(hostile)).toEqual([]);
    expect(() => rememberPlace(PLACE(), hostile)).not.toThrow();
  });
});
