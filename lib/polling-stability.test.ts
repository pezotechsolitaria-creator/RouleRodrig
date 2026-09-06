import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// ── THE LOOP THAT BILLED 110,000 REQUESTS IN A DAY ──────────────────────────
//
// On 6 Sep 2026 the kitchen screen sent 36,915 kitchen_dashboard calls, 36,907
// claim_kitchen_invites WRITES and 37,747 auth checks in 24 hours — about two
// per second, sustained for five hours, from a screen nobody was touching.
//
// The poll interval was 15 seconds. The interval was never the problem.
//
//   const chime = useChime()                      // fresh object EVERY render
//   const load  = useCallback(..., [chime])       // so load is fresh every render
//   useEffect(() => { void load(); setInterval(load, 15_000) }, [load])
//
// useChime returned a bare object literal. Every member was stable; the wrapper
// was not. So the effect re-ran on every render, and its first act is to fetch.
// load() then calls setDash/setLastOk, which renders, which builds another
// wrapper. An unbounded fetch loop, throttled only by network latency — and
// useWakeLock keeps a mounted kitchen tablet awake, so it never even slowed.
//
// Nothing caught it: it type-checks, it lints, every test passed, and the only
// visible symptom was on a bill. These two guards encode the rule that was
// broken, because a comment explaining it would not have stopped the next one.

const ROOTS = ["app", "components", "lib"];

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

function allFiles(): string[] {
  return ROOTS.flatMap((r) => sourceFiles(join(process.cwd(), r)));
}

/** The body of a braced block starting at the first `{` at or after `from`. */
function block(src: string, from: number): string {
  const open = src.indexOf("{", from);
  if (open === -1) return "";
  let depth = 1;
  let i = open + 1;
  while (i < src.length && depth > 0) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") depth--;
    i++;
  }
  return src.slice(open, i);
}

/**
 * Local hooks that hand back a NEW object on every render.
 *
 * Returning a bare literal is not itself a bug — every consumer in this repo
 * but one destructures it immediately, which only ever reads stable members.
 * It becomes a bug the moment somebody keeps the whole object and puts it in a
 * dependency array, which is the second guard below.
 */
function unstableHooks(): Map<string, string[]> {
  const byFile = new Map<string, string[]>();
  for (const file of allFiles()) {
    const src = readFileSync(file, "utf8");
    const names: string[] = [];
    for (const m of src.matchAll(/function (use[A-Z]\w*)\s*\(/g)) {
      const body = block(src, m.index + m[0].length - 1);
      // A top-level `return {` — as opposed to `return useMemo(`.
      if (/\n {2}return \{/.test(body)) names.push(m[1]);
    }
    if (names.length) byFile.set(file, names);
  }
  return byFile;
}

describe("a polling effect never re-subscribes on every render", () => {
  it("keeps setInterval effects off unstable dependencies", () => {
    const unstable = new Set(Array.from(unstableHooks().values()).flat());
    const offenders: string[] = [];

    for (const file of allFiles()) {
      const src = readFileSync(file, "utf8");

      // Every identifier bound to a whole hook result rather than destructured:
      //   const chime = useChime()   <-- holds the object
      //   const { play } = useChime()  <-- fine, reads a stable member
      const held = new Map<string, string>();
      for (const m of src.matchAll(/const (\w+)\s*=\s*(use[A-Z]\w*)\(/g)) {
        if (unstable.has(m[2])) held.set(m[1], m[2]);
      }
      if (held.size === 0) continue;

      // Resolve one level of indirection: a useCallback that depends on a held
      // object is itself unstable, and that is exactly how the kitchen bug
      // reached the effect.
      const tainted = new Map(held);
      for (const m of src.matchAll(/const (\w+)\s*=\s*useCallback\(/g)) {
        const call = src.slice(m.index);
        const deps = /,\s*\[([^\]]*)\]\s*\)/.exec(call.slice(0, 4000));
        if (!deps) continue;
        for (const d of deps[1].split(",").map((s) => s.trim())) {
          if (held.has(d)) tainted.set(m[1], `${d} (${held.get(d)})`);
        }
      }

      for (const m of src.matchAll(/useEffect\(\(\)\s*=>\s*\{/g)) {
        const body = block(src, m.index + m[0].length - 1);
        if (!body.includes("setInterval")) continue;
        const after = src.slice(m.index + m[0].length - 1 + body.length, m.index + m[0].length + body.length + 200);
        const deps = /^\s*,\s*\[([^\]]*)\]/.exec(after);
        if (!deps) continue;
        for (const d of deps[1].split(",").map((s) => s.trim()).filter(Boolean)) {
          if (tainted.has(d)) {
            const line = src.slice(0, m.index).split("\n").length;
            offenders.push(
              `${file.replace(process.cwd(), "")}:${line} — polling effect depends on \`${d}\`, ` +
                `which is unstable via ${tainted.get(d)}. Memoise the hook's return, or read it through a ref.`,
            );
          }
        }
      }
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("mounts the kitchen poll exactly once", () => {
    const src = readFileSync(join(process.cwd(), "app/kitchen/KitchenBoard.tsx"), "utf8");

    // The interval reads the latest load through a ref, so no future identity
    // churn upstream can rebuild the loop.
    expect(src).toMatch(/const t = setInterval\(\(\) => void loadRef\.current\(\), 15_000\)/);
    expect(src).not.toMatch(/setInterval\(\(\) => void load\(\), 15_000\)/);

    // And the cause is fixed at the source, not only worked around.
    expect(src, "useChime must memoise its return object").toMatch(/return useMemo\(\s*\(\) => \(\{ on, toggle, play: playIfOn, ensureCtx \}\)/);
  });
});
