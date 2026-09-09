import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// ── A REQUEST THAT NEVER ARRIVED MUST NOT LOOK LIKE AN ANSWER ───────────────
//
// 26 places paired a fetch-bearing `try` with a bare `finally` and no `catch`.
// Both halves read as careful code, and together they were silent:
//
//   try {
//     const res = await fetch(url);
//     if (res.ok) setThing(await res.json());   // non-ok falls through
//   } finally {
//     setLoading(false);                        // rejection lands here
//   }
//
// Whichever way it failed, the spinner stopped and the screen kept whatever it
// had. On a loader that meant an empty list presented as a real answer — the
// admin dashboard showed zero bookings and Rs 0 revenue to an owner whose phone
// had simply lost signal. On a save it meant the dialog sat there having done
// nothing. On a delete at AdminDashboard's review panel it was worse still: an
// unchecked fetch followed by an UNCONDITIONAL row removal, so a refused delete
// still cleared the row from the screen.
//
// This file's own adminWrite() had been written for exactly that lie, months
// earlier, with a comment saying so. Most call sites had never adopted it.

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

/**
 * A `try { ... fetch ... } finally { ... }` with no catch and no other
 * acknowledgement that the request can fail.
 *
 * A block counts as handled if it routes through adminWrite/adminRead (which
 * own the failure themselves) or attaches its own `.catch`. Deliberate silence
 * is still allowed — it just has to be written down as `.catch(() => {})`
 * rather than left implicit.
 */
function silentFetchBlocks(): string[] {
  const found: string[] = [];
  for (const file of ROOTS.flatMap((r) => sourceFiles(join(process.cwd(), r)))) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/\btry\s*\{/g)) {
      let i = m.index + m[0].length;
      let depth = 1;
      while (i < src.length && depth > 0) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}") depth--;
        i++;
      }
      if (!/^\s*finally\s*\{/.test(src.slice(i, i + 40))) continue;
      const block = src.slice(m.index, i);
      if (!block.includes("fetch(")) continue;
      if (/adminWrite\(|adminRead|\.catch\(/.test(block)) continue;
      found.push(`${file.replace(process.cwd(), "")}:${src.slice(0, m.index).split("\n").length}`);
    }
  }
  return found;
}

describe("no request fails silently", () => {
  it("every try/finally around a fetch acknowledges failure", () => {
    const offenders = silentFetchBlocks();
    expect(
      offenders,
      "these run `finally` on a failed request and say nothing, so the screen " +
        "keeps a value the server never gave. Use adminWrite/adminRead, add a " +
        "catch, or make the silence explicit with .catch(() => {}):\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });
});

describe("the admin helpers", () => {
  const SRC = readFileSync(join(process.cwd(), "app/admin/AdminDashboard.tsx"), "utf8");

  it("has a read counterpart to adminWrite", () => {
    expect(SRC).toMatch(/async function adminRead<T>\(input: string, what: string\)/);
  });

  it("adminRead returns null rather than throwing, so the screen keeps its data", () => {
    const fn = SRC.slice(SRC.indexOf("async function adminRead"));
    expect(fn.slice(0, 900)).toMatch(/return null;/);
    expect(fn.slice(0, 900)).toContain("toast.error");
  });

  it("names the offline case separately from a refusal", () => {
    const fn = SRC.slice(SRC.indexOf("async function adminRead"));
    expect(fn.slice(0, 900)).toContain("you appear to be offline");
    expect(fn.slice(0, 900)).toMatch(/error \$\{res\.status\}/);
  });

  it("the review delete no longer removes a row it failed to delete", () => {
    const idx = SRC.indexOf("/api/admin/reviews?id=");
    expect(idx).toBeGreaterThan(-1);
    const around = SRC.slice(idx - 300, idx + 300);
    expect(around).toContain("adminWrite(");
  });
});
