import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// ── Architectural guard ──────────────────────────────────────────────────────
//
// `<AnimatePresence>{cond && createPortal(…)}</AnimatePresence>` renders
// NOTHING. framer-motion filters its children through React.isValidElement()
// (onlyElements() in AnimatePresence/utils.mjs), and a portal's $$typeof is
// REACT_PORTAL_TYPE rather than REACT_ELEMENT_TYPE — so isValidElement() is
// false and the portal is discarded before it can mount.
//
// This is not hypothetical. It shipped, and it disabled the "Install app"
// button completely on every platform for as long as it was live. Nothing
// caught it: no error, no warning, no console output, no failing test. The
// component simply rendered nothing while its state said it was open.
//
// A type checker cannot see this and eslint has no rule for it, so the check
// lives here. It is deliberately a source scan rather than a runtime test —
// the failure is invisible at runtime, which is the whole problem.
//
// The correct shapes are: portal OUTSIDE and AnimatePresence INSIDE (see
// components/MapSection.tsx), or a plain conditional (see
// components/InstallAppButton.tsx).

const ROOT = path.resolve(__dirname, "..");
const SCAN_DIRS = ["app", "components"];
const EXTS = new Set([".tsx", ".ts"]);

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }

  for (const entry of entries) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTS.has(path.extname(entry))) out.push(full);
  }
  return out;
}

/**
 * Comments discuss this exact pattern by name — including the warnings left in
 * InstallAppButton — so they must not count as violations.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** True when a createPortal( call sits between an <AnimatePresence> and its close. */
function wrapsPortal(src: string): boolean {
  const open = /<AnimatePresence[^>]*>/g;
  let match: RegExpExecArray | null;

  while ((match = open.exec(src)) !== null) {
    const from = match.index + match[0].length;
    const close = src.indexOf("</AnimatePresence>", from);
    const inner = close === -1 ? src.slice(from) : src.slice(from, close);
    if (/createPortal\s*\(/.test(inner)) return true;
  }
  return false;
}

describe("AnimatePresence must never wrap createPortal", () => {
  const files = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)));

  it("finds source files to scan", () => {
    // Guards the guard: a broken path would make every assertion below vacuous.
    expect(files.length).toBeGreaterThan(20);
  });

  it("no component wraps a portal in AnimatePresence", () => {
    const offenders = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      if (!src.includes("AnimatePresence") || !src.includes("createPortal")) return false;
      return wrapsPortal(stripComments(src));
    });

    expect(
      offenders.map((f) => path.relative(ROOT, f)),
      "AnimatePresence wrapping createPortal renders nothing at all — move the " +
        "portal outside, or drop AnimatePresence. See MapSection.tsx for the " +
        "correct shape.",
    ).toEqual([]);
  });
});

describe("the guard itself detects the pattern", () => {
  // Without these, a regex typo would silently turn the check above into a
  // test that can never fail — which is the same class of bug it exists to stop.
  it("flags the broken shape", () => {
    const bad = `
      <AnimatePresence>
        {open && createPortal(<div />, document.body)}
      </AnimatePresence>`;
    expect(wrapsPortal(bad)).toBe(true);
  });

  it("accepts the portal-outside shape", () => {
    const good = `
      {mounted && createPortal(
        <AnimatePresence>{open && <motion.div />}</AnimatePresence>,
        document.body,
      )}`;
    expect(wrapsPortal(good)).toBe(false);
  });

  it("accepts a plain conditional portal", () => {
    const good = `{mounted && open && createPortal(<motion.div />, document.body)}`;
    expect(wrapsPortal(good)).toBe(false);
  });

  it("ignores the pattern when it only appears in a comment", () => {
    const commented = `
      /* Never write <AnimatePresence>{createPortal(x)}</AnimatePresence> here. */
      {mounted && open && createPortal(<div />, document.body)}`;
    expect(wrapsPortal(stripComments(commented))).toBe(false);
  });

  it("does not mistake a protocol slash for a line comment", () => {
    const src = `const u = "https://example.com"; // ok\n<AnimatePresence>{createPortal(1)}</AnimatePresence>`;
    expect(stripComments(src)).toContain("https://example.com");
    expect(wrapsPortal(stripComments(src))).toBe(true);
  });
});
