import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// ── M232 · THE TAXI ACCOUNT DOOR ────────────────────────────────────────────
// driver_link_by_code bound taxi_drivers.user_id = auth.uid(), but its only
// caller runs it under the service role, where auth.uid() is null — so no
// driver was ever remembered. The route now passes the verified user.
describe("the taxi account door binds the signed-in driver", () => {
  const route = readFileSync("app/api/driver-signin/route.ts", "utf8");
  const m232 = readFileSync("supabase/migrations/20261002120000_m232_the_taxi_account_door_binds.sql", "utf8");

  it("reads the user from the request's own session and passes it explicitly", () => {
    expect(route).toMatch(/import \{ createClient \} from "@\/lib\/supabase\/server";/);
    expect(route).toMatch(/const \{ data: \{ user \} \} = await session\.auth\.getUser\(\);/);
    expect(route).toMatch(/p_user_id: userId,/);
  });

  it("still calls it with the service role, behind the route's rate limit", () => {
    expect(route).toMatch(/guardShared\(req, "driver-signin", 6, 60_000\)/);
    expect(route).toMatch(/const supabase = await getPrivileged\(\);/);
  });

  // ── M235: a binding must be asked for, and must die with the old link ──────
  it("binds only when the /account form asks — never from a /d sign-in", () => {
    expect(route).toMatch(/link: z\.boolean\(\)\.optional\(\)\.default\(false\),/);
    expect(route).toMatch(/if \(parsed\.data\.link\) \{/);
    const accountForm = readFileSync("app/account/DriverCodeBox.tsx", "utf8");
    expect(accountForm).toMatch(/JSON\.stringify\(\{ code, link: true \}\)/);
    const dPage = readFileSync("app/d/DriverSignIn.tsx", "utf8");
    expect(dPage).not.toMatch(/link: true/);
  });

  it("changing a driver's link also unlinks the account (M235)", () => {
    const m235 = readFileSync("supabase/migrations/20261004200000_m235_a_new_driver_link_unlinks_the_account.sql", "utf8");
    expect(m235).toMatch(/set driver_token = v_new,\s*user_id\s*= null/);
    expect(m235).toMatch(/'accountUnlinked', v_unlinked/);
  });

  it("replaces the function instead of adding an overload (PGRST203)", () => {
    expect(m232).toMatch(/drop function if exists public\.driver_link_by_code\(text, text\);/);
    expect(m232).toMatch(/v_uid\s+uuid := coalesce\(p_user_id, auth\.uid\(\)\);/);
  });

  it("is never granted to a client role — the rate limit is the only defence", () => {
    expect(m232).toMatch(/revoke all on function public\.driver_link_by_code\(text, text, uuid\) from public, anon, authenticated;/);
    expect(m232).not.toMatch(/grant execute on function public\.driver_link_by_code\([^)]*\) to [^;]*(anon|authenticated)/);
  });
});

// ── M233 · TEST SHOPS' PRODUCTS STAY OUT OF THE SITEMAP ─────────────────────
describe("a (test) shop's products never reach the sitemap", () => {
  const m233 = readFileSync("supabase/migrations/20261002123000_m233_test_shop_products_never_reach_google.sql", "utf8");

  it("applies the same narrow name gate as sitemap_stores (M186)", () => {
    expect(m233).toMatch(/create or replace function public\.sitemap_products\(\)/);
    expect(m233).toContain("coalesce(s.name, '') !~* '\\(\\s*test\\s*\\)'");
    expect(m233).toMatch(/where not coalesce\(s\.no_index, false\)/);
  });
});
