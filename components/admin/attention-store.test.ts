import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── RENDERING THE SAME BELL TWICE SHOULD COST WHAT RENDERING IT ONCE COSTS ──
//
// AdminShell mounts <AdminBell/> twice on purpose: once in the desktop sidebar,
// once in the mobile top bar, with a CSS breakpoint hiding one. CSS hides;
// React still mounts. So when the poll lived inside the component there were
// two timers, and /api/admin/attention runs 21 Supabase queries
// (lib/admin/attention-load.ts) — 42 a minute, 2,520 an hour, from one open
// admin tab, continuing all night because nothing checked whether anyone was
// looking.

const BELL = readFileSync(join(process.cwd(), "components/admin/AdminBell.tsx"), "utf8");
const STORE = readFileSync(join(process.cwd(), "components/admin/attention-store.ts"), "utf8");
const SHELL = readFileSync(join(process.cwd(), "components/admin/AdminShell.tsx"), "utf8");

describe("the bell is mounted more than once and polls once", () => {
  it("is still mounted twice, which is why this matters", () => {
    // If this ever drops to one the guard below is not wrong, just less urgent.
    // If it grows, the shared store is the only reason that is free.
    const mounts = SHELL.match(/<AdminBell\s*\/>/g)?.length ?? 0;
    expect(mounts).toBeGreaterThanOrEqual(2);
  });

  it("AdminBell owns no timer and no fetch of its own", () => {
    const code = BELL.replace(/\/\*[\s\S]*?\*\//g, "")
      .split(/\r?\n/)
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    expect(code, "the poll belongs in attention-store, not in the component").not.toContain(
      "setInterval",
    );
    expect(code, "the fetch belongs in attention-store, not in the component").not.toContain(
      "/api/admin/attention",
    );
    expect(code).toContain("useSyncExternalStore");
  });

  it("the store counts subscribers, so the last bell to leave stops the timer", () => {
    expect(STORE).toMatch(/listeners\.size === 0/);
    expect(STORE).toContain("clearInterval");
  });

  it("the store stops polling a tab nobody is looking at", () => {
    expect(STORE).toContain("visibilitychange");
    expect(STORE).toMatch(/visibilityState === "visible"/);
  });

  it("does not re-render every bell when the numbers have not moved", () => {
    // useSyncExternalStore compares snapshots by identity, so handing it a new
    // object every minute would re-render on every tick for nothing.
    expect(STORE).toMatch(/if \(next\.total === snapshot\.total/);
  });
});
