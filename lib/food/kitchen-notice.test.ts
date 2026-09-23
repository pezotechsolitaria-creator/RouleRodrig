import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// ── A KITCHEN THAT NEEDS NOTICE (M216) ──────────────────────────────────────
//
// On 23 Sept 2026 the owner said "turn on advance ordering 1-2 days for chez
// banane"; the cook's own note asked for "24-48 hours". M161 had built
// pre-ordering and never switched it on, and had no idea of NOTICE at all.
// These pins hold the decisions that are easy to undo by accident:
//
//   · the rule has ONE source (kitchen_notice_hours) and the platform lever
//     still rolls everything back;
//   · it is enforced at the orders table, because the ASAP path never meets
//     create_food_order and `authenticated` can call create_order directly;
//   · the grace, the units, the single store, the anon revoke.

const sql = readFileSync(
  "supabase/migrations/20260923200000_m216_a_kitchen_that_needs_notice.sql",
  "utf8",
).replace(/\r\n/g, "\n");

const CHEZ_BANANE = "d522e765-78c3-43da-ab4e-db2b7977acaa";

describe("one question, and the lever still rolls it back", () => {
  it("defines kitchen_notice_hours() on top of the platform lever", () => {
    const fn = sql.slice(sql.indexOf("create or replace function public.kitchen_notice_hours"));
    expect(fn).toMatch(/when coalesce\(\(select m\.food_preorder_enabled from marketplace_settings m limit 1\), false\)/);
    expect(fn).toMatch(/else 0/);
  });

  it("slots, window and wall all ask it — none reads the column on its own", () => {
    for (const name of ["food_pickup_slots", "food_pickup_window", "enforce_kitchen_notice"]) {
      const at = sql.indexOf(`create or replace function public.${name}`);
      expect(at, name).toBeGreaterThan(-1);
      // Each body closes with "end $function$;" or "end $fn$;".
      const body = sql.slice(at, sql.indexOf("end $", at));
      expect(body, name).toContain("kitchen_notice_hours(");
      expect(body, name).not.toMatch(/k\.min_notice_hours/);
    }
  });

  it("guests can ask it (the picker reads it through PostgREST)", () => {
    expect(sql).toContain("grant execute on function public.kitchen_notice_hours(uuid) to anon, authenticated;");
  });
});

describe("the setting", () => {
  it("defaults to walk-up and is bounded", () => {
    expect(sql).toContain("add column if not exists min_notice_hours smallint not null default 0");
    expect(sql).toContain("check (min_notice_hours between 0 and 72)");
  });

  it("cannot be set so long that no time is ever bookable", () => {
    expect(sql).toContain("check (min_notice_hours <= preorder_days * 24)");
  });

  it("names exactly one kitchen: Chez Banane, 24 hours, two days", () => {
    const updates = sql.match(/update public\.food_kitchens[\s\S]*?;/g) ?? [];
    expect(updates).toHaveLength(1);
    const update = updates[0] ?? "";
    expect(update).toContain("min_notice_hours = 24, preorder_days = 2");
    expect(update.match(/'[0-9a-f-]{36}'/g)).toEqual([`'${CHEZ_BANANE}'`]);
  });
});

describe("the notice is enforced where every order passes", () => {
  it("a BEFORE INSERT trigger on orders reads the stamped slot", () => {
    expect(sql).toMatch(/create trigger t_orders_kitchen_notice\s+before insert on public\.orders/);
    const fn = sql.slice(sql.indexOf("create or replace function public.enforce_kitchen_notice"));
    expect(fn).toContain("rr_fulfil_at()");
  });

  it("create_order itself is not rewritten (it is shared by food, shop and events)", () => {
    expect(sql).not.toMatch(/create or replace function public\.create_order\s*\(/);
  });

  it("ASAP is refused for a notice kitchen, with a sentence", () => {
    const fn = sql.slice(sql.indexOf("create or replace function public.food_pickup_window"));
    expect(fn).toMatch(/if p_date is null or p_time is null then\s+if v_notice > 0 then\s+raise exception using errcode = 'RR030'/);
  });

  it("the migration proves the wall in a sealed sub-transaction", () => {
    // If the wall ever let the proof order through, the block undoes it
    // before failing — a proof must never leave a real order behind.
    expect(sql).toContain("raise exception using errcode = 'P0216', message = 'accepted';");
    expect(sql).toContain("when sqlstate 'P0216' then v_leak := true;");
  });
});

describe("the grace and the units", () => {
  it("one slot (30 min) of grace in the validator and the wall — the picker's own first offer never fails", () => {
    expect(sql).toContain("if v_notice > 0 and v_end <= p_now + make_interval(hours => v_notice) then");
    expect(sql).toContain("if rr_fulfil_at() + interval '30 minutes' <= now() + make_interval(hours => v_notice) then");
  });

  it("notice is HOURS and the cooking lead is MINUTES — never compared raw", () => {
    // greatest(30, 24) would be 30 minutes: the notice silently ignored.
    expect(sql).toContain("v_notice_floor := v_now_local + make_interval(hours => v_notice);");
    expect(sql).toContain("greatest(v_now_local + make_interval(mins => v_lead), v_notice_floor)");
  });

  it("an open day inside the notice says 'notice', not 'no times left'", () => {
    expect(sql).toContain("'notice'::text");
  });
});

describe("the readers that meant 'now' ask ready_now", () => {
  it("the Ready-now chip and the first home rail", () => {
    expect(sql).toContain("(1, 'browse_food',  'or c.orderable)', 'or c.ready_now)', 1)");
    expect(sql).toContain("(3, 'food_home',    'where c.orderable', 'where c.ready_now', 1)");
  });

  it("orderable and ready_now are different columns of the catalog", () => {
    expect(sql).toMatch(/AND nt\.h = 0 AS ready_now/);
    expect(sql).toMatch(/WHEN nt\.h > 0 THEN \(avail\.av = ANY \(ARRAY\['available'::text, 'wrong_time'::text, 'wrong_day'::text\]\)\)/);
  });

  it("the cook's board keeps a booked order until its day is over, and is told the slot", () => {
    const fn = sql.slice(sql.indexOf("create or replace function public.kitchen_dashboard"));
    expect(fn).toContain("'pickupFrom', lower(ord.pickup_slot)");
    expect(fn).toContain("upper(ord.pickup_slot) > now() - interval '24 hours'");
  });
});

describe("housekeeping", () => {
  it("the public key can no longer create orders directly", () => {
    expect(sql).toMatch(/revoke execute on function public\.create_food_order\([\s\S]*?\) from anon;/);
  });

  it("PostgREST is told about the new column and function", () => {
    expect(sql).toContain("notify pgrst, 'reload schema';");
  });

  it("refuses to overwrite a function that changed since it was read", () => {
    expect(sql).toContain("refusing to overwrite");
  });
});

describe("the picker asks the same question", () => {
  it("/api/food/slots reads kitchen_notice_hours, not the column", () => {
    const route = readFileSync("app/api/food/slots/route.ts", "utf8");
    expect(route).toContain('supabase.rpc("kitchen_notice_hours"');
    expect(route).not.toMatch(/from\(["']food_kitchens["']\)/);
  });
});
