import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSearcher, segments } from "./engine";
import { synonymGroups } from "./build";
import { normalize } from "./normalize";
import type { SearchIndex } from "./types";

// ── What the search finds, on the REAL catalogue ─────────────────────────────
//
// The fixture is the live English index (117 entries, captured 4 Oct 2026),
// with its synonyms rebuilt here from today's vocabulary plus a copy of the
// search_synonyms table — so a change to lib/search/aliases.ts is tested, not
// the copy baked into the snapshot.
//
// Every case below was a real failure of plain Fuse.js before the rules in
// engine.ts existed: "stay" found Petrol STATion, "honey" found the police,
// "massage" listed every boat trip, "atm" found Port MATHurin.

const dir = join(process.cwd(), "lib/search/__fixtures__");
const index: SearchIndex = JSON.parse(readFileSync(join(dir, "index-en.json"), "utf8"));
index.syn = synonymGroups(JSON.parse(readFileSync(join(dir, "search-synonyms.json"), "utf8")));
const s = createSearcher(index);

const top = (q: string) => s.search(q).top?.doc.t[0] ?? null;
/** Every hit, not just the four a group shows. */
const all = (q: string) => {
  const o = s.search(q, 100);
  return [o.top, ...o.groups.flatMap((g) => g.hits)].filter(Boolean).map((h) => h!.doc);
};

describe("finds the place through typos, accents and partial words", () => {
  it.each([
    ["pointe coton", /pointe coton/i],
    ["ile aux coco", /île aux cocos/i],
    ["rivier banane", /rivière banane/i],
    ["trou d argent", /trou d'argent/i],
    ["st francois", /st françois/i],
    ["caverne", /caverne/i],
    ["mont limon", /mont limon/i],
    ["burgman", /burgman/i],
    ["lobster", /lobster/i],
    ["les insepara", /inséparables/i],
  ])("%s", (q, want) => {
    expect(top(q)).toMatch(want);
  });
});

describe("understands the words visitors use", () => {
  it("French and Kreol for beaches list the beaches", () => {
    // Things that merely mention beaches ("East-Coast Beach Run") may follow;
    // a beach must lead, and all twenty must be there.
    for (const q of ["plage", "plages", "laplaz"]) {
      expect(s.search(q).top?.doc.k, q).toBe("beach");
      expect(all(q).filter((d) => d.k === "beach").length, q).toBe(index.docs.filter((d) => d.k === "beach").length);
    }
  });

  it("moto and voiture find the fleet", () => {
    expect(s.search("moto").top?.doc.k).toBe("vehicle");
    expect(s.search("voiture").top?.doc.k).toBe("vehicle");
  });

  it("stay / hotel / hébergement list the stays first — not Petrol STATion", () => {
    for (const q of ["stay", "hotel", "hebergement"]) {
      expect(s.search(q).top?.doc.k, q).toBe("stay");
      expect(all(q).some((d) => /petrol/i.test(d.t[0])), q).toBe(false);
    }
  });

  it("a misspelt activity is found through the vocabulary", () => {
    expect(top("snorkling")).toMatch(/apnée/i);
  });

  it("aéroport finds the airport transfer", () => {
    expect(top("aeroport")).toMatch(/airport transfer/i);
  });
});

describe("does not invent matches", () => {
  it("one activity is not a request for every activity", () => {
    expect(all("massage").map((d) => d.t[0])).toEqual([expect.stringMatching(/massage/i)]);
  });

  it("a synonym phrase is never split into words", () => {
    // "honey" ↔ "miel de rodrigues" once searched for "rodrigues".
    expect(all("honey").some((d) => /police|fire station/i.test(d.t[0]))).toBe(false);
  });

  it("short queries allow almost no error", () => {
    expect(all("atm")).toEqual([]);
    expect(all("kite")).toEqual([]);
  });

  it("a stop word never becomes a synonym (the shop table maps the → tea)", () => {
    expect(all("the beach").some((d) => /tea/i.test(d.t[0]))).toBe(false);
  });

  it("gibberish finds nothing, and one letter searches nothing", () => {
    expect(s.search("xyzq").total).toBe(0);
    expect(s.search("a").total).toBe(0);
  });

  it("fuel finds fuel, not every kind of station", () => {
    expect(all("fuel").some((d) => /landing station|police station/i.test(d.t[0]))).toBe(false);
    expect(top("fuel")).toMatch(/petrol/i);
  });
});

describe("emergencies are one word away", () => {
  it.each(["police", "hospital", "pharmacy"])("%s", (q) => {
    expect(s.search(q).top?.doc.k).toBe("help");
  });
});

describe("groups and highlighting", () => {
  it("never shows the same entry twice", () => {
    const o = s.search("scooter");
    const ids = [o.top, ...o.groups.flatMap((g) => g.hits)].filter(Boolean).map((h) => h!.doc.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("marks the matched run, not scattered letters", () => {
    const seg = s.search("pointe coton").top!.title;
    expect(seg.some((x) => x.hit && normalize(x.text).includes("pointe"))).toBe(true);
    expect(segments("Anse Ali", [[0, 0], [5, 7]], 5)).toEqual([
      { text: "Anse ", hit: false },
      { text: "Ali", hit: true },
    ]);
  });
});
