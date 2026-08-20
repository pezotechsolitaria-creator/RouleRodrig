import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ── A POLICY MUST NOT GO BACK TO EVALUATING auth.uid() PER ROW (M126) ───────
//
// M126 rewrote 28 RLS policies so Postgres hoists auth.uid() into an InitPlan
// and evaluates it once per query instead of once per row.
//
// The revert risk is real and specific, and an audit of the repo found it:
// 29 of the 35 CREATE POLICY statements across the existing migrations still
// carry the bare form, and NINE of those files open with
// `drop policy if exists` before recreating. Re-run any of them and the fix
// silently disappears — no error, no failing test, just a slow database again.
//
// Those historical files are not rewritten: they are the record of what
// happened, and editing history to match the present is its own kind of lie.
// Instead this guards the FUTURE. Any migration added after M126 that writes a
// policy with a bare auth.uid() fails here, while it is still cheap to fix.

const MIGRATIONS = join(__dirname, "..", "supabase", "migrations");

// The migration that established the rule. Files at or before it are history.
const M126 = "20260819200000_m126_rls_initplan_hoist_auth_uid.sql";

// Bare auth.* NOT already wrapped in a scalar subquery, in either spelling:
// the one a human writes, and the one Postgres deparses to.
export function bareAuthCalls(sql: string): string[] {
  const withoutComments = sql.replace(/^\s*--.*$/gm, "");
  const unwrapped = withoutComments
    .replace(/\(\s*select\s+auth\.(uid|jwt|role)\(\)\s*\)/gi, "<WRAPPED>")
    .replace(/\(\s*SELECT\s+auth\.(uid|jwt|role)\(\)\s+AS\s+\w+\s*\)/g, "<WRAPPED>");
  return unwrapped.match(/auth\.(uid|jwt|role)\(\)/g) ?? [];
}

describe("the InitPlan rewrite cannot be silently undone", () => {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();

  it("finds the migration that set the rule", () => {
    expect(files).toContain(M126);
  });

  it("M126 rewrites in place and never drops a policy", () => {
    const sql = readFileSync(join(MIGRATIONS, M126), "utf8");
    expect(sql).toMatch(/alter policy/i);
    // Dropping a policy leaves a window with no protection and can lose the
    // role list — the whole reason this was written as ALTER.
    expect(sql).not.toMatch(/drop\s+policy/i);
    // It asserts its own result rather than assuming the rewrite took.
    expect(sql).toMatch(/raise exception/);
  });

  it("no migration added AFTER it writes a policy with a per-row auth call", () => {
    const later = files.filter((f) => f > M126);
    const offenders: string[] = [];

    for (const f of later) {
      const sql = readFileSync(join(MIGRATIONS, f), "utf8");
      if (!/create\s+policy|alter\s+policy/i.test(sql)) continue;
      const bare = bareAuthCalls(sql);
      if (bare.length > 0) offenders.push(`${f} (${bare.length} bare call(s))`);
    }

    expect(
      offenders,
      "These migrations evaluate auth.* once per ROW inside a policy. Wrap each " +
        "call as (select auth.uid()) so Postgres hoists it into an InitPlan:\n  " +
        offenders.join("\n  "),
    ).toEqual([]);
  });

  it("the detector actually detects — it is not vacuously passing", () => {
    // A guard nobody has proven catches anything is not a guard.
    expect(bareAuthCalls("create policy p on t using (user_id = auth.uid());")).toHaveLength(1);
    expect(bareAuthCalls("create policy p on t using (a = auth.uid() or b = auth.jwt());")).toHaveLength(2);
    // Both fixed spellings are accepted.
    expect(bareAuthCalls("using (user_id = (select auth.uid()))")).toHaveLength(0);
    expect(bareAuthCalls("using (user_id = ( SELECT auth.uid() AS uid))")).toHaveLength(0);
    // A commented-out example must not trip it.
    expect(bareAuthCalls("-- old form was auth.uid()\nusing (a = (select auth.uid()))")).toHaveLength(0);
  });
});
