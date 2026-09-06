import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// ── THE SCREEN THAT SETS A SHOP'S PAYMENT METHODS FOR IT ────────────────────
//
// This route needs a service-role key and an admin session, so it cannot be
// executed in a test process. What follows guards the SHAPE of it, the way
// rpc-grants and reachable-pages do: a source scan cannot prove the code is
// right, but it can prove nobody deleted the line that makes it safe.
//
// Two of these guards exist because the bug already happened today.

const ROUTE = join(process.cwd(), "app/api/admin/payment-methods/route.ts");
const SRC = readFileSync(ROUTE, "utf8");

function handler(method: "GET" | "POST"): string {
  const at = SRC.indexOf(`export async function ${method}(`);
  expect(at, `${method} handler is missing or was renamed`).toBeGreaterThan(-1);
  const next = (["GET", "POST"] as const)
    .map((m) => SRC.indexOf(`export async function ${m}(`, at + 10))
    .filter((i) => i > -1)
    .sort((a, b) => a - b)[0];
  return SRC.slice(at, next === undefined ? SRC.length : next);
}

describe("both handlers are behind the admin cookie", () => {
  it("checks the session before touching the database", () => {
    for (const m of ["GET", "POST"] as const) {
      const body = handler(m);
      // /admin carries a signed password cookie and NO Supabase user, so
      // is_platform_admin() is false for it and RLS cannot be the boundary.
      // This line IS the boundary.
      expect(body, `${m} does not check the admin session`).toContain("if (!isAuthed(req))");
      const gate = body.indexOf("isAuthed(req)");
      const firstAwait = body.indexOf("await");
      expect(firstAwait === -1 || firstAwait > gate, `${m} awaits something before the gate`).toBe(
        true,
      );
    }
  });

  it("writes through the RPC that was revoked from anon, not straight to the table", () => {
    const post = handler("POST");
    expect(post).toContain("admin_set_store_payment_settings");
    // A direct .from("store_payment_settings").update() here would bypass the
    // constraint checks the RPC delegates to, and M179's revoke with them.
    expect(post).not.toMatch(/from\("store_payment_settings"\)[\s\S]{0,80}\.(update|upsert|insert)/);
  });
});

describe("the list says whether bank details exist, never what they are", () => {
  it("returns hasBankDetails and no account number", () => {
    const list = SRC.slice(SRC.indexOf("const [{ data: stores }"));
    expect(list).toContain("hasBankDetails");
    // The row is read to compute the boolean; it must not be handed back. A
    // list of every shop's account number is exactly what this screen exists
    // to avoid becoming.
    expect(list).not.toMatch(/account_number:\s*(row|s)\b/);
    expect(list).not.toMatch(/\.\.\.row\b/);
  });

  it("keeps the bank details out of the audit trail", () => {
    const post = handler("POST");
    const diff = post.slice(post.indexOf("diff:"));
    // The trail answers "who switched this shop's payments on". Reprinting an
    // account number into audit_log would put it in a second table with a
    // different retention story and no reason to be there.
    expect(diff).toContain("bankDetailsTouched");
    expect(diff).not.toMatch(/account_number:\s*[^,}\s]/);
  });
});

// ── THE ENUM TRAP, GUARDED REPO-WIDE ────────────────────────────────────────
//
// `.neq("status", "archived")` on `stores` is not a no-op and not a type
// error: Postgres rejects the whole query, PostgREST returns an error, and the
// screen renders empty with no clue why. 'archived' is a real product_status,
// which is why it looks correct while reading. It was written into two new
// admin routes today before the enum was checked.

const STORE_STATUS = ["draft", "active", "paused", "holiday", "closed"];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe("every status filter on `stores` names a real store_status", () => {
  it("finds no value outside draft|active|paused|holiday|closed", () => {
    const offenders: string[] = [];

    for (const file of [
      ...sourceFiles(join(process.cwd(), "app")),
      ...sourceFiles(join(process.cwd(), "lib")),
      ...sourceFiles(join(process.cwd(), "components")),
    ]) {
      const text = readFileSync(file, "utf8");
      let at = text.indexOf('.from("stores")');
      while (at > -1) {
        // Stop at the next .from(...) so a later chain on another table is
        // never blamed on this one.
        const nextFrom = text.indexOf(".from(", at + 15);
        const window = text.slice(at, nextFrom === -1 ? at + 600 : Math.min(nextFrom, at + 600));

        for (const m of window.matchAll(/\.(eq|neq|in)\(\s*"status"\s*,([^)]*)\)/g)) {
          for (const lit of m[2].matchAll(/"([a-z_]+)"/g)) {
            if (!STORE_STATUS.includes(lit[1])) {
              offenders.push(`${file.replace(process.cwd(), "")}: .${m[1]}("status", "${lit[1]}")`);
            }
          }
        }
        at = text.indexOf('.from("stores")', at + 15);
      }
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
