import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// ── EVERY NETWORK POLL GOES THROUGH ONE CLOCK ───────────────────────────────
//
// Ten screens polled Supabase on a timer, and eight of them kept polling a tab
// nobody was looking at. An admin tab left open overnight was billing thousands
// of requests for numbers no one could see — measured, not guessed: overnight
// traffic sat at ~3,600 requests an hour with nobody on the island awake.
//
// The same eight also depended on the callback's identity, which is the exact
// shape that turned the kitchen screen into an unbounded fetch loop.
//
// usePolling fixes both at once, so the rule this guards is simple: a polling
// screen uses the hook, and does not hand-roll the timer again.

const ROOTS = ["app", "components"];

function sourceFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * Hand-rolled timers that fetch. Animation and clock-tick intervals are not
 * polls and are left alone — the test is about network calls, not setInterval.
 */
function handRolledPolls(): string[] {
  const found: string[] = [];
  for (const file of ROOTS.flatMap((r) => sourceFiles(join(process.cwd(), r)))) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/setInterval\(/g)) {
      let i = m.index + m[0].length;
      let depth = 1;
      while (i < src.length && depth > 0) {
        if (src[i] === "(") depth++;
        else if (src[i] === ")") depth--;
        i++;
      }
      const call = src.slice(m.index, i);
      const ms = /,\s*([0-9_]+)\s*\)$/.exec(call);
      if (!ms) continue;
      if (Number(ms[1].replace(/_/g, "")) < 5000) continue; // a ticker, not a poll
      if (!/fetch|load|pull|refresh/i.test(call)) continue;

      const line = src.slice(0, m.index).split("\n").length;
      found.push(`${file.replace(process.cwd(), "")}:${line}`);
    }
  }
  return found;
}

describe("nothing polls a tab nobody is looking at", () => {
  it("routes every network poll through usePolling", () => {
    const offenders = handRolledPolls().filter(
      // KitchenBoard keeps its own timer on purpose: it is the one screen that
      // is SUPPOSED to keep running while backgrounded — a kitchen tablet is
      // propped up and mounted, and useWakeLock holds the screen awake for it.
      // Its interval is already ref-latched and mount-once; app/kitchen/
      // board-contract.test.ts guards that shape.
      (f) => !f.includes("kitchen"),
    );

    expect(
      offenders,
      "these hand-roll a polling timer instead of using usePolling, so they " +
        "keep hitting Supabase while hidden and re-subscribe on callback identity:\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });
});

describe("the hook carries both lessons", () => {
  const SRC = readFileSync(join(process.cwd(), "lib/use-polling.ts"), "utf8");

  it("reads the callback through a ref so identity churn cannot rebuild the loop", () => {
    expect(SRC).toMatch(/const latest = useRef\(fn\)/);
    expect(SRC).toMatch(/void latest\.current\(\)/);
  });

  it("keeps fn OUT of the interval effect's dependencies", () => {
    // The whole fault. `[load]` re-subscribes on every render where load is a
    // new function, and the effect's first act is to fetch.
    const effect = SRC.slice(SRC.indexOf("if (!enabled) return;"));
    const deps = /\}, \[([^\]]*)\]\);/.exec(effect);
    expect(deps, "the interval effect lost its dependency array").toBeTruthy();
    expect(deps![1]).not.toMatch(/\bfn\b/);
  });

  it("stops while the tab is hidden and takes one read on the way back", () => {
    expect(SRC).toContain("visibilitychange");
    expect(SRC).toMatch(/visibilityState === "visible"/);
    const onVis = SRC.slice(SRC.indexOf("const onVisibility"));
    expect(onVis.slice(0, 400)).toMatch(/tick\(\);/);
  });

  it("can be switched off entirely, for something that has settled", () => {
    expect(SRC).toMatch(/enabled = true/);
    expect(SRC).toMatch(/if \(!enabled\) return;/);
  });
});
