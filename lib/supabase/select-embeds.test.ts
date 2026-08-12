import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// ── PostgREST embeds are a repeat offender ─────────────────────────────────
//
// Two production outages in this codebase came from the same place: a
// `.select()` string that is syntactically fine, type-checks, builds, and is
// only wrong when a real request reaches PostgREST.
//
//   · food_kitchens embedding its SIBLINGS (no FK between them) — the whole
//     query failed and the admin menu panel said "Add a kitchen first" while
//     four kitchens were live.
//   · payments embedded TWICE in one select — PostgREST answers the entire
//     request with 42803, so the admin food queue showed only "Failed to load
//     orders".
//
// Neither was caught by tsc, by the production build, or by 714 unit tests,
// because not one of them ever issues the query. This test reads the select
// strings themselves, which is the only artefact available without a database.
//
// It deliberately checks the ONE rule that is decidable from the string alone:
// a relation must not be embedded more than once. Whether an FK exists is not
// knowable here — that stays a job for a real probe.

const ROOT = join(process.cwd(), "app", "api");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/**
 * Pull the embedded relation names out of one select string.
 *
 * Only top-level embeds count: `a(b(c))` embeds `a`, and `b` is nested inside
 * it, which is legal and common. Depth tracking is what keeps the nested case
 * from being reported as a duplicate of a sibling with the same name.
 */
function topLevelEmbeds(select: string): string[] {
  const names: string[] = [];
  let depth = 0;
  let token = "";
  for (const ch of select) {
    if (ch === "(") {
      if (depth === 0) {
        const name = token.split(",").pop()?.trim();
        // Skip PostgREST's own modifiers, e.g. `count()` or `!inner` hints.
        if (name && /^[a-z_][a-z0-9_]*$/i.test(name)) names.push(name);
      }
      depth++;
      token = "";
    } else if (ch === ")") {
      depth--;
      token = "";
    } else if (depth === 0) {
      token += ch;
    }
  }
  return names;
}

/**
 * Every string literal concatenated into a single .select(...) call.
 *
 * The argument has to be found by MATCHING PARENTHESES, not by a non-greedy
 * regex. A select like `select("a, delivery_zones(name), payments(...)")`
 * contains inner parens, so `\(([\s\S]*?)\)` stops at the first `)` — inside
 * `delivery_zones(name)` — and silently truncates the string before the part
 * that matters. The first version of this test did exactly that and passed
 * happily against the very bug it was written to catch.
 *
 * Comments are stripped first: several of them quote PostgREST error text, and
 * those quotes would otherwise be spliced in as if they were select fragments.
 */
function selectStrings(source: string): string[] {
  const clean = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

  const out: string[] = [];
  const marker = ".select(";
  let idx = clean.indexOf(marker);

  while (idx !== -1) {
    let depth = 0;
    let end = -1;
    for (let i = idx + marker.length - 1; i < clean.length; i++) {
      const ch = clean[i];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    if (end === -1) break;

    const body = clean.slice(idx + marker.length, end);
    // Join the concatenated literals back into the string PostgREST receives.
    const parts = [...body.matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)].map(
      (x) => x[1] ?? x[2] ?? x[3] ?? "",
    );
    if (parts.length > 0) out.push(parts.join(""));
    idx = clean.indexOf(marker, end);
  }
  return out;
}

describe("PostgREST select strings", () => {
  const files = walk(ROOT);

  it("finds select calls to check (guards against the regex silently matching nothing)", () => {
    const total = files.reduce((n, f) => n + selectStrings(readFileSync(f, "utf8")).length, 0);
    // A test that checks nothing passes forever. This is the tripwire.
    expect(total).toBeGreaterThan(20);
  });

  it("never embeds the same relation twice in one select", () => {
    const offenders: string[] = [];

    for (const file of files) {
      for (const select of selectStrings(readFileSync(file, "utf8"))) {
        const embeds = topLevelEmbeds(select);
        const seen = new Set<string>();
        for (const name of embeds) {
          if (seen.has(name)) {
            offenders.push(
              `${file.replace(process.cwd(), "")}: "${name}" embedded twice in select(${select.slice(0, 90)}…)`,
            );
          }
          seen.add(name);
        }
      }
    }

    // Named rather than counted: a failure should say which file to open.
    expect(offenders).toEqual([]);
  });
});
