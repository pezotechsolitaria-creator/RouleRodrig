import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// ── A THROWN ERROR MUST CARRY THE ONE IT REPLACED ───────────────────────────
//
// Sentry ROULE-RODRIGUES-3: `Error: Could not load your events.` on
// HEAD /organizer, five occurrences over five days, and nothing else. No code,
// no message, no table — the sentence named the symptom and destroyed the
// diagnosis in the same line. Five days later nobody could say why it fired.
//
// The shape was everywhere:
//
//   if (error) {
//     console.error("... failed", error);       // -> Vercel runtime logs
//     throw new Error("Could not load X.");     // -> Sentry
//   }
//
// Both halves are reasonable and together they are useless: the reason goes to
// runtime logs, which expire and which nobody opens, while the Error goes to
// Sentry, which is where somebody actually looks. `{ cause: error }` puts them
// in the same place.
//
// lib/events/scanner.ts had already worked this out and written the comment.
// Four other sites had not.

const ROOTS = ["app", "lib", "components"];

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
 * A `throw new Error(...)` inside an `if (error)` block that does NOT pass the
 * error on. Deliberately narrow: only where a caught/returned `error` is in
 * scope and demonstrably logged, so this cannot nag about a throw that has
 * nothing to attach.
 */
function throwsThatDropTheCause(): string[] {
  const found: string[] = [];
  for (const file of ROOTS.flatMap((r) => sourceFiles(join(process.cwd(), r)))) {
    const src = readFileSync(file, "utf8");
    const lines = src.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!/throw new Error\(/.test(lines[i])) continue;
      if (/cause/.test(lines[i])) continue;

      // Look back a few lines for a console.error that passed `error` along.
      // That is the proof the reason existed and was thrown away.
      const back = lines.slice(Math.max(0, i - 8), i).join("\n");
      if (!/console\.error\([^)]*\berror\b/.test(back)) continue;

      found.push(`${file.replace(process.cwd(), "")}:${i + 1}  ${lines[i].trim()}`);
    }
  }
  return found;
}

describe("an error swallowed is an error nobody can fix", () => {
  it("passes the underlying error as `cause` wherever one was logged", () => {
    const offenders = throwsThatDropTheCause();
    expect(
      offenders,
      "these log the real reason to runtime logs and throw a bare sentence to " +
        "Sentry, so the message survives and the diagnosis does not. Add " +
        "`{ cause: error }`:\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });
});

describe("the sites this was found on", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("organizer.ts carries the cause on both loaders", () => {
    const src = read("lib/events/organizer.ts");
    expect(src).toMatch(/Could not load your events\.", \{ cause: error \}/);
    expect(src).toMatch(/Could not load this event\.", \{ cause: error \}/);
  });

  it("the customer order pages carry it too", () => {
    expect(read("app/orders/page.tsx")).toMatch(/Could not load your orders\.", \{ cause: error \}/);
    expect(read("app/orders/[id]/page.tsx")).toMatch(
      /Could not load this order\.", \{ cause: error \}/,
    );
  });

  it("scanner.ts, which got there first, still does", () => {
    expect(read("lib/events/scanner.ts")).toMatch(
      /Could not load your events\.", \{ cause: error \}/,
    );
  });

  it("keeps the customer-facing sentence unchanged", () => {
    // The wording is deliberate and plain. This fix is about what reaches
    // Sentry, not about what the person on the page reads.
    expect(read("lib/events/organizer.ts")).toContain("Could not load your events.");
    expect(read("app/orders/page.tsx")).toContain("Could not load your orders.");
  });
});
