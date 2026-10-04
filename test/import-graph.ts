import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// ── What a page's first JavaScript actually pulls in ────────────────────────
//
// Architecture review 2026-09-30, perf items 1 and 2. "Load it on demand" is
// only true if nothing on the STATIC import path still reaches the module — a
// single leftover `import X from` anywhere under the layout puts the whole
// file back into every page's first download, and nothing on screen changes.
// The tests that use this walk the graph the bundler walks: `import … from`,
// side-effect `import "…"` and `export … from`, starting at a real entry file.
// `import(…)` is deliberately NOT followed — that is the split point — and
// type-only imports are skipped because TypeScript erases them.
//
// It asserts on imports, never on prose: comments are stripped before parsing,
// so the comment explaining a lazy load cannot count as an import of it.
//
// ── SERVER IMPORTS DO NOT SHIP ───────────────────────────────────────────────
// app/layout.tsx is a server component. What it imports for itself (the meta
// description reads lib/llms-txt, which reads the knowledge base) runs on the
// server and never reaches a browser. What ships is every "use client" module
// the walk meets, and everything THOSE import. clientGraph() is that set, and
// it is the one a "not in the first download" assertion must use.

export const ROOT = path.resolve(__dirname, "..");

const EXTS = [".ts", ".tsx", ".js", ".mjs", ".jsx"];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

/** Every static specifier in `src`, type-only imports excluded. */
export function staticSpecifiers(src: string): string[] {
  const code = stripComments(src);
  const out: string[] = [];
  // import X from "a" · import { a, b } from "a" · import * as X from "a"
  for (const m of code.matchAll(/(^|[;\n])\s*import\s+(type\s+)?([^;"'`]*?)\s+from\s*["']([^"']+)["']/g)) {
    if (m[2]) continue; // import type … from
    const clause = m[3].trim();
    // import { type A, type B } from — every name is a type, so the whole
    // statement is erased.
    const braced = /^\{([\s\S]*)\}$/.exec(clause);
    if (braced) {
      const names = braced[1].split(",").map((s) => s.trim()).filter(Boolean);
      if (names.length > 0 && names.every((n) => n.startsWith("type "))) continue;
    }
    out.push(m[4]);
  }
  // import "a" (side effects only)
  for (const m of code.matchAll(/(^|[;\n])\s*import\s*["']([^"']+)["']/g)) out.push(m[2]);
  // export * from "a" · export { a } from "a"
  for (const m of code.matchAll(/(^|[;\n])\s*export\s+(type\s+)?(\*(?:\s+as\s+\w+)?|\{[^}]*\})\s*from\s*["']([^"']+)["']/g)) {
    if (m[2]) continue;
    out.push(m[4]);
  }
  return out;
}

function resolveFile(base: string): string | null {
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const ext of EXTS) if (existsSync(base + ext)) return base + ext;
  for (const ext of EXTS) {
    const idx = path.join(base, `index${ext}`);
    if (existsSync(idx)) return idx;
  }
  return null;
}

/** A project file for "@/…" and relative specifiers; `pkg:<name>` for a package. */
export function resolveSpecifier(spec: string, fromFile: string): string | null {
  if (spec.startsWith("@/")) return resolveFile(path.join(ROOT, spec.slice(2)));
  if (spec.startsWith(".")) return resolveFile(path.resolve(path.dirname(fromFile), spec));
  return `pkg:${spec}`;
}

const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/");
const isCode = (f: string) => /\.(tsx?|jsx?|mjs)$/.test(f);

/** True for a module whose first statement is the "use client" directive. */
export function isClientModule(file: string): boolean {
  if (!isCode(file)) return false;
  return /^\s*["']use client["']/.test(stripComments(readFileSync(path.join(ROOT, file), "utf8")));
}

/** Direct static imports of one repo-relative file (files and `pkg:` specifiers). */
function edges(file: string): string[] {
  if (!isCode(file)) return []; // json, css: leaves
  const abs = path.join(ROOT, file);
  return staticSpecifiers(readFileSync(abs, "utf8"))
    .map((spec) => resolveSpecifier(spec, abs))
    .filter((t): t is string => t !== null)
    .map((t) => (t.startsWith("pkg:") ? t : rel(t)));
}

function walkFrom(starts: string[]): Set<string> {
  const seen = new Set<string>();
  const stack = [...starts];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!file.startsWith("pkg:")) stack.push(...edges(file));
  }
  return seen;
}

/**
 * Everything statically reachable from `entry` (repo-relative, forward
 * slashes), server and client alike, plus every package specifier met on the
 * way as `pkg:<spec>`.
 */
export function staticGraph(entry: string): Set<string> {
  return walkFrom([entry]);
}

/**
 * What `entry` puts in the browser's first download: every "use client"
 * module its static graph meets, and everything statically reachable from
 * those. Server-only imports along the way are left out, because they never
 * ship.
 */
export function clientGraph(entry: string): Set<string> {
  const boundaries = [...staticGraph(entry)].filter((f) => !f.startsWith("pkg:") && isClientModule(f));
  return walkFrom(boundaries);
}
