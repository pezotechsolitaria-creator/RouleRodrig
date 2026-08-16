import { describe, it, expect } from "vitest";
import { canEdit, parseEditors, visibleWorlds, type WorldScope } from "./access";
import { WORLD_IDS } from "./types";

// The permission boundary. It is small enough to read in a minute and is the
// only thing standing between "an editor who looks after Curated" and the rest
// of the site, so every branch of it is asserted rather than assumed.

describe("parseEditors", () => {
  it("reads name, code and worlds", () => {
    const got = parseEditors("marie:s3cret:curated,explore");
    expect(got).toEqual([{ name: "marie", code: "s3cret", worlds: ["curated", "explore"] }]);
  });

  it("reads several editors", () => {
    const got = parseEditors("marie:a:curated; jean:b:stays");
    expect(got.map((e) => e.name)).toEqual(["marie", "jean"]);
  });

  it("drops an entry with no code rather than creating one that opens with nothing", () => {
    expect(parseEditors("marie::curated")).toEqual([]);
    expect(parseEditors("marie")).toEqual([]);
  });

  it("drops world names it does not recognise, and the entry if none survive", () => {
    expect(parseEditors("marie:a:curated,nonsense")[0].worlds).toEqual(["curated"]);
    expect(parseEditors("marie:a:nonsense")).toEqual([]);
  });

  it("treats an unset variable as no editors at all", () => {
    expect(parseEditors("")).toEqual([]);
    expect(parseEditors("   ")).toEqual([]);
  });
});

describe("canEdit", () => {
  const owner: WorldScope = { kind: "admin", name: "Owner", worlds: "all" };
  const marie: WorldScope = { kind: "editor", name: "marie", worlds: ["curated"] };

  it("lets the owner into every world", () => {
    for (const w of WORLD_IDS) expect(canEdit(owner, w)).toBe(true);
  });

  it("lets an editor into their own world and no other", () => {
    expect(canEdit(marie, "curated")).toBe(true);
    expect(canEdit(marie, "stays")).toBe(false);
    expect(canEdit(marie, "global")).toBe(false);
  });

  it("refuses a signed-out visitor", () => {
    expect(canEdit(null, "curated")).toBe(false);
  });

  it("refuses a world name that does not exist, whoever is asking", () => {
    // Guards the API's `world` parameter: an unknown string must not fall
    // through to a lookup that creates a row.
    expect(canEdit(owner, "../../etc/passwd")).toBe(false);
    expect(canEdit(owner, "")).toBe(false);
  });
});

describe("visibleWorlds", () => {
  it("shows the owner everything, in the switcher's order", () => {
    expect(visibleWorlds({ kind: "admin", name: "Owner", worlds: "all" })).toEqual([...WORLD_IDS]);
  });

  it("shows an editor only what they may edit", () => {
    expect(
      visibleWorlds({ kind: "editor", name: "m", worlds: ["stays", "curated"] }),
    ).toEqual(["curated", "stays"]);
  });

  it("shows a signed-out visitor nothing", () => {
    expect(visibleWorlds(null)).toEqual([]);
  });
});
