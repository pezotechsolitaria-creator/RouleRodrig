import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ── A standing guard against one specific, repeatable mistake ────────────────
//
// Every admin RPC in this project opens with the M25 gate:
//
//     if auth.uid() is not null and not is_platform_admin() then raise …
//
// which PASSES for an anonymous caller, because auth.uid() is null there. That
// is deliberate: /admin authenticates with a signed password cookie and reaches
// Postgres as service_role with no Supabase user, so is_platform_admin() can
// never be true for it. The consequence is easy to miss — the gate is not the
// security boundary. The REVOKE is.
//
// And `revoke … from anon, authenticated` is NOT enough: Postgres grants
// EXECUTE to PUBLIC by default, and both roles inherit it. admin_delete_kitchen
// shipped that way for a few minutes; this test is why it will not happen twice.
//
// It reads the migration FILES, so it catches the mistake at the point it is
// written rather than after it reaches production.

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

/** Function names defined in a migration that carry the auth.uid()-null gate. */
function gatedAdminFunctions(sql: string): string[] {
  const names: string[] = [];
  // Split on function definitions so each body is examined on its own.
  const parts = sql.split(/create\s+(?:or\s+replace\s+)?function\s+/i).slice(1);
  for (const part of parts) {
    const name = part.match(/^([a-z0-9_]+)\s*\(/i)?.[1];
    if (!name || !name.startsWith("admin_")) continue;
    // Only the ones whose gate an anonymous caller would pass.
    if (!/auth\.uid\(\)\s+is\s+not\s+null/i.test(part)) continue;
    names.push(name);
  }
  return names;
}

describe("admin RPC grants", () => {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"));
  // Read once, not once per (file × gated function). This was re-reading the
  // whole migration corpus inside a nested loop, so its cost grew with the
  // SQUARE of the migration count — it finally crossed the 5s default timeout
  // and started failing under suite load while passing on its own. The check
  // itself is unchanged; only the number of disk reads is.
  const sqlByFile = new Map(files.map((f) => [f, readFileSync(join(MIGRATIONS, f), "utf8")]));

  it("finds migrations to check at all — a silent zero would pass forever", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("revokes EXECUTE from PUBLIC for every admin_* RPC an anon caller could pass", () => {
    const offenders: string[] = [];

    for (const [file, sql] of sqlByFile) {
      for (const fn of gatedAdminFunctions(sql)) {
        // The revoke may live in this migration or a later one; the whole
        // corpus is the source of truth for the function's final state.
        const revokedSomewhere = [...sqlByFile.values()].some((other) => {
          // The revoke may be schema-qualified (`public.admin_delete_shop(...)`)
          // and may or may not spell out the argument list. Both forms are in
          // this repo, and a regex that misses one reports a false alarm on a
          // function that is actually locked down — worse than useless, because
          // the next person learns to ignore this test.
          const re = new RegExp(
            `revoke\\s+(?:all|execute)[^;]*on\\s+function\\s+(?:public\\.)?${fn}\\s*(?:\\([^)]*\\))?[^;]*from[^;]*public`,
            "is",
          );
          return re.test(other);
        });
        if (!revokedSomewhere) offenders.push(`${fn} (${file})`);
      }
    }

    // A failure here means the function is callable with the public anon key
    // and its own gate will wave the caller through.
    expect(offenders, `admin RPCs still granted to PUBLIC:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });
});
