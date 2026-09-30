import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrateQuickAccess } from "./quick-access";
import { DEFAULT_QUICK_ACCESS } from "./defaults";

// lib/content.ts imports "server-only", so its wiring is checked from source.
// The assertion is on the CALL, not on prose: a comment explaining the fix
// must not be able to satisfy it (see source-assertions memory).

const src = readFileSync(join(__dirname, "content.ts"), "utf8");
const code = src
  .split("\n")
  .filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l))
  .join("\n");

describe("tile migrations reach the live site on deploy", () => {
  it("getContent re-applies the code migrations AFTER the cross-deploy cache", () => {
    // 30 Sep 2026: applied only inside the cached parse, the eSIM tile shipped
    // and the homepage kept showing Fishing from a blob the old build cached.
    expect(code).toMatch(/withCodeMigrations\(\s*withoutHidden\(\s*await readPublicContentAt\(/);
  });

  it("re-applying a migration to already-migrated content changes nothing", () => {
    const once = migrateQuickAccess(DEFAULT_QUICK_ACCESS);
    expect(migrateQuickAccess(once)).toEqual(once);
  });
});
