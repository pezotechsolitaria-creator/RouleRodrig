import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ── A FOOD ORDER CAN SAY WHEN (M161) ────────────────────────────────────────
//
// The owner: "There is no way for the user to choose when they want the food."
//
// Three pieces of this were already built and never wired up — orders.pickup_slot
// (written by nothing since July), food_item_availability(product, AT) and
// store_schedule_at(store, LOCAL_TS). M161 is not a scheduling engine; it is a
// way to say WHICH instant the existing gates answer for, carried in a
// transaction-local GUC that reads as now() when unset.
//
// These assertions pin the parts that would regress SILENTLY — where the
// feature keeps compiling, keeps deploying, and quietly stops working or
// quietly starts cancelling real orders.

const DIR = join(__dirname, "..", "supabase", "migrations");
const files = readdirSync(DIR);
const read = (needle: string) => {
  const f = files.find((n) => n.includes(needle));
  if (!f) throw new Error(`migration ${needle} is missing from supabase/migrations`);
  return readFileSync(join(DIR, f), "utf8");
};

const A = read("m161_a_food_order_can_say_when");
const B = read("m161b_food_pickup_slots_and_door");
const BOTH = `${A}\n${B}`;

describe("the requested instant reaches the gates", () => {
  it("the trigger asks about the instant the food is FOR", () => {
    // THE bug this feature existed to clear. enforce_food_item_servable called
    // food_item_availability with one argument, so a pre-order that passed
    // every check in the UI still raised RR006 at the last possible moment.
    expect(A).toContain("food_item_availability(v_product, rr_fulfil_at())");
    expect(A).not.toContain("food_item_availability(v_product);");
  });

  it("the closed-shop gate asks the same clock", () => {
    const fn = A.slice(A.indexOf("function public.store_schedule_status"));
    expect(fn).toContain("rr_fulfil_at() at time zone 'Indian/Mauritius'");
    expect(fn.slice(0, 1200)).not.toContain("now() at time zone 'Indian/Mauritius'");
  });

  it("unset, the clock is just now()", () => {
    // Every non-food path on the platform depends on this being true.
    expect(A).toContain("current_setting('rr.fulfil_at', true)");
    expect(A).toMatch(/coalesce\(nullif\(current_setting\('rr\.fulfil_at', true\), ''\)::timestamptz, now\(\)\)/);
  });

  it("the setting is transaction-local, never session-wide", () => {
    // set_config's third argument is is_local. false would leak one customer's
    // pre-order clock into the next request on a pooled connection.
    expect(B).toContain("set_config('rr.fulfil_at', lower(v_win)::text, true)");
    expect(B).toContain("set_config('rr.fulfil_at', '', true)");
    expect(B).not.toMatch(/set_config\('rr\.fulfil_at'[^)]*, false\)/);
  });
});

describe("create_order is not touched", () => {
  it("is called, never dropped or recreated", () => {
    // ~250 lines shared by food, shop AND events, with its `for update of v`
    // lock ordering asserted by six later migrations. Two of the three
    // candidate designs wanted to drop and recreate it; that would put every
    // checkout on the site at risk for a feature touching nine dishes.
    expect(B).toContain("from create_order(");
    expect(BOTH).not.toMatch(/drop\s+function\s+[^;]*create_order/i);
    expect(BOTH).not.toMatch(/create\s+or\s+replace\s+function\s+public\.create_order\b/i);
  });

  it("the new door has its own signature", () => {
    expect(B).toContain("function public.create_food_order(");
    expect(B).toContain("p_pickup_date date default null");
    expect(B).toContain("p_pickup_time time default null");
  });

  it("an idempotent replay cannot re-stamp a different time", () => {
    // create_order returns the ORIGINAL order for a repeated key.
    expect(B).toContain("and o.pickup_slot is null");
  });
});

describe("pre-orders fail closed", () => {
  it("refuses a kitchen that has never said when it cooks", () => {
    // store_schedule_at does `v_open := not v_any`, so a store with ZERO
    // store_hours rows reads as OPEN FOREVER — right for walk-ups, and
    // catastrophic for a generator that would sell a month of empty days.
    expect(B).toContain("if not v_a.has_schedule then");
    expect(B).toContain("has not set its opening hours");
  });

  it("checks the kitchen is open at BOTH ends of the window", () => {
    // A 23:30 slot at a kitchen closing 23:59 must be refused.
    expect(B).toContain("v_a.is_open and v_b.is_open");
  });

  it("only offers times the picker actually shows", () => {
    expect(B).toContain("extract(minute from p_time) not in (0, 30)");
  });
});

describe("the nightly sweep does not cancel tomorrow's lunch", () => {
  it("expire_order skips an order whose window is still ahead", () => {
    // Without this, a pre-order sitting in pending_payment on a bank transfer
    // is released and the customer emailed "your order expired" — for food
    // they are collecting in the morning.
    expect(B).toContain("(o.pickup_slot is null or lower(o.pickup_slot) < now())");
  });

  it("still expires once the window has passed", () => {
    // The guard must not leak orders forever.
    expect(B).toContain("lower(o.pickup_slot) < now()");
  });
});

describe("it ships off", () => {
  it("no kitchen is opted in by default", () => {
    expect(A).toMatch(/preorder_days smallint not null default 0/);
  });

  it("the platform lever defaults to false", () => {
    expect(A).toMatch(/food_preorder_enabled boolean not null default false/);
  });

  it("refuses to commit if it changed what any store reports", () => {
    // store_schedule_status has nineteen callers including the food_catalog
    // view every dish card is built from.
    expect(A).toContain("M161 refused: store_schedule_status disagrees");
    expect(A).toContain("M161 refused: rr_fulfil_at() is not now()");
  });
});

// ── THE WIRING ──────────────────────────────────────────────────────────────
// The engine is only worth having if checkout can reach it, and only safe if
// shop and event checkout cannot accidentally reach it.

const SRC = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8");

describe("checkout reaches the new door, and only for food", () => {
  const route = SRC("app", "api", "checkout", "route.ts");
  const schema = SRC("lib", "schemas", "checkout.ts");

  it("accepts a date and a half-hour, and nothing else", () => {
    expect(schema).toContain("pickupDate: z.string().regex(");
    expect(schema).toContain("pickupTime: z.string().regex(");
    // Only :00 and :30 — the same boundaries food_pickup_window enforces, so
    // the client cannot ask for 08:17 and get a confusing server error.
    expect(schema).toContain("(00|30)");
  });

  it("uses create_food_order ONLY when a window was chosen", () => {
    expect(route).toContain('wantsSlot ? "create_food_order" : "create_order"');
    expect(route).toContain("const wantsSlot = Boolean(pickupDate && pickupTime)");
  });

  it("leaves the grouped multi-shop path alone", () => {
    // create_order_group is shop-and-event territory. A pickup slot there
    // would need a per-shop window and this MVP does not have one.
    const grouped = SRC("app", "api", "checkout", "group.ts");
    // "pickup" alone appears there as a FULFILMENT value; what must not
    // appear is a scheduling field.
    expect(grouped).not.toContain("pickupDate");
    expect(grouped).not.toContain("pickup_slot");
    expect(grouped).not.toContain("create_food_order");
    expect(grouped).toContain("create_order_group");
  });

  it("passes the kitchen's own refusal through to the customer", () => {
    // RR030 sentences are written for a human: "The kitchen is closed then."
    expect(route).toContain('error.code === "RR030"');
  });
});

describe("the slots endpoint decides nothing", () => {
  const api = SRC("app", "api", "food", "slots", "route.ts");

  it("is a pass-through to the RPC", () => {
    expect(api).toContain('rpc("food_pickup_slots"');
    // If any of this appears here, the picker and checkout can disagree about
    // what is bookable — which is the one thing this split exists to prevent.
    expect(api).not.toContain("Indian/Mauritius");
    expect(api).not.toContain("prep_minutes");
    expect(api).not.toMatch(/opens_at|closes_at/);
  });

  it("is rate limited", () => {
    expect(api).toContain('guardShared(req, "food-slots"');
  });
});

describe("the picker is mounted, and only where it can work", () => {
  const form = SRC("components", "checkout", "CheckoutForm.tsx");
  const picker = SRC("components", "food", "WhenPicker.tsx");

  it("renders for food collection only", () => {
    // Delivery has its own timing story and the kitchen's window is not the
    // rider's; shop and event checkout must never see this control.
    expect(form).toContain('sellerDomain === "food" && fulfillment === "pickup"');
  });

  it("sends both fields or neither", () => {
    expect(form).toContain("pickupDate: slot?.date");
    expect(form).toContain("pickupTime: slot?.time");
  });

  it("keeps the choice in form state, never in storage or the URL", () => {
    // A time chosen an hour ago is not a time the kitchen still has.
    const block = form.slice(form.indexOf("const [slot, setSlot]"), form.indexOf("const [slot, setSlot]") + 200);
    expect(block).toContain("useState<PickedSlot>(null)");
    expect(picker).not.toContain("localStorage");
    expect(picker).not.toContain("searchParams");
  });

  it("decides nothing itself", () => {
    // Every offered time comes from food_pickup_slots(). If the timezone or
    // the prep maths appears here, the picker and checkout can disagree.
    expect(picker).toContain('fetch("/api/food/slots"');
    expect(picker).not.toContain("Indian/Mauritius");
    expect(picker).not.toMatch(/opens_at|closes_at|preorder_days/);
  });

  it("does not block checkout when it cannot load", () => {
    // Falling back to ASAP is the pre-M161 behaviour, which always works.
    expect(picker).toContain("setSlots([])");
  });

  it("hides ASAP when the kitchen is shut", () => {
    expect(picker).toContain("asapAvailable && (");
  });
});

describe("the copy exists in all three languages", () => {
  const copy = SRC("lib", "food", "copy.i18n.ts");

  it("has a when block per language", () => {
    // FOOD_COPY is Record<Language, FoodCopy> and FoodCopy = typeof EN, so a
    // missing French key is a COMPILE error rather than a blank screen —
    // unlike lib/i18n.ts, which is read through a cast.
    expect((copy.match(/^  when: \{/gm) ?? []).length).toBe(3);
  });

  it("keeps the Kreol house style", () => {
    // This file's own note: <s> not <ch>, and the reader is "ou", never "to".
    expect(copy).toContain('title: "Kan ou anvi li');
    expect(copy).toContain("Ou pe komann pou");
  });
});
